import { addDays, set } from "date-fns";

import { DEFAULT_SETTINGS } from "@/lib/planner/constants";
import type {
  EventRecord,
  TaskBlockRecord,
  TaskChecklistItemRecord,
  TaskRecord,
  TaskTagRecord,
  WorkspaceSnapshot,
} from "@/lib/planner/types";

function isoAtOffset(days: number, hours: number, minutes = 0) {
  const now = new Date();
  const date = addDays(now, days);

  return set(date, {
    hours,
    minutes,
    seconds: 0,
    milliseconds: 0,
  }).toISOString();
}

export function createSeedSnapshot(userId = "demo-user"): WorkspaceSnapshot {
  const createdAt = new Date().toISOString();
  const areas = [
    { id: "area-work", userId, name: "Work", color: "#0f766e", createdAt, updatedAt: createdAt },
    {
      id: "area-health",
      userId,
      name: "Health",
      color: "#b45309",
      createdAt,
      updatedAt: createdAt,
    },
  ];
  const projects = [
    {
      id: "project-launch",
      userId,
      areaId: "area-work",
      name: "Planner MVP",
      color: "#0f766e",
      deadlineAt: addDays(new Date(), 10).toISOString(),
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: "project-wellness",
      userId,
      areaId: "area-health",
      name: "Training Block",
      color: "#b45309",
      deadlineAt: addDays(new Date(), 30).toISOString(),
      createdAt,
      updatedAt: createdAt,
    },
  ];
  const tags = [
    { id: "tag-focus", userId, name: "Focus", color: "#1d4ed8", createdAt, updatedAt: createdAt },
    { id: "tag-admin", userId, name: "Admin", color: "#6d28d9", createdAt, updatedAt: createdAt },
    { id: "tag-errand", userId, name: "Errand", color: "#9a3412", createdAt, updatedAt: createdAt },
  ];
  const tasks: TaskRecord[] = [
    {
      id: "task-outline",
      userId,
      title: "Outline the planner onboarding",
      notes: "Decide how new users set work hours, timezone, and default planning horizon.",
      priority: "high",
      estimatedMinutes: 90,
      dueAt: isoAtOffset(1, 11),
      preferredTimeBand: "morning",
      preferredWindowStart: "08:30",
      preferredWindowEnd: "11:30",
      status: "todo",
      completedAt: null,
      areaId: "area-work",
      projectId: "project-launch",
      recurrence: null,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: "task-review",
      userId,
      title: "Review overdue follow-ups",
      notes: "Clear anything that slipped from yesterday and either reschedule or archive it.",
      priority: "critical",
      estimatedMinutes: 45,
      dueAt: isoAtOffset(-1, 16),
      preferredTimeBand: "anytime",
      preferredWindowStart: null,
      preferredWindowEnd: null,
      status: "todo",
      completedAt: null,
      areaId: "area-work",
      projectId: "project-launch",
      recurrence: null,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: "task-gym",
      userId,
      title: "Strength session",
      notes: "Upper-body block. Keep it at 60 minutes.",
      priority: "medium",
      estimatedMinutes: 60,
      dueAt: isoAtOffset(0, 19),
      preferredTimeBand: "evening",
      preferredWindowStart: "17:30",
      preferredWindowEnd: "20:30",
      status: "todo",
      completedAt: null,
      areaId: "area-health",
      projectId: "project-wellness",
      recurrence: null,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: "task-plan",
      userId,
      title: "Daily planning reset",
      notes: "Close loops, choose top three, and rebalance the afternoon.",
      priority: "medium",
      estimatedMinutes: 30,
      dueAt: isoAtOffset(0, 8),
      preferredTimeBand: "morning",
      preferredWindowStart: "08:00",
      preferredWindowEnd: "09:00",
      status: "todo",
      completedAt: null,
      areaId: "area-work",
      projectId: "project-launch",
      recurrence: {
        frequency: "weekdays",
      },
      createdAt,
      updatedAt: createdAt,
    },
  ];
  const taskBlocks: TaskBlockRecord[] = [
    {
      id: "block-plan",
      userId,
      taskId: "task-plan",
      startsAt: isoAtOffset(0, 8),
      endsAt: isoAtOffset(0, 8, 30),
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: "block-outline",
      userId,
      taskId: "task-outline",
      startsAt: isoAtOffset(0, 10),
      endsAt: isoAtOffset(0, 11, 30),
      createdAt,
      updatedAt: createdAt,
    },
  ];
  const events: EventRecord[] = [
    {
      id: "event-standup",
      userId,
      title: "Product standup",
      notes: "Daily sync with engineering and design.",
      location: "Zoom",
      startsAt: isoAtOffset(0, 9),
      endsAt: isoAtOffset(0, 9, 30),
      recurrence: {
        frequency: "weekdays",
      },
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: "event-review",
      userId,
      title: "Project review",
      notes: "Lock scope for the first release.",
      location: "Studio",
      startsAt: isoAtOffset(1, 14),
      endsAt: isoAtOffset(1, 15),
      recurrence: null,
      createdAt,
      updatedAt: createdAt,
    },
  ];
  const checklistItems: TaskChecklistItemRecord[] = [
    {
      id: "check-1",
      taskId: "task-outline",
      label: "Define setup steps",
      completed: true,
      sortOrder: 0,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: "check-2",
      taskId: "task-outline",
      label: "Write first-run copy",
      completed: false,
      sortOrder: 1,
      createdAt,
      updatedAt: createdAt,
    },
  ];
  const taskTags: TaskTagRecord[] = [
    { taskId: "task-outline", tagId: "tag-focus" },
    { taskId: "task-review", tagId: "tag-admin" },
    { taskId: "task-gym", tagId: "tag-errand" },
  ];

  return {
    user: {
      id: userId,
      email: "planner@example.com",
      fullName: "Daycraft User",
      createdAt,
      updatedAt: createdAt,
    },
    settings: {
      ...DEFAULT_SETTINGS,
      userId,
      createdAt,
      updatedAt: createdAt,
    },
    areas,
    projects,
    tags,
    tasks: tasks.map((task) => ({ ...task })),
    taskBlocks,
    events,
    checklistItems,
    taskTags,
  };
}
