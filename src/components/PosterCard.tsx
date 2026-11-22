import Image from "next/image";
import Link from "next/link";
import { img } from "@/lib/tmdb";

type Props = {
  media_type: "movie" | "tv";
  id: number;
  title: string;
  year?: string | null;
  poster_path: string | null;
  badge?: string;
  /** Serie que sigue saliendo: se marca con "En emisión". */
  airing?: boolean;
};

export default function PosterCard({ media_type, id, title, year, poster_path, badge, airing }: Props) {
  const src = img(poster_path, "w342");
  return (
    <Link href={`/title/${media_type}/${id}`} className="group block">
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-white/5 ring-1 ring-white/10 transition group-hover:ring-accent">
        {src ? (
          <Image src={src} alt={title} fill sizes="(max-width: 640px) 45vw, 180px" className="object-cover" />
        ) : (
          <div className="grid h-full place-items-center p-3 text-center text-sm text-white/50">{title}</div>
        )}
        {badge && (
          <span className="absolute left-2 top-2 rounded-full bg-ink/80 px-2 py-0.5 text-[11px] font-medium text-accent">{badge}</span>
        )}
        {airing && (
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-red-500/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            <span className="h-1.5 w-1.5 rounded-full bg-white" />
            En emisión
          </span>
        )}
      </div>
      <p className="mt-2 line-clamp-2 text-sm font-medium leading-tight">{title}</p>
      <p className="text-xs text-white/50">
        {media_type === "tv" ? "Serie" : "Película"}
        {year ? ` · ${year}` : ""}
      </p>
    </Link>
  );
}

export function PosterGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4 lg:grid-cols-6">{children}</div>;
}
