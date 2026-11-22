// Lee la configuración de Supabase y la limpia de errores comunes al copiarla:
// espacios, barra final o una ruta como "/rest/v1/" (que provoca el error
// "Invalid path specified in request URL" al pedir el login).
function cleanUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

const RAW_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

export const SUPABASE_URL = cleanUrl(RAW_URL);
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || null;

/** Datos no secretos para diagnosticar la configuración desde /api/estado. */
export function supabaseDiagnostics() {
  const host = SUPABASE_URL ? new URL(SUPABASE_URL).host : null;
  return {
    configurada: Boolean(SUPABASE_URL && SUPABASE_KEY),
    host,
    url_corregida: Boolean(RAW_URL && SUPABASE_URL && RAW_URL.trim() !== SUPABASE_URL),
    host_parece_de_supabase: host ? host.endsWith(".supabase.co") : false,
    tipo_de_clave: SUPABASE_KEY?.startsWith("sb_publishable_") ? "publishable" : SUPABASE_KEY?.startsWith("eyJ") ? "anon (JWT)" : SUPABASE_KEY ? "desconocido" : null,
  };
}
