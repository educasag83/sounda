"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export default function SearchBar({ autoFocus = false, big = false }: { autoFocus?: boolean; big?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus={autoFocus}
        type="search"
        placeholder="Busca una serie o película"
        aria-label="Buscar"
        className={`w-full rounded-full border border-white/10 bg-white/5 px-4 text-white placeholder:text-white/40 outline-none focus:border-accent ${
          big ? "py-3.5 text-lg" : "py-2 text-sm"
        }`}
      />
    </form>
  );
}
