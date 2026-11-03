"use client";

import { format, parseISO } from "date-fns";
import { useState } from "react";
import { expandParts, partHistory } from "@/lib/carState";
import { partLabel, type PartId } from "@/lib/parts";
import type { Finish, Timeline, TimelineEvent } from "@/lib/types";
import { useExplorer } from "@/store/useExplorer";

const fmt = (d: string) => format(parseISO(d), "d MMMM yyyy");
/** MINI headlines end with a full stop. */
const stop = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

function Swatch({ finish, size = 18 }: { finish: Finish; size?: number }) {
  const bg =
    finish.finish === "chrome"
      ? "linear-gradient(135deg,#f5f5f5,#9ca3af 45%,#f9fafb 55%,#6b7280)"
      : finish.finish === "metallic"
        ? `linear-gradient(135deg, ${finish.color}, #ffffff66 50%, ${finish.color})`
        : finish.color;
  return (
    <span
      className="inline-block shrink-0 rounded-full ring-1 ring-black/15"
      style={{ background: bg, width: size, height: size }}
    />
  );
}

export function EventDetail({ timeline, event }: { timeline: Timeline; event: TimelineEvent | null }) {
  const selectedPart = useExplorer((s) => s.selectedPart);
  const setTime = useExplorer((s) => s.setTime);
  const setSelected = useExplorer((s) => s.setSelectedPart);

  return (
    <div className="flex min-h-full flex-col px-5 pb-6 pt-1 sm:px-7 lg:px-8 lg:pt-8">
      {selectedPart ? (
        <PartPanel timeline={timeline} part={selectedPart} onJump={setTime} onClose={() => setSelected(null)} />
      ) : event ? (
        <EventPanel event={event} spec={timeline.car.spec} />
      ) : (
        <p className="text-[15px] text-muted">Before the first entry. Drag the timeline to explore.</p>
      )}
      <p className="mt-auto pt-8 text-[13px] text-muted">Tap a panel on the car to see its history.</p>
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-muted">{children}</p>;
}

function Meta({ items }: { items: (string | false | undefined)[] }) {
  const list = items.filter(Boolean) as string[];
  if (!list.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {list.map((m) => (
        <span key={m} className="rounded-full border border-line px-3 py-1 text-[13px] tabular-nums">
          {m}
        </span>
      ))}
    </div>
  );
}

function EventPanel({ event, spec }: { event: TimelineEvent; spec?: Spec }) {
  const changed = event.parts ? (Object.entries(expandParts(event.parts)) as [PartId, Finish][]) : [];
  // group parts with identical finishes: "Roof, Spoiler → Red"
  const groups = new Map<string, { finish: Finish; parts: PartId[] }>();
  for (const [p, f] of changed) {
    const k = `${f.color}|${f.finish}|${f.label}`;
    if (!groups.has(k)) groups.set(k, { finish: f, parts: [] });
    groups.get(k)!.parts.push(p);
  }

  return (
    <article className="flex flex-col">
      {/* --- this top block is what the collapsed phone sheet shows --- */}
      <Eyebrow>{event.dateLabel ?? fmt(event.date)}</Eyebrow>
      <h2 className="headline mt-1.5 line-clamp-2 text-[22px] sm:text-[26px] lg:line-clamp-none lg:text-[32px]">{stop(event.title)}</h2>
      <Meta
        items={[
          event.odometerKm != null && `${event.odometerKm.toLocaleString("en-GB")} km`,
          event.costEur != null && `€${event.costEur.toLocaleString("en-GB", { maximumFractionDigits: 2 })}`,
        ]}
      />
      {/* --------------------------------------------------------------- */}

      <span className="rule mt-6" />
      {event.body && <p className="mt-5 whitespace-pre-line text-[15px] leading-relaxed">{event.body}</p>}
      {event.photos.length > 0 && <Photos photos={event.photos} />}
      {event.tags.includes("factory") && spec && <SpecSheet spec={spec} />}

      {groups.size > 0 && (
        <section className="mt-8">
          <h3 className="headline text-[17px]">What changed.</h3>
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {[...groups.values()].map(({ finish, parts }) => (
              <li key={parts.join()} className="flex items-start gap-3 py-3">
                <Swatch finish={finish} />
                <div className="min-w-0 text-[14px] leading-snug">
                  <div className="font-medium">{finish.label ?? finish.color}</div>
                  <div className="text-muted">{parts.map(partLabel).join(", ")}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

type Spec = NonNullable<Timeline["car"]["spec"]>;

function SpecSheet({ spec }: { spec: Spec }) {
  const rows: [string, string][] = [
    ["VIN", `…${spec.vinShort}`],
    ["Engine", spec.engine],
    ["Power", spec.power],
    ["Drive", `${spec.drive} · ${spec.steering}`],
    ["Paint", spec.paint],
    ["Interior", spec.upholstery],
  ];
  return (
    <section className="mt-8">
      <h3 className="headline text-[17px]">Factory spec.</h3>
      <dl className="mt-3 divide-y divide-line border-y border-line text-[14px]">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[88px_1fr] gap-3 py-2.5">
            <dt className="text-muted">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <details className="group mt-4 text-[14px]">
        <summary className="pill cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          {spec.options.length} factory options
          <span className="transition-transform group-open:rotate-180">⌄</span>
        </summary>
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {spec.options.map((o) => (
            <li key={o.code} className="flex gap-3 py-2">
              <span className="w-10 shrink-0 text-[12px] leading-5 tabular-nums text-muted">S{o.code}</span>
              <span>{o.name}</span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function Photos({ photos }: { photos: TimelineEvent["photos"] }) {
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const visible = photos.filter((p) => !broken.has(p.src));
  if (!visible.length) return null;
  return (
    <>
      <div className={`mt-6 grid gap-2 ${visible.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
        {visible.map((p) => (
          <button key={p.src} onClick={() => setOpen(p.src)} className="group overflow-hidden bg-mist text-left">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.src}
              alt={p.caption ?? ""}
              loading="lazy"
              className="aspect-[16/10] w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              onError={() => setBroken((b) => new Set(b).add(p.src))}
            />
            {p.caption && <span className="block px-0 py-2 text-[12px] text-muted">{p.caption}</span>}
          </button>
        ))}
      </div>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/90 p-4" onClick={() => setOpen(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={open} alt="" className="max-h-full max-w-full" />
          <button className="pill pill-icon absolute right-4 top-4 border-white bg-transparent text-white" aria-label="Close">
            ✕
          </button>
        </div>
      )}
    </>
  );
}

function PartPanel({ timeline, part, onJump, onClose }: { timeline: Timeline; part: PartId; onJump: (d: string) => void; onClose: () => void }) {
  const history = partHistory(timeline, part);
  return (
    <section className="flex flex-col">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Eyebrow>Part history</Eyebrow>
          <h2 className="headline mt-1.5 text-[22px] sm:text-[26px] lg:text-[32px]">{stop(partLabel(part))}</h2>
        </div>
        <button onClick={onClose} className="pill pill-icon h-9 w-9 shrink-0" aria-label="Close part history">
          ✕
        </button>
      </div>
      <Meta items={[`${history.length} ${history.length === 1 ? "finish" : "finishes"}`]} />
      <span className="rule mt-6" />
      <ol className="mt-5 divide-y divide-line border-y border-line">
        {history.map((h, i) => (
          <li key={i}>
            <button
              className="flex w-full items-center gap-3 py-3 text-left hover:bg-mist"
              onClick={() => onJump(h.date ?? timeline.events[0]?.date ?? h.date!)}
            >
              <Swatch finish={h.finish} />
              <span className="min-w-0 text-[14px] leading-snug">
                <span className="block font-medium">{h.finish.label ?? h.finish.color}</span>
                <span className="block text-muted">{h.date ? `${h.event!.dateLabel ?? fmt(h.date)} · ${h.event!.title}` : "Factory"}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
