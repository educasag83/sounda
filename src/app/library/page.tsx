import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import PosterCard, { PosterGrid } from "@/components/PosterCard";
import Notice from "@/components/Notice";
import { createClient, getUser, supabaseConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Mi biblioteca" };

type Item = {
  media_type: "movie" | "tv";
  tmdb_id: number;
  title: string;
  poster_path: string | null;
  year: string | null;
  source: "search" | "recognition";
};

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  if (!supabaseConfigured()) {
    return <Notice title="Falta conectar Supabase">Configura Supabase para guardar tu biblioteca. Los pasos están en el README.</Notice>;
  }
  const user = await getUser();
  if (!user) redirect("/login?next=/library");

  const { tipo } = await searchParams;
  const supabase = await createClient();
  let query = supabase.from("library_items").select("media_type,tmdb_id,title,poster_path,year,source").order("added_at", { ascending: false });
  if (tipo === "tv" || tipo === "movie") query = query.eq("media_type", tipo);
  const { data, error } = await query.returns<Item[]>();
  if (error) return <Notice title="No pude cargar tu biblioteca">{error.message}</Notice>;

  const tabs = [
    { label: "Todo", value: undefined },
    { label: "Series", value: "tv" },
    { label: "Películas", value: "movie" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-bold">Mi biblioteca</h1>
        <div className="flex gap-1 rounded-full bg-white/5 p-1 text-sm">
          {tabs.map((tab) => (
            <Link
              key={tab.label}
              href={tab.value ? `/library?tipo=${tab.value}` : "/library"}
              className={`rounded-full px-3 py-1 ${tipo === tab.value ? "bg-white/15 text-white" : "text-white/60 hover:text-white"}`}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </div>
      {!data?.length ? (
        <p className="text-white/60">
          Todavía no guardaste nada. <Link href="/" className="text-accent underline-offset-4 hover:underline">Busca algo</Link> y tócale “Añadir a mi biblioteca”.
        </p>
      ) : (
        <PosterGrid>
          {data.map((it) => (
            <PosterCard
              key={`${it.media_type}-${it.tmdb_id}`}
              media_type={it.media_type}
              id={it.tmdb_id}
              title={it.title}
              year={it.year}
              poster_path={it.poster_path}
              badge={it.source === "recognition" ? "🎙 Descubierto" : undefined}
            />
          ))}
        </PosterGrid>
      )}
    </div>
  );
}
