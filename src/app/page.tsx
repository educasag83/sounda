import { Suspense } from "react";
import SearchBar from "@/components/SearchBar";
import PosterCard, { PosterGrid } from "@/components/PosterCard";
import Notice from "@/components/Notice";
import { tmdbConfigured, trending } from "@/lib/tmdb";

export default async function Home() {
  return (
    <div className="space-y-10">
      <section className="py-6 text-center sm:py-10">
        <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">¿Qué estás viendo?</h1>
        <p className="mx-auto mt-3 max-w-xl text-white/60">
          Pronto podrás tocar un botón y Sounda lo reconocerá escuchando. Por ahora, búscalo y guárdalo en tu biblioteca.
        </p>
        <div className="mx-auto mt-6 max-w-xl">
          <Suspense>
            <SearchBar big />
          </Suspense>
        </div>
        <button
          disabled
          className="mt-5 inline-flex items-center gap-2 rounded-full border border-accent/40 px-5 py-2.5 text-sm text-accent/70"
          title="Llega en el próximo paso"
        >
          🎙 Escuchar (próximamente)
        </button>
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
  const items = await trending();
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
