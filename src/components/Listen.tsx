"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Match } from "@/app/api/recognize/route";

// Tipos mínimos de la Web Speech API (no vienen en lib.dom).
type SpeechResultList = ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
type Recognizer = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: SpeechResultList }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function getRecognizer(): Recognizer | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognizer; webkitSpeechRecognition?: new () => Recognizer };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

const LISTEN_SECONDS = 15;
const LANGS = [
  { code: "es-ES", label: "Español" },
  { code: "en-US", label: "Inglés" },
];

type State =
  | { kind: "idle" }
  | { kind: "listening"; seconds: number }
  | { kind: "thinking" }
  | { kind: "done"; matches: Match[]; saved: boolean }
  | { kind: "error"; message: string; login?: boolean };

const IMG = "https://image.tmdb.org/t/p/w342";

export default function Listen({ loggedIn, enabled }: { loggedIn: boolean; enabled: boolean }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [lang, setLang] = useState("es-ES");
  const [transcript, setTranscript] = useState("");
  const [supported, setSupported] = useState(true);
  const rec = useRef<Recognizer | null>(null);
  const text = useRef("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const failed = useRef(false);

  useEffect(() => {
    setSupported(Boolean(getRecognizer()));
    return () => {
      rec.current?.abort();
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  async function identify() {
    const said = text.current.trim();
    if (!said) {
      setState({ kind: "error", message: "No escuché diálogo. Sube el volumen o acerca el móvil a la TV." });
      return;
    }
    setState({ kind: "thinking" });
    try {
      const res = await fetch("/api/recognize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transcript: said }),
      });
      const data = await res.json();
      if (!res.ok) return setState({ kind: "error", message: data.error ?? "Algo falló.", login: res.status === 401 });
      setState({ kind: "done", matches: data.matches, saved: data.saved });
    } catch {
      setState({ kind: "error", message: "Sin conexión. Prueba de nuevo." });
    }
  }

  function stop() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    rec.current?.stop();
  }

  function start() {
    const r = getRecognizer();
    if (!r) return setSupported(false);
    text.current = "";
    failed.current = false;
    setTranscript("");
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let all = "";
      for (let i = 0; i < e.results.length; i++) all += e.results[i][0].transcript + " ";
      text.current = all;
      setTranscript(all);
    };
    r.onerror = (e) => {
      if (timer.current) clearInterval(timer.current);
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        failed.current = true;
        setState({ kind: "error", message: "Necesito permiso para usar el micrófono. Actívalo en tu navegador." });
      }
    };
    r.onend = () => {
      rec.current = null;
      if (timer.current) clearInterval(timer.current);
      if (failed.current) return;
      void identifyIfListening();
    };
    rec.current = r;
    r.start();
    setState({ kind: "listening", seconds: LISTEN_SECONDS });
    let left = LISTEN_SECONDS;
    timer.current = setInterval(() => {
      left -= 1;
      if (left <= 0) stop();
      else setState({ kind: "listening", seconds: left });
    }, 1000);
  }

  // onend se dispara tanto al terminar el tiempo como si el navegador corta antes.
  const pending = useRef(false);
  async function identifyIfListening() {
    if (pending.current) return;
    pending.current = true;
    await identify();
    pending.current = false;
  }

  if (!enabled) {
    return (
      <button disabled className="inline-flex items-center gap-2 rounded-full border border-accent/40 px-5 py-2.5 text-sm text-accent/70">
        🎙 Escuchar (falta configurar)
      </button>
    );
  }

  const listening = state.kind === "listening";

  return (
    <div className="flex flex-col items-center gap-4">
      <button
        onClick={() => (listening ? stop() : start())}
        disabled={state.kind === "thinking" || !supported || !loggedIn}
        aria-label={listening ? "Dejar de escuchar" : "Escuchar"}
        className={`relative grid h-28 w-28 place-items-center rounded-full bg-accent text-ink shadow-[0_0_60px_-10px] shadow-accent transition active:scale-95 disabled:opacity-50 ${
          listening ? "animate-pulse" : ""
        }`}
      >
        {listening && <span className="absolute inset-0 animate-ping rounded-full bg-accent/40" />}
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
          <path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4" />
        </svg>
      </button>

      <div className="flex gap-1 rounded-full bg-white/5 p-1 text-xs">
        {LANGS.map((l) => (
          <button
            key={l.code}
            onClick={() => setLang(l.code)}
            disabled={listening}
            className={`rounded-full px-3 py-1 ${lang === l.code ? "bg-white/15 text-white" : "text-white/50"}`}
          >
            Audio en {l.label}
          </button>
        ))}
      </div>

      <p className="min-h-6 text-sm text-white/60">
        {!supported
          ? "Tu navegador no permite reconocer voz. Usa Chrome o Safari."
          : !loggedIn
            ? <><Link href="/login?next=/" className="text-accent">Entra</Link> para usar el reconocimiento.</>
            : listening
              ? `Escuchando… ${state.seconds}s (toca para terminar antes)`
              : state.kind === "thinking"
                ? "Pensando qué estás viendo…"
                : state.kind === "idle"
                  ? "Toca y acerca el móvil a la TV mientras hablan los personajes."
                  : null}
      </p>

      {transcript && (listening || state.kind === "thinking") && (
        <p className="max-w-xl text-center text-sm italic text-white/40">“{transcript.trim().slice(-220)}”</p>
      )}

      {state.kind === "error" && (
        <p className="max-w-md text-center text-sm text-red-300">
          {state.message} {state.login && <Link href="/login?next=/" className="text-accent">Entrar</Link>}
        </p>
      )}

      {state.kind === "done" && <Results matches={state.matches} saved={state.saved} />}
    </div>
  );
}

function Results({ matches, saved }: { matches: Match[]; saved: boolean }) {
  if (!matches.length) {
    return <p className="max-w-md text-center text-sm text-white/70">No lo reconocí. Prueba en una escena con más diálogo o búscalo a mano.</p>;
  }
  const [best, ...rest] = matches;
  return (
    <div className="w-full max-w-xl space-y-4 text-left">
      <Link href={`/title/${best.media_type}/${best.tmdb_id}`} className="flex gap-4 rounded-2xl bg-panel p-4 ring-1 ring-accent/40 hover:ring-accent">
        <div className="relative aspect-[2/3] w-24 shrink-0 overflow-hidden rounded-lg bg-white/5">
          {best.poster_path && <Image src={IMG + best.poster_path} alt={best.title} fill sizes="96px" className="object-cover" />}
        </div>
        <div className="min-w-0 space-y-1">
          <p className="text-xs uppercase tracking-wide text-accent">
            {best.confidence === "alta" ? "¡Lo tengo!" : best.confidence === "media" ? "Creo que es" : "Quizás sea"}
          </p>
          <p className="text-lg font-semibold leading-tight">{best.title}</p>
          <p className="text-sm text-white/60">
            {best.media_type === "tv" ? "Serie" : "Película"}
            {best.year ? ` · ${best.year}` : ""}
            {best.season ? ` · T${best.season} E${best.episode}` : ""}
            {best.episode_name ? ` · ${best.episode_name}` : ""}
          </p>
          <p className="line-clamp-2 text-xs text-white/40">{best.reason}</p>
          {saved && <p className="text-xs font-medium text-accent">✓ Guardado en tu biblioteca</p>}
        </div>
      </Link>
      {rest.length > 0 && (
        <div>
          <p className="mb-2 text-xs text-white/40">¿O quizás…?</p>
          <div className="flex flex-wrap gap-2">
            {rest.map((m) => (
              <Link key={`${m.media_type}-${m.tmdb_id}`} href={`/title/${m.media_type}/${m.tmdb_id}`} className="rounded-full bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20">
                {m.title} {m.year && <span className="text-white/40">({m.year})</span>}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
