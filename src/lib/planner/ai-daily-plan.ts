import {
  addMinutes,
  differenceInCalendarDays,
  differenceInMinutes,
  format,
  parseISO,
} from "date-fns";

import type {
  DayCapacity,
  MilestoneRecord,
  PlannerCalendarItem,
  PlannerTask,
  Priority,
  ProjectPlan,
  ProjectRecord,
  UserSettingsRecord,
} from "./types";

export type PlanningMode = "deep_focus" | "standard" | "chill" | "custom";

export type CustomPlanningPreferences = {
  intensity?: string;
  priorityFocus?: string;
  avoidTasks?: string;
  sessionLength?: string;
};

export type DailyPlanTaskDependency = {
  taskId: string;
  dependsOnTaskId: string;
  type?: "blocks" | "related";
};

export type DailyPlanRequest = {
  planningMode: PlanningMode;
  date: string;
  timezone: string;
  tasks: PlannerTask[];
  projects: ProjectRecord[];
  milestones: MilestoneRecord[];
  projectPlans: ProjectPlan[];
  scheduledItems: PlannerCalendarItem[];
  capacity: DayCapacity[];
  settings: UserSettingsRecord;
  customInstructions?: CustomPlanningPreferences;
  dependencies: DailyPlanTaskDependency[];
};

export type DailyPlanBlock = {
  start_time: string;
  end_time: string;
  type: "focus_block" | "break" | "buffer";
  task_id: string | null;
  task_title: string;
  project_id?: string | null;
  project_name?: string | null;
  reason?: string;
};

export type DeadlineRiskWarning = {
  type: "deadline_risk" | "capacity_risk" | "overload";
  project_id?: string | null;
  milestone_id?: string | null;
  task_id?: string | null;
  message: string;
  severity: "low" | "medium" | "high";
};

export type PostponedTask = {
  task_id: string;
  task_title: string;
  reason: string;
};

export type AlternativePlan = {
  label: string;
  summary: string;
  schedule: DailyPlanBlock[];
};

export type DailyPlanResponse = {
  planning_mode: PlanningMode;
  summary: string;
  generated_at: string;
  date: string;
  schedule: DailyPlanBlock[];
  warnings: DeadlineRiskWarning[];
  postponed_tasks: PostponedTask[];
  alternatives: AlternativePlan[];
  explanation_summary: string;
};

type ModeConfig = {
  fillRatio: number;
  focusBlockMinutes: number;
  maxTaskMinutes: number;
  breakMinutes: number;
  minBreakMinutes: number;
  startBufferMinutes: number;
  endBufferMinutes: number;
  summary: string;
};

const PRIORITY_SCORE: Record<Priority, number> = {
  low: 5,
  medium: 18,
  high: 32,
  critical: 48,
};

export const AI_DAILY_PLANNER_SYSTEM_PROMPT = [
  "You are Inflara's AI Office Assistant.",
  "Create humane, realistic daily plans that balance urgency, effort, priority, deadlines, fixed calendar events, available capacity, and project progress.",
  "Never overload the user just because a project is high priority. Balance priority with actual deadline risk.",
  "Return only structured JSON matching the DailyPlanResponse schema.",
].join("\n");

export const AI_DAILY_PLANNER_DEVELOPER_PROMPT = [
  "Input includes tasks, projects, milestones, estimated durations, priorities, due dates, project progress, work hours, fixed events, planning mode, custom user instructions, and task dependencies.",
  "Deep Focus should use longer focused blocks and fewer gaps.",
  "Standard should balance urgent work, project progress, breaks, and task variety.",
  "Chill should reduce cognitive load with more breathing room and less total scheduled work.",
  "Custom should follow the user's explicit organization preferences.",
  "Warn clearly when available time cannot realistically satisfy deadlines.",
  "The output must include planning_mode, summary, schedule, warnings, postponed_tasks, alternatives, and explanation_summary.",
].join("\n");

export const AI_DAILY_PLANNER_USER_PROMPT_TEMPLATE = [
  "Create a daily plan for {{date}} in {{timezone}}.",
  "Selected planning mode: {{planning_mode}}.",
  "Custom instructions: {{custom_instructions}}.",
  "Use the provided JSON context: tasks, projects, milestones, deadlines, priorities, estimated durations, fixed events, available working hours, project progress, and dependencies.",
  "Return JSON only in the expected DailyPlanResponse format.",
].join("\n");

export const PROJECT_DELAY_MONITOR_PROMPT_V2 = [
  "Future v2 agent: continuously monitor project completion percentage, remaining tasks, upcoming deadlines, current completion pace, missed tasks, delayed tasks, and schedule changes.",
  "If a project may be delayed, emit a clear warning with expected completion pace versus current pace.",
  "This prompt is non-running in v1 and exists only as a structured implementation note.",
].join("\n");

function modeConfig(mode: PlanningMode, custom?: CustomPlanningPreferences): ModeConfig {
  if (mode === "deep_focus") {
    return {
      fillRatio: 0.94,
      focusBlockMinutes: 105,
      maxTaskMinutes: 120,
      breakMinutes: 10,
      minBreakMinutes: 5,
      startBufferMinutes: 0,
      endBufferMinutes: 0,
      summary: "Today’s plan uses longer focus blocks and fewer gaps for deeper work.",
    };
  }

  if (mode === "chill") {
    return {
      fillRatio: 0.55,
      focusBlockMinutes: 40,
      maxTaskMinutes: 55,
      breakMinutes: 25,
      minBreakMinutes: 20,
      startBufferMinutes: 10,
      endBufferMinutes: 10,
      summary: "Today’s plan protects energy with lighter blocks and more breathing room.",
    };
  }

  if (mode === "custom") {
    const sessionLength = Number.parseInt(custom?.sessionLength ?? "", 10);
    const intensity = (custom?.intensity ?? "").toLowerCase();

    return {
      fillRatio: intensity.includes("light") || intensity.includes("chill") ? 0.62 : 0.82,
      focusBlockMinutes: Number.isFinite(sessionLength) ? Math.min(120, Math.max(25, sessionLength)) : 60,
      maxTaskMinutes: Number.isFinite(sessionLength) ? Math.min(150, Math.max(30, sessionLength)) : 75,
      breakMinutes: intensity.includes("intense") ? 10 : 15,
      minBreakMinutes: intensity.includes("intense") ? 5 : 10,
      startBufferMinutes: intensity.includes("light") || intensity.includes("chill") ? 10 : 0,
      endBufferMinutes: intensity.includes("light") || intensity.includes("chill") ? 10 : 0,
      summary: "Today’s plan follows your custom scheduling preferences.",
    };
  }

  return {
    fillRatio: 0.8,
    focusBlockMinutes: 75,
    maxTaskMinutes: 90,
    breakMinutes: 15,
    minBreakMinutes: 10,
    startBufferMinutes: 0,
    endBufferMinutes: 0,
    summary: "Today’s plan balances urgent work, project progress, and breaks.",
  };
}

function parseTimeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return 0;
  }
  return hours * 60 + minutes;
}

function minutesToTime(minutes: number) {
  const safe = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)));
  const hours = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function dateTimePartsInTimezone(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    date: `${values.year}-${values.month}-${values.day}`,
    minutes:
      Number.parseInt(values.hour ?? "0", 10) * 60 +
      Number.parseInt(values.minute ?? "0", 10),
  };
}

function nowInTimezone(timezone: string) {
  return dateTimePartsInTimezone(new Date(), timezone);
}

function roundUpToPlanningSlot(minutes: number) {
  return Math.ceil(minutes / 5) * 5;
}

function eventBusyWindowForDate(
  item: PlannerCalendarItem,
  date: string,
  timezone: string,
) {
  const start = parseISO(item.start);
  const end = parseISO(item.end);

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end.getTime() <= start.getTime()
  ) {
    return null;
  }

  const localStart = dateTimePartsInTimezone(start, timezone);
  const localEnd = dateTimePartsInTimezone(end, timezone);

  if (localEnd.date < date || localStart.date > date) {
    return null;
  }

  const windowStart = localStart.date < date ? 0 : localStart.minutes;
  const windowEnd = localEnd.date > date ? 24 * 60 : localEnd.minutes;

  if (windowEnd <= windowStart) {
    return null;
  }

  return {
    start: windowStart,
    end: windowEnd,
  };
}

function nearestDeadline(task: PlannerTask) {
  return task.dueAt ?? task.milestone?.deadline ?? task.project?.deadlineAt ?? null;
}

function deadlineScore(task: PlannerTask, date: string) {
  const deadline = nearestDeadline(task);
  if (!deadline) {
    return 0;
  }

  const days = differenceInCalendarDays(parseISO(deadline), parseISO(`${date}T12:00:00`));

  if (days < 0) return 86;
  if (days === 0) return 76;
  if (days === 1) return 58;
  if (days <= 3) return 42;
  if (days <= 7) return 28;
  if (days <= 14) return 14;
  return -10;
}

function projectProgressScore(task: PlannerTask, projectPlans: ProjectPlan[]) {
  if (!task.projectId) {
    return 0;
  }

  const plan = projectPlans.find((candidate) => candidate.project.id === task.projectId);
  if (!plan) {
    return 0;
  }

  if (plan.completionPercentage < 25) return 12;
  if (plan.completionPercentage < 60) return 6;
  return 0;
}

function scoreTask(task: PlannerTask, request: DailyPlanRequest) {
  const statusBoost = task.status === "in_progress" ? 22 : 0;
  const customFocus = request.customInstructions?.priorityFocus?.toLowerCase() ?? "";
  const customBoost =
    customFocus && task.title.toLowerCase().includes(customFocus) ? 18 : 0;

  return (
    PRIORITY_SCORE[task.priority] +
    deadlineScore(task, request.date) +
    projectProgressScore(task, request.projectPlans) +
    statusBoost +
    customBoost
  );
}

function getWorkWindow(request: DailyPlanRequest) {
  const date = parseISO(`${request.date}T12:00:00`);
  const weekday = date.getDay();
  const configured = request.settings.workHours[weekday];
  const fallback = { start: "09:00", end: "17:00" };
  const window = configured ?? fallback;
  const start = parseTimeToMinutes(window.start);
  const end = parseTimeToMinutes(window.end);

  if (end <= start) {
    return { start: fallback.start, end: fallback.end, startMinutes: 540, endMinutes: 1020 };
  }

  return {
    start: window.start,
    end: window.end,
    startMinutes: start,
    endMinutes: end,
  };
}

function subtractBusyWindows(
  base: Array<{ start: number; end: number }>,
  busy: Array<{ start: number; end: number }>,
) {
  let windows = base;

  for (const busyWindow of busy) {
    const next: Array<{ start: number; end: number }> = [];

    for (const window of windows) {
      if (busyWindow.end <= window.start || busyWindow.start >= window.end) {
        next.push(window);
        continue;
      }

      if (busyWindow.start > window.start) {
        next.push({ start: window.start, end: busyWindow.start });
      }

      if (busyWindow.end < window.end) {
        next.push({ start: busyWindow.end, end: window.end });
      }
    }

    windows = next.filter((window) => window.end - window.start >= 15);
  }

  return windows;
}

function freeWindowsForDay(request: DailyPlanRequest) {
  const workWindow = getWorkWindow(request);
  const timezoneNow = nowInTimezone(request.timezone);
  const currentDayStart =
    timezoneNow.date === request.date
      ? Math.max(workWindow.startMinutes, roundUpToPlanningSlot(timezoneNow.minutes))
      : workWindow.startMinutes;

  if (currentDayStart >= workWindow.endMinutes) {
    return [];
  }

  const fixedBusy = request.scheduledItems
    .filter((item) => item.source === "event")
    .map((item) => eventBusyWindowForDate(item, request.date, request.timezone))
    .filter((window) => window !== null)
    .sort((a, b) => a.start - b.start);

  return subtractBusyWindows(
    [{ start: currentDayStart, end: workWindow.endMinutes }],
    fixedBusy,
  );
}

function blockReason(task: PlannerTask) {
  const deadline = nearestDeadline(task);
  const deadlinePart = deadline
    ? ` due ${format(parseISO(deadline), "MMM d")}`
    : " without a fixed deadline";
  return `${task.priority} priority task${deadlinePart}; estimated ${task.estimatedMinutes} minutes.`;
}

function buildWarnings(request: DailyPlanRequest): DeadlineRiskWarning[] {
  const day = parseISO(`${request.date}T12:00:00`);
  const dailyWorkMinutes = Math.max(240, getWorkWindow(request).endMinutes - getWorkWindow(request).startMinutes);
  const warnings: DeadlineRiskWarning[] = [];

  for (const plan of request.projectPlans) {
    if (!plan.project.deadlineAt || plan.remainingMinutes <= 0) {
      continue;
    }

    const daysLeft = Math.max(
      1,
      differenceInCalendarDays(parseISO(plan.project.deadlineAt), day) + 1,
    );
    const realisticCapacity = daysLeft * dailyWorkMinutes * 0.72;

    if (plan.remainingMinutes > realisticCapacity) {
      warnings.push({
        type: "deadline_risk",
        project_id: plan.project.id,
        message: `${plan.project.name} may miss its deadline. About ${Math.round(
          plan.remainingMinutes / 60,
        )}h remains, but the realistic capacity before the deadline is about ${Math.round(
          realisticCapacity / 60,
        )}h.`,
        severity: plan.remainingMinutes > realisticCapacity * 1.35 ? "high" : "medium",
      });
    }
  }

  const capacityForDay = request.capacity.find((dayCapacity) => dayCapacity.date === request.date);
  if (capacityForDay?.overloaded) {
    warnings.unshift({
      type: "overload",
      message: "Today is already overloaded before adding an AI plan. I avoided fixed events and kept the draft conservative.",
      severity: "high",
    });
  }

  return warnings.slice(0, 4);
}

export function generateDeterministicDailyPlan(request: DailyPlanRequest): DailyPlanResponse {
  const config = modeConfig(request.planningMode, request.customInstructions);
  const windows = freeWindowsForDay(request);
  const availableMinutes = windows.reduce((total, window) => total + window.end - window.start, 0);
  const targetWorkMinutes = Math.max(0, Math.floor(availableMinutes * config.fillRatio));
  const avoidedText = (request.customInstructions?.avoidTasks ?? "").toLowerCase();
  const candidates = request.tasks
    .filter((task) => task.status !== "done")
    .filter((task) => !avoidedText || !task.title.toLowerCase().includes(avoidedText))
    .sort((a, b) => scoreTask(b, request) - scoreTask(a, request));

  const schedule: DailyPlanBlock[] = [];
  const postponed: PostponedTask[] = [];
  let taskIndex = 0;
  let scheduledWorkMinutes = 0;

  for (const window of windows) {
    let cursor = Math.min(window.end, window.start + config.startBufferMinutes);
    const windowEnd = Math.max(cursor, window.end - config.endBufferMinutes);

    while (taskIndex < candidates.length && cursor + 15 <= windowEnd) {
      const task = candidates[taskIndex];
      const remainingBudget = targetWorkMinutes - scheduledWorkMinutes;

      if (remainingBudget < 15) {
        break;
      }

      const requestedMinutes = Math.max(15, task.estimatedMinutes || config.focusBlockMinutes);
      const duration = Math.min(
        requestedMinutes,
        config.maxTaskMinutes,
        remainingBudget,
        windowEnd - cursor,
      );

      if (duration < 15) {
        break;
      }

      const end = cursor + duration;
      schedule.push({
        start_time: minutesToTime(cursor),
        end_time: minutesToTime(end),
        type: "focus_block",
        task_id: task.id,
        task_title: task.title,
        project_id: task.projectId,
        project_name: task.project?.name ?? null,
        reason: blockReason(task),
      });
      scheduledWorkMinutes += duration;
      cursor = end;
      taskIndex += 1;

      if (
        taskIndex < candidates.length &&
        cursor + config.minBreakMinutes + 15 <= windowEnd &&
        scheduledWorkMinutes < targetWorkMinutes
      ) {
        const breakMinutes = Math.min(
          config.breakMinutes,
          Math.max(config.minBreakMinutes, windowEnd - cursor - 15),
        );
        schedule.push({
          start_time: minutesToTime(cursor),
          end_time: minutesToTime(cursor + breakMinutes),
          type: "break",
          task_id: null,
          task_title: "Break",
          reason: `${breakMinutes} minute recovery gap.`,
        });
        cursor += breakMinutes;
      }
    }
  }

  for (const task of candidates.slice(taskIndex)) {
    postponed.push({
      task_id: task.id,
      task_title: task.title,
      reason:
        scheduledWorkMinutes >= targetWorkMinutes
          ? "Lower schedule score or outside today’s realistic capacity."
          : "Could not fit around fixed events and work hours.",
    });
  }

  const workLabel = scheduledWorkMinutes >= 60
    ? `${Math.floor(scheduledWorkMinutes / 60)}h ${scheduledWorkMinutes % 60}m`
    : `${scheduledWorkMinutes}m`;
  const warnings = buildWarnings(request);

  return {
    planning_mode: request.planningMode,
    summary: config.summary,
    generated_at: new Date().toISOString(),
    date: request.date,
    schedule,
    warnings,
    postponed_tasks: postponed.slice(0, 8),
    alternatives: [],
    explanation_summary: `Drafted ${schedule.filter((block) => block.type === "focus_block").length} focus blocks totaling ${workLabel}. Tasks were scored by deadline urgency, priority, estimated effort, current status, and project progress while preserving fixed calendar events.`,
  };
}

export function localDateTime(date: string, time: string) {
  const base = parseISO(`${date}T00:00:00`);
  const minutes = parseTimeToMinutes(time);
  return addMinutes(base, minutes);
}

export function planBlockDurationMinutes(block: DailyPlanBlock) {
  const start = parseISO(`2000-01-01T${block.start_time}:00`);
  const end = parseISO(`2000-01-01T${block.end_time}:00`);
  return differenceInMinutes(end, start);
}
