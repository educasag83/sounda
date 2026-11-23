import type { Metadata } from "next";
import { notFound } from "next/navigation";
import DiscoverGraph from "@/components/DiscoverGraph";
import Notice from "@/components/Notice";
import { getTitleNeighbors, tmdbConfigured, type MediaType } from "@/lib/tmdb";
import { createClient, getUser } from "@/lib/supabase/server";

type Props = { params: Promise<{ type: string; id: string }> };

function parse(type: string, id: string): { type: MediaType; id: number } | null {
  const n = Number(id);
  if ((type !== "movie" && type !== "tv") || !Number.isInteger(n) || n <= 0) return null;
  return { type, id: n };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { type, id } = await params;
  const p = parse(type, id);
  if (!p || !tmdbConfigured()) return { title: "Explorar" };
  try {
    const { node } = await getTitleNeighbors(p.type, p.id);
    return { title: `Explorar desde ${node.label}` };
  } catch {
    return { title: "Explorar" };
  }
}

export default async function ExplorePage({ params }: Props) {
  const { type, id } = await params;
  const p = parse(type, id);
  if (!p) notFound();
  if (!tmdbConfigured()) return <Notice title="Falta conectar TMDB">Agrega <code>TMDB_READ_TOKEN</code> para explorar.</Notice>;

  let data;
  try {
    data = await getTitleNeighbors(p.type, p.id);
  } catch {
    notFound();
  }

  // Para marcar en el mapa lo que ya está en la biblioteca.
  let libraryKeys: string[] = [];
  const user = await getUser();
  if (user) {
    const supabase = await createClient();
    const { data: rows } = await supabase.from("library_items").select("media_type,tmdb_id");
    libraryKeys = (rows ?? []).map((r) => `${r.media_type}-${r.tmdb_id}`);
  }

  return <DiscoverGraph root={data.node} neighbors={data.neighbors} libraryKeys={libraryKeys} />;
}
