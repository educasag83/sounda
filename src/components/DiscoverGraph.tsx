"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { addToLibrary } from "@/app/actions";
import type { GraphNode } from "@/lib/tmdb";

type SimNode = SimulationNodeDatum & { key: string; data: GraphNode; r: number; phase: number };
type SimLink = SimulationLinkDatum<SimNode> & { key: string; via?: string };

const MAX_NODES = 140;
const IMG = "https://image.tmdb.org/t/p/w185";
const COLORS = { tv: "#3ee6b0", movie: "#f5b942" } as const;
const KIND_LABEL = { tv: "Serie", movie: "Película" } as const;
const LEGEND = { tv: "Series", movie: "Películas" } as const;
// Conexiones por protagonistas o creador.
const PEOPLE_COLOR = "#b49cff";

function radius(isRoot: boolean) {
  return isRoot ? 46 : 31;
}

function homeZoom(width: number) {
  return width < 640 ? 0.78 : 1;
}

type Camera = { x: number; y: number; k: number };

export default function DiscoverGraph({ root, neighbors, libraryKeys }: { root: GraphNode; neighbors: GraphNode[]; libraryKeys: string[] }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const nodeEls = useRef(new Map<string, HTMLElement>());
  const linkEls = useRef(new Map<string, SVGLineElement>());
  const cam = useRef<Camera>({ x: 0, y: 0, k: 1 });
  const camTarget = useRef<Camera | null>(null);
  const size = useRef({ w: 0, h: 0 });

  const [, setVersion] = useState(0);
  const [top, setTop] = useState(57);
  const [selected, setSelected] = useState<string>(root.key);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([root.key]));
  const [loading, setLoading] = useState<Set<string>>(() => new Set());
  const [failed, setFailed] = useState<string | null>(null);
  const [library, setLibrary] = useState(() => new Set(libraryKeys));
  const [hint, setHint] = useState(true);

  /* ---------- Dibujo imperativo (no pasa por React en cada cuadro) ---------- */

  const applyCamera = useCallback(() => {
    const { x, y, k } = cam.current;
    const { w, h } = size.current;
    if (worldRef.current) worldRef.current.style.transform = `translate3d(${w / 2 + x}px, ${h / 2 + y}px, 0) scale(${k})`;
  }, []);

  const draw = useCallback(() => {
    for (const n of nodesRef.current) {
      const el = nodeEls.current.get(n.key);
      if (el) el.style.transform = `translate3d(${n.x ?? 0}px, ${n.y ?? 0}px, 0)`;
    }
    for (const l of linksRef.current) {
      const el = linkEls.current.get(l.key);
      const s = l.source as SimNode;
      const t = l.target as SimNode;
      if (!el || typeof s !== "object" || typeof t !== "object") continue;
      el.setAttribute("x1", String(s.x ?? 0));
      el.setAttribute("y1", String(s.y ?? 0));
      el.setAttribute("x2", String(t.x ?? 0));
      el.setAttribute("y2", String(t.y ?? 0));
    }
  }, []);

  /* ---------- Simulación ---------- */

  const addNeighbors = useCallback((parentKey: string, list: GraphNode[]) => {
    const nodes = nodesRef.current;
    const links = linksRef.current;
    const byKey = new Map(nodes.map((n) => [n.key, n]));
    const parent = byKey.get(parentKey);
    if (!parent) return;
    const linkKeys = new Set(links.map((l) => l.key));
    list.forEach((data, i) => {
      let n = byKey.get(data.key);
      if (!n) {
        if (nodes.length >= MAX_NODES) return;
        // Los nodos nuevos "brotan" desde el que tocaste.
        const a = (i / Math.max(list.length, 1)) * Math.PI * 2 + Math.random() * 0.4;
        n = { key: data.key, data, r: radius(false), phase: Math.random() * Math.PI * 2, x: (parent.x ?? 0) + Math.cos(a) * 12, y: (parent.y ?? 0) + Math.sin(a) * 12 };
        nodes.push(n);
        byKey.set(n.key, n);
      }
      const key = [parentKey, data.key].sort().join("|");
      if (!linkKeys.has(key)) {
        linkKeys.add(key);
        links.push({ key, source: parent, target: n, via: data.via });
      }
    });
    const sim = simRef.current;
    if (sim) {
      sim.nodes(nodes);
      (sim.force("link") as ReturnType<typeof forceLink<SimNode, SimLink>>).links(links);
      sim.alpha(0.9).restart();
    }
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rootNode: SimNode = { key: root.key, data: root, r: radius(true), phase: 0, x: 0, y: 0, fx: 0, fy: 0 };
    nodesRef.current = [rootNode];
    linksRef.current = [];

    const drift = () => {
      if (reduceMotion) return;
      const t = performance.now() / 1000;
      for (const n of nodesRef.current) {
        if (n.fx != null) continue;
        n.vx = (n.vx ?? 0) + Math.cos(t * 0.6 + n.phase) * 0.045;
        n.vy = (n.vy ?? 0) + Math.sin(t * 0.5 + n.phase * 1.3) * 0.045;
      }
    };

    const sim = forceSimulation<SimNode, SimLink>(nodesRef.current)
      .velocityDecay(0.45)
      .force("charge", forceManyBody<SimNode>().strength(-300).distanceMax(420))
      .force(
        "link",
        forceLink<SimNode, SimLink>([])
          .id((n) => n.key)
          .distance((l) => (l.source as SimNode).r + (l.target as SimNode).r + 46)
          .strength(0.55),
      )
      .force("collide", forceCollide<SimNode>((n) => n.r + 16).strength(0.9))
      .force("x", forceX<SimNode>(0).strength(0.025))
      .force("y", forceY<SimNode>(0).strength(0.025))
      .force("drift", drift)
      .alphaTarget(reduceMotion ? 0 : 0.012)
      .on("tick", draw);
    simRef.current = sim;
    addNeighbors(root.key, neighbors);

    const onVisibility = () => (document.hidden ? sim.stop() : sim.restart());
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      sim.stop();
      simRef.current = null;
    };
  }, [root, neighbors, addNeighbors, draw]);

  /* ---------- Tamaño del lienzo (debajo del encabezado) ---------- */

  useLayoutEffect(() => {
    const header = document.querySelector("header");
    const measure = () => {
      const h = header ? Math.round(header.getBoundingClientRect().bottom) : 57;
      setTop(h);
      const box = boxRef.current;
      if (box) {
        const first = size.current.w === 0;
        size.current = { w: box.clientWidth, h: box.clientHeight };
        // En el celular arrancamos un poco más lejos para que entre todo.
        if (first) cam.current.k = homeZoom(box.clientWidth);
      }
      applyCamera();
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (boxRef.current) ro.observe(boxRef.current);
    if (header) ro.observe(header);
    return () => ro.disconnect();
  }, [applyCamera]);

  /* ---------- Cámara animada ---------- */

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const t = camTarget.current;
      if (t) {
        const c = cam.current;
        c.x += (t.x - c.x) * 0.12;
        c.y += (t.y - c.y) * 0.12;
        c.k += (t.k - c.k) * 0.12;
        if (Math.abs(t.x - c.x) < 0.5 && Math.abs(t.y - c.y) < 0.5 && Math.abs(t.k - c.k) < 0.002) {
          cam.current = { ...t };
          camTarget.current = null;
        }
        applyCamera();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [applyCamera]);

  const focusOn = useCallback((n: SimNode) => {
    const k = cam.current.k;
    // Un poco más arriba del centro: abajo va la tarjeta del nodo.
    camTarget.current = { x: -(n.x ?? 0) * k, y: -(n.y ?? 0) * k - size.current.h * 0.12, k };
  }, []);

  /* ---------- Expandir un nodo ---------- */

  const expand = useCallback(
    async (n: SimNode) => {
      if (expanded.has(n.key) || loading.has(n.key)) return;
      setFailed(null);
      setLoading((s) => new Set(s).add(n.key));
      try {
        const res = await fetch(`/api/explorar?n=${encodeURIComponent(n.key)}`);
        if (!res.ok) throw new Error(String(res.status));
        const data: { neighbors: GraphNode[] } = await res.json();
        addNeighbors(n.key, data.neighbors);
        setExpanded((s) => new Set(s).add(n.key));
      } catch {
        setFailed(n.key);
      } finally {
        setLoading((s) => {
          const next = new Set(s);
          next.delete(n.key);
          return next;
        });
      }
    },
    [expanded, loading, addNeighbors],
  );

  const tap = useCallback(
    (n: SimNode) => {
      setHint(false);
      setSelected(n.key);
      focusOn(n);
      expand(n);
    },
    [expand, focusOn],
  );

  /* ---------- Gestos: arrastrar, mover el mapa, pellizcar ---------- */

  const gesture = useRef<{
    pointers: Map<number, { x: number; y: number }>;
    node: SimNode | null;
    start: { x: number; y: number } | null;
    moved: boolean;
    pinch: { dist: number; k: number } | null;
  }>({ pointers: new Map(), node: null, start: null, moved: false, pinch: null });

  const toWorld = (clientX: number, clientY: number) => {
    const box = boxRef.current!.getBoundingClientRect();
    const { x, y, k } = cam.current;
    return { x: (clientX - box.left - size.current.w / 2 - x) / k, y: (clientY - box.top - size.current.h / 2 - y) / k };
  };

  const zoomAt = (clientX: number, clientY: number, nextK: number) => {
    const box = boxRef.current!.getBoundingClientRect();
    const c = cam.current;
    const k = Math.min(2.5, Math.max(0.3, nextK));
    const px = clientX - box.left - size.current.w / 2;
    const py = clientY - box.top - size.current.h / 2;
    c.x = px - ((px - c.x) / c.k) * k;
    c.y = py - ((py - c.y) / c.k) * k;
    c.k = k;
    camTarget.current = null;
    applyCamera();
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const g = gesture.current;
    boxRef.current?.setPointerCapture(e.pointerId);
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    camTarget.current = null;
    if (g.pointers.size === 2) {
      const [a, b] = [...g.pointers.values()];
      g.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), k: cam.current.k };
      if (g.node) {
        g.node.fx = g.node.key === root.key ? g.node.x : null;
        g.node.fy = g.node.key === root.key ? g.node.y : null;
      }
      g.node = null;
      g.moved = true;
      return;
    }
    const key = (e.target as HTMLElement).closest<HTMLElement>("[data-node]")?.dataset.node;
    g.node = key ? (nodesRef.current.find((n) => n.key === key) ?? null) : null;
    g.start = { x: e.clientX, y: e.clientY };
    g.moved = false;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    const prev = g.pointers.get(e.pointerId);
    if (!prev) return;
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g.pinch && g.pointers.size >= 2) {
      const [a, b] = [...g.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      zoomAt(mid.x, mid.y, g.pinch.k * (dist / g.pinch.dist));
      // Además del zoom, mover con el punto medio.
      cam.current.x += (e.clientX - prev.x) / 2;
      cam.current.y += (e.clientY - prev.y) / 2;
      applyCamera();
      return;
    }
    if (g.start && !g.moved && Math.hypot(e.clientX - g.start.x, e.clientY - g.start.y) > 7) g.moved = true;
    if (!g.moved) return;
    if (g.node) {
      const w = toWorld(e.clientX, e.clientY);
      g.node.fx = w.x;
      g.node.fy = w.y;
      simRef.current?.alphaTarget(0.25).restart();
    } else {
      cam.current.x += e.clientX - prev.x;
      cam.current.y += e.clientY - prev.y;
      applyCamera();
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    g.pointers.delete(e.pointerId);
    if (g.pointers.size < 2) g.pinch = null;
    if (g.pointers.size > 0) return;
    if (g.node) {
      if (!g.moved) tap(g.node);
      else if (g.node.key !== root.key) {
        g.node.fx = null;
        g.node.fy = null;
      }
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      simRef.current?.alphaTarget(reduce ? 0 : 0.012);
    }
    g.node = null;
    g.start = null;
  };

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, cam.current.k * Math.exp(-e.deltaY * 0.0015));
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => box.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- Render ---------- */

  const nodes = nodesRef.current;
  const links = linksRef.current;
  const sel = nodes.find((n) => n.key === selected) ?? nodes[0];
  const neighborKeys = new Set<string>();
  for (const l of links) {
    const s = (l.source as SimNode).key;
    const t = (l.target as SimNode).key;
    if (s === selected) neighborKeys.add(t);
    if (t === selected) neighborKeys.add(s);
  }

  return (
    <div
      ref={boxRef}
      className="fixed inset-x-0 bottom-0 z-20 touch-none select-none overflow-hidden bg-ink"
      style={{ top, backgroundImage: "radial-gradient(circle at 50% 40%, rgba(62,230,176,0.08), transparent 60%)" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div ref={worldRef} className="absolute left-0 top-0 origin-top-left will-change-transform">
        <svg className="absolute overflow-visible" width="1" height="1" aria-hidden>
          {links.map((l) => {
            const s = (l.source as SimNode).key;
            const t = (l.target as SimNode).key;
            const on = s === selected || t === selected;
            return (
              <line
                key={l.key}
                ref={(el) => {
                  if (el) linkEls.current.set(l.key, el);
                  else linkEls.current.delete(l.key);
                }}
                stroke={l.via ? (on ? PEOPLE_COLOR : "rgba(180,156,255,0.35)") : on ? "#3ee6b0" : "rgba(255,255,255,0.14)"}
                strokeWidth={on ? 2 : 1.2}
                strokeDasharray={l.via ? "5 4" : undefined}
              />
            );
          })}
        </svg>
        {nodes.map((n) => {
          const isRoot = n.key === root.key;
          const isSel = n.key === selected;
          const dim = !isSel && !neighborKeys.has(n.key) && !isRoot;
          const color = COLORS[n.data.kind];
          const d = n.r * 2;
          return (
            <div
              key={n.key}
              data-node={n.key}
              ref={(el) => {
                if (el) {
                  nodeEls.current.set(n.key, el);
                  el.style.transform = `translate3d(${n.x ?? 0}px, ${n.y ?? 0}px, 0)`;
                } else nodeEls.current.delete(n.key);
              }}
              className="absolute left-0 top-0 cursor-pointer"
              style={{ zIndex: isSel ? 3 : isRoot ? 2 : 1 }}
            >
              <div
                className="absolute flex flex-col items-center transition-opacity duration-300"
                style={{ left: -n.r, top: -n.r, width: d, opacity: dim ? 0.55 : 1 }}
              >
                <div
                  className="relative overflow-hidden rounded-full bg-panel animate-[pop_.45s_ease-out]"
                  style={{
                    width: d,
                    height: d,
                    boxShadow: `0 0 0 ${isSel ? 3 : 2}px ${isSel ? "#fff" : color}${isSel ? `, 0 0 22px 4px ${color}88` : ""}`,
                  }}
                >
                  {n.data.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={IMG + n.data.image} alt="" draggable={false} loading="lazy" className="pointer-events-none h-full w-full object-cover" />
                  ) : (
                    <span className="grid h-full w-full place-items-center px-1 text-center text-[9px] leading-tight text-white/70">{n.data.label}</span>
                  )}
                  {loading.has(n.key) && <span className="absolute inset-0 animate-pulse rounded-full bg-ink/60 ring-2 ring-inset ring-white/60" />}
                </div>
                {!expanded.has(n.key) && !loading.has(n.key) && (
                  <span
                    className="absolute grid h-5 w-5 place-items-center rounded-full text-[13px] font-bold leading-none text-ink shadow"
                    style={{ right: -2, top: d - 18, background: color }}
                    aria-hidden
                  >
                    +
                  </span>
                )}
                <span
                  className="pointer-events-none mt-1 line-clamp-2 w-[110px] text-center text-[11px] font-medium leading-tight text-white/85 [text-shadow:0_1px_3px_#000]"
                  style={{ fontSize: isRoot ? 13 : undefined }}
                >
                  {n.data.label}
                </span>
                {n.data.via && (
                  <span className="pointer-events-none line-clamp-1 w-[110px] text-center text-[10px] leading-tight [text-shadow:0_1px_3px_#000]" style={{ color: PEOPLE_COLOR }}>
                    {n.data.via}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Leyenda y ayuda */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 p-3">
        <Link
          href={`/title/${root.kind}/${root.id}`}
          className="pointer-events-auto rounded-full bg-panel/90 px-3 py-1.5 text-sm text-white/80 ring-1 ring-white/10 backdrop-blur hover:text-white"
          onPointerDown={(e) => e.stopPropagation()}
        >
          ← {root.label}
        </Link>
        <div className="flex gap-3 rounded-full bg-panel/90 px-3 py-1.5 text-[11px] text-white/70 ring-1 ring-white/10 backdrop-blur">
          {(["tv", "movie"] as const).map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[k] }} />
              {LEGEND[k]}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <svg width="14" height="4" aria-hidden>
              <line x1="0" y1="2" x2="14" y2="2" stroke={PEOPLE_COLOR} strokeWidth="2" strokeDasharray="4 3" />
            </svg>
            Elenco o creador
          </span>
        </div>
      </div>

      <div className="pointer-events-none absolute right-3 top-28 flex flex-col gap-2">
        {[
          { label: "Acercar", text: "+", f: 1.3 },
          { label: "Alejar", text: "−", f: 1 / 1.3 },
        ].map((b) => (
          <button
            key={b.label}
            aria-label={b.label}
            className="pointer-events-auto grid h-9 w-9 place-items-center rounded-full bg-panel/90 text-lg text-white/80 ring-1 ring-white/10 hover:text-white"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              const c = cam.current;
              camTarget.current = { x: c.x * b.f, y: c.y * b.f, k: Math.min(2.5, Math.max(0.3, c.k * b.f)) };
            }}
          >
            {b.text}
          </button>
        ))}
        <button
          aria-label="Volver al centro"
          className="pointer-events-auto grid h-9 w-9 place-items-center rounded-full bg-panel/90 text-white/80 ring-1 ring-white/10 hover:text-white"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            camTarget.current = { x: 0, y: 0, k: homeZoom(size.current.w) };
            setSelected(root.key);
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
          </svg>
        </button>
      </div>

      {hint && (
        <p className="pointer-events-none absolute inset-x-0 top-28 mx-auto w-fit max-w-[70%] rounded-full bg-ink/70 px-3 py-1.5 text-center text-xs text-white/70">
          Toca un círculo para ver sus conexiones
        </p>
      )}

      {sel && (
        <NodeCard
          node={sel.data}
          loading={loading.has(sel.key)}
          failed={failed === sel.key}
          retry={() => expand(sel)}
          inLibrary={library.has(sel.key)}
          onAdded={() => setLibrary((s) => new Set(s).add(sel.key))}
        />
      )}
    </div>
  );
}

function NodeCard({
  node,
  loading,
  failed,
  retry,
  inLibrary,
  onAdded,
}: {
  node: GraphNode;
  loading: boolean;
  failed: boolean;
  retry: () => void;
  inLibrary: boolean;
  onAdded: () => void;
}) {
  const [pending, start] = useTransition();
  return (
    <div
      className="absolute inset-x-0 bottom-0 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-panel/95 p-3 shadow-2xl ring-1 ring-white/10 backdrop-blur">
        <div
          className="relative aspect-[2/3] w-14 shrink-0 overflow-hidden rounded-lg bg-white/5"
        >
          {node.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={IMG + node.image} alt="" className="h-full w-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: COLORS[node.kind] }}>
            {KIND_LABEL[node.kind]}
            {node.rating > 0 ? <span className="ml-2 text-white/60">★ {node.rating.toFixed(1)}</span> : null}
          </p>
          <p className="truncate font-semibold">{node.label}</p>
          <p className="truncate text-xs text-white/50">
            {loading
              ? "Buscando conexiones…"
              : failed
                ? "No pude cargar sus conexiones."
                : [node.year, node.via].filter(Boolean).join(" · ") || "Toca otro círculo para seguir"}
          </p>
          {failed && (
            <button onClick={retry} className="text-xs font-semibold text-accent">
              Reintentar
            </button>
          )}
        </div>
          <div className="flex shrink-0 flex-col gap-1.5">
            <Link href={`/title/${node.kind}/${node.id}`} className="rounded-full bg-white/10 px-3 py-1.5 text-center text-xs font-semibold hover:bg-white/20">
              Ver ficha
            </Link>
            <button
              disabled={pending || inLibrary}
              onClick={() =>
                start(async () => {
                  await addToLibrary({
                    media_type: node.kind,
                    tmdb_id: node.id,
                    title: node.label,
                    poster_path: node.image,
                    backdrop_path: node.backdrop,
                    year: node.year,
                  });
                  onAdded();
                })
              }
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:opacity-80 ${
                inLibrary ? "bg-white/10 text-white/70" : "bg-accent text-ink hover:brightness-110"
              }`}
            >
              {pending ? "Guardando…" : inLibrary ? "✓ Guardada" : "+ Biblioteca"}
            </button>
          </div>
      </div>
    </div>
  );
}
