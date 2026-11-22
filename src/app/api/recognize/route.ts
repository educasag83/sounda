import { NextResponse } from "next/server";
import { identifyConfigured, identifyFromTranscript } from "@/lib/identify";
import { findTitle, getEpisode, tmdbConfigured } from "@/lib/tmdb";
import { createClient, supabaseConfigured } from "@/lib/supabase/server";

export const maxDuration = 60;

export type Match = {
  media_type: "movie" | "tv";
  tmdb_id: number;
  title: string;
  year: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
  season: number | null;
  episode: number | null;
  episode_name: string | null;
  confidence: "alta" | "media" | "baja";
  reason: string;
};

export async function POST(request: Request) {
  if (!identifyConfigured() || !tmdbConfigured() || !supabaseConfigured()) {
    return NextResponse.json({ error: "El reconocimiento todavía no está configurado." }, { status: 503 });
  }

  // Solo usuarios con sesión: cada reconocimiento cuesta dinero.
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Entra a tu cuenta para usar el reconocimiento." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const transcript = typeof body?.transcript === "string" ? body.transcript.trim().slice(0, 2000) : "";
  if (transcript.split(/\s+/).length < 4) {
    return NextResponse.json({ error: "No escuché suficiente diálogo. Acerca el móvil a la TV y prueba otra vez." }, { status: 422 });
  }

  const candidates = await identifyFromTranscript(transcript);

  const matches: Match[] = [];
  for (const c of candidates) {
    const found = await findTitle(c.media_type, c.title, c.year);
    if (!found || matches.some((m) => m.tmdb_id === found.id && m.media_type === found.media_type)) continue;
    const ep = c.media_type === "tv" && c.season && c.episode ? await getEpisode(found.id, c.season, c.episode) : null;
    matches.push({
      media_type: found.media_type,
      tmdb_id: found.id,
      title: found.title,
      year: found.year,
      poster_path: found.poster_path,
      backdrop_path: found.backdrop_path,
      overview: found.overview,
      season: ep ? ep.season_number : null,
      episode: ep ? ep.episode_number : null,
      episode_name: ep?.name ?? null,
      confidence: c.confidence,
      reason: c.reason,
    });
  }

  const best = matches[0];
  await supabase.from("recognitions").insert({
    user_id: auth.user.id,
    transcript,
    media_type: best?.media_type ?? null,
    tmdb_id: best?.tmdb_id ?? null,
    title: best?.title ?? null,
    season: best?.season ?? null,
    episode: best?.episode ?? null,
    confidence: best?.confidence ?? null,
  });

  // La coincidencia principal se guarda sola en la biblioteca, salvo que la confianza sea baja.
  let saved = false;
  if (best && best.confidence !== "baja") {
    const { error } = await supabase.from("library_items").upsert(
      {
        user_id: auth.user.id,
        media_type: best.media_type,
        tmdb_id: best.tmdb_id,
        title: best.title,
        poster_path: best.poster_path,
        backdrop_path: best.backdrop_path,
        year: best.year,
        source: "recognition",
        ...(best.season ? { last_season: best.season, last_episode: best.episode } : {}),
      },
      { onConflict: "user_id,media_type,tmdb_id" },
    );
    saved = !error;
    // Si reconoció el capítulo exacto, lo marca como visto (lo estás viendo ahora).
    if (saved && best.media_type === "tv" && best.season && best.episode) {
      await supabase
        .from("watched_episodes")
        .upsert(
          { user_id: auth.user.id, tmdb_id: best.tmdb_id, season: best.season, episode: best.episode },
          { onConflict: "user_id,tmdb_id,season,episode", ignoreDuplicates: true },
        );
    }
  }

  return NextResponse.json({ matches, saved });
}
