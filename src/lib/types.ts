import { z } from "zod";
import { ALL_PARTS, PART_ALIASES, type PartId } from "./parts";

export const FinishSchema = z.object({
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  finish: z.enum(["gloss", "satin", "matte", "metallic", "chrome", "emissive", "glass"]),
  label: z.string().optional(),
});
export type Finish = z.infer<typeof FinishSchema>;

/** Part ids or aliases (e.g. "@chrome") → finish. */
const PartMapSchema = z.record(z.string(), FinishSchema).superRefine((map, ctx) => {
  for (const key of Object.keys(map)) {
    if (!(ALL_PARTS as string[]).includes(key) && !(key in PART_ALIASES))
      ctx.addIssue({ code: "custom", message: `Unknown part "${key}"`, path: [key] });
  }
});

export const PhotoSchema = z.object({
  src: z.string(),
  caption: z.string().optional(),
});

export const TimelineEventSchema = z.object({
  id: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  title: z.string(),
  /** Shown instead of the date when the exact date isn't known (date then only orders it). */
  dateLabel: z.string().optional(),
  body: z.string().optional(),
  tags: z.array(z.enum(["purchase", "wrap", "mod", "service", "repair", "trip", "detail", "legal", "factory"])).default([]),
  photos: z.array(PhotoSchema).default([]),
  /** Parts whose look changed at this moment. */
  parts: PartMapSchema.optional(),
  odometerKm: z.number().optional(),
  costEur: z.number().optional(),
  /** Number plates fitted from this moment on. */
  plate: z
    .object({
      number: z.string(),
      style: z.enum(["be-export", "ee"]),
    })
    .optional(),
  /** Where the entry came from, e.g. a Notion page URL. */
  source: z.string().optional(),
});
export type TimelineEvent = z.infer<typeof TimelineEventSchema>;

export const TimelineSchema = z.object({
  car: z.object({
    name: z.string(),
    model: z.string(),
    /** Build sheet (from the VIN decoder). */
    spec: z
      .object({
        vinShort: z.string(),
        built: z.string(),
        engine: z.string(),
        power: z.string(),
        drive: z.string(),
        steering: z.string(),
        paint: z.string(),
        upholstery: z.string(),
        options: z.array(z.object({ code: z.string(), name: z.string() })),
      })
      .optional(),
    /** Look as delivered from the factory. Every part must be covered. */
    factory: PartMapSchema,
  }),
  events: z.array(TimelineEventSchema),
});
export type Timeline = z.infer<typeof TimelineSchema>;

export type CarState = Record<PartId, Finish>;
