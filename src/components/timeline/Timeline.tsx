"use client";

import { addMonths, format, parseISO, subMonths } from "date-fns";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TimelineEvent } from "@/lib/types";
import { useExplorer } from "@/store/useExplorer";
import { makeScale } from "./scale";

export function Timeline({ events, today }: { events: TimelineEvent[]; today: string }) {
  const time = useExplorer((s) => s.time);
  const setTime = useExplorer((s) => s.setTime);
  const playing = useExplorer((s) => s.playing);
  const setPlaying = useExplorer((s) => s.setPlaying);
  const trackRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  // tick density follows the real track width (phones get fewer labels)
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [start, end] = useMemo(() => {
    const first = events.length ? parseISO(events[0].date) : parseISO(today);
    const last = parseISO(events.length && events.at(-1)!.date > today ? events.at(-1)!.date : today);
    return [subMonths(first, 2), addMonths(last, 1)];
  }, [events, today]);
  const scale = useMemo(() => makeScale(start, end, events.map((e) => e.date)), [start, end, events]);
  const pct = useCallback((d: string) => scale.pos(d) * 100, [scale]);

  const timeFromClientX = useCallback(
    (clientX: number) => {
      const r = trackRef.current!.getBoundingClientRect();
      const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      // snap to an event within ~12 px of the finger / pointer
      const snapPct = (12 / Math.max(r.width, 1)) * 100;
      const snap = events.find((e) => Math.abs(pct(e.date) - f * 100) < snapPct);
      const d = snap ? snap.date : scale.dateAt(f);
      return d > today && !snap ? today : d; // never scrub into the future
    },
    [events, pct, scale, today],
  );

  const jump = useCallback(
    (dir: 1 | -1) => {
      const list = dir === 1 ? events : [...events].reverse();
      const next = list.find((e) => (dir === 1 ? e.date > time : e.date < time));
      if (next) setTime(next.date);
      else if (dir === 1) setTime(today);
    },
    [events, time, setTime, today],
  );

  // keyboard: ← / → jump between events, space plays
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea")) return;
      if (e.key === "ArrowRight") { e.preventDefault(); jump(1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); jump(-1); }
      if (e.key === " ") { e.preventDefault(); setPlaying(!useExplorer.getState().playing); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [jump, setPlaying]);

  // play: sweep along the track (not linear time) from the cursor to today in ~10 s
  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now();
    const now0 = useExplorer.getState().time;
    let f = now0 >= today ? 0 : scale.pos(now0);
    const tick = (now: number) => {
      f += (now - last) / 10000;
      last = now;
      if (f >= scale.pos(today)) { setTime(today); setPlaying(false); return; }
      setTime(scale.dateAt(f));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, today, scale, setTime, setPlaying]);

  const ticks = useMemo(() => (width ? scale.ticks(Math.max(0.045, 46 / width)) : []), [scale, width]);
  const cursor = pct(time);
  const current = [...events].reverse().find((e) => e.date <= time);

  // keep the date pill inside the track at both ends
  const labelShift = cursor < 8 ? "0%" : cursor > 92 ? "-100%" : "-50%";

  return (
    <div className="flex h-[88px] items-center gap-3 px-3 sm:gap-5 sm:px-6">
      <div className="flex shrink-0 items-center gap-1.5">
        <button className="pill pill-icon hidden h-9 w-9 sm:inline-flex" aria-label="Previous entry (←)" title="Previous entry (←)" onClick={() => jump(-1)}>
          <Chevron dir="left" />
        </button>
        <button
          className="pill pill-icon h-10 w-10 border-ink bg-ink text-paper hover:bg-paper hover:text-ink"
          aria-label={playing ? "Pause (space)" : "Play (space)"}
          title={playing ? "Pause (space)" : "Play (space)"}
          onClick={() => setPlaying(!playing)}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button className="pill pill-icon hidden h-9 w-9 sm:inline-flex" aria-label="Next entry (→)" title="Next entry (→)" onClick={() => jump(1)}>
          <Chevron dir="right" />
        </button>
      </div>

      {/* the whole block is the touch target; touch-none stops page scroll/zoom while dragging */}
      <div
        className="relative h-full flex-1 cursor-pointer touch-none select-none"
        onPointerDown={(e) => {
          setPlaying(false);
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          setTime(timeFromClientX(e.clientX));
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1 || e.pointerType === "touch") {
            if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) setTime(timeFromClientX(e.clientX));
          }
        }}
      >
        {/* date pill */}
        <div className="pointer-events-none absolute top-2.5" style={{ left: `${cursor}%`, transform: `translateX(${labelShift})` }}>
          <div className="whitespace-nowrap rounded-full bg-ink px-2.5 py-[3px] text-[12px] font-medium tabular-nums text-paper">
            {format(parseISO(time), "d MMM yyyy")}
          </div>
        </div>

        {/* track */}
        <div ref={trackRef} className="absolute inset-x-0 top-[44px] h-[2px] bg-line">
          <div className="absolute inset-y-0 left-0 bg-ink" style={{ width: `${cursor}%` }} />
        </div>

        {/* event markers */}
        {events.map((e) => {
          const past = e.date <= time;
          const isCurrent = current?.id === e.id;
          return (
            <span
              key={e.id}
              title={`${e.dateLabel ?? e.date} · ${e.title}`}
              className={`pointer-events-none absolute top-[45px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] transition-[width,height,background-color] ${
                isCurrent ? "h-3.5 w-3.5 border-accent bg-accent" : past ? "h-2.5 w-2.5 border-ink bg-ink" : "h-2.5 w-2.5 border-ink bg-paper"
              }`}
              style={{ left: `${pct(e.date)}%` }}
            />
          );
        })}

        {/* cursor line */}
        <div className="pointer-events-none absolute top-[34px] h-[22px] w-[2px] -translate-x-1/2 bg-ink" style={{ left: `${cursor}%` }} />

        {/* year / month ticks (non-linear scale: see scale.ts) */}
        {ticks.map((t) => (
          <div
            key={`${t.f}`}
            className={`pointer-events-none absolute top-[60px] -translate-x-1/2 text-[11px] tabular-nums ${t.major ? "font-semibold text-ink" : "text-muted"}`}
            style={{ left: `${t.f * 100}%` }}
          >
            {t.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d={dir === "left" ? "M9 2 4 7l5 5" : "M5 2l5 5-5 5"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <path d="M4 2.5v9l7.5-4.5z" fill="currentColor" />
    </svg>
  );
}
function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <path d="M3.5 2.5h2.5v9H3.5zM8 2.5h2.5v9H8z" fill="currentColor" />
    </svg>
  );
}
