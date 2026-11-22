/** Fecha corta en español, por ejemplo "jue 4 dic". */
export function formatDate(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("es-UY", { weekday: "short", day: "numeric", month: "short" });
}

/** Fecha larga, por ejemplo "jueves 4 de diciembre de 2026". */
export function formatLongDate(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("es-UY", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

/** "hoy", "mañana", "en 5 días", "en 3 semanas"... */
export function fromNow(iso: string) {
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").getTime();
  const days = Math.round((new Date(`${iso}T00:00:00Z`).getTime() - today) / 86_400_000);
  if (days < 0) return "ya salió";
  if (days === 0) return "hoy";
  if (days === 1) return "mañana";
  if (days < 14) return `en ${days} días`;
  if (days < 60) return `en ${Math.round(days / 7)} semanas`;
  return `en ${Math.round(days / 30)} meses`;
}
