"use client";

import { useTransition } from "react";
import { addToLibrary, removeFromLibrary, type LibraryInput } from "@/app/actions";

export default function LibraryButton({ item, inLibrary }: { item: LibraryInput; inLibrary: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => start(() => (inLibrary ? removeFromLibrary(item.media_type, item.tmdb_id) : addToLibrary(item)))}
      className={`rounded-full px-5 py-2.5 text-sm font-semibold transition disabled:opacity-60 ${
        inLibrary ? "bg-white/10 text-white hover:bg-white/20" : "bg-accent text-ink hover:brightness-110"
      }`}
    >
      {pending ? "Guardando…" : inLibrary ? "✓ En tu biblioteca" : "+ Añadir a mi biblioteca"}
    </button>
  );
}
