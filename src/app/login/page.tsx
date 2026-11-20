import type { Metadata } from "next";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next = "/library", error } = await searchParams;
  return (
    <div className="mx-auto max-w-sm py-10">
      <h1 className="text-2xl font-bold">Entra a Sounda</h1>
      <p className="mt-2 text-sm text-white/60">Te enviamos un enlace a tu correo. Sin contraseñas.</p>
      {error && <p className="mt-4 text-sm text-red-300">El enlace venció o no es válido. Pide uno nuevo.</p>}
      <LoginForm next={next} />
    </div>
  );
}
