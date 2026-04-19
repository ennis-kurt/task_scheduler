import {
  eachDayOfInterval,
  endOfDay,
  format,
  isBefore,
  isSameDay,
  parseISO,
  startOfDay,
} from "date-fns";

import { DEFAULT_SETTINGS, SAVED_FILTERS } from "@/lib/planner/constants";
import { getSessionContext } from "@/lib/auth";
import { buildDefaultRange, calculateMinutes, expandRecurrence } from "@/lib/planner/date";
import { buildProjectPlans } from "@/lib/planner/project-planning";
import { plannerRepository } from "@/lib/planner/repository";
import type {
  PlannerCalendarItem,
  PlannerPayload,
  PlannerRange,
  PlannerTask,
} from "@/lib/planner/types";

export async function getInitialPlannerPayload(range?: PlannerRange) {
  const session = await getSessionContext();

  if (!session.userId) {
    return null;
  }

  const workspace = await plannerRepository.getWorkspace(session.userId);
  const effectiveRange = range ?? buildDefaultRange(workspace.settings.weekStart);
  const primaryBlocksByTask = new Map(
    workspace.taskBlocks.map((block) => [
      block.taskId,
      {
        id: block.id,
        startsAt: block.startsAt,
        endsAt: block.endsAt,
      },
    ]),
  );
  const tasks: PlannerTask[] = workspace.tasks.map((task) => ({
    ...task,
    area: workspace.areas.find((area) => area.id === task.areaId) ?? null,
    project: workspace.projects.find((project) => project.id === task.projectId) ?? null,
    milestone:
      workspace.milestones.find((milestone) => milestone.id === task.milestoneId) ?? null,
    tags: workspace.tags.filter((tag) =>
      workspace.taskTags.some(
        (taskTag) => taskTag.taskId === task.id && taskTag.tagId === tag.id,
      ),
    ),
    checklist: workspace.checklistItems
      .filter((item) => item.taskId === task.id)
      .sort((left, right) => left.sortOrder - right.sortOrder),
    hasBlock: primaryBlocksByTask.has(task.id),
    primaryBlock: primaryBlocksByTask.get(task.id) ?? null,
  }));

  const scheduledTasks: PlannerCalendarItem[] = workspace.taskBlocks.flatMap((block) => {
    const task = tasks.find((candidate) => candidate.id === block.taskId);

    if (!task) {
      return [];
    }

    return expandRecurrence(
      block.startsAt,
      block.endsAt,
      task.recurrence,
      effectiveRange,
    ).map((occurrence) => ({
      id: `task:${block.id}:${occurrence.occurrenceKey}`,
      sourceId: block.id,
      instanceId: `${block.id}-${occurrence.occurrenceKey}`,
      occurrenceKey: occurrence.occurrenceKey,
      source: "task" as const,
      taskId: task.id,
      title: task.title,
      start: occurrence.start,
      end: occurrence.end,
      notes: task.notes,
      priority: task.priority,
      status: task.status,
      areaId: task.areaId,
      projectId: task.projectId,
      recurring: occurrence.recurring,
      readOnly: false,
    }));
  });

  const scheduledEvents: PlannerCalendarItem[] = workspace.events.flatMap((event) =>
    expandRecurrence(event.startsAt, event.endsAt, event.recurrence, effectiveRange).map(
      (occurrence) => ({
        id: `event:${event.id}:${occurrence.occurrenceKey}`,
        sourceId: event.id,
        instanceId: `${event.id}-${occurrence.occurrenceKey}`,
        occurrenceKey: occurrence.occurrenceKey,
        source: "event" as const,
        title: event.title,
        start: occurrence.start,
        end: occurrence.end,
        notes: event.notes,
        location: event.location,
        recurring: occurrence.recurring,
        readOnly: occurrence.recurring,
      }),
    ),
  );

  const scheduledItems = [...scheduledTasks, ...scheduledEvents].sort((left, right) =>
    left.start.localeCompare(right.start),
  );
  const projectPlans = buildProjectPlans(workspace.projects, workspace.milestones, tasks);
  const unscheduledTasks = tasks.filter((task) => !task.hasBlock && task.status !== "done");
  const today = new Date();
  const todayStart = startOfDay(today);
  const overdueTasks = tasks.filter((task) => {
    if (task.status === "done") {
      return false;
    }

    const dueOverdue =
      task.dueAt != null && isBefore(parseISO(task.dueAt), todayStart);
    const scheduledOverdue =
      task.primaryBlock != null &&
      isBefore(parseISO(task.primaryBlock.endsAt), todayStart);

    return dueOverdue || scheduledOverdue;
  });
  const overdueCount = overdueTasks.length;
  const todayCount = tasks.filter(
    (task) =>
      task.status !== "done" &&
      task.dueAt &&
      isSameDay(parseISO(task.dueAt), today),
  ).length;
  const days = eachDayOfInterval({
    start: startOfDay(parseISO(effectiveRange.start)),
    end: endOfDay(parseISO(effectiveRange.end)),
  });
  const settings = workspace.settings ?? DEFAULT_SETTINGS;
  const capacity = days.map((day) => {
    const workWindow = settings.workHours[day.getDay()];
    const workMinutes = workWindow
      ? calculateMinutes(
          `${format(day, "yyyy-MM-dd")}T${workWindow.start}:00.000Z`,
          `${format(day, "yyyy-MM-dd")}T${workWindow.end}:00.000Z`,
        )
      : 0;
    const itemsForDay = scheduledItems.filter((item) =>
      isSameDay(parseISO(item.start), day),
    );
    const scheduledTaskMinutes = itemsForDay
      .filter((item) => item.source === "task")
      .reduce((total, item) => total + calculateMinutes(item.start, item.end), 0);
    const fixedEventMinutes = itemsForDay
      .filter((item) => item.source === "event")
      .reduce((total, item) => total + calculateMinutes(item.start, item.end), 0);
    const remainingMinutes = workMinutes - scheduledTaskMinutes - fixedEventMinutes;

    return {
      date: format(day, "yyyy-MM-dd"),
      workMinutes,
      scheduledTaskMinutes,
      fixedEventMinutes,
      remainingMinutes,
      overloaded: remainingMinutes < 0,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    mode: session.mode,
    user: workspace.user,
    settings,
    areas: workspace.areas,
    projects: workspace.projects,
    milestones: workspace.milestones,
    projectPlans,
    tags: workspace.tags,
    events: workspace.events,
    tasks,
    unscheduledTasks,
    overdueTasks,
    scheduledItems,
    capacity,
    overdueCount,
    todayCount,
    unscheduledCount: unscheduledTasks.length,
    savedFilters: SAVED_FILTERS,
  } satisfies PlannerPayload;
}
