import "server-only";
import raw from "../../content/timeline.json";
import { factoryState, sortEvents } from "./carState";
import { TimelineSchema, type Timeline } from "./types";

/** Load + validate content/timeline.json. Throws (failing the build) on bad data. */
export function loadTimeline(): Timeline {
  const parsed = TimelineSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`content/timeline.json is invalid:\n${parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n")}`);
  }
  const timeline = { ...parsed.data, events: sortEvents(parsed.data.events) };
  factoryState(timeline); // throws if a part has no factory finish
  return timeline;
}
