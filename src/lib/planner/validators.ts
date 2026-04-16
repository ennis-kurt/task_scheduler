import { z } from "zod";

const recurrenceSchema = z
  .object({
    frequency: z.enum(["none", "daily", "weekly", "monthly", "weekdays"]),
    interval: z.number().int().positive().optional(),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
    until: z.string().datetime().nullable().optional(),
  })
  .nullable()
  .optional();

export const taskSchema = z
  .object({
    title: z.string().min(1).max(120),
    notes: z.string().max(5000).optional(),
    priority: z.enum(["low", "medium", "high", "critical"]).optional(),
    estimatedMinutes: z.number().int().min(15).max(720).optional(),
    dueAt: z.string().datetime().nullable().optional(),
    preferredTimeBand: z
      .enum(["anytime", "morning", "afternoon", "evening"])
      .optional(),
    preferredWindowStart: z.string().nullable().optional(),
    preferredWindowEnd: z.string().nullable().optional(),
    areaId: z.string().nullable().optional(),
    projectId: z.string().nullable().optional(),
    tagIds: z.array(z.string()).optional(),
    checklist: z
      .array(
        z.object({
          id: z.string().optional(),
          label: z.string().min(1).max(120),
          completed: z.boolean().optional(),
        }),
      )
      .optional(),
    recurrence: recurrenceSchema,
    startsAt: z.string().datetime().nullable().optional(),
    endsAt: z.string().datetime().nullable().optional(),
    status: z.enum(["todo", "done"]).optional(),
    completedAt: z.string().datetime().nullable().optional(),
  })
  .refine(
    (value) => !(value.startsAt && value.endsAt) || value.startsAt < value.endsAt,
    "Task blocks must end after they start.",
  );

export const taskBlockSchema = z.object({
  taskId: z.string(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
});

export const eventSchema = z
  .object({
    title: z.string().min(1).max(120),
    notes: z.string().max(5000).optional(),
    location: z.string().max(120).optional(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    recurrence: recurrenceSchema,
  })
  .refine((value) => value.startsAt < value.endsAt, "Events must end after they start.");

export const taxonomySchema = z.object({
  name: z.string().min(1).max(80),
  color: z.string().max(32).optional(),
  areaId: z.string().nullable().optional(),
  deadlineAt: z.string().datetime().nullable().optional(),
});

export const settingsSchema = z.object({
  timezone: z.string().optional(),
  weekStart: z.number().int().min(0).max(6).optional(),
  slotMinutes: z.number().int().min(15).max(120).optional(),
  workHours: z
    .record(
      z.string(),
      z
        .object({
          start: z.string(),
          end: z.string(),
        })
        .nullable(),
    )
    .optional(),
});
