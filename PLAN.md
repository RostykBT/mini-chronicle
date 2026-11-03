# MINI F56 Timeline Explorer — Implementation Plan

A web app for browsing the history of one car (MINI Cooper F56, 3-door hatch).
There is a 3D model of the car in the centre and a timeline under it. When you move the
timeline cursor, the car changes to its state on that date (wrap colours per panel, and
later parts/mods). The text updates and photos for that period show beside it.

## Stack (installed)

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router, `src/`, TypeScript, Turbopack) |
| Styling | Tailwind CSS v4 |
| 3D | three.js + `@react-three/fiber` + `@react-three/drei` |
| Client state | zustand (current time, selected event, selected panel) |
| Dates | date-fns |
| Content validation | zod |

## Core idea: events → derived car state

All data is a list of **timestamped events**. The car state at time `t` is a pure
function: fold every event with `date <= t` into a `CarState`.

```ts
type PanelId =
  | "hood" | "roof" | "tailgate"
  | "door_l" | "door_r"
  | "fender_fl" | "fender_fr" | "quarter_rl" | "quarter_rr"
  | "bumper_f" | "bumper_r"
  | "mirror_cap_l" | "mirror_cap_r"
  | "a_pillar_l" | "a_pillar_r" | "c_pillar_l" | "c_pillar_r";

type Finish = { color: string; finish: "gloss" | "satin" | "matte" | "metallic" | "chrome"; label?: string };

type TimelineEvent = {
  id: string;
  date: string;              // ISO, e.g. 2025-06-14 or 2025-06-14T10:00
  title: string;
  body?: string;             // markdown text update
  photos?: { src: string; caption?: string; takenAt?: string }[];
  tags?: ("wrap" | "service" | "mod" | "repair" | "trip" | "purchase")[];
  panels?: Partial<Record<PanelId, Finish | "factory">>;  // what changed at this moment
  odometerKm?: number;
};

type CarState = { panels: Record<PanelId, Finish>; odometerKm?: number };
```

- The factory paint is the starting state (one `purchase` event sets all panels).
- A wrap event lists only the panels it changed. For example, roof + mirror caps on one
  date and the full body on a later date. `"factory"` means the wrap was removed.
- Because the state is derived, scrubbing backwards in time is free and always correct.
  We do not need undo logic.

## Content storage (phase 1: files in the repo)

```
content/
  car.json                 # model, VIN-less info, factory colour per panel
  events/
    2023-04-02-purchase.md
    2025-06-14-roof-wrap.md   # frontmatter = event fields, body = text update
public/photos/2025-06-14/*.jpg
```

- Load and validate this content at build time with zod (`src/lib/content.ts`). If the
  data is bad, the build fails with a clear message.
- Add a small script (`scripts/import-photos.ts`) that reads the EXIF `DateTimeOriginal` of
  each photo, resizes it with `sharp`, and writes it into the correct date folder or
  attaches it to the nearest event.
- Phase 2 (optional): move to a DB + upload UI (e.g. SQLite/Turso or Supabase + storage)
  if you want to add updates from your phone. The `TimelineEvent` type stays the same,
  so only the loader changes.

## Status (2026-11-03)

Done:
- **Model pipeline:** `npm run model:convert` (FBX → raw GLB), then `npm run model:build`
  (`scripts/build-model.mjs` → `public/models/f56.glb`). The script splits the source mesh
  into 30 recolourable parts:
  - Body panels: hood, front and rear bumpers, both fenders, both doors, both rear
    quarters, tailgate
  - Contrast parts: roof, spoiler, both mirror caps
  - 11 chrome parts, used for dechrome: grille surround, window line trim, door handles,
    side scuttles, taillight rings, fuel cap, exhaust…
  - Grille bar (for the red stripe), the LED DRL rings, wheels and callipers

  The part ids are listed in `src/lib/parts.ts`. `/debug/model` shows each part in its
  own colour. `node scripts/shoot.mjs <url> <out>` takes screenshots with the local Chrome.
- **Data:** `content/timeline.json` holds the factory look and the events. It is validated
  with zod (`src/lib/types.ts`, `src/lib/content.ts`). `deriveState()` / `partHistory()`
  are in `src/lib/carState.ts`. Events can use aliases such as `@body`, `@chrome` and
  `@mirror_caps`.
- **UI:** the 3D scene (studio lighting, animated colour changes, hover/click a part to see
  its history); a timeline with markers, drag, ←/→, play, and `?t=` deep links; a detail
  panel with text, photos and the list of changed parts.

Known imperfections in the model split (fix in Blender if two-tone panels are ever needed):
- a small notch where the left front fender meets the door
- a slightly uneven line where the rear bumper meets the rear quarter

Next: real dates and photos, split the current mod into separate events if needed,
Markdown bodies, a photo import script, tests for `carState`, mobile polish.

## The 3D model (the most important dependency)

The panel recolouring needs a **GLB in which each body panel is a separate mesh with a
known name**.

1. Get an F56 model: buy or download a licensed one (Sketchfab/CGTrader), or use your own
   photogrammetry scan.
2. In Blender, separate the body into the panels listed in `PanelId` and name each
   object exactly (`hood`, `roof`, …). Keep glass, lights, tyres and trim as separate,
   non-recolourable meshes.
3. Export the result to `public/models/f56.glb`. Compress it with
   `npx gltfjsx f56.glb --transform` (Draco + texture resize). This also makes a typed
   React component.
4. **Until the model is ready:** use a procedural placeholder car made from boxes, with
   the same panel names. Then the timeline and the colour logic can be fully built and
   tested first.

Rendering: `<Canvas>` with `OrbitControls`, `Environment` (studio HDRI) for realistic
reflections, `ContactShadows`. Each panel gets a `MeshPhysicalMaterial` from its
`Finish`. Use clearcoat for gloss, high roughness for matte, metalness + flakes for
metallic. Colours change with a short lerp, so the wrap visibly "applies".

## UI layout

```
┌───────────────────────────────────────────────┬───────────────┐
│                                               │ Event detail  │
│              3D canvas (car)                  │  title, date  │
│   click panel → shows its colour history      │  text update  │
│                                               │  photo strip  │
├───────────────────────────────────────────────┴───────────────┤
│ ◀ ▶  ●───●──────●●────────●─────────|cursor|──────●  ▷ play  │
│      2023          2024            2025            2026       │
└───────────────────────────────────────────────────────────────┘
```

- **Timeline bar:** zoomable/pannable time axis, event markers coloured by tag, a draggable
  cursor, keyboard ←/→ to jump between events, and a play button that animates through
  time.
- **Detail panel:** shows the event at or just before the cursor. Includes a photo
  lightbox, and a "before / after" toggle for wrap events.
- **Panel inspector:** hover a panel to highlight it. Click a panel to see the list of
  finishes it had over time.
- **Deep links:** `?t=2025-06-14&event=roof-wrap` in the URL, so a date can be shared.
- On mobile, the detail panel becomes a bottom sheet.

## File structure (target)

```
src/
  app/
    page.tsx                 # server: load content, pass to <Explorer>
    layout.tsx
  components/
    Explorer.tsx             # client root, layout
    scene/
      CarScene.tsx           # Canvas, lights, env, controls (dynamic import, ssr:false)
      CarModel.tsx           # GLB or placeholder, applies CarState to meshes
      PlaceholderCar.tsx
      materials.ts           # Finish → MeshPhysicalMaterial params
    timeline/
      Timeline.tsx
      EventMarker.tsx
    detail/
      EventDetail.tsx
      PhotoLightbox.tsx
      PanelHistory.tsx
  lib/
    types.ts                 # PanelId, Finish, TimelineEvent, CarState
    schema.ts                # zod schemas
    content.ts               # read content/ at build time
    carState.ts              # deriveState(events, t) + panelHistory(events, panel)
  store/
    useExplorer.ts           # zustand: currentTime, selectedEventId, hoveredPanel
content/
scripts/
  import-photos.ts
```

## Milestones

1. **Data core:** types, zod schema, content loader, `deriveState` + unit tests (vitest),
   2–3 sample events (purchase, roof/mirror wrap, full wrap).
2. **3D scene with the placeholder car:** Canvas, lighting, orbit, panels coloured from
   `CarState`, hover/click picking.
3. **Timeline:** axis, markers, draggable cursor wired to the store, ←/→ and play.
4. **Detail panel:** markdown body, photo strip + lightbox, URL deep links.
5. **Real F56 model:** prepare the GLB in Blender, replace the placeholder, tune the
   materials.
6. **Polish:** colour transitions, before/after, panel history, mobile layout, image
   optimisation (`next/image`), loading states.
7. **(Optional) Authoring:** an admin page to add events and upload photos, plus a DB backend.
8. **Deploy:** Vercel (static export is possible for as long as the content is file-based).

## Open questions for you

- Factory colour of the car, and the wrap colours/finishes (with dates) for each panel.
- Do you already have a 3D model of the F56, or should we find one?
- Roughly how many photos? Are they on your phone with intact EXIF dates?
- Private (only you) or public site? This decides if authoring needs authentication.
