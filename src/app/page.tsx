import { Suspense } from "react";
import SearchBar from "@/components/SearchBar";
import PosterCard, { PosterGrid } from "@/components/PosterCard";
import Notice from "@/components/Notice";
import Listen from "@/components/Listen";
import { tmdbConfigured, trending } from "@/lib/tmdb";
import { identifyConfigured } from "@/lib/identify";
import { getUser, supabaseConfigured } from "@/lib/supabase/server";

export default async function Home() {
  const user = await getUser();
  const enabled = identifyConfigured() && tmdbConfigured() && supabaseConfigured();
  return (
    <div className="space-y-10">
      <section className="py-6 text-center sm:py-10">
        <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">¿Qué estás viendo?</h1>
        <p className="mx-auto mt-3 max-w-xl text-white/60">
          Toca el botón mientras ves una serie o película y Sounda la reconoce por sus diálogos. Queda guardada en tu biblioteca.
        </p>
        <div className="mt-8">
          <Listen loggedIn={Boolean(user)} enabled={enabled} />
        </div>
        <div className="mx-auto mt-10 max-w-xl">
          <p className="mb-2 text-xs text-white/40">o búscalo a mano</p>
          <Suspense>
            <SearchBar />
          </Suspense>
        </div>
      </section>
      <Trending />
    </div>
  );
}

async function Trending() {
  if (!tmdbConfigured()) {
    return (
      <Notice title="Falta conectar TMDB">
        Agrega la variable <code>TMDB_READ_TOKEN</code> para ver tendencias, buscar y abrir fichas. Los pasos están en el README.
      </Notice>
    );
  }
  let items;
  try {
    items = await trending();
  } catch {
    return <Notice title="No pude cargar las tendencias">Revisa que el token de TMDB sea correcto.</Notice>;
  }
  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold">Tendencias de la semana</h2>
      <PosterGrid>
        {items.slice(0, 18).map((t) => (
          <PosterCard key={`${t.media_type}-${t.id}`} media_type={t.media_type} id={t.id} title={t.title} year={t.year} poster_path={t.poster_path} />
        ))}
      </PosterGrid>
    </section>
  );
}
