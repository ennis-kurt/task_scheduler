import crypto from "node:crypto";

import { isDatabaseConfigured } from "@/lib/env";
import { calculateMinutes } from "@/lib/planner/date";
import { databaseRepository } from "@/lib/planner/database-repository";
import { readDemoSnapshot, writeDemoSnapshot } from "@/lib/planner/demo-store";
import type {
  NewEventInput,
  NewTaskBlockInput,
  NewTaskInput,
  NewTaxonomyInput,
  TaskChecklistItemRecord,
  TaskRecord,
  UpdateEventInput,
  UpdateSettingsInput,
  UpdateTaskBlockInput,
  UpdateTaskInput,
  WorkspaceSnapshot,
} from "@/lib/planner/types";

function now() {
  return new Date().toISOString();
}

function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

async function withSnapshot<T>(
  userId: string,
  mutator: (snapshot: WorkspaceSnapshot) => T | Promise<T>,
) {
  const snapshot = await readDemoSnapshot(userId);
  const result = await mutator(snapshot);
  await writeDemoSnapshot(snapshot);
  return result;
}

function replaceChecklist(
  snapshot: WorkspaceSnapshot,
  taskId: string,
  checklist: NewTaskInput["checklist"] | undefined,
) {
  if (!checklist) {
    return;
  }

  snapshot.checklistItems = snapshot.checklistItems.filter(
    (item) => item.taskId !== taskId,
  );

  const timestamp = now();
  snapshot.checklistItems.push(
    ...checklist.map<TaskChecklistItemRecord>((item, index) => ({
      id: item.id ?? id("check"),
      taskId,
      label: item.label,
      completed: item.completed ?? false,
      sortOrder: index,
      createdAt: timestamp,
      updatedAt: timestamp,
    })),
  );
}

function replaceTaskTags(
  snapshot: WorkspaceSnapshot,
  taskId: string,
  tagIds: string[] | undefined,
) {
  if (!tagIds) {
    return;
  }

  snapshot.taskTags = snapshot.taskTags.filter((tag) => tag.taskId !== taskId);
  snapshot.taskTags.push(...tagIds.map((tagId) => ({ taskId, tagId })));
}

function patchTask(task: TaskRecord, input: UpdateTaskInput | NewTaskInput) {
  const timestamp = now();
  const syncedEstimate =
    input.estimatedMinutes ??
    (input.startsAt && input.endsAt
      ? calculateMinutes(input.startsAt, input.endsAt)
      : undefined);

  Object.assign(task, {
    title: input.title ?? task.title,
    notes: input.notes ?? task.notes,
    priority: input.priority ?? task.priority,
    estimatedMinutes: syncedEstimate ?? task.estimatedMinutes,
    dueAt:
      input.dueAt === undefined
        ? task.dueAt
        : input.dueAt,
    preferredTimeBand: input.preferredTimeBand ?? task.preferredTimeBand,
    preferredWindowStart:
      input.preferredWindowStart === undefined
        ? task.preferredWindowStart
        : input.preferredWindowStart,
    preferredWindowEnd:
      input.preferredWindowEnd === undefined
        ? task.preferredWindowEnd
        : input.preferredWindowEnd,
    areaId: input.areaId === undefined ? task.areaId : input.areaId,
    projectId:
      input.projectId === undefined ? task.projectId : input.projectId,
    recurrence:
      input.recurrence === undefined ? task.recurrence : input.recurrence,
    updatedAt: timestamp,
  });

  if ("status" in input && input.status) {
    task.status = input.status;
    task.completedAt =
      input.status === "done"
        ? input.completedAt ?? task.completedAt ?? timestamp
        : null;
  }
}

const demoRepository = {
  async getWorkspace(userId: string) {
    return readDemoSnapshot(userId);
  },

  async createTask(userId: string, input: NewTaskInput) {
    return withSnapshot(userId, (snapshot) => {
      const timestamp = now();
      const task: TaskRecord = {
        id: id("task"),
        userId,
        title: input.title,
        notes: input.notes ?? "",
        priority: input.priority ?? "medium",
        estimatedMinutes:
          input.estimatedMinutes ??
          (input.startsAt && input.endsAt
            ? calculateMinutes(input.startsAt, input.endsAt)
            : 60),
        dueAt: input.dueAt ?? null,
        preferredTimeBand: input.preferredTimeBand ?? "anytime",
        preferredWindowStart: input.preferredWindowStart ?? null,
        preferredWindowEnd: input.preferredWindowEnd ?? null,
        status: "todo",
        completedAt: null,
        areaId: input.areaId ?? null,
        projectId: input.projectId ?? null,
        recurrence: input.recurrence ?? null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      snapshot.tasks.unshift(task);
      replaceChecklist(snapshot, task.id, input.checklist);
      replaceTaskTags(snapshot, task.id, input.tagIds);

      if (input.startsAt && input.endsAt) {
        snapshot.taskBlocks.push({
          id: id("block"),
          userId,
          taskId: task.id,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }

      return task;
    });
  },

  async updateTask(userId: string, taskId: string, input: UpdateTaskInput) {
    return withSnapshot(userId, (snapshot) => {
      const task = snapshot.tasks.find(
        (candidate) => candidate.id === taskId && candidate.userId === userId,
      );

      if (!task) {
        throw new Error("NOT_FOUND");
      }

      patchTask(task, input);
      replaceChecklist(snapshot, task.id, input.checklist);
      replaceTaskTags(snapshot, task.id, input.tagIds);

      if (input.startsAt && input.endsAt) {
        const existingBlock = snapshot.taskBlocks.find(
          (block) => block.taskId === task.id,
        );

        if (existingBlock) {
          existingBlock.startsAt = input.startsAt;
          existingBlock.endsAt = input.endsAt;
          existingBlock.updatedAt = now();
        } else {
          snapshot.taskBlocks.push({
            id: id("block"),
            userId,
            taskId: task.id,
            startsAt: input.startsAt,
            endsAt: input.endsAt,
            createdAt: now(),
            updatedAt: now(),
          });
        }
      }

      return task;
    });
  },

  async deleteTask(userId: string, taskId: string) {
    return withSnapshot(userId, (snapshot) => {
      snapshot.tasks = snapshot.tasks.filter(
        (task) => !(task.id === taskId && task.userId === userId),
      );
      snapshot.taskBlocks = snapshot.taskBlocks.filter(
        (block) => block.taskId !== taskId,
      );
      snapshot.checklistItems = snapshot.checklistItems.filter(
        (item) => item.taskId !== taskId,
      );
      snapshot.taskTags = snapshot.taskTags.filter((tag) => tag.taskId !== taskId);
      return { ok: true };
    });
  },

  async createTaskBlock(userId: string, input: NewTaskBlockInput) {
    return withSnapshot(userId, (snapshot) => {
      snapshot.taskBlocks = snapshot.taskBlocks.filter(
        (block) => block.taskId !== input.taskId,
      );
      const block = {
        id: id("block"),
        userId,
        taskId: input.taskId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        createdAt: now(),
        updatedAt: now(),
      };
      snapshot.taskBlocks.push(block);
      const task = snapshot.tasks.find(
        (candidate) => candidate.id === input.taskId && candidate.userId === userId,
      );

      if (task) {
        task.estimatedMinutes = calculateMinutes(input.startsAt, input.endsAt);
        task.updatedAt = now();
      }

      return block;
    });
  },

  async updateTaskBlock(userId: string, blockId: string, input: UpdateTaskBlockInput) {
    return withSnapshot(userId, (snapshot) => {
      const block = snapshot.taskBlocks.find(
        (candidate) => candidate.id === blockId && candidate.userId === userId,
      );

      if (!block) {
        throw new Error("NOT_FOUND");
      }

      block.startsAt = input.startsAt ?? block.startsAt;
      block.endsAt = input.endsAt ?? block.endsAt;
      block.updatedAt = now();
      const task = snapshot.tasks.find(
        (candidate) => candidate.id === block.taskId && candidate.userId === userId,
      );

      if (task) {
        task.estimatedMinutes = calculateMinutes(block.startsAt, block.endsAt);
        task.updatedAt = now();
      }

      return block;
    });
  },

  async deleteTaskBlock(userId: string, blockId: string) {
    return withSnapshot(userId, (snapshot) => {
      snapshot.taskBlocks = snapshot.taskBlocks.filter(
        (block) => !(block.id === blockId && block.userId === userId),
      );
      return { ok: true };
    });
  },

  async createEvent(userId: string, input: NewEventInput) {
    return withSnapshot(userId, (snapshot) => {
      const event = {
        id: id("event"),
        userId,
        title: input.title,
        notes: input.notes ?? "",
        location: input.location ?? "",
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        recurrence: input.recurrence ?? null,
        createdAt: now(),
        updatedAt: now(),
      };
      snapshot.events.push(event);
      return event;
    });
  },

  async updateEvent(userId: string, eventId: string, input: UpdateEventInput) {
    return withSnapshot(userId, (snapshot) => {
      const event = snapshot.events.find(
        (candidate) => candidate.id === eventId && candidate.userId === userId,
      );

      if (!event) {
        throw new Error("NOT_FOUND");
      }

      event.title = input.title ?? event.title;
      event.notes = input.notes ?? event.notes;
      event.location = input.location ?? event.location;
      event.startsAt = input.startsAt ?? event.startsAt;
      event.endsAt = input.endsAt ?? event.endsAt;
      event.recurrence =
        input.recurrence === undefined ? event.recurrence : input.recurrence;
      event.updatedAt = now();
      return event;
    });
  },

  async deleteEvent(userId: string, eventId: string) {
    return withSnapshot(userId, (snapshot) => {
      snapshot.events = snapshot.events.filter(
        (event) => !(event.id === eventId && event.userId === userId),
      );
      return { ok: true };
    });
  },

  async createArea(userId: string, input: NewTaxonomyInput) {
    return withSnapshot(userId, (snapshot) => {
      const area = {
        id: id("area"),
        userId,
        name: input.name,
        color: input.color ?? "#0f766e",
        createdAt: now(),
        updatedAt: now(),
      };
      snapshot.areas.push(area);
      return area;
    });
  },

  async createProject(userId: string, input: NewTaxonomyInput) {
    return withSnapshot(userId, (snapshot) => {
      const project = {
        id: id("project"),
        userId,
        areaId: input.areaId ?? null,
        name: input.name,
        color: input.color ?? "#0f766e",
        deadlineAt: input.deadlineAt ?? null,
        createdAt: now(),
        updatedAt: now(),
      };
      snapshot.projects.push(project);
      return project;
    });
  },

  async createTag(userId: string, input: NewTaxonomyInput) {
    return withSnapshot(userId, (snapshot) => {
      const tag = {
        id: id("tag"),
        userId,
        name: input.name,
        color: input.color ?? "#1d4ed8",
        createdAt: now(),
        updatedAt: now(),
      };
      snapshot.tags.push(tag);
      return tag;
    });
  },

  async updateSettings(userId: string, input: UpdateSettingsInput) {
    return withSnapshot(userId, (snapshot) => {
      snapshot.settings = {
        ...snapshot.settings,
        ...input,
        updatedAt: now(),
      };
      return snapshot.settings;
    });
  },
};

export const plannerRepository = isDatabaseConfigured()
  ? databaseRepository
  : demoRepository;
