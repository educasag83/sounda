"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient, supabaseConfigured } from "@/lib/supabase/server";

export type LibraryInput = {
  media_type: "movie" | "tv";
  tmdb_id: number;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  year: string;
  source?: "search" | "recognition";
};

export async function addToLibrary(item: LibraryInput) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect(`/login?next=/title/${item.media_type}/${item.tmdb_id}`);
  const { error } = await supabase
    .from("library_items")
    .upsert({ ...item, source: item.source ?? "search", user_id: data.user.id }, { onConflict: "user_id,media_type,tmdb_id" });
  if (error) throw new Error(error.message);
  revalidatePath("/library");
  revalidatePath(`/title/${item.media_type}/${item.tmdb_id}`);
}

export async function removeFromLibrary(media_type: "movie" | "tv", tmdb_id: number) {
  const supabase = await createClient();
  const { error } = await supabase.from("library_items").delete().match({ media_type, tmdb_id });
  if (error) throw new Error(error.message);
  revalidatePath("/library");
  revalidatePath(`/title/${media_type}/${tmdb_id}`);
}

export async function sendMagicLink(_prev: { message: string } | null, formData: FormData) {
  if (!supabaseConfigured()) return { message: "Supabase todavía no está configurado." };
  const email = String(formData.get("email") || "").trim();
  const next = String(formData.get("next") || "/library");
  if (!email) return { message: "Escribe tu email." };
  const h = await headers();
  const origin = h.get("origin") || `https://${h.get("host")}`;
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error) return { message: `No se pudo enviar: ${error.message}` };
  return { message: "Listo. Revisa tu correo y abre el enlace para entrar." };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

/** Asegura que la serie esté en la biblioteca sin pisar cómo llegó. */
async function ensureInLibrary(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, show: LibraryInput) {
  await supabase
    .from("library_items")
    .upsert({ ...show, source: show.source ?? "search", user_id: userId }, { onConflict: "user_id,media_type,tmdb_id", ignoreDuplicates: true });
}

function revalidateShow(tmdbId: number, season?: number) {
  revalidatePath("/library");
  revalidatePath(`/title/tv/${tmdbId}`);
  if (season !== undefined) revalidatePath(`/title/tv/${tmdbId}/season/${season}`);
}

export async function setEpisodesWatched(show: LibraryInput, season: number, episodes: number[], watched: boolean) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect(`/login?next=/title/tv/${show.tmdb_id}/season/${season}`);
  if (!episodes.length) return;

  if (watched) {
    await ensureInLibrary(supabase, data.user.id, show);
    const rows = episodes.map((episode) => ({ user_id: data.user.id, tmdb_id: show.tmdb_id, season, episode }));
    const { error } = await supabase
      .from("watched_episodes")
      .upsert(rows, { onConflict: "user_id,tmdb_id,season,episode", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("watched_episodes")
      .delete()
      .eq("tmdb_id", show.tmdb_id)
      .eq("season", season)
      .in("episode", episodes);
    if (error) throw new Error(error.message);
  }
  revalidateShow(show.tmdb_id, season);
}
