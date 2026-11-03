import { ALL_PARTS, PART_ALIASES, type PartId } from "./parts";
import type { CarState, Finish, Timeline, TimelineEvent } from "./types";

/** Expand aliases ("@chrome") into concrete part ids. Later keys win. */
export function expandParts(map: Record<string, Finish>): Partial<Record<PartId, Finish>> {
  const out: Partial<Record<PartId, Finish>> = {};
  for (const [key, finish] of Object.entries(map)) {
    const ids = PART_ALIASES[key] ?? [key as PartId];
    for (const id of ids) out[id] = finish;
  }
  return out;
}

export function factoryState(timeline: Timeline): CarState {
  const state = expandParts(timeline.car.factory);
  const missing = ALL_PARTS.filter((p) => !state[p]);
  if (missing.length) throw new Error(`car.factory is missing parts: ${missing.join(", ")}`);
  return state as CarState;
}

export function sortEvents(events: TimelineEvent[]): TimelineEvent[] {
  return [...events].sort((a, b) => a.date.localeCompare(b.date));
}

/** The car's look at time `t` (ISO date): factory look + every event up to and including t. */
export function deriveState(timeline: Timeline, t: string): CarState {
  const state = { ...factoryState(timeline) };
  for (const ev of sortEvents(timeline.events)) {
    if (ev.date > t) break;
    if (ev.parts) Object.assign(state, expandParts(ev.parts));
  }
  return state;
}

export type Plate = NonNullable<TimelineEvent["plate"]>;

/** Plates on the car at time t (null = whatever the model shipped with). */
export function plateAt(timeline: Timeline, t: string): Plate | null {
  let plate: Plate | null = null;
  for (const ev of sortEvents(timeline.events)) {
    if (ev.date > t) break;
    if (ev.plate) plate = ev.plate;
  }
  return plate;
}

/** Every finish a part has had, oldest first, with the event that caused it. */
export function partHistory(timeline: Timeline, part: PartId) {
  const history: { date: string | null; event: TimelineEvent | null; finish: Finish }[] = [
    { date: null, event: null, finish: factoryState(timeline)[part] },
  ];
  for (const ev of sortEvents(timeline.events)) {
    const f = ev.parts && expandParts(ev.parts)[part];
    if (f) history.push({ date: ev.date, event: ev, finish: f });
  }
  return history;
}

/** Latest event at or before t (the one the detail panel shows). */
export function eventAt(timeline: Timeline, t: string): TimelineEvent | null {
  let found: TimelineEvent | null = null;
  for (const ev of sortEvents(timeline.events)) if (ev.date <= t) found = ev;
  return found;
}
