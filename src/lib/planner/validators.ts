import { z } from "zod";

import { TASK_STATUSES } from "@/lib/planner/types";

const recurrenceSchema = z
  .object({
    frequency: z.enum(["none", "daily", "weekly", "monthly", "weekdays"]),
    interval: z.number().int().positive().optional(),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
    until: z.string().datetime().nullable().optional(),
    overrides: z
      .record(
        z.string(),
        z.object({
          startsAt: z.string().datetime(),
          endsAt: z.string().datetime(),
        }),
      )
      .optional(),
  })
  .nullable()
  .optional();

const taskBaseSchema = z.object({
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
  milestoneId: z.string().nullable().optional(),
  tagIds: z.array(z.string()).optional(),
  dependencyIds: z.array(z.string()).optional(),
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
  status: z.enum(TASK_STATUSES).optional(),
  availability: z.enum(["ready", "later"]).optional(),
  completedAt: z.string().datetime().nullable().optional(),
  addToProjectNotes: z.boolean().optional(),
});

const eventBaseSchema = z.object({
  title: z.string().min(1).max(120),
  notes: z.string().max(5000).optional(),
  location: z.string().max(120).optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  recurrence: recurrenceSchema,
});

function validDateRange(
  value: { startsAt?: string | null; endsAt?: string | null },
  options?: { requireBoth?: boolean },
) {
  if (value.startsAt == null && value.endsAt == null) {
    return true;
  }

  if (options?.requireBoth) {
    return Boolean(value.startsAt && value.endsAt && value.startsAt < value.endsAt);
  }

  if (value.startsAt == null || value.endsAt == null) {
    return false;
  }

  return value.startsAt < value.endsAt;
}

export const taskSchema = taskBaseSchema
  .refine(
    (value) => validDateRange(value, { requireBoth: false }),
    "Task blocks must include both start and end times, and they must end after they start.",
  );

export const updateTaskSchema = taskBaseSchema
  .partial()
  .refine(
    (value) => validDateRange(value, { requireBoth: false }),
    "Task blocks must include both start and end times, and they must end after they start.",
  );

export const taskBlockSchema = z
  .object({
    taskId: z.string(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
  })
  .refine(
    (value) => validDateRange(value, { requireBoth: true }),
    "Task blocks must end after they start.",
  );

export const updateTaskBlockSchema = z
  .object({
    taskId: z.string().optional(),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().optional(),
    scope: z.enum(["series", "occurrence"]).optional(),
    occurrenceKey: z.string().optional(),
    originalStartsAt: z.string().datetime().optional(),
    originalEndsAt: z.string().datetime().optional(),
  })
  .refine(
    (value) => validDateRange(value, { requireBoth: false }),
    "Task blocks must include both start and end times, and they must end after they start.",
  )
  .refine(
    (value) => value.scope !== "occurrence" || Boolean(value.occurrenceKey),
    "Recurring occurrence edits require an occurrence key.",
  )
  .refine(
    (value) =>
      (value.originalStartsAt == null && value.originalEndsAt == null) ||
      Boolean(value.originalStartsAt && value.originalEndsAt && value.originalStartsAt < value.originalEndsAt),
    "Original occurrence times must include both start and end times, and they must end after they start.",
  );

export const eventSchema = eventBaseSchema.refine(
  (value) => value.startsAt < value.endsAt,
  "Events must end after they start.",
);

export const updateEventSchema = eventBaseSchema
  .partial()
  .refine(
    (value) => validDateRange(value, { requireBoth: false }),
    "Events must include both start and end times, and they must end after they start.",
  );

export const taxonomySchema = z.object({
  name: z.string().min(1).max(80),
  notes: z.string().max(250000).optional(),
  color: z.string().max(32).optional(),
  areaId: z.string().nullable().optional(),
  deadlineAt: z.string().datetime().nullable().optional(),
  status: z.enum(["active", "completed", "archived"]).optional(),
});

export const updateProjectSchema = taxonomySchema.partial();

const milestoneBaseSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  startDate: z.string().datetime(),
  deadline: z.string().datetime(),
});

export const milestoneSchema = milestoneBaseSchema
  .refine((value) => value.startDate < value.deadline, "Milestones must end after they start.");

export const updateMilestoneSchema = milestoneBaseSchema
  .partial()
  .refine(
    (value) => {
      if (!value.startDate && !value.deadline) {
        return true;
      }

      if (!value.startDate || !value.deadline) {
        return true;
      }

      return value.startDate < value.deadline;
    },
    "Milestones must end after they start.",
  );

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

const noteCommentSchema = z.object({
  id: z.string().min(1),
  author: z.string().min(1).max(120),
  initials: z.string().min(1).max(6),
  body: z.string().min(1).max(4000),
  createdAt: z.string().datetime(),
});

export const projectNotePageSchema = z.object({
  kind: z.enum(["note", "section"]).optional(),
  sectionId: z.string().nullable().optional(),
  parentSectionId: z.string().nullable().optional(),
  linkedEntityType: z.enum(["project", "milestone", "task", "manual"]).optional(),
  linkedEntityId: z.string().nullable().optional(),
  systemKey: z.string().max(240).nullable().optional(),
  title: z.string().min(1).max(160).optional(),
  status: z.enum(["Draft", "Shared", "Final"]).optional(),
  content: z.unknown().optional(),
  markdown: z.string().max(250000).optional(),
  comments: z.array(noteCommentSchema).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const updateProjectNotePageSchema = projectNotePageSchema.partial();
