import type { Metadata } from "next";
import PosterCard, { PosterGrid } from "@/components/PosterCard";
import Notice from "@/components/Notice";
import { searchTitles, tmdbConfigured } from "@/lib/tmdb";

type Props = { searchParams: Promise<{ q?: string }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = await searchParams;
  return { title: q ? `Buscar “${q}”` : "Buscar" };
}

export default async function SearchPage({ searchParams }: Props) {
  const { q = "" } = await searchParams;
  if (!tmdbConfigured()) return <Notice title="Falta conectar TMDB">Agrega <code>TMDB_READ_TOKEN</code> para poder buscar.</Notice>;
  if (!q.trim()) return <p className="text-white/60">Escribe el nombre de una serie o película.</p>;
  const results = await searchTitles(q);
  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold">
        Resultados para “{q}” <span className="text-white/40">({results.length})</span>
      </h1>
      {results.length === 0 ? (
        <p className="text-white/60">No encontré nada. Prueba con otro nombre o en inglés.</p>
      ) : (
        <PosterGrid>
          {results.map((t) => (
            <PosterCard key={`${t.media_type}-${t.id}`} media_type={t.media_type} id={t.id} title={t.title} year={t.year} poster_path={t.poster_path} />
          ))}
        </PosterGrid>
      )}
    </div>
  );
}
