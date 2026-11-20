"use client";

import { useActionState } from "react";
import { sendMagicLink } from "@/app/actions";

export default function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(sendMagicLink, null);
  return (
    <form action={action} className="mt-6 space-y-3">
      <input type="hidden" name="next" value={next} />
      <input
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder="tu@email.com"
        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 outline-none focus:border-accent"
      />
      <button disabled={pending} className="w-full rounded-xl bg-accent py-3 font-semibold text-ink disabled:opacity-60">
        {pending ? "Enviando…" : "Enviarme el enlace"}
      </button>
      {state?.message && <p className="text-sm text-white/70">{state.message}</p>}
    </form>
  );
}
