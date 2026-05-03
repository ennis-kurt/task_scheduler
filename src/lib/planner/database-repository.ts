import crypto from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import {
  areas,
  events,
  milestones,
  projects,
  tags,
  taskBlocks,
  taskChecklistItems,
  taskTags,
  tasks,
  userSettings,
  users,
} from "@/db/schema";
import { getSessionUserProfile } from "@/lib/auth";
import { DEFAULT_SETTINGS } from "@/lib/planner/constants";
import {
  applyRecurrenceOverride,
  calculateMinutes,
  shiftRecurringSeries,
} from "@/lib/planner/date";
import type {
  AppUserRecord,
  AreaRecord,
  EventRecord,
  MilestoneRecord,
  NewEventInput,
  NewMilestoneInput,
  NewTaskBlockInput,
  NewTaskInput,
  NewTaxonomyInput,
  ProjectRecord,
  TagRecord,
  TaskAvailability,
  TaskBlockRecord,
  TaskChecklistItemRecord,
  TaskRecord,
  TaskTagRecord,
  UpdateEventInput,
  UpdateMilestoneInput,
  UpdateProjectInput,
  UpdateSettingsInput,
  UpdateRecurringTaskBlockInput,
  UpdateTaskInput,
  UserSettingsRecord,
  WorkspaceSnapshot,
} from "@/lib/planner/types";

function now() {
  return new Date();
}

function iso(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

function resolveTaskAvailability(input: {
  startsAt?: string | null;
  endsAt?: string | null;
  availability?: TaskAvailability;
}) {
  return input.startsAt && input.endsAt ? "ready" : (input.availability ?? "later");
}

async function ensureDbUser(userId: string) {
  const db = getDb();
  const timestamp = now();
  const profile = await getSessionUserProfile();
  const email = profile.email ?? `${userId}@inflara.local`;
  const fullName = profile.fullName ?? "Inflara User";

  await db
    .insert(users)
    .values({
      id: userId,
      email,
      fullName,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        email,
        fullName,
        updatedAt: timestamp,
      },
    });

  await db
    .insert(userSettings)
    .values({
      userId,
      timezone: DEFAULT_SETTINGS.timezone,
      weekStart: DEFAULT_SETTINGS.weekStart,
      slotMinutes: DEFAULT_SETTINGS.slotMinutes,
      workHours: DEFAULT_SETTINGS.workHours,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoNothing();
}

function mapUser(record: typeof users.$inferSelect): AppUserRecord {
  return {
    id: record.id,
    email: record.email,
    fullName: record.fullName,
    createdAt: iso(record.createdAt)!,
    updatedAt: iso(record.updatedAt)!,
  };
}

function mapSettings(record: typeof userSettings.$inferSelect): UserSettingsRecord {
  return {
    userId: record.userId,
    timezone: record.timezone,
    weekStart: record.weekStart,
    slotMinutes: record.slotMinutes,
    workHours: record.workHours as UserSettingsRecord["workHours"],
    createdAt: iso(record.createdAt)!,
    updatedAt: iso(record.updatedAt)!,
  };
}

function mapArea(record: typeof areas.$inferSelect): AreaRecord {
  return {
    id: record.id,
    userId: record.userId,
    name: record.name,
    color: record.color,
    createdAt: iso(record.createdAt)!,
    updatedAt: iso(record.updatedAt)!,
  };
}

function mapProject(record: typeof projects.$inferSelect): ProjectRecord {
  return {
    id: record.id,
    userId: record.userId,
    areaId: record.areaId,
    name: record.name,
    color: record.color,
    status: record.status as ProjectRecord["status"],
    deadlineAt: iso(record.deadlineAt),
    createdAt: iso(record.createdAt)!,
    updatedAt: iso(record.updatedAt)!,
  };
}

function mapMilestone(record: typeof milestones.$inferSelect): MilestoneRecord {
  return {
    id: record.id,
    userId: record.userId,
    projectId: record.projectId,
    name: record.name,
    description: record.description,
    startDate: iso(record.startDate)!,
    deadline: iso(record.deadline)!,
    createdAt: iso(record.createdAt)!,
    updatedAt: iso(record.updatedAt)!,
  };
}

function mapTag(record: typeof tags.$inferSelect): TagRecord {
  return {
    id: record.id,
    userId: record.userId,
    name: record.name,
    color: record.color,
    createdAt: iso(record.createdAt)!,
    updatedAt: iso(record.updatedAt)!,
  };
}

function mapTask(record: typeof tasks.$inferSelect): TaskRecord {
  return {
    id: record.id,
    userId: record.userId,
    title: record.title,
    notes: record.notes,
    priority: record.priority as TaskRecord["priority"],
    estimatedMinutes: record.estimatedMinutes,
    dueAt: iso(record.dueAt),
    preferredTimeBand: record.preferredTimeBand as TaskRecord["preferredTimeBand"],
    preferredWindowStart: record.preferredWindowStart,
    preferredWindowEnd: record.preferredWindowEnd,
    status: record.status as TaskRecord["status"],
    availability: (record.availability ?? "ready") as TaskRecord["availability"],
    completedAt: iso(record.completedAt),
    areaId: record.areaId,
    projectId: record.projectId,
    milestoneId: record.milestoneId,
    recurrence: (record.recurrence ?? null) as TaskRecord["recurrence"],
    createdAt: iso(record.createdAt)!,
    updatedAt: iso(record.updatedAt)!,
  };
}

function mapTaskBlock(record: typeof taskBlocks.$inferSelect): TaskBlockRecord {
  return {
    id: record.id,
    userId: record.userId,
    taskId: record.taskId,
    startsAt: iso(record.startsAt)!,
    endsAt: iso(record.endsAt)!,
    createdAt: iso(record.createdAt)!,
    updatedAt: iso(record.updatedAt)!,
  };
}

function mapEvent(record: typeof events.$inferSelect): EventRecord {
  return {
    id: record.id,
    userId: record.userId,
    title: record.title,
    notes: record.notes,
    location: record.location,
    startsAt: iso(record.startsAt)!,
    endsAt: iso(record.endsAt)!,
    recurrence: (record.recurrence ?? null) as EventRecord["recurrence"],
    createdAt: iso(record.createdAt)!,
    updatedAt: iso(record.updatedAt)!,
  };
}

function mapChecklistItem(
  record: typeof taskChecklistItems.$inferSelect,
): TaskChecklistItemRecord {
  return {
    id: record.id,
    taskId: record.taskId,
    label: record.label,
    completed: record.completed,
    sortOrder: record.sortOrder,
    createdAt: iso(record.createdAt)!,
    updatedAt: iso(record.updatedAt)!,
  };
}

function mapTaskTag(record: typeof taskTags.$inferSelect): TaskTagRecord {
  return {
    taskId: record.taskId,
    tagId: record.tagId,
  };
}

async function replaceTaskRelations(
  taskId: string,
  input: Pick<NewTaskInput | UpdateTaskInput, "checklist" | "tagIds">,
) {
  const db = getDb();

  if (input.checklist) {
    await db.delete(taskChecklistItems).where(eq(taskChecklistItems.taskId, taskId));
    if (input.checklist.length) {
      await db.insert(taskChecklistItems).values(
        input.checklist.map((item, index) => ({
          id: item.id ?? id("check"),
          taskId,
          label: item.label,
          completed: item.completed ?? false,
          sortOrder: index,
          createdAt: now(),
          updatedAt: now(),
        })),
      );
    }
  }

  if (input.tagIds) {
    await db.delete(taskTags).where(eq(taskTags.taskId, taskId));
    if (input.tagIds.length) {
      await db.insert(taskTags).values(
        input.tagIds.map((tagId) => ({
          taskId,
          tagId,
        })),
      );
    }
  }
}

async function upsertPrimaryBlock(
  userId: string,
  taskId: string,
  startsAt?: string | null,
  endsAt?: string | null,
) {
  if (!startsAt || !endsAt) {
    return;
  }

  const db = getDb();
  const existing = await db
    .select()
    .from(taskBlocks)
    .where(and(eq(taskBlocks.taskId, taskId), eq(taskBlocks.userId, userId)))
    .limit(1);

  if (existing[0]) {
    await db
      .update(taskBlocks)
      .set({
        startsAt: new Date(startsAt),
        endsAt: new Date(endsAt),
        updatedAt: now(),
      })
      .where(eq(taskBlocks.id, existing[0].id));
  } else {
    await db.insert(taskBlocks).values({
      id: id("block"),
      userId,
      taskId,
      startsAt: new Date(startsAt),
      endsAt: new Date(endsAt),
      createdAt: now(),
      updatedAt: now(),
    });
  }
}

async function resolveMilestoneProject(
  milestoneId?: string | null,
): Promise<MilestoneRecord | null> {
  if (!milestoneId) {
    return null;
  }

  const db = getDb();
  const [record] = await db
    .select()
    .from(milestones)
    .where(eq(milestones.id, milestoneId))
    .limit(1);

  return record ? mapMilestone(record) : null;
}

export const databaseRepository = {
  async getWorkspace(userId: string): Promise<WorkspaceSnapshot> {
    await ensureDbUser(userId);
    const db = getDb();

    const [userRecord] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const [settingsRecord] = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);
    const [areaRows, projectRows, milestoneRows, tagRows, taskRows, blockRows, eventRows] =
      await Promise.all([
        db.select().from(areas).where(eq(areas.userId, userId)),
        db.select().from(projects).where(eq(projects.userId, userId)),
        db.select().from(milestones).where(eq(milestones.userId, userId)),
        db.select().from(tags).where(eq(tags.userId, userId)),
        db.select().from(tasks).where(eq(tasks.userId, userId)),
        db.select().from(taskBlocks).where(eq(taskBlocks.userId, userId)),
        db.select().from(events).where(eq(events.userId, userId)),
      ]);
    const taskIds = taskRows.map((task) => task.id);
    const [checklistRows, taskTagRows] = taskIds.length
      ? await Promise.all([
          db
            .select()
            .from(taskChecklistItems)
            .where(inArray(taskChecklistItems.taskId, taskIds)),
          db.select().from(taskTags).where(inArray(taskTags.taskId, taskIds)),
        ])
      : [[], []];

    return {
      user: mapUser(userRecord),
      settings: mapSettings(settingsRecord),
      areas: areaRows.map(mapArea),
      projects: projectRows.map(mapProject),
      milestones: milestoneRows.map(mapMilestone),
      tags: tagRows.map(mapTag),
      tasks: taskRows.map(mapTask),
      taskBlocks: blockRows.map(mapTaskBlock),
      events: eventRows.map(mapEvent),
      checklistItems: checklistRows.map(mapChecklistItem),
      taskTags: taskTagRows.map(mapTaskTag),
    };
  },

  async createTask(userId: string, input: NewTaskInput) {
    await ensureDbUser(userId);
    const db = getDb();
    const taskId = id("task");
    const linkedMilestone = await resolveMilestoneProject(input.milestoneId);
    const syncedEstimate =
      input.estimatedMinutes ??
      (input.startsAt && input.endsAt
        ? calculateMinutes(input.startsAt, input.endsAt)
        : 60);

    await db.insert(tasks).values({
      id: taskId,
      userId,
      title: input.title,
      notes: input.notes ?? "",
      priority: input.priority ?? "medium",
      estimatedMinutes: syncedEstimate,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      preferredTimeBand: input.preferredTimeBand ?? "anytime",
      preferredWindowStart: input.preferredWindowStart ?? null,
      preferredWindowEnd: input.preferredWindowEnd ?? null,
      status: "todo",
      availability: resolveTaskAvailability(input),
      completedAt: null,
      areaId: input.areaId ?? null,
      projectId: linkedMilestone?.projectId ?? input.projectId ?? null,
      milestoneId: linkedMilestone?.id ?? null,
      recurrence: input.recurrence ?? null,
      createdAt: now(),
      updatedAt: now(),
    });

    await replaceTaskRelations(taskId, input);
    await upsertPrimaryBlock(userId, taskId, input.startsAt, input.endsAt);

    const [record] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
    return mapTask(record);
  },

  async updateTask(userId: string, taskId: string, input: UpdateTaskInput) {
    await ensureDbUser(userId);
    const db = getDb();
    const linkedMilestone =
      input.milestoneId === undefined
        ? null
        : await resolveMilestoneProject(input.milestoneId);
    const syncedEstimate =
      input.estimatedMinutes ??
      (input.startsAt && input.endsAt
        ? calculateMinutes(input.startsAt, input.endsAt)
        : undefined);

    await db
      .update(tasks)
      .set({
        title: input.title,
        notes: input.notes,
        priority: input.priority,
        estimatedMinutes: syncedEstimate,
        dueAt: input.dueAt === undefined ? undefined : input.dueAt ? new Date(input.dueAt) : null,
        preferredTimeBand: input.preferredTimeBand,
        preferredWindowStart: input.preferredWindowStart,
        preferredWindowEnd: input.preferredWindowEnd,
        status: input.status,
        availability:
          input.startsAt && input.endsAt
            ? "ready"
            : input.availability,
        completedAt:
          input.status === undefined
            ? undefined
            : input.status === "done"
              ? input.completedAt
                ? new Date(input.completedAt)
                : now()
              : null,
        areaId: input.areaId,
        projectId:
          input.milestoneId === undefined
            ? input.projectId
            : linkedMilestone?.projectId ?? input.projectId ?? null,
        milestoneId:
          input.milestoneId === undefined
            ? undefined
            : linkedMilestone?.id ?? null,
        recurrence: input.recurrence,
        updatedAt: now(),
      })
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));

    await replaceTaskRelations(taskId, input);
    await upsertPrimaryBlock(userId, taskId, input.startsAt, input.endsAt);

    const [record] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);

    if (!record) {
      throw new Error("NOT_FOUND");
    }

    return mapTask(record);
  },

  async deleteTask(userId: string, taskId: string) {
    await ensureDbUser(userId);
    const db = getDb();
    await db.delete(tasks).where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
    return { ok: true };
  },

  async createTaskBlock(userId: string, input: NewTaskBlockInput) {
    await ensureDbUser(userId);
    const db = getDb();

    await db.delete(taskBlocks).where(and(eq(taskBlocks.taskId, input.taskId), eq(taskBlocks.userId, userId)));

    const blockId = id("block");
    await db.insert(taskBlocks).values({
      id: blockId,
      userId,
      taskId: input.taskId,
      startsAt: new Date(input.startsAt),
      endsAt: new Date(input.endsAt),
      createdAt: now(),
      updatedAt: now(),
    });

    await db
      .update(tasks)
      .set({
        estimatedMinutes: calculateMinutes(input.startsAt, input.endsAt),
        availability: "ready",
        updatedAt: now(),
      })
      .where(and(eq(tasks.id, input.taskId), eq(tasks.userId, userId)));

    const [record] = await db.select().from(taskBlocks).where(eq(taskBlocks.id, blockId)).limit(1);
    return mapTaskBlock(record);
  },

  async updateTaskBlock(userId: string, blockId: string, input: UpdateRecurringTaskBlockInput) {
    await ensureDbUser(userId);
    const db = getDb();
    const [existingBlock] = await db
      .select()
      .from(taskBlocks)
      .where(and(eq(taskBlocks.id, blockId), eq(taskBlocks.userId, userId)))
      .limit(1);

    if (!existingBlock) {
      throw new Error("NOT_FOUND");
    }

    const [taskRecord] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, existingBlock.taskId), eq(tasks.userId, userId)))
      .limit(1);
    const currentRecurrence = taskRecord
      ? ((taskRecord.recurrence ?? null) as TaskRecord["recurrence"])
      : null;

    if (
      currentRecurrence &&
      currentRecurrence.frequency !== "none" &&
      input.scope === "occurrence"
    ) {
      if (!input.startsAt || !input.endsAt || !input.occurrenceKey) {
        throw new Error("NOT_FOUND");
      }

      await db
        .update(tasks)
        .set({
          recurrence: applyRecurrenceOverride(
            currentRecurrence,
            input.occurrenceKey,
            input.startsAt,
            input.endsAt,
          ),
          updatedAt: now(),
        })
        .where(and(eq(tasks.id, existingBlock.taskId), eq(tasks.userId, userId)));

      return mapTaskBlock(existingBlock);
    }

    let nextStartsAt = input.startsAt ? new Date(input.startsAt) : undefined;
    let nextEndsAt = input.endsAt ? new Date(input.endsAt) : undefined;
    let nextRecurrence = currentRecurrence;

    if (
      currentRecurrence &&
      currentRecurrence.frequency !== "none" &&
      input.scope === "series" &&
      input.startsAt &&
      input.endsAt &&
      input.originalStartsAt &&
      input.originalEndsAt
    ) {
      const shifted = shiftRecurringSeries(
        iso(existingBlock.startsAt)!,
        iso(existingBlock.endsAt)!,
        currentRecurrence,
        input.originalStartsAt,
        input.originalEndsAt,
        input.startsAt,
        input.endsAt,
      );

      nextStartsAt = new Date(shifted.startsAt);
      nextEndsAt = new Date(shifted.endsAt);
      nextRecurrence = shifted.recurrence;
    }

    await db
      .update(taskBlocks)
      .set({
        taskId: input.taskId,
        startsAt: nextStartsAt,
        endsAt: nextEndsAt,
        updatedAt: now(),
      })
      .where(and(eq(taskBlocks.id, blockId), eq(taskBlocks.userId, userId)));

    const [record] = await db.select().from(taskBlocks).where(eq(taskBlocks.id, blockId)).limit(1);

    if (!record) {
      throw new Error("NOT_FOUND");
    }

    await db
      .update(tasks)
      .set({
        estimatedMinutes: calculateMinutes(iso(record.startsAt)!, iso(record.endsAt)!),
        recurrence: nextRecurrence,
        updatedAt: now(),
      })
      .where(and(eq(tasks.id, record.taskId), eq(tasks.userId, userId)));

    return mapTaskBlock(record);
  },

  async deleteTaskBlock(userId: string, blockId: string) {
    await ensureDbUser(userId);
    const db = getDb();
    await db.delete(taskBlocks).where(and(eq(taskBlocks.id, blockId), eq(taskBlocks.userId, userId)));
    return { ok: true };
  },

  async createEvent(userId: string, input: NewEventInput) {
    await ensureDbUser(userId);
    const db = getDb();
    const eventId = id("event");

    await db.insert(events).values({
      id: eventId,
      userId,
      title: input.title,
      notes: input.notes ?? "",
      location: input.location ?? "",
      startsAt: new Date(input.startsAt),
      endsAt: new Date(input.endsAt),
      recurrence: input.recurrence ?? null,
      createdAt: now(),
      updatedAt: now(),
    });

    const [record] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
    return mapEvent(record);
  },

  async updateEvent(userId: string, eventId: string, input: UpdateEventInput) {
    await ensureDbUser(userId);
    const db = getDb();

    await db
      .update(events)
      .set({
        title: input.title,
        notes: input.notes,
        location: input.location,
        startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
        endsAt: input.endsAt ? new Date(input.endsAt) : undefined,
        recurrence: input.recurrence,
        updatedAt: now(),
      })
      .where(and(eq(events.id, eventId), eq(events.userId, userId)));

    const [record] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);

    if (!record) {
      throw new Error("NOT_FOUND");
    }

    return mapEvent(record);
  },

  async deleteEvent(userId: string, eventId: string) {
    await ensureDbUser(userId);
    const db = getDb();
    await db.delete(events).where(and(eq(events.id, eventId), eq(events.userId, userId)));
    return { ok: true };
  },

  async createArea(userId: string, input: NewTaxonomyInput) {
    await ensureDbUser(userId);
    const db = getDb();
    const areaId = id("area");

    await db.insert(areas).values({
      id: areaId,
      userId,
      name: input.name,
      color: input.color ?? "#0f766e",
      createdAt: now(),
      updatedAt: now(),
    });

    const [record] = await db.select().from(areas).where(eq(areas.id, areaId)).limit(1);
    return mapArea(record);
  },

  async createProject(userId: string, input: NewTaxonomyInput) {
    await ensureDbUser(userId);
    const db = getDb();
    const projectId = id("project");

    await db.insert(projects).values({
      id: projectId,
      userId,
      areaId: input.areaId ?? null,
      name: input.name,
      color: input.color ?? "#0f766e",
      status: input.status ?? "active",
      deadlineAt: input.deadlineAt ? new Date(input.deadlineAt) : null,
      createdAt: now(),
      updatedAt: now(),
    });

    const [record] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    return mapProject(record);
  },

  async updateProject(userId: string, projectId: string, input: UpdateProjectInput) {
    await ensureDbUser(userId);
    const db = getDb();

    await db
      .update(projects)
      .set({
        name: input.name,
        color: input.color,
        areaId: input.areaId,
        status: input.status,
        deadlineAt:
          input.deadlineAt === undefined
            ? undefined
            : input.deadlineAt
              ? new Date(input.deadlineAt)
              : null,
        updatedAt: now(),
      })
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));

    const [record] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
      .limit(1);

    if (!record) {
      throw new Error("NOT_FOUND");
    }

    return mapProject(record);
  },

  async deleteProject(userId: string, projectId: string) {
    await ensureDbUser(userId);
    const db = getDb();
    await db.delete(projects).where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
    return { ok: true };
  },

  async createMilestone(userId: string, input: NewMilestoneInput) {
    await ensureDbUser(userId);
    const db = getDb();
    const milestoneId = id("milestone");

    await db.insert(milestones).values({
      id: milestoneId,
      userId,
      projectId: input.projectId,
      name: input.name,
      description: input.description ?? "",
      startDate: new Date(input.startDate),
      deadline: new Date(input.deadline),
      createdAt: now(),
      updatedAt: now(),
    });

    const [record] = await db
      .select()
      .from(milestones)
      .where(eq(milestones.id, milestoneId))
      .limit(1);
    return mapMilestone(record);
  },

  async updateMilestone(userId: string, milestoneId: string, input: UpdateMilestoneInput) {
    await ensureDbUser(userId);
    const db = getDb();

    await db
      .update(milestones)
      .set({
        projectId: input.projectId,
        name: input.name,
        description: input.description,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        deadline: input.deadline ? new Date(input.deadline) : undefined,
        updatedAt: now(),
      })
      .where(and(eq(milestones.id, milestoneId), eq(milestones.userId, userId)));

    if (input.projectId) {
      await db
        .update(tasks)
        .set({
          projectId: input.projectId,
          updatedAt: now(),
        })
        .where(and(eq(tasks.milestoneId, milestoneId), eq(tasks.userId, userId)));
    }

    const [record] = await db
      .select()
      .from(milestones)
      .where(eq(milestones.id, milestoneId))
      .limit(1);

    if (!record) {
      throw new Error("NOT_FOUND");
    }

    return mapMilestone(record);
  },

  async deleteMilestone(userId: string, milestoneId: string) {
    await ensureDbUser(userId);
    const db = getDb();
    await db
      .delete(milestones)
      .where(and(eq(milestones.id, milestoneId), eq(milestones.userId, userId)));
    return { ok: true };
  },

  async createTag(userId: string, input: NewTaxonomyInput) {
    await ensureDbUser(userId);
    const db = getDb();
    const tagId = id("tag");

    await db.insert(tags).values({
      id: tagId,
      userId,
      name: input.name,
      color: input.color ?? "#1d4ed8",
      createdAt: now(),
      updatedAt: now(),
    });

    const [record] = await db.select().from(tags).where(eq(tags.id, tagId)).limit(1);
    return mapTag(record);
  },

  async updateSettings(userId: string, input: UpdateSettingsInput) {
    await ensureDbUser(userId);
    const db = getDb();

    await db
      .update(userSettings)
      .set({
        timezone: input.timezone,
        weekStart: input.weekStart,
        slotMinutes: input.slotMinutes,
        workHours: input.workHours,
        updatedAt: now(),
      })
      .where(eq(userSettings.userId, userId));

    const [record] = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);
    return mapSettings(record);
  },
};
