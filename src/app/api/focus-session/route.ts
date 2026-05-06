import { z } from "zod";

import { handleRouteError, success } from "@/app/api/_helpers";
import { requireUserId } from "@/lib/auth";
import { plannerRepository } from "@/lib/planner/repository";

const isoStringSchema = z.string().refine(
  (value) => Number.isFinite(Date.parse(value)),
  "Invalid date",
);

const focusPhaseSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["focus", "break", "long_break"]),
  label: z.string().min(1),
  minutes: z.number().int().min(1).max(240),
});

const focusSessionSchema = z.object({
  version: z.literal(1),
  selectedTaskId: z.string().nullable(),
  selectedProfileId: z.string().min(1),
  profileName: z.string().min(1),
  customFocusMinutes: z.number().int().min(1).max(240),
  customBreakMinutes: z.number().int().min(1).max(120),
  customLongBreakMinutes: z.number().int().min(1).max(240),
  customRounds: z.number().int().min(1).max(24),
  phaseIndex: z.number().int().min(0).max(100),
  remainingSeconds: z.number().int().min(0).max(24 * 60 * 60),
  running: z.boolean(),
  phases: z.array(focusPhaseSchema).min(1).max(100),
  updatedAt: isoStringSchema,
});

const focusHistoryRecordSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().nullable(),
  taskTitle: z.string().min(1),
  projectName: z.string().nullable(),
  profileName: z.string().min(1),
  minutes: z.number().int().min(1).max(240),
  completedAt: isoStringSchema,
});

const updateFocusSessionSchema = z
  .object({
    session: focusSessionSchema.nullable().optional(),
    history: z.array(focusHistoryRecordSchema).max(100).optional(),
  })
  .refine(
    (value) => value.session !== undefined || value.history !== undefined,
    "No focus session fields provided",
  );

export async function GET() {
  try {
    const userId = await requireUserId();
    const record = await plannerRepository.getFocusSession(userId);

    return success({
      session: record.session,
      history: record.history,
      updatedAt: record.updatedAt,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const userId = await requireUserId();
    const input = updateFocusSessionSchema.parse(await request.json());
    const record = await plannerRepository.updateFocusSession(userId, input);

    return success({
      session: record.session,
      history: record.history,
      updatedAt: record.updatedAt,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
