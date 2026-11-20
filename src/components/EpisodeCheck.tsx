"use client";

import { useOptimistic, useTransition } from "react";
import { setEpisodesWatched, type LibraryInput } from "@/app/actions";

type Props = {
  show: LibraryInput;
  season: number;
  episodes: number[];
  watched: boolean;
  disabled?: boolean;
  label?: { on: string; off: string };
  variant?: "circle" | "pill";
};

/** Botón para marcar uno o varios capítulos como vistos. */
export default function EpisodeCheck({ show, season, episodes, watched, disabled, label, variant = "circle" }: Props) {
  const [pending, start] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(watched);
  const toggle = () =>
    start(async () => {
      setOptimistic(!optimistic);
      await setEpisodesWatched(show, season, episodes, !optimistic);
    });

  if (variant === "pill") {
    return (
      <button
        onClick={toggle}
        disabled={disabled || pending}
        className={`rounded-full px-4 py-2 text-sm font-semibold transition disabled:opacity-50 ${
          optimistic ? "bg-white/10 text-white hover:bg-white/20" : "bg-accent text-ink hover:brightness-110"
        }`}
      >
        {optimistic ? label?.on ?? "✓ Visto" : label?.off ?? "Marcar como visto"}
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      disabled={disabled || pending}
      aria-pressed={optimistic}
      aria-label={optimistic ? "Desmarcar capítulo" : "Marcar capítulo como visto"}
      className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 text-lg transition disabled:opacity-30 ${
        optimistic ? "border-accent bg-accent text-ink" : "border-white/25 text-transparent hover:border-accent"
      }`}
    >
      ✓
    </button>
  );
}
