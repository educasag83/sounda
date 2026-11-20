import Link from "next/link";
import { getUser } from "@/lib/supabase/server";
import { signOut } from "@/app/actions";
import SearchBar from "./SearchBar";

export default async function Header() {
  const user = await getUser();
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-ink/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-accent text-ink">
            <Wave />
          </span>
          <span className="hidden sm:inline">Sounda</span>
        </Link>
        <div className="min-w-0 flex-1">
          <SearchBar />
        </div>
        <nav className="flex shrink-0 items-center gap-3 text-sm">
          <Link href="/library" className="text-white/80 hover:text-white">
            Biblioteca
          </Link>
          {user ? (
            <form action={signOut}>
              <button className="text-white/50 hover:text-white">Salir</button>
            </form>
          ) : (
            <Link href="/login" className="rounded-full bg-white/10 px-3 py-1.5 hover:bg-white/20">
              Entrar
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

function Wave() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
      <path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4" />
    </svg>
  );
}
