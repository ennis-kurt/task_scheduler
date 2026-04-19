import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfDay,
  isAfter,
  isBefore,
  parseISO,
  startOfDay,
  subDays,
} from "date-fns";

import type {
  MilestoneHealth,
  MilestoneRecord,
  PlannerMilestone,
  PlannerTask,
  ProjectBurndownPoint,
  ProjectPlan,
  ProjectRecord,
  TaskStatus,
} from "@/lib/planner/types";

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
};

function taskWeight(task: PlannerTask) {
  return Math.max(task.estimatedMinutes, 15);
}

function percentage(completed: number, total: number) {
  if (total <= 0) {
    return 0;
  }

  return Math.round((completed / total) * 100);
}

function toHealth(startDate: string, deadline: string, progress: number): MilestoneHealth {
  if (progress >= 100) {
    return "done";
  }

  const now = new Date();
  const start = startOfDay(parseISO(startDate));
  const end = endOfDay(parseISO(deadline));

  if (isBefore(now, start)) {
    return "not_started";
  }

  if (isAfter(now, end)) {
    return "at_risk";
  }

  const totalDays = Math.max(1, differenceInCalendarDays(end, start) + 1);
  const elapsedDays = Math.min(
    totalDays,
    Math.max(1, differenceInCalendarDays(startOfDay(now), start) + 1),
  );
  const expectedProgress = (elapsedDays / totalDays) * 100;

  return progress + 12 >= expectedProgress ? "on_track" : "at_risk";
}

function minDate(values: string[]) {
  return values
    .map((value) => parseISO(value))
    .sort((left, right) => left.getTime() - right.getTime())[0];
}

function maxDate(values: string[]) {
  return values
    .map((value) => parseISO(value))
    .sort((left, right) => right.getTime() - left.getTime())[0];
}

function buildMilestonePlan(
  milestone: MilestoneRecord,
  project: ProjectRecord,
  tasks: PlannerTask[],
  options?: { synthetic?: boolean },
): PlannerMilestone {
  const completedMinutes = tasks
    .filter((task) => task.status === "done")
    .reduce((sum, task) => sum + taskWeight(task), 0);
  const totalMinutes = tasks.reduce((sum, task) => sum + taskWeight(task), 0);
  const completionPercentage = percentage(completedMinutes, totalMinutes);

  return {
    ...milestone,
    project,
    tasks,
    completionPercentage,
    completedTaskCount: tasks.filter((task) => task.status === "done").length,
    totalTaskCount: tasks.length,
    completedMinutes,
    totalMinutes,
    remainingMinutes: Math.max(totalMinutes - completedMinutes, 0),
    health: toHealth(milestone.startDate, milestone.deadline, completionPercentage),
    synthetic: options?.synthetic ?? false,
  };
}

function buildSyntheticMilestone(
  project: ProjectRecord,
  tasks: PlannerTask[],
  start: Date,
  end: Date,
) {
  const fallbackEnd =
    project.deadlineAt != null
      ? endOfDay(parseISO(project.deadlineAt))
      : end.getTime() > start.getTime()
        ? endOfDay(end)
        : endOfDay(addDays(start, 14));

  return buildMilestonePlan(
    {
      id: `project-scope:${project.id}`,
      userId: project.userId,
      projectId: project.id,
      name: project.name,
      description:
        "Project-wide timeline. Add milestones to break this plan into named phases.",
      startDate: startOfDay(start).toISOString(),
      deadline: fallbackEnd.toISOString(),
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    },
    project,
    tasks.sort((left, right) => left.title.localeCompare(right.title)),
    { synthetic: true },
  );
}

function buildBurndown(
  tasks: PlannerTask[],
  start: string,
  end: string,
): ProjectBurndownPoint[] {
  const startDate = startOfDay(parseISO(start));
  const endDate = endOfDay(parseISO(end));
  const totalMinutes = tasks.reduce((sum, task) => sum + taskWeight(task), 0);
  const days = eachDayOfInterval({ start: startDate, end: endDate });

  return days.map((day, index) => {
    const cutoff = endOfDay(day);
    const remainingMinutes = tasks.reduce((sum, task) => {
      if (!task.completedAt) {
        return sum + taskWeight(task);
      }

      return isAfter(parseISO(task.completedAt), cutoff) ? sum + taskWeight(task) : sum;
    }, 0);
    const completedMinutes = Math.max(totalMinutes - remainingMinutes, 0);
    const idealRemainingMinutes =
      days.length === 1
        ? 0
        : Math.max(
            0,
            Math.round(totalMinutes - (totalMinutes * index) / (days.length - 1)),
          );

    return {
      date: day.toISOString(),
      remainingMinutes,
      idealRemainingMinutes,
      completedMinutes,
    };
  });
}

export function buildProjectPlans(
  projects: ProjectRecord[],
  milestones: MilestoneRecord[],
  tasks: PlannerTask[],
): ProjectPlan[] {
  const statusOrder: Record<ProjectRecord["status"], number> = {
    active: 0,
    completed: 1,
    archived: 2,
  };

  return projects
    .map((project) => {
      const projectTasks = tasks.filter((task) => task.projectId === project.id);
      const projectMilestones = milestones
        .filter((milestone) => milestone.projectId === project.id)
        .sort((left, right) => left.startDate.localeCompare(right.startDate))
        .map((milestone) =>
          buildMilestonePlan(
            milestone,
            project,
            projectTasks
              .filter((task) => task.milestoneId === milestone.id)
              .sort((left, right) => left.title.localeCompare(right.title)),
          ),
        );
      const standaloneTasks = projectTasks
        .filter((task) => !task.milestoneId)
        .sort((left, right) => left.title.localeCompare(right.title));
      const totalMinutes = projectTasks.reduce((sum, task) => sum + taskWeight(task), 0);
      const completedMinutes = projectTasks
        .filter((task) => task.status === "done")
        .reduce((sum, task) => sum + taskWeight(task), 0);
      const completionPercentage = percentage(completedMinutes, totalMinutes);
      const scheduleCandidates = [
        project.createdAt,
        ...projectMilestones.flatMap((milestone) => [milestone.startDate, milestone.deadline]),
        ...projectTasks.flatMap((task) =>
          [task.dueAt, task.primaryBlock?.startsAt, task.primaryBlock?.endsAt].filter(
            Boolean,
          ) as string[],
        ),
        ...(project.deadlineAt ? [project.deadlineAt] : []),
      ];
      const scheduleStart = minDate(scheduleCandidates);
      const scheduleEnd = maxDate(scheduleCandidates);
      const plottedMilestones = projectMilestones.length
        ? projectMilestones
        : [buildSyntheticMilestone(project, projectTasks, scheduleStart, scheduleEnd)];
      const plottedScheduleCandidates = [
        project.createdAt,
        ...plottedMilestones.flatMap((milestone) => [milestone.startDate, milestone.deadline]),
        ...projectTasks.flatMap((task) =>
          [task.dueAt, task.primaryBlock?.startsAt, task.primaryBlock?.endsAt].filter(
            Boolean,
          ) as string[],
        ),
        ...(project.deadlineAt ? [project.deadlineAt] : []),
      ];
      const plottedScheduleStart = minDate(plottedScheduleCandidates);
      const plottedScheduleEnd = maxDate(plottedScheduleCandidates);
      const health =
        completionPercentage >= 100
          ? "done"
          : plottedMilestones.some((milestone) => milestone.health === "at_risk")
            ? "at_risk"
            : "on_track";

      return {
        project,
        milestones: projectMilestones,
        plottedMilestones,
        hasFallbackMilestone: projectMilestones.length === 0,
        standaloneTasks,
        tasks: projectTasks.sort((left, right) => left.title.localeCompare(right.title)),
        completionPercentage,
        completedTaskCount: projectTasks.filter((task) => task.status === "done").length,
        totalTaskCount: projectTasks.length,
        completedMinutes,
        totalMinutes,
        remainingMinutes: Math.max(totalMinutes - completedMinutes, 0),
        statusBreakdown: (["todo", "in_progress", "done"] as TaskStatus[]).map((status) => ({
          status,
          label: STATUS_LABELS[status],
          count: projectTasks.filter((task) => task.status === status).length,
          minutes: projectTasks
            .filter((task) => task.status === status)
            .reduce((sum, task) => sum + taskWeight(task), 0),
        })),
        burndown: buildBurndown(
          projectTasks,
          plottedScheduleStart.toISOString(),
          (project.deadlineAt ? parseISO(project.deadlineAt) : plottedScheduleEnd).toISOString(),
        ),
        scheduleRange: {
          start: subDays(plottedScheduleStart, 3).toISOString(),
          end: addDays(plottedScheduleEnd, 7).toISOString(),
        },
        health,
      } satisfies ProjectPlan;
    })
    .sort(
      (left, right) =>
        statusOrder[left.project.status] - statusOrder[right.project.status] ||
        left.project.name.localeCompare(right.project.name),
    );
}
