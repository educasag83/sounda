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
type Filter = "all" | "similar" | "people";

const IMG = "https://image.tmdb.org/t/p/w185";
const COLORS = { tv: "#3ee6b0", movie: "#f5b942" } as const;
const KIND_LABEL = { tv: "Serie", movie: "Película" } as const;
// Conexiones por protagonistas o creador.
const PEOPLE_COLOR = "#b49cff";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Todo" },
  { value: "similar", label: "Parecidas" },
  { value: "people", label: "Elenco y creador" },
];

// Tamaños: el foco grande, sus conexiones medianas y el camino recorrido chiquito.
const R_FOCUS = 42;
const R_NEIGHBOR = 29;
const R_TRAIL = 20;

function homeZoom(width: number) {
  return width < 640 ? 0.85 : 1;
}

/**
 * Pocas conexiones a la vez para que el mapa respire.
 * En el título de inicio: 5 parecidas + 3 por elenco o creador. Después: 3 + 2.
 */
function pick(list: GraphNode[], filter: Filter, isRoot: boolean, exclude: Set<string>): GraphNode[] {
  const fresh = list.filter((n) => !exclude.has(n.key));
  const similar = fresh.filter((n) => !n.via);
  // Una por persona primero, así no se repite siempre el mismo actor.
  const byVia = new Map<string, GraphNode[]>();
  for (const n of fresh.filter((n) => n.via)) byVia.set(n.via!, [...(byVia.get(n.via!) ?? []), n]);
  const people: GraphNode[] = [];
  for (let round = 0; people.length < fresh.length && round < 4; round++) {
    for (const group of byVia.values()) if (group[round]) people.push(group[round]);
  }
  if (filter === "similar") return similar.slice(0, 6);
  if (filter === "people") return people.slice(0, 6);
  return isRoot ? [...similar.slice(0, 5), ...people.slice(0, 3)] : [...similar.slice(0, 3), ...people.slice(0, 2)];
}

type Camera = { x: number; y: number; k: number };

export default function DiscoverGraph({ root, neighbors, libraryKeys }: { root: GraphNode; neighbors: GraphNode[]; libraryKeys: string[] }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);
  const pool = useRef(new Map<string, SimNode>());
  const cache = useRef(new Map<string, GraphNode[]>([[root.key, neighbors]]));
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const nodeEls = useRef(new Map<string, HTMLElement>());
  const linkEls = useRef(new Map<string, SVGLineElement>());
  const cam = useRef<Camera>({ x: 0, y: 0, k: 1 });
  const camTarget = useRef<Camera | null>(null);
  const size = useRef({ w: 0, h: 0 });

  const [, setVersion] = useState(0);
  const [cacheVersion, setCacheVersion] = useState(0);
  const [top, setTop] = useState(57);
  // Camino recorrido desde el título inicial hasta el foco actual.
  const [path, setPath] = useState<string[]>([root.key]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [library, setLibrary] = useState(() => new Set(libraryKeys));
  const [hint, setHint] = useState(true);
  const focus = path[path.length - 1];

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

  const focusOn = useCallback((n: SimNode) => {
    const k = cam.current.k;
    camTarget.current = { x: -(n.x ?? 0) * k, y: -(n.y ?? 0) * k, k };
  }, []);

  /* ---------- Simulación ---------- */

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const drift = () => {
      if (reduceMotion) return;
      const t = performance.now() / 1000;
      for (const n of nodesRef.current) {
        if (n.fx != null) continue;
        n.vx = (n.vx ?? 0) + Math.cos(t * 0.6 + n.phase) * 0.04;
        n.vy = (n.vy ?? 0) + Math.sin(t * 0.5 + n.phase * 1.3) * 0.04;
      }
    };
    const sim = forceSimulation<SimNode, SimLink>([])
      .velocityDecay(0.45)
      .force("charge", forceManyBody<SimNode>().strength(-380).distanceMax(500))
      .force(
        "link",
        forceLink<SimNode, SimLink>([])
          .id((n) => n.key)
          .distance((l) => (l.source as SimNode).r + (l.target as SimNode).r + 70)
          .strength(0.6),
      )
      // Radio extra para que también entren los títulos debajo de cada círculo.
      .force("collide", forceCollide<SimNode>((n) => n.r + 30).strength(1).iterations(2))
      .force("x", forceX<SimNode>(0).strength(0.015))
      .force("y", forceY<SimNode>(0).strength(0.015))
      .force("drift", drift)
      .alphaTarget(reduceMotion ? 0 : 0.01)
      .on("tick", draw);
    simRef.current = sim;
    const onVisibility = () => (document.hidden ? sim.stop() : sim.restart());
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      sim.stop();
      simRef.current = null;
    };
  }, [draw]);

  // Arma lo que se ve: el camino recorrido + las conexiones del foco. Lo demás se oculta.
  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    const get = (data: GraphNode) => {
      let n = pool.current.get(data.key);
      if (!n) {
        n = { key: data.key, data, r: R_NEIGHBOR, phase: Math.random() * Math.PI * 2, x: 0, y: 0 };
        pool.current.set(data.key, n);
      }
      return n;
    };
    const prevVisible = new Set(nodesRef.current.map((n) => n.key));
    const onPath = new Set(path);
    const nodes: SimNode[] = [];
    const links: SimLink[] = [];

    // El camino.
    let parentList: GraphNode[] = [];
    path.forEach((key, i) => {
      const data = key === root.key ? root : parentList.find((d) => d.key === key) ?? pool.current.get(key)?.data;
      if (!data) return;
      const n = get(data);
      n.r = key === focus ? R_FOCUS : R_TRAIL;
      nodes.push(n);
      if (i > 0) {
        const prev = pool.current.get(path[i - 1])!;
        links.push({ key: `${prev.key}|${key}`, source: prev, target: n, via: data.via });
      }
      parentList = cache.current.get(key) ?? [];
    });

    // Las conexiones del foco.
    const focusNode = pool.current.get(focus)!;
    const around = pick(cache.current.get(focus) ?? [], filter, focus === root.key, onPath);
    around.forEach((data, i) => {
      const n = get(data);
      n.r = R_NEIGHBOR;
      if (!prevVisible.has(n.key)) {
        // Brotan desde el foco, repartidos en círculo.
        const a = (i / Math.max(around.length, 1)) * Math.PI * 2 + Math.random() * 0.3;
        n.x = (focusNode.x ?? 0) + Math.cos(a) * 20;
        n.y = (focusNode.y ?? 0) + Math.sin(a) * 20;
        n.vx = 0;
        n.vy = 0;
      }
      nodes.push(n);
      links.push({ key: `${focus}|${n.key}`, source: focusNode, target: n, via: data.via });
    });

    // Solo el foco queda fijo; el resto flota.
    for (const n of nodes) {
      n.fx = n.key === focus ? (n.x ?? 0) : null;
      n.fy = n.key === focus ? (n.y ?? 0) : null;
    }

    nodesRef.current = nodes;
    linksRef.current = links;
    sim.nodes(nodes);
    (sim.force("link") as ReturnType<typeof forceLink<SimNode, SimLink>>).links(links);
    sim.alpha(0.8).restart();
    focusOn(focusNode);
    setVersion((v) => v + 1);
  }, [path, filter, cacheVersion, focus, root, focusOn]);

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
        c.x += (t.x - c.x) * 0.1;
        c.y += (t.y - c.y) * 0.1;
        c.k += (t.k - c.k) * 0.1;
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

  /* ---------- Cargar conexiones de un título ---------- */

  const load = useCallback(async (key: string) => {
    if (cache.current.has(key)) return;
    setFailed(null);
    setLoading(key);
    try {
      const res = await fetch(`/api/explorar?n=${encodeURIComponent(key)}`);
      if (!res.ok) throw new Error(String(res.status));
      const data: { neighbors: GraphNode[] } = await res.json();
      cache.current.set(key, data.neighbors);
      setCacheVersion((v) => v + 1);
    } catch {
      setFailed(key);
    } finally {
      setLoading((k) => (k === key ? null : k));
    }
  }, []);

  const tap = useCallback(
    (n: SimNode) => {
      setHint(false);
      const idx = path.indexOf(n.key);
      if (idx === path.length - 1) {
        focusOn(n);
        return;
      }
      // Tocar el camino vuelve atrás; tocar una conexión avanza.
      setPath(idx >= 0 ? path.slice(0, idx + 1) : [...path, n.key]);
      load(n.key);
    },
    [path, focusOn, load],
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

  const release = (n: SimNode) => {
    if (n.key === focus) return;
    n.fx = null;
    n.fy = null;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const g = gesture.current;
    boxRef.current?.setPointerCapture(e.pointerId);
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    camTarget.current = null;
    if (g.pointers.size === 2) {
      const [a, b] = [...g.pointers.values()];
      g.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), k: cam.current.k };
      if (g.node) release(g.node);
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
      zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, g.pinch.k * (dist / g.pinch.dist));
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
      else release(g.node);
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      simRef.current?.alphaTarget(reduce ? 0 : 0.01);
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
  const onPath = new Set(path);
  const sel = pool.current.get(focus);

  return (
    <div
      ref={boxRef}
      className="fixed inset-x-0 bottom-0 z-20 touch-none select-none overflow-hidden bg-ink"
      style={{ top, backgroundImage: "radial-gradient(circle at 50% 40%, rgba(62,230,176,0.07), transparent 60%)" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div ref={worldRef} className="absolute left-0 top-0 origin-top-left will-change-transform">
        <svg className="absolute overflow-visible" width="1" height="1" aria-hidden>
          {links.map((l) => {
            const trail = onPath.has((l.target as SimNode).key);
            return (
              <line
                key={l.key}
                ref={(el) => {
                  if (el) linkEls.current.set(l.key, el);
                  else linkEls.current.delete(l.key);
                }}
                stroke={l.via ? PEOPLE_COLOR : trail ? "rgba(255,255,255,0.35)" : "#3ee6b0"}
                strokeOpacity={trail ? 0.5 : 0.6}
                strokeWidth={trail ? 1.5 : 1.5}
                strokeDasharray={l.via ? "5 4" : undefined}
              />
            );
          })}
        </svg>
        {nodes.map((n) => {
          const isFocus = n.key === focus;
          const isTrail = onPath.has(n.key) && !isFocus;
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
              style={{ zIndex: isFocus ? 3 : isTrail ? 1 : 2 }}
            >
              <div
                className="absolute flex flex-col items-center transition-opacity duration-300"
                style={{ left: -n.r, top: -n.r, width: d, opacity: isTrail ? 0.5 : 1 }}
              >
                <div
                  className="relative overflow-hidden rounded-full bg-panel transition-[width,height] duration-300 animate-[pop_.45s_ease-out]"
                  style={{
                    width: d,
                    height: d,
                    boxShadow: isFocus ? `0 0 0 3px #fff, 0 0 24px 4px ${color}77` : `0 0 0 2px ${color}`,
                  }}
                >
                  {n.data.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={IMG + n.data.image} alt="" draggable={false} loading="lazy" className="pointer-events-none h-full w-full object-cover" />
                  ) : (
                    <span className="grid h-full w-full place-items-center px-1 text-center text-[9px] leading-tight text-white/70">{n.data.label}</span>
                  )}
                  {loading === n.key && <span className="absolute inset-0 animate-pulse rounded-full bg-ink/60 ring-2 ring-inset ring-white/60" />}
                </div>
                {!isTrail && (
                  <>
                    <span
                      className="pointer-events-none mt-1.5 line-clamp-2 w-[104px] text-center text-[11px] font-medium leading-tight text-white/85 [text-shadow:0_1px_3px_#000]"
                      style={{ fontSize: isFocus ? 13 : undefined }}
                    >
                      {n.data.label}
                    </span>
                    {n.data.via && !isFocus && (
                      <span className="pointer-events-none line-clamp-1 w-[104px] text-center text-[10px] leading-tight [text-shadow:0_1px_3px_#000]" style={{ color: PEOPLE_COLOR }}>
                        {n.data.via}
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Arriba: volver y filtro */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-start gap-2 p-3">
        <Link
          href={`/title/${root.kind}/${root.id}`}
          className="pointer-events-auto max-w-[70%] truncate rounded-full bg-panel/90 px-3 py-1.5 text-sm text-white/80 ring-1 ring-white/10 backdrop-blur hover:text-white"
          onPointerDown={(e) => e.stopPropagation()}
        >
          ← {root.label}
        </Link>
        <div
          className="pointer-events-auto flex gap-1 rounded-full bg-panel/90 p-1 text-xs ring-1 ring-white/10 backdrop-blur"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`rounded-full px-3 py-1 transition ${filter === f.value ? "bg-white/15 text-white" : "text-white/60 hover:text-white"}`}
            >
              {f.value === "people" && <span className="mr-1 inline-block h-0 w-3 border-t-2 border-dashed align-middle" style={{ borderColor: PEOPLE_COLOR }} />}
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="pointer-events-none absolute right-3 top-3 flex flex-col gap-2">
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
          aria-label="Volver al inicio"
          className="pointer-events-auto grid h-9 w-9 place-items-center rounded-full bg-panel/90 text-white/80 ring-1 ring-white/10 hover:text-white"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            setPath([root.key]);
            cam.current.k = homeZoom(size.current.w);
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
          </svg>
        </button>
      </div>


      {sel && (
        <NodeCard
          node={sel.data}
          hint={hint}
          canGoBack={path.length > 1}
          back={() => setPath(path.slice(0, -1))}
          loading={loading === sel.key}
          failed={failed === sel.key}
          retry={() => load(sel.key)}
          inLibrary={library.has(sel.key)}
          onAdded={() => setLibrary((s) => new Set(s).add(sel.key))}
        />
      )}
    </div>
  );
}

function NodeCard({
  node,
  hint,
  canGoBack,
  back,
  loading,
  failed,
  retry,
  inLibrary,
  onAdded,
}: {
  node: GraphNode;
  hint: boolean;
  canGoBack: boolean;
  back: () => void;
  loading: boolean;
  failed: boolean;
  retry: () => void;
  inLibrary: boolean;
  onAdded: () => void;
}) {
  const [pending, start] = useTransition();
  return (
    <div className="absolute inset-x-0 bottom-0 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" onPointerDown={(e) => e.stopPropagation()}>
      <div className="mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-panel/95 p-3 shadow-2xl ring-1 ring-white/10 backdrop-blur">
        {canGoBack && (
          <button onClick={back} aria-label="Volver al anterior" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 text-white/80 hover:bg-white/20">
            ‹
          </button>
        )}
        <div className="relative aspect-[2/3] w-12 shrink-0 overflow-hidden rounded-lg bg-white/5">
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
                : hint
                  ? "Toca un círculo para seguir explorando"
                  : [node.year, node.via].filter(Boolean).join(" · ")}
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
