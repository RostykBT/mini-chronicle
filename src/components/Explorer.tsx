"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { deriveState, eventAt, plateAt } from "@/lib/carState";
import { partLabel } from "@/lib/parts";
import type { Timeline as TimelineData } from "@/lib/types";
import { useExplorer } from "@/store/useExplorer";
import { EventDetail } from "./detail/EventDetail";
import { Timeline } from "./timeline/Timeline";

const CarScene = dynamic(() => import("./scene/CarScene"), { ssr: false, loading: () => <StageLoader /> });

const noopSubscribe = () => () => {};
const localToday = () => new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD, local time

import { SHEET_PEEK } from "@/lib/layout";

export function Explorer({ timeline }: { timeline: TimelineData }) {
  // "today" is the viewer's date, so it's only known in the browser (null while prerendering)
  const today = useSyncExternalStore(noopSubscribe, localToday, () => null);
  const time = useExplorer((s) => s.time);
  const setTime = useExplorer((s) => s.setTime);
  const hoveredPart = useExplorer((s) => s.hoveredPart);
  const selectedPart = useExplorer((s) => s.selectedPart);
  const [sheetOpen, setSheetOpen] = useState(false);

  // deep link: ?t=YYYY-MM-DD, otherwise start at today
  useEffect(() => {
    if (!today) return;
    const t = new URLSearchParams(window.location.search).get("t");
    setTime(t && /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : today);
  }, [setTime, today]);

  // keep ?t= in sync (without adding history entries)
  useEffect(() => {
    if (!time) return;
    const url = new URL(window.location.href);
    url.searchParams.set("t", time);
    window.history.replaceState(null, "", url);
  }, [time]);

  const state = useMemo(() => deriveState(timeline, time || "9999-12-31"), [timeline, time]);
  const event = useMemo(() => (time ? eventAt(timeline, time) : null), [timeline, time]);
  const plate = useMemo(() => (time ? plateAt(timeline, time) : null), [timeline, time]);

  return (
    // fixed full-screen grid: header / stage / timeline. Nothing in here changes height at
    // runtime, so the canvas never resizes (no jumping on phones).
    <div className="fixed inset-0 grid h-[100svh] grid-rows-[auto_1fr_auto] bg-paper">
      <Header model={timeline.car.model} plate={plate?.number} />

      <main className="relative min-h-0 overflow-hidden lg:grid lg:grid-cols-[1fr_420px]">
        {/* stage */}
        <div className="absolute inset-0 lg:relative">
          <CarScene state={state} plate={plate} />
          <StageHero name={timeline.car.name} paint={timeline.car.spec?.paint} built={timeline.car.spec?.built} />
          {hoveredPart && (
            <div className="pointer-events-none absolute left-1/2 top-4 hidden -translate-x-1/2 rounded-full bg-ink px-3.5 py-1.5 text-[13px] text-paper lg:block">
              {partLabel(hoveredPart)}
            </div>
          )}
        </div>

        {/* details: a bottom sheet on phones, a sidebar on desktop (same element) */}
        <DetailSheet open={sheetOpen} onOpenChange={setSheetOpen} attention={selectedPart}>
          <EventDetail timeline={timeline} event={event} />
        </DetailSheet>
      </main>

      <div className="border-t border-line bg-paper pb-[env(safe-area-inset-bottom)]">
        {today && time ? <Timeline events={timeline.events} today={today} /> : <div className="h-[88px]" />}
      </div>
    </div>
  );
}

function Header({ model, plate }: { model: string; plate?: string }) {
  return (
    <header className="z-20 flex h-14 items-center justify-between border-b border-line bg-paper px-4 pt-[env(safe-area-inset-top)] sm:px-6 lg:h-16">
      <div className="headline text-[22px] lg:text-[26px]">My MINI.</div>
      <div className="flex items-center gap-3 text-[13px] text-muted lg:text-sm">
        <span className="hidden sm:inline">{model}</span>
        {plate && (
          <span className="rounded border border-ink px-1.5 py-0.5 font-medium tracking-wide text-ink">{plate}</span>
        )}
      </div>
    </header>
  );
}

/** MINI-style hero copy over the 3D stage. */
function StageHero({ name, paint, built }: { name: string; paint?: string; built?: string }) {
  const colour = paint?.replace(/^[A-Z0-9]+ /, "");
  return (
    <div className="pointer-events-none absolute left-4 top-4 max-w-[70%] text-ink sm:left-6 sm:top-6 lg:left-10 lg:top-10">
      <h1 className="headline text-[26px] sm:text-[34px] lg:text-[44px]">{name.replace(/^My /, "")} Cooper&nbsp;S.</h1>
      {colour && (
        <p className="subline mt-1 text-[15px] sm:text-xl lg:text-2xl">
          {colour}{built ? `, built ${built.slice(0, 4)}.` : "."}
        </p>
      )}
    </div>
  );
}

function StageLoader() {
  return (
    <div className="grid h-full place-items-center bg-mist">
      <div className="flex flex-col items-center gap-3">
        <span className="rule animate-pulse" />
        <span className="text-[13px] uppercase tracking-[0.18em] text-muted">Loading</span>
      </div>
    </div>
  );
}

/**
 * Phones: a bottom sheet over the stage. Collapsed it shows SHEET_PEEK px; it only ever
 * moves with transform, so nothing else on screen reflows. Desktop: a static sidebar.
 */
function DetailSheet({
  open,
  onOpenChange,
  attention,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  attention: unknown;
  children: React.ReactNode;
}) {
  const drag = useRef<{ y: number; t: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // new content (e.g. a tapped part) starts at the top
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [attention]);

  return (
    <section
      className={[
        "absolute inset-x-0 bottom-0 z-10 flex h-[78%] flex-col rounded-t-[20px] bg-paper shadow-[0_-8px_30px_rgba(0,0,0,0.12)]",
        "translate-y-(--sheet-y) transition-[translate] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] will-change-transform",
        "lg:relative lg:inset-auto lg:h-full lg:translate-y-0 lg:rounded-none lg:border-l lg:border-line lg:shadow-none lg:transition-none",
      ].join(" ")}
      style={{ "--sheet-y": open ? "0px" : `calc(100% - ${SHEET_PEEK}px)` } as React.CSSProperties}
    >
      {/* handle (phones): tap or swipe */}
      <button
        aria-label={open ? "Collapse details" : "Expand details"}
        className="flex h-6 shrink-0 touch-none items-center justify-center lg:hidden"
        onClick={() => onOpenChange(!open)}
        onPointerDown={(e) => (drag.current = { y: e.clientY, t: Date.now() })}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (!d) return;
          const dy = e.clientY - d.y;
          if (Math.abs(dy) > 24) {
            e.preventDefault();
            onOpenChange(dy < 0);
          }
        }}
      >
        <span className="h-1 w-10 rounded-full bg-black/20" />
      </button>
      <div
        ref={scrollRef}
        className={`no-scrollbar min-h-0 flex-1 overscroll-contain ${open ? "overflow-y-auto" : "overflow-hidden"} lg:overflow-y-auto`}
        onClick={() => !open && onOpenChange(true)}
      >
        {children}
      </div>
    </section>
  );
}
