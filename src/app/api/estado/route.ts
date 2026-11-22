import { NextResponse } from "next/server";
import { supabaseDiagnostics } from "@/lib/supabase/config";
import { tmdbConfigured } from "@/lib/tmdb";
import { identifyConfigured } from "@/lib/identify";

export const dynamic = "force-dynamic";

// Muestra qué está configurado, sin revelar ninguna clave.
export async function GET() {
  return NextResponse.json({
    supabase: supabaseDiagnostics(),
    tmdb: tmdbConfigured(),
    claude: identifyConfigured(),
  });
}
