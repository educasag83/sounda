import { NextResponse, type NextRequest } from "next/server";
import { getTitleNeighbors, tmdbConfigured } from "@/lib/tmdb";

// Devuelve los vecinos de un nodo del mapa: /api/explorar?n=tv-1399 o ?n=movie-603
export async function GET(req: NextRequest) {
  if (!tmdbConfigured()) return NextResponse.json({ error: "TMDB no está configurado" }, { status: 503 });
  const m = /^(movie|tv)-(\d+)$/.exec(req.nextUrl.searchParams.get("n") ?? "");
  if (!m) return NextResponse.json({ error: "Nodo inválido" }, { status: 400 });
  const id = Number(m[2]);
  try {
    const data = await getTitleNeighbors(m[1] as "movie" | "tv", id);
    return NextResponse.json(data, { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } });
  } catch {
    return NextResponse.json({ error: "No se pudo cargar" }, { status: 502 });
  }
}
