"use client";

import FullCalendar from "@fullcalendar/react";
import interactionPlugin, {
  Draggable,
  type EventReceiveArg,
  type EventResizeDoneArg,
} from "@fullcalendar/interaction";
import timeGridPlugin from "@fullcalendar/timegrid";
import type {
  DateSelectArg,
  EventContentArg,
  EventDropArg,
  EventMountArg,
} from "@fullcalendar/core";
import { CalendarClock, Trash2, X } from "lucide-react";
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  addDays,
  addMinutes,
  differenceInMinutes,
  endOfDay,
  format,
  isBefore,
  isSameDay,
  parseISO,
  startOfDay,
  startOfWeek,
} from "date-fns";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ProjectPlanningModule } from "@/components/planner/project-planning-module";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PRIORITIES } from "@/lib/planner/constants";
import {
  buildDefaultEventWindow,
  calculateMinutes,
  toDateTimeInput,
  todayDateString,
} from "@/lib/planner/date";
import type {
  DayCapacity,
  EventRecord,
  NewMilestoneInput,
  NewTaskInput,
  PlannerCalendarItem,
  PlannerPayload,
  ProjectPlan,
  PlannerRange,
  PlannerSurface,
  PlannerTask,
  Priority,
  RecurrenceRule,
  TaskStatus,
  UpdateSettingsInput,
  UpdateTaskInput,
} from "@/lib/planner/types";
import { cn } from "@/lib/utils";
import { Sidebar, type ActiveViewType } from "../layout/sidebar";
import { PlanningView } from "./views/planning-view";

type PlannerAppProps = {
  initialData: PlannerPayload;
  initialRange: PlannerRange;
};

type ProjectPlanningSurface = "plan" | "timeline" | "charts";

type DrawerState =
  | { type: "task"; taskId: string; blockId?: string; instanceId?: string }
  | { type: "event"; eventId: string }
  | { type: "settings" }
  | null;

type QuickAddKind = "task" | "event" | "project" | "area" | "tag" | null;

type QuickAddDefaults = {
  startsAt?: string;
  endsAt?: string;
  projectId?: string;
  milestoneId?: string | null;
};

type PendingRecurringEdit = {
  taskId: string;
  title: string;
  sourceId: string;
  occurrenceKey: string;
  startsAt: string;
  endsAt: string;
  originalStartsAt: string;
  originalEndsAt: string;
  revert: () => void;
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

function pickInitialProjectId(projectPlans: ProjectPlan[]) {
  return (
    projectPlans.find((plan) => plan.project.status === "active")?.project.id ??
    projectPlans[0]?.project.id ??
    ""
  );
}

const BOARD_COLUMNS: Array<{
  id: TaskStatus;
  label: string;
  description: string;
}> = [
  {
    id: "todo",
    label: "To do",
    description: "Ready to place and sequence.",
  },
  {
    id: "in_progress",
    label: "In progress",
    description: "Already moving this week.",
  },
  {
    id: "done",
    label: "Done",
    description: "Closed loops for this plan.",
  },
];

function DateTimePicker({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (val: string) => void;
  className?: string;
}) {
  const dt = value ? parseISO(value) : undefined;
  const hasValidDate = dt && !isNaN(dt.getTime());

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-10 w-full justify-start bg-[var(--surface-elevated)] px-3 py-2 text-left font-normal",
            !hasValidDate && "text-[var(--muted-foreground)]",
            className,
          )}
        >
          <CalendarClock className="mr-2 h-4 w-4 opacity-70" />
          {hasValidDate ? format(dt, "MMM d, yyyy - h:mm a") : <span>Pick date and time</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="z-50 my-1 w-auto overflow-hidden rounded-[22px] border border-[var(--border-strong)] bg-[var(--surface-elevated)] p-0 shadow-[var(--shadow-soft)]"
      >
        <Calendar
          mode="single"
          selected={hasValidDate ? dt : undefined}
          onSelect={(date) => {
            if (date) {
               const oldTime = hasValidDate ? format(dt, "HH:mm") : "12:00";
               const newStr = format(date, "yyyy-MM-dd") + "T" + oldTime;
               onChange(newStr);
            }
          }}
          initialFocus
        />
        <div className="border-t border-[var(--border)] p-3">
           <Input 
             type="time" 
             value={hasValidDate ? format(dt, "HH:mm") : ""}
             onChange={(e) => {
               const time = e.target.value;
               if (hasValidDate && time) {
                 const newStr = format(dt, "yyyy-MM-dd") + "T" + time;
                 onChange(newStr);
               } else if (time) {
                 const newStr = format(new Date(), "yyyy-MM-dd") + "T" + time;
                 onChange(newStr);
               }
             }}
           />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function formatMinutes(minutes: number) {
  if (minutes <= 0) {
    return "0h";
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (!hours) {
    return `${rest}m`;
  }

  if (!rest) {
    return `${hours}h`;
  }

  return `${hours}h ${rest}m`;
}

function priorityClass(priority?: Priority) {
  if (priority === "critical") {
    return "border-transparent bg-[var(--danger-soft)] text-[var(--danger)]";
  }
  if (priority === "high") {
    return "border-transparent bg-[rgba(245,158,11,0.14)] text-[color:#b45309] dark:text-[color:#fbbf24]";
  }
  if (priority === "low") {
    return "border-transparent bg-[var(--panel-subtle)] text-[var(--muted-foreground)]";
  }
  return "border-transparent bg-[var(--accent-soft)] text-[var(--foreground-strong)]";
}

function renderCalendarEventContent(info: EventContentArg) {
  const source = info.event.extendedProps.source as PlannerCalendarItem["source"] | undefined;
  const status = info.event.extendedProps.status as TaskStatus | undefined;
  const priority = info.event.extendedProps.priority as string | undefined;
  const location =
    typeof info.event.extendedProps.location === "string"
      ? info.event.extendedProps.location
      : "";
  const projectName =
    typeof info.event.extendedProps.projectName === "string"
      ? info.event.extendedProps.projectName
      : "";
  const projectColor =
    typeof info.event.extendedProps.projectColor === "string"
      ? info.event.extendedProps.projectColor
      : "";
  const durationMinutes =
    info.event.start && info.event.end
      ? Math.max(0, differenceInMinutes(info.event.end, info.event.start))
      : 0;
  const isWeekView = info.view.type === "timeGridWeek";
  const singleLine = !isWeekView && durationMinutes > 0 && durationMinutes < 60;
  const isTask = source === "task";
  const statusLabel =
    status === "in_progress" ? "IN PROGRESS" : status === "done" ? "DONE" : "";
  const durationLabel = durationMinutes > 0 ? `${formatMinutes(durationMinutes)} block` : "";
  const accentColor =
    status === "in_progress"
      ? "#60A5FA"
      : priority === "high" || priority === "critical"
        ? "#FB923C"
        : projectColor || "#FB923C";
  const accentStyle = {
    "--calendar-item-accent": accentColor,
  } as CSSProperties;

  if (isTask) {
    return (
      <div
        className={cn(
          "planner-calendar-item is-task",
          singleLine && "is-single-line",
          isWeekView && "is-week",
        )}
        style={accentStyle}
      >
        <span className="planner-calendar-item__rail" aria-hidden />
        <div className="planner-calendar-item__content">
          {singleLine ? (
            <div className="planner-calendar-item__inline">
              <span className="planner-calendar-item__title" title={info.event.title}>
                {info.event.title}
              </span>
            </div>
          ) : (
            <>
              <div className="planner-calendar-item__topline">
                <div className="planner-calendar-item__title-group">
                  <span className="planner-calendar-item__title" title={info.event.title}>
                    {info.event.title}
                  </span>
                </div>
                {!isWeekView && (statusLabel || projectName) ? (
                  <div className="planner-calendar-item__right">
                    {statusLabel ? (
                      <span className="planner-calendar-item__status">
                        {statusLabel}
                      </span>
                    ) : null}
                    {projectName ? (
                      <span className="planner-calendar-item__project">
                        <span
                          className="planner-calendar-item__project-dot"
                          style={{ backgroundColor: projectColor || accentColor }}
                          aria-hidden
                        />
                        <span className="planner-calendar-item__project-name">
                          {projectName}
                        </span>
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {!isWeekView && info.timeText ? (
                <div className="planner-calendar-item__meta">
                  <span>{info.timeText}</span>
                  {durationLabel ? (
                    <>
                      <span aria-hidden>•</span>
                      <span className="planner-calendar-item__duration">
                        {durationLabel}
                      </span>
                    </>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "planner-calendar-item is-event",
        singleLine && "is-single-line",
        isWeekView && "is-week",
      )}
    >
      <span className="planner-calendar-item__rail" aria-hidden />
      <div className="planner-calendar-item__content">
        {singleLine ? (
          <div className="planner-calendar-item__inline">
            <span className="planner-calendar-item__title" title={info.event.title}>
              {info.event.title}
            </span>
          </div>
        ) : (
          <>
            <div className="planner-calendar-item__topline">
              <div className="planner-calendar-item__title-group">
                <span className="planner-calendar-item__title" title={info.event.title}>
                  {info.event.title}
                </span>
              </div>
              {!isWeekView ? (
                <div className="planner-calendar-item__right">
                  <span className="planner-calendar-item__kind">Event</span>
                  {location ? (
                    <span className="planner-calendar-item__kind is-location">
                      {location}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
            {!isWeekView && info.timeText ? (
              <div className="planner-calendar-item__meta">
                <span>{info.timeText}</span>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function recurrenceLabel(rule: RecurrenceRule | null | undefined) {
  if (!rule || rule.frequency === "none") {
    return "Does not repeat";
  }

  switch (rule.frequency) {
    case "daily":
      return "Repeats daily";
    case "weekly":
      return "Repeats weekly";
    case "monthly":
      return "Repeats monthly";
    case "weekdays":
      return "Repeats weekdays";
    default:
      return "Repeats";
  }
}

function buildSurfaceRange(
  surface: PlannerSurface,
  focusedDate: string,
  weekStartsOn: number,
): PlannerRange {
  const focus = parseISO(`${focusedDate}T12:00:00`);

  if (surface === "day") {
    return {
      start: startOfDay(focus).toISOString(),
      end: endOfDay(focus).toISOString(),
    };
  }

  const weekStart = startOfWeek(focus, {
    weekStartsOn: weekStartsOn as 0 | 1 | 2 | 3 | 4 | 5 | 6,
  });
  const weekEnd = addDays(weekStart, 6);

  return {
    start: weekStart.toISOString(),
    end: endOfDay(weekEnd).toISOString(),
  };
}

function sameRange(left: PlannerRange, right: PlannerRange) {
  return left.start === right.start && left.end === right.end;
}

function shiftFocusedDate(
  surface: PlannerSurface,
  focusedDate: string,
  direction: "prev" | "next",
) {
  const delta = surface === "day" ? 1 : 7;
  const base = parseISO(`${focusedDate}T12:00:00`);
  const next = addDays(base, direction === "prev" ? -delta : delta);
  return format(next, "yyyy-MM-dd");
}

function isTaskOverdue(task: PlannerTask, reference = new Date()) {
  if (task.status === "done") {
    return false;
  }

  const todayStart = startOfDay(reference);
  const dueOverdue =
    task.dueAt != null && isBefore(parseISO(task.dueAt), todayStart);
  const scheduledOverdue =
    task.primaryBlock != null &&
    isBefore(parseISO(task.primaryBlock.endsAt), todayStart);

  return dueOverdue || scheduledOverdue;
}

function deriveTaskCollections(tasks: PlannerTask[]) {
  const overdueTasks = tasks.filter((task) => isTaskOverdue(task));
  const unscheduledTasks = tasks.filter((task) => !task.hasBlock && task.status !== "done");
  const todayCount = tasks.filter(
    (task) =>
      task.status !== "done" &&
      task.dueAt != null &&
      isSameDay(parseISO(task.dueAt), new Date()),
  ).length;

  return {
    overdueTasks,
    unscheduledTasks,
    overdueCount: overdueTasks.length,
    unscheduledCount: unscheduledTasks.length,
    todayCount,
  };
}

function compareBoardTasks(left: PlannerTask, right: PlannerTask) {
  const priorityRank: Record<Priority, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  const leftAnchor =
    left.primaryBlock?.startsAt ?? left.dueAt ?? left.completedAt ?? left.createdAt;
  const rightAnchor =
    right.primaryBlock?.startsAt ?? right.dueAt ?? right.completedAt ?? right.createdAt;

  return (
    priorityRank[left.priority] - priorityRank[right.priority] ||
    leftAnchor.localeCompare(rightAnchor) ||
    left.title.localeCompare(right.title)
  );
}

function buildTaskItem(
  task: PlannerTask,
  sourceId: string,
  startsAt: string,
  endsAt: string,
): PlannerCalendarItem {
  return {
    id: `task:${sourceId}:${startsAt}`,
    sourceId,
    instanceId: `${sourceId}-${startsAt}`,
    occurrenceKey: null,
    source: "task",
    taskId: task.id,
    title: task.title,
    start: startsAt,
    end: endsAt,
    notes: task.notes,
    priority: task.priority,
    status: task.status,
    areaId: task.areaId,
    projectId: task.projectId,
    recurring: false,
    readOnly: false,
  };
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = (await response.json().catch(() => null)) as T & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(data?.error ?? "Request failed");
  }

  return data;
}

function TaskCollectionView({
  title,
  description,
  tasks,
  emptyLabel,
  onOpenTask,
}: {
  title: string;
  description: string;
  tasks: PlannerTask[];
  emptyLabel: string;
  onOpenTask: (taskId: string) => void;
}) {
  return (
    <section className="flex h-full flex-1 flex-col bg-[var(--background)]">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-6">
        <div>
          <h1 className="text-lg font-semibold text-[var(--foreground-strong)]">
            {title}
          </h1>
          <p className="text-xs text-[var(--muted-foreground)]">{description}</p>
        </div>
        <Badge tone="neutral">{tasks.length}</Badge>
      </header>

      <div className="flex-1 overflow-y-auto bg-[var(--background)] p-6">
        {tasks.length ? (
          <div className="mx-auto grid max-w-4xl gap-3">
            {tasks.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => onOpenTask(task.id)}
                className="group grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left shadow-[var(--shadow-soft)] transition hover:-translate-y-0.5 hover:border-[var(--border-strong)]"
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold text-[var(--foreground-strong)] group-hover:text-[var(--accent-strong)]">
                      {task.title}
                    </h2>
                    {task.notes ? (
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--muted-foreground)]">
                        {task.notes}
                      </p>
                    ) : null}
                  </div>
                  <Badge tone="neutral" className={priorityClass(task.priority)}>
                    {PRIORITY_LABELS[task.priority]}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted-foreground)]">
                  {task.project ? <span>{task.project.name}</span> : null}
                  {task.area ? <span>{task.area.name}</span> : null}
                  <span>{formatMinutes(task.estimatedMinutes)}</span>
                  {task.dueAt ? <span>Due {format(parseISO(task.dueAt), "MMM d")}</span> : null}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="mx-auto flex h-full max-w-xl items-center justify-center">
            <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-8 text-center">
              <p className="text-sm font-medium text-[var(--foreground-strong)]">
                {emptyLabel}
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function CapacityView({
  capacity,
  onOpenPlanning,
}: {
  capacity: DayCapacity[];
  onOpenPlanning: () => void;
}) {
  const totals = capacity.reduce(
    (sum, day) => ({
      workMinutes: sum.workMinutes + day.workMinutes,
      scheduledTaskMinutes: sum.scheduledTaskMinutes + day.scheduledTaskMinutes,
      fixedEventMinutes: sum.fixedEventMinutes + day.fixedEventMinutes,
      remainingMinutes: sum.remainingMinutes + day.remainingMinutes,
    }),
    {
      workMinutes: 0,
      scheduledTaskMinutes: 0,
      fixedEventMinutes: 0,
      remainingMinutes: 0,
    },
  );

  return (
    <section className="flex h-full flex-1 flex-col bg-[var(--background)]">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-6">
        <div>
          <h1 className="text-lg font-semibold text-[var(--foreground-strong)]">
            Capacity
          </h1>
          <p className="text-xs text-[var(--muted-foreground)]">
            Work-hour load from tasks and fixed events.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onOpenPlanning}>
          Open planning
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto bg-[var(--background)] p-6">
        <div className="mx-auto grid max-w-5xl gap-4">
          <div className="grid gap-3 md:grid-cols-4">
            {[
              ["Work time", totals.workMinutes],
              ["Task blocks", totals.scheduledTaskMinutes],
              ["Events", totals.fixedEventMinutes],
              ["Remaining", totals.remainingMinutes],
            ].map(([label, minutes]) => (
              <div
                key={label}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-soft)]"
              >
                <p className="text-xs font-medium text-[var(--muted-foreground)]">
                  {label}
                </p>
                <p className="mt-2 text-lg font-semibold text-[var(--foreground-strong)]">
                  {formatMinutes(Number(minutes))}
                </p>
              </div>
            ))}
          </div>

          <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-soft)]">
            {capacity.map((day) => {
              const usedMinutes = day.scheduledTaskMinutes + day.fixedEventMinutes;
              const usedPercentage = day.workMinutes
                ? Math.min(100, Math.round((usedMinutes / day.workMinutes) * 100))
                : 0;

              return (
                <div
                  key={day.date}
                  className="grid gap-3 border-b border-[var(--border)] px-4 py-3 last:border-b-0 md:grid-cols-[160px_minmax(0,1fr)_120px]"
                >
                  <div>
                    <p className="text-sm font-medium text-[var(--foreground-strong)]">
                      {format(parseISO(`${day.date}T12:00:00`), "EEE, MMM d")}
                    </p>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {formatMinutes(day.workMinutes)} available
                    </p>
                  </div>
                  <div className="flex items-center">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-muted)]">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          day.overloaded ? "bg-[var(--danger)]" : "bg-[var(--accent-strong)]",
                        )}
                        style={{ width: `${usedPercentage}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right text-sm font-medium text-[var(--foreground-strong)]">
                    {formatMinutes(day.remainingMinutes)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

export function PlannerApp({ initialData, initialRange }: PlannerAppProps) {
  const initialProjectId = pickInitialProjectId(initialData.projectPlans);
  const calendarRef = useRef<FullCalendar | null>(null);
  const queueRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [plannerData, setPlannerData] = useState(initialData);
  const [visibleRange, setVisibleRange] = useState(initialRange);
  const projectSurface: ProjectPlanningSurface = "plan";
  const [activeProjectId, setActiveProjectId] = useState(() => initialProjectId);
  const [activeView, setActiveView] = useState<ActiveViewType>(() =>
    initialProjectId ? `project:${initialProjectId}` : "planning",
  );
  const [surface, setSurface] = useState<PlannerSurface>("week");
  const [focusedDate, setFocusedDate] = useState(todayDateString());
  const [drawerState, setDrawerState] = useState<DrawerState>(null);
  const [quickAddKind, setQuickAddKind] = useState<QuickAddKind>(null);
  const [quickAddDefaults, setQuickAddDefaults] = useState<QuickAddDefaults>({});
  const [helpOpen, setHelpOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const showWeekends = false;
  const [milestoneComposerOpen, setMilestoneComposerOpen] = useState(false);
  const [calendarCreateChoice, setCalendarCreateChoice] = useState<QuickAddDefaults | null>(null);
  const [pendingRecurringEdit, setPendingRecurringEdit] = useState<PendingRecurringEdit | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  const selectedTask =
    drawerState?.type === "task"
      ? plannerData.tasks.find((task) => task.id === drawerState.taskId) ?? null
      : null;
  const selectedBlock =
    drawerState?.type === "task"
      ? plannerData.scheduledItems.find(
          (item) =>
            item.source === "task" &&
            (drawerState.instanceId
              ? item.instanceId === drawerState.instanceId
              : item.sourceId === (drawerState.blockId ?? selectedTask?.primaryBlock?.id)),
        ) ?? null
      : null;
  const selectedEvent =
    drawerState?.type === "event"
      ? plannerData.events.find((event) => event.id === drawerState.eventId) ?? null
      : null;
  const selectedProjectId = plannerData.projectPlans.some(
    (plan) => plan.project.id === activeProjectId,
  )
    ? activeProjectId
    : pickInitialProjectId(plannerData.projectPlans);
  const activeSidebarView = useMemo<ActiveViewType>(() => {
    if (activeView.startsWith("project:")) {
      return selectedProjectId ? `project:${selectedProjectId}` : "planning";
    }

    if (
      activeView.startsWith("area:") &&
      !plannerData.areas.some((area) => activeView === `area:${area.id}`)
    ) {
      return "planning";
    }

    return activeView;
  }, [activeView, plannerData.areas, selectedProjectId]);
  const activeAreaId = activeSidebarView.startsWith("area:")
    ? activeSidebarView.slice("area:".length)
    : null;
  const activeArea = activeAreaId
    ? plannerData.areas.find((area) => area.id === activeAreaId) ?? null
    : null;
  const inboxTasks = useMemo(
    () => plannerData.unscheduledTasks.filter((task) => !task.hasBlock).sort(compareBoardTasks),
    [plannerData.unscheduledTasks],
  );
  const planningPipelineTasks = useMemo(
    () => plannerData.tasks.filter((task) => !task.hasBlock).sort(compareBoardTasks),
    [plannerData.tasks],
  );
  const planningWorkload = useMemo(() => {
    const capacityForDay = plannerData.capacity.find((day) => day.date === focusedDate);

    return {
      scheduledMinutes:
        (capacityForDay?.scheduledTaskMinutes ?? 0) +
        (capacityForDay?.fixedEventMinutes ?? 0),
      workMinutes: capacityForDay?.workMinutes ?? 0,
      overloaded: capacityForDay?.overloaded ?? false,
    };
  }, [focusedDate, plannerData.capacity]);
  const areaTasks = useMemo(
    () =>
      activeAreaId
        ? plannerData.tasks
            .filter((task) => task.areaId === activeAreaId)
            .sort(compareBoardTasks)
        : [],
    [activeAreaId, plannerData.tasks],
  );

  async function refreshPlanner(range: PlannerRange = visibleRange) {
    const params = new URLSearchParams({
      start: range.start,
      end: range.end,
    });

    const nextData = await requestJson<PlannerPayload>(`/api/planner?${params}`);
    setPlannerData(nextData);
    setVisibleRange(range);
  }

  function openQuickAdd(kind: Exclude<QuickAddKind, null>, defaults: QuickAddDefaults = {}) {
    setQuickAddDefaults(defaults);
    setQuickAddKind(kind);
  }

  function dismissCalendarCreateChoice() {
    calendarRef.current?.getApi().unselect();
    setCalendarCreateChoice(null);
  }

  function confirmCalendarCreateChoice(kind: "task" | "event") {
    if (!calendarCreateChoice) {
      return;
    }

    const defaults = calendarCreateChoice;
    calendarRef.current?.getApi().unselect();
    setCalendarCreateChoice(null);
    openQuickAdd(kind, defaults);
  }

  async function createMilestone(input: NewMilestoneInput) {
    try {
      await requestJson("/api/milestones", {
        method: "POST",
        body: JSON.stringify(input),
      });
      toast.success("Milestone created");
      await refreshPlanner();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create milestone");
      throw error;
    }
  }

  async function updateMilestone(milestoneId: string, input: Partial<NewMilestoneInput>) {
    try {
      await requestJson(`/api/milestones/${milestoneId}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      });
      await refreshPlanner();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update milestone");
      throw error;
    }
  }

  async function deleteMilestone(milestoneId: string) {
    try {
      await requestJson(`/api/milestones/${milestoneId}`, {
        method: "DELETE",
      });
      toast.success("Milestone removed");
      await refreshPlanner();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove milestone");
      throw error;
    }
  }

  function moveToSurface(nextSurface: PlannerSurface, nextFocusedDate = focusedDate) {
    const nextRange = buildSurfaceRange(
      nextSurface,
      nextFocusedDate,
      plannerData.settings.weekStart,
    );

    setSurface(nextSurface);
    setFocusedDate(nextFocusedDate);

    if (sameRange(nextRange, visibleRange)) {
      return;
    }

    setVisibleRange(nextRange);
    startTransition(async () => {
      await refreshPlanner(nextRange);
    });
  }

  function navigateSurface(direction: "prev" | "today" | "next") {
    if (direction === "today") {
      moveToSurface(surface, todayDateString());
      return;
    }

    moveToSurface(surface, shiftFocusedDate(surface, focusedDate, direction));
  }

  function optimisticallyScheduleTask(
    taskId: string,
    startsAt: string,
    endsAt: string,
    options?: { sourceId?: string },
  ) {
    setPlannerData((current) => {
      const task = current.tasks.find((item) => item.id === taskId);

      if (!task) {
        return current;
      }

      const sourceId = options?.sourceId ?? task.primaryBlock?.id ?? `temp-${taskId}`;
      const updatedTask: PlannerTask = {
        ...task,
        estimatedMinutes: calculateMinutes(startsAt, endsAt),
        hasBlock: true,
        primaryBlock: {
          id: sourceId,
          startsAt,
          endsAt,
        },
      };
      const nextTasks = current.tasks.map((item) =>
        item.id === taskId ? updatedTask : item,
      );
      const nextCollections = deriveTaskCollections(nextTasks);

      return {
        ...current,
        ...nextCollections,
        tasks: nextTasks,
        scheduledItems: [
          ...current.scheduledItems.filter((item) => item.taskId !== taskId),
          buildTaskItem(updatedTask, sourceId, startsAt, endsAt),
        ].sort((left, right) => left.start.localeCompare(right.start)),
      };
    });
  }

  function optimisticallyMoveCalendarItem(sourceId: string, startsAt: string, endsAt: string) {
    setPlannerData((current) => {
      const matchingItem = current.scheduledItems.find(
        (item) => item.source === "task" && item.sourceId === sourceId,
      );

      if (!matchingItem?.taskId) {
        return current;
      }

      const nextTasks = current.tasks.map((task) =>
        task.id === matchingItem.taskId
          ? {
              ...task,
              estimatedMinutes: calculateMinutes(startsAt, endsAt),
              hasBlock: true,
              primaryBlock: {
                id: sourceId,
                startsAt,
                endsAt,
              },
            }
          : task,
      );

      return {
        ...current,
        ...deriveTaskCollections(nextTasks),
        tasks: nextTasks,
        scheduledItems: current.scheduledItems.map((item) =>
          item.source === "task" && item.sourceId === sourceId
            ? { ...item, start: startsAt, end: endsAt }
            : item,
        ),
      };
    });
  }

  function markTaskStatus(taskId: string, status: TaskStatus) {
    setPlannerData((current) => ({
      ...current,
      ...(() => {
        const completedAt = status === "done" ? new Date().toISOString() : null;
        const nextTasks = current.tasks.map((task) =>
          task.id === taskId ? { ...task, status, completedAt } : task,
        );

        return {
          ...deriveTaskCollections(nextTasks),
          tasks: nextTasks,
          scheduledItems: current.scheduledItems.map((item) =>
            item.source === "task" && item.taskId === taskId
              ? { ...item, status }
              : item,
          ),
        };
      })(),
    }));
  }

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1024px)");

    const apply = () => {
      setIsMobile(media.matches);
      setSurface((current) => (media.matches && current === "week" ? "agenda" : current));
    };

    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const calendarApi = calendarRef.current?.getApi();

    if (!calendarApi) return;

    const frame = window.requestAnimationFrame(() => {
      calendarApi.changeView(surface === "week" ? "timeGridWeek" : "timeGridDay", focusedDate);
      calendarApi.updateSize();
    });
    const timeout = window.setTimeout(() => calendarApi.updateSize(), 240);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [focusedDate, surface]);

  useEffect(() => {
    if (!queueRef.current || isMobile) {
      return;
    }

    const draggable = new Draggable(queueRef.current, {
      itemSelector: "[data-draggable-queue-task='true']",
      eventData(eventEl) {
        const element = eventEl as HTMLElement;
        const duration = Number(element.dataset.duration ?? "60");

        return {
          title: element.dataset.title ?? "",
          duration: { minutes: duration },
          extendedProps: {
            taskId: element.dataset.taskId,
            blockId: element.dataset.blockId,
          },
        };
      },
    });

    return () => {
      draggable.destroy();
    };
  }, [isMobile]);

  const handleKeyboardEvent = useEffectEvent((event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const inTextInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.getAttribute("contenteditable") === "true" ||
          target.tagName === "SELECT");

      if (event.key === "Escape") {
        event.preventDefault();
        if (quickAddKind) {
          setQuickAddKind(null);
          return;
        }

        if (drawerState) {
          setDrawerState(null);
          return;
        }

        if (helpOpen) {
          setHelpOpen(false);
        }
        return;
      }

      const usesPlannerShortcut =
        (event.metaKey || event.ctrlKey) && event.altKey && event.shiftKey;

      if (inTextInput) {
        return;
      }

      if (!usesPlannerShortcut) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "/") {
        event.preventDefault();
        setHelpOpen((current) => !current);
        return;
      }

      if (key === "f") {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (key === "n") {
        event.preventDefault();
        setQuickAddDefaults({});
        setQuickAddKind("task");
        return;
      }

      if (key === "e") {
        event.preventDefault();
        setQuickAddDefaults({});
        setQuickAddKind("event");
        return;
      }

      if (key === "d") {
        event.preventDefault();
        moveToSurface("day");
        return;
      }

      if (key === "w") {
        event.preventDefault();
        moveToSurface("week");
        return;
      }

      if (key === "a") {
        event.preventDefault();
        moveToSurface("agenda");
        return;
      }

      if (key === "t") {
        event.preventDefault();
        moveToSurface(surface, todayDateString());
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        navigateSurface("prev");
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        navigateSurface("next");
        return;
      }
    });

  useEffect(() => {
    const keyboardHandler = (event: KeyboardEvent) => {
      handleKeyboardEvent(event);
    };

    window.addEventListener("keydown", keyboardHandler);
    return () => window.removeEventListener("keydown", keyboardHandler);
  }, []);

  function openCalendarItemDetails(event: {
    extendedProps: Record<string, unknown>;
  }) {
    const source = event.extendedProps.source as "task" | "event";
    const sourceId = event.extendedProps.sourceId as string;

    if (source === "task") {
      const taskId = event.extendedProps.taskId as string | undefined;
      const instanceId = event.extendedProps.instanceId as string | undefined;
      const task = plannerData.tasks.find((candidate) => candidate.id === taskId);

      if (task) {
        setDrawerState({ type: "task", taskId: task.id, blockId: sourceId, instanceId });
      }
    } else {
      setDrawerState({ type: "event", eventId: sourceId });
    }
  }

  function handleCalendarEventMount(info: EventMountArg) {
    info.el.ondblclick = () => {
      openCalendarItemDetails(info.event);
    };
  }

  const handleTaskReceive = (info: EventReceiveArg) => {
    const taskId = info.event.extendedProps.taskId as string | undefined;
    const blockId = info.event.extendedProps.blockId as string | undefined;
    const startsAt = info.event.start?.toISOString();
    const endsAt = info.event.end?.toISOString();

    if (!taskId || !startsAt || !endsAt) {
      info.revert();
      return;
    }

    info.event.remove();
    optimisticallyScheduleTask(taskId, startsAt, endsAt, { sourceId: blockId });

    startTransition(async () => {
      try {
        if (blockId) {
          await requestJson(`/api/task-blocks/${blockId}`, {
            method: "PATCH",
            body: JSON.stringify({ startsAt, endsAt }),
          });
          toast.success("Task rescheduled");
        } else {
          await requestJson("/api/task-blocks", {
            method: "POST",
            body: JSON.stringify({
              taskId,
              startsAt,
              endsAt,
            }),
          });
          toast.success("Task scheduled");
        }
        await refreshPlanner();
      } catch (error) {
        await refreshPlanner();
        toast.error(error instanceof Error ? error.message : "Could not schedule task");
      }
    });
  };

  const handleCalendarMove = (info: EventDropArg | EventResizeDoneArg) => {
    const startsAt = info.event.start?.toISOString();
    const endsAt = info.event.end?.toISOString();
    const source = info.event.extendedProps.source as "task" | "event";
    const sourceId = info.event.extendedProps.sourceId as string;
    const recurring = Boolean(info.event.extendedProps.recurring);
    const occurrenceKey = info.event.extendedProps.occurrenceKey as string | undefined;
    const taskId = info.event.extendedProps.taskId as string | undefined;
    const originalStartsAt = info.oldEvent.start?.toISOString();
    const originalEndsAt = info.oldEvent.end?.toISOString();

    if (!startsAt || !endsAt) {
      info.revert();
      return;
    }

    if (
      source === "task" &&
      recurring &&
      taskId &&
      occurrenceKey &&
      originalStartsAt &&
      originalEndsAt
    ) {
      setPendingRecurringEdit({
        taskId,
        title: info.event.title,
        sourceId,
        occurrenceKey,
        startsAt,
        endsAt,
        originalStartsAt,
        originalEndsAt,
        revert: info.revert,
      });
      return;
    }

    if (source === "task") {
      optimisticallyMoveCalendarItem(sourceId, startsAt, endsAt);
    }

    startTransition(async () => {
      try {
        if (source === "task") {
          await requestJson(`/api/task-blocks/${sourceId}`, {
            method: "PATCH",
            body: JSON.stringify({ startsAt, endsAt }),
          });
        } else {
          await requestJson(`/api/events/${sourceId}`, {
            method: "PATCH",
            body: JSON.stringify({ startsAt, endsAt }),
          });
        }
        toast.success(source === "task" ? "Task block updated" : "Event updated");
        await refreshPlanner();
      } catch (error) {
        info.revert();
        await refreshPlanner();
        toast.error(error instanceof Error ? error.message : "Could not update item");
      }
    });
  };

  const handleCalendarSelect = (info: DateSelectArg) => {
    setCalendarCreateChoice({
      startsAt: info.start.toISOString(),
      endsAt: info.end.toISOString(),
    });
  };

  const projectById = useMemo(
    () => new Map(plannerData.projects.map((project) => [project.id, project])),
    [plannerData.projects],
  );
  const calendarEvents = plannerData.scheduledItems.map((item) => {
    const project = item.projectId ? projectById.get(item.projectId) : null;

    return {
      id: item.id,
      title: item.title,
      start: item.start,
      end: item.end,
      editable: !item.readOnly,
      durationEditable: !item.readOnly,
      startEditable: !item.readOnly,
      extendedProps: {
        ...item,
        projectName: project?.name ?? "",
        projectColor: project?.color ?? "",
      },
      classNames: [
        item.source === "task" ? "planner-task-event" : "planner-meeting-event",
        item.priority ? `priority-${item.priority}` : "",
        item.status ? `status-${item.status}` : "",
        item.status === "done" ? "is-done" : "",
        item.recurring ? "is-recurring" : "",
      ],
    };
  });

  function dismissRecurringEdit(options?: { revert?: boolean }) {
    if (options?.revert && pendingRecurringEdit) {
      pendingRecurringEdit.revert();
    }

    setPendingRecurringEdit(null);
  }

  function confirmRecurringEdit(scope: "occurrence" | "series") {
    if (!pendingRecurringEdit) {
      return;
    }

    const currentEdit = pendingRecurringEdit;
    setPendingRecurringEdit(null);

    startTransition(async () => {
      try {
        await requestJson(`/api/task-blocks/${currentEdit.sourceId}`, {
          method: "PATCH",
          body: JSON.stringify({
            startsAt: currentEdit.startsAt,
            endsAt: currentEdit.endsAt,
            scope,
            occurrenceKey: currentEdit.occurrenceKey,
            originalStartsAt: currentEdit.originalStartsAt,
            originalEndsAt: currentEdit.originalEndsAt,
          }),
        });
        toast.success(
          scope === "occurrence"
            ? "Only this occurrence was updated"
            : "The recurring series was updated",
        );
        await refreshPlanner();
      } catch (error) {
        currentEdit.revert();
        await refreshPlanner();
        toast.error(error instanceof Error ? error.message : "Could not update recurring task");
      }
    });
  }

  function handleSidebarChange(view: ActiveViewType) {
    setActiveView(view);

    if (view.startsWith("project:")) {
      setActiveProjectId(view.slice("project:".length));
    }
  }

  async function updateTaskFields(taskId: string, input: UpdateTaskInput) {
    try {
      await requestJson(`/api/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      });
      toast.success("Task updated");
      await refreshPlanner();
    } catch (error) {
      await refreshPlanner();
      toast.error(error instanceof Error ? error.message : "Could not update task");
      throw error;
    }
  }

  function updateTaskStatus(taskId: string, status: TaskStatus) {
    markTaskStatus(taskId, status);
    startTransition(async () => {
      try {
        await requestJson(`/api/tasks/${taskId}`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        });
        toast.success(
          status === "done"
            ? "Task marked done"
            : status === "in_progress"
              ? "Task moved to in progress"
              : "Task moved back to to do",
        );
        await refreshPlanner();
      } catch (error) {
        await refreshPlanner();
        toast.error(error instanceof Error ? error.message : "Could not update task");
      }
    });
  }

  return (
    <div
      data-planner-root
      className="flex h-screen w-full bg-[var(--background)] text-[var(--foreground)] text-sm antialiased overflow-hidden"
    >
      <Sidebar
        activeView={activeSidebarView}
        onChangeView={handleSidebarChange}
        projectPlans={plannerData.projectPlans}
        areas={plannerData.areas}
        onOpenNewProject={() => openQuickAdd("project")}
        onOpenNewArea={() => openQuickAdd("area")}
        onOpenCreateTask={() => openQuickAdd("task")}
        onOpenSettings={() => setDrawerState({ type: "settings" })}
        showUserButton={plannerData.mode === "clerk"}
        inboxCount={inboxTasks.length}
      />
      <main className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden border-[var(--border)] bg-[var(--background)] shadow-[-4px_0_24px_-4px_rgba(0,0,0,0.05)] md:rounded-l-2xl md:border-l">
        {activeSidebarView === "planning" ? (
          <PlanningView
            tasks={planningPipelineTasks}
            onTaskDrop={updateTaskStatus}
            onOpenTask={(taskId) => setDrawerState({ type: "task", taskId })}
            onOpenNewTask={() => openQuickAdd("task")}
            surface={surface === "day" || surface === "week" || surface === "agenda" ? surface : "week"}
            onChangeSurface={moveToSurface}
            focusedDate={focusedDate}
            onNavigateDate={(dir) => navigateSurface(dir)}
            workload={planningWorkload}
            storageKey={`inflara:planning:${plannerData.mode}:${plannerData.user.id}`}
            overlayOpen={Boolean(quickAddKind || calendarCreateChoice)}
            externalDragRef={queueRef}
            calendarElement={
              <FullCalendar
                ref={calendarRef}
                plugins={[timeGridPlugin, interactionPlugin]}
                initialView={surface === "week" ? "timeGridWeek" : "timeGridDay"}
                initialDate={focusedDate}
                headerToolbar={false}
                height="100%"
                editable
                selectable
                selectMirror
                eventResizableFromStart
                eventMinHeight={32}
                eventShortHeight={26}
                eventContent={renderCalendarEventContent}
                droppable={!isMobile}
                nowIndicator
                weekends={showWeekends}
                allDaySlot={false}
                scrollTime={surface === "week" ? "09:00:00" : String(new Date().getHours()).padStart(2, "0") + ":00:00"}
                slotDuration={`00:${String(plannerData.settings.slotMinutes).padStart(2, "0")}:00`}
                snapDuration="00:15:00"
                slotLabelFormat={{
                  hour: "numeric",
                  meridiem: "short",
                }}
                dayHeaderFormat={{
                  weekday: "short",
                  month: "numeric",
                  day: "numeric",
                }}
                firstDay={plannerData.settings.weekStart}
                eventTimeFormat={{
                  hour: "numeric",
                  minute: "2-digit",
                  meridiem: "short",
                }}
                events={calendarEvents}
                eventDidMount={handleCalendarEventMount}
                eventReceive={handleTaskReceive}
                eventDrop={handleCalendarMove}
                eventResize={handleCalendarMove}
                select={handleCalendarSelect}
              />
            }
          />
        ) : activeSidebarView === "inbox" ? (
          <TaskCollectionView
            title="Inbox"
            description="Unscheduled work that still needs a plan."
            tasks={inboxTasks}
            emptyLabel="Inbox is clear"
            onOpenTask={(taskId) => setDrawerState({ type: "task", taskId })}
          />
        ) : activeSidebarView === "capacity" ? (
          <CapacityView
            capacity={plannerData.capacity}
            onOpenPlanning={() => handleSidebarChange("planning")}
          />
        ) : activeSidebarView.startsWith("area:") ? (
          <TaskCollectionView
            title={activeArea?.name ?? "Area"}
            description="Tasks connected to this area."
            tasks={areaTasks}
            emptyLabel="No tasks in this area yet"
            onOpenTask={(taskId) => setDrawerState({ type: "task", taskId })}
          />
        ) : (
          <ProjectPlanningModule
            projectPlans={plannerData.projectPlans}
            activeProjectId={selectedProjectId}
            isPending={isPending}
            onOpenTask={(taskId) => setDrawerState({ type: "task", taskId })}
            surface={projectSurface}
            onOpenNewTask={(defaults) => openQuickAdd("task", defaults ?? {})}
            onOpenNewProject={() => openQuickAdd("project")}
            milestoneComposerOpen={milestoneComposerOpen}
            onOpenMilestoneComposer={() => setMilestoneComposerOpen(true)}
            onCloseMilestoneComposer={() => setMilestoneComposerOpen(false)}
            onCreateMilestone={createMilestone}
            onUpdateMilestone={updateMilestone}
            onDeleteMilestone={deleteMilestone}
            onUpdateTask={updateTaskFields}
          />
        )}
      </main>

      <EditorModal
        drawerState={drawerState}
        onClose={() => setDrawerState(null)}
        task={selectedTask}
        block={selectedBlock}
        event={selectedEvent}
        plannerData={plannerData}
        onSaveTask={(taskId, input) =>
          startTransition(async () => {
            await requestJson(`/api/tasks/${taskId}`, {
              method: "PATCH",
              body: JSON.stringify(input),
            });
            toast.success("Task updated");
            await refreshPlanner();
          })
        }
        onDeleteTask={(taskId) =>
          startTransition(async () => {
            await requestJson(`/api/tasks/${taskId}`, { method: "DELETE" });
            toast.success("Task deleted");
            setDrawerState(null);
            await refreshPlanner();
          })
        }
        onUnscheduleTask={(blockId) =>
          startTransition(async () => {
            await requestJson(`/api/task-blocks/${blockId}`, { method: "DELETE" });
            toast.success("Task moved back to inbox");
            await refreshPlanner();
          })
        }
        onSaveEvent={(eventId, input) =>
          startTransition(async () => {
            await requestJson(`/api/events/${eventId}`, {
              method: "PATCH",
              body: JSON.stringify(input),
            });
            toast.success("Event updated");
            await refreshPlanner();
          })
        }
        onDeleteEvent={(eventId) =>
          startTransition(async () => {
            await requestJson(`/api/events/${eventId}`, { method: "DELETE" });
            toast.success("Event deleted");
            setDrawerState(null);
            await refreshPlanner();
          })
        }
        onSaveSettings={(input: UpdateSettingsInput) =>
          startTransition(async () => {
            await requestJson(`/api/settings`, {
              method: "PATCH",
              body: JSON.stringify(input),
            });
            toast.success("Planning settings updated");
            await refreshPlanner();
          })
        }
      />

      <RecurringEditPrompt
        pendingEdit={pendingRecurringEdit}
        onCancel={() => dismissRecurringEdit({ revert: true })}
        onConfirm={confirmRecurringEdit}
      />

      <CalendarCreatePrompt
        selection={calendarCreateChoice}
        onCancel={dismissCalendarCreateChoice}
        onConfirm={confirmCalendarCreateChoice}
      />

      <QuickAddDialog
        key={`${quickAddKind ?? "closed"}:${quickAddDefaults.startsAt ?? ""}:${quickAddDefaults.endsAt ?? ""}:${quickAddDefaults.projectId ?? ""}:${quickAddDefaults.milestoneId ?? ""}`}
        open={quickAddKind}
        defaults={quickAddDefaults}
        plannerData={plannerData}
        onClose={() => setQuickAddKind(null)}
        onSubmit={(kind, payload) =>
          startTransition(async () => {
            const endpoint =
              kind === "task"
                ? "/api/tasks"
                : kind === "event"
                  ? "/api/events"
                  : kind === "project"
                    ? "/api/projects"
                    : kind === "area"
                      ? "/api/areas"
                      : "/api/tags";
            await requestJson(endpoint, {
              method: "POST",
              body: JSON.stringify(payload),
            });
            toast.success("Added to your planner");
            setQuickAddKind(null);
            await refreshPlanner();
          })
        }
      />

      {isMobile ? (
        <MobileActionDock
          onToday={() => navigateSurface("today")}
          onNewTask={() => openQuickAdd("task")}
          onNewEvent={() => openQuickAdd("event")}
          onHelp={() => setHelpOpen(true)}
        />
      ) : null}

      {helpOpen ? <KeyboardShortcuts onClose={() => setHelpOpen(false)} /> : null}
    </div>
  );
}

function CalendarCreatePrompt({
  selection,
  onCancel,
  onConfirm,
}: {
  selection: QuickAddDefaults | null;
  onCancel: () => void;
  onConfirm: (kind: "task" | "event") => void;
}) {
  if (!selection) {
    return null;
  }

  const startLabel = selection.startsAt
    ? format(parseISO(selection.startsAt), "EEE, MMM d • h:mm a")
    : null;
  const endLabel = selection.endsAt
    ? format(parseISO(selection.endsAt), "h:mm a")
    : null;

  return (
    <div className="fixed inset-0 z-40 bg-[var(--modal-backdrop)]">
      <button
        type="button"
        className="absolute inset-0"
        onClick={onCancel}
        aria-label="Close calendar create prompt"
      />
      <div className="absolute left-1/2 top-1/2 w-[min(92vw,26rem)] -translate-x-1/2 -translate-y-1/2 rounded-[28px] border border-[var(--border-strong)] bg-[var(--surface)] p-5 shadow-[var(--shadow-float)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
          Calendar slot
        </p>
        <h2 className="mt-2 text-[1.5rem] font-semibold tracking-[-0.04em] text-[var(--foreground-strong)]">
          Create a task or an event?
        </h2>
        {startLabel && endLabel ? (
          <p className="mt-2 text-[13px] text-[var(--muted-foreground)]">
            {startLabel} to {endLabel}
          </p>
        ) : null}

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => onConfirm("task")}
            className="grid gap-1 rounded-[20px] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-4 text-left transition hover:border-[var(--border-strong)] hover:bg-[var(--accent-soft)]"
          >
            <span className="text-[15px] font-semibold text-[var(--foreground-strong)]">
              Task
            </span>
            <span className="text-[12px] leading-5 text-[var(--muted-foreground)]">
              Add a task block with project and milestone options.
            </span>
          </button>
          <button
            type="button"
            onClick={() => onConfirm("event")}
            className="grid gap-1 rounded-[20px] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-4 text-left transition hover:border-[var(--border-strong)] hover:bg-[var(--accent-soft)]"
          >
            <span className="text-[15px] font-semibold text-[var(--foreground-strong)]">
              Event
            </span>
            <span className="text-[12px] leading-5 text-[var(--muted-foreground)]">
              Add a meeting or appointment with location and notes.
            </span>
          </button>
        </div>

        <div className="mt-5 flex justify-end">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

function MobileActionDock({
  onToday,
  onNewTask,
  onNewEvent,
  onHelp,
}: {
  onToday: () => void;
  onNewTask: () => void;
  onNewEvent: () => void;
  onHelp: () => void;
}) {
  return (
    <div className="fixed inset-x-4 bottom-4 z-20 md:hidden">
      <div className="grid grid-cols-4 gap-2 rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-2 shadow-[var(--shadow-soft)]">
        <Button variant="ghost" size="sm" onClick={onToday}>
          Today
        </Button>
        <Button variant="ghost" size="sm" onClick={onNewTask}>
          Task
        </Button>
        <Button variant="ghost" size="sm" onClick={onNewEvent}>
          Event
        </Button>
        <Button variant="ghost" size="sm" onClick={onHelp}>
          Shortcuts
        </Button>
      </div>
    </div>
  );
}

type EditorModalProps = {
  drawerState: DrawerState;
  onClose: () => void;
  task: PlannerTask | null;
  block: PlannerCalendarItem | null;
  event: EventRecord | null;
  plannerData: PlannerPayload;
  onSaveTask: (taskId: string, input: Partial<NewTaskInput> & { status?: TaskStatus }) => void;
  onDeleteTask: (taskId: string) => void;
  onUnscheduleTask: (blockId: string) => void;
  onSaveEvent: (eventId: string, input: Partial<EventRecord>) => void;
  onDeleteEvent: (eventId: string) => void;
  onSaveSettings: (input: UpdateSettingsInput) => void;
};

function EditorModal({
  drawerState,
  onClose,
  task,
  block,
  event,
  plannerData,
  onSaveTask,
  onDeleteTask,
  onUnscheduleTask,
  onSaveEvent,
  onDeleteEvent,
  onSaveSettings,
}: EditorModalProps) {
  if (!drawerState) {
    return null;
  }

  const eyebrow =
    drawerState.type === "task"
      ? "Task details"
      : drawerState.type === "event"
        ? "Event details"
        : "Planning settings";
  const title =
    drawerState.type === "task"
      ? task?.title ?? "Task details"
      : drawerState.type === "event"
        ? event?.title ?? "Event details"
        : "Planning settings";
  const description =
    drawerState.type === "task"
      ? "Review schedule, notes, and organization without leaving the board."
      : drawerState.type === "event"
        ? "Adjust timing, location, and notes in one floating panel."
        : "Tune the planning defaults that shape the calendar.";
  const maxWidth = drawerState.type === "settings" ? "max-w-[760px]" : "max-w-[720px]";
  const shellClassName =
    drawerState.type === "settings"
      ? "border-[var(--border-strong)] bg-[var(--surface-elevated)]"
      : "border-[var(--task-modal-border)] bg-[var(--task-modal-shell)] text-[var(--foreground)] backdrop-blur-md";

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-2 sm:p-5">
      <button
        type="button"
        className="absolute inset-0 bg-[var(--modal-backdrop)]"
        onClick={onClose}
        aria-label="Close details"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={eyebrow}
        className={cn(
          "relative z-10 flex w-full flex-col overflow-hidden rounded-[26px] border shadow-[var(--shadow-float)]",
          drawerState.type !== "settings" &&
            "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-20 before:bg-[linear-gradient(180deg,rgba(255,255,255,0.12),rgba(255,255,255,0))]",
          shellClassName,
          maxWidth,
        )}
      >
        <div className="border-b border-[var(--task-modal-border)] px-4 py-3 sm:px-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                {eyebrow}
              </p>
              <h2 className="mt-1 line-clamp-2 text-[1.08rem] font-semibold tracking-[-0.04em] text-[var(--foreground-strong)]">
                {title}
              </h2>
              {drawerState.type === "settings" ? (
                <p className="mt-1 text-[13px] text-[var(--muted-foreground)]">
                  {description}
                </p>
              ) : null}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 rounded-full"
              onClick={onClose}
              aria-label="Close details"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div
          className={cn(
            "overflow-y-auto px-3.5 py-3.5 sm:px-4 sm:py-4",
            drawerState.type === "settings"
              ? "max-h-[min(82svh,720px)]"
              : "max-h-[min(76svh,620px)]",
          )}
        >
          {drawerState.type === "task" && task ? (
            <TaskEditor
              key={`${task.id}:${block?.instanceId ?? block?.sourceId ?? "inbox"}`}
              task={task}
              block={block}
              plannerData={plannerData}
              onSave={(input) => onSaveTask(task.id, input)}
              onDelete={() => onDeleteTask(task.id)}
              onUnschedule={() => (block ? onUnscheduleTask(block.sourceId) : undefined)}
            />
          ) : null}

          {drawerState.type === "event" && event ? (
            <EventEditor
              key={event.id}
              event={event}
              onSave={(input) => onSaveEvent(event.id, input)}
              onDelete={() => onDeleteEvent(event.id)}
            />
          ) : null}

          {drawerState.type === "settings" ? (
            <SettingsEditor
              key={plannerData.settings.updatedAt}
              settings={plannerData.settings}
              onSave={onSaveSettings}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function RecurringEditPrompt({
  pendingEdit,
  onCancel,
  onConfirm,
}: {
  pendingEdit: PendingRecurringEdit | null;
  onCancel: () => void;
  onConfirm: (scope: "occurrence" | "series") => void;
}) {
  if (!pendingEdit) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-[var(--modal-backdrop)]"
        onClick={onCancel}
        aria-label="Cancel recurring edit"
      />
      <div className="relative z-10 w-full max-w-[360px] rounded-[24px] border border-[var(--border-strong)] bg-[var(--surface-glass)] p-4 shadow-[var(--shadow-float)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
          Recurring task
        </p>
        <h3 className="mt-2 text-[1.02rem] font-semibold tracking-[-0.03em] text-[var(--foreground-strong)]">
          {pendingEdit.title}
        </h3>
        <p className="mt-2 text-[13px] leading-6 text-[var(--muted-foreground)]">
          This task repeats. Do you want to change only the selected occurrence or update the
          entire series?
        </p>
        <div className="mt-3 rounded-[16px] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2.5 text-[12px] font-medium text-[var(--foreground)]">
          {format(parseISO(pendingEdit.startsAt), "EEE, MMM d h:mm a")} to{" "}
          {format(parseISO(pendingEdit.endsAt), "h:mm a")}
        </div>
        <div className="mt-4 grid gap-2">
          <Button type="button" onClick={() => onConfirm("occurrence")}>
            Edit this occurrence
          </Button>
          <Button type="button" variant="outline" onClick={() => onConfirm("series")}>
            Edit the entire series
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

function TaskEditor({
  task,
  block,
  plannerData,
  onSave,
  onDelete,
  onUnschedule,
}: {
  task: PlannerTask;
  block: PlannerCalendarItem | null;
  plannerData: PlannerPayload;
  onSave: (input: Partial<NewTaskInput> & { status?: TaskStatus }) => void;
  onDelete: () => void;
  onUnschedule: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes);
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [estimatedMinutes, setEstimatedMinutes] = useState(task.estimatedMinutes);
  const [dueAt, setDueAt] = useState(toDateTimeInput(task.dueAt));
  const [startsAt, setStartsAt] = useState(toDateTimeInput(block?.start ?? null));
  const [endsAt, setEndsAt] = useState(toDateTimeInput(block?.end ?? null));
  const [areaId, setAreaId] = useState(task.areaId ?? "");
  const [projectId, setProjectId] = useState(task.projectId ?? "");
  const [milestoneId, setMilestoneId] = useState(task.milestoneId ?? "");
  const [tagIds, setTagIds] = useState(task.tags.map((tag) => tag.id));
  const [checklist, setChecklist] = useState(
    task.checklist.map<{
      id?: string;
      label: string;
      completed: boolean;
    }>((item) => ({
      id: item.id,
      label: item.label,
      completed: item.completed,
    })),
  );
  const [recurrence, setRecurrence] = useState<RecurrenceRule | null>(
    task.recurrence ?? null,
  );
  const compactFieldClassName =
    "h-9 rounded-[14px] border-[var(--task-modal-border)] bg-[var(--task-modal-neutral)] px-3 text-[13px] shadow-none";
  const compactTextAreaClassName =
    "min-h-[88px] rounded-[18px] border-[var(--task-modal-border)] bg-[var(--task-modal-neutral)] px-3 py-2.5 text-[13px] leading-5 shadow-none";
  const availableMilestones = plannerData.milestones.filter(
    (milestone) => !projectId || milestone.projectId === projectId,
  );

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 rounded-[22px] border border-[var(--task-modal-border)] bg-[var(--task-modal-neutral)] p-3">
        <Field label="Task name">
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className={compactFieldClassName}
          />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {BOARD_COLUMNS.map((column) => (
            <Button
              key={column.id}
              type="button"
              variant={status === column.id ? "solid" : "outline"}
              size="sm"
              onClick={() => setStatus(column.id)}
            >
              {column.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={block ? "accent" : "neutral"}>
            {block
              ? `${format(parseISO(block.start), "EEE h:mm a")} - ${format(parseISO(block.end), "h:mm a")}`
              : "Unscheduled"}
          </Badge>
          <Badge tone="neutral">{formatMinutes(estimatedMinutes)}</Badge>
          {task.project ? <Badge tone="neutral">{task.project.name}</Badge> : null}
          {task.dueAt ? (
            <Badge tone={isTaskOverdue(task) ? "danger" : "neutral"}>
              Due {format(parseISO(task.dueAt), "MMM d, h:mm a")}
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,0.96fr)]">
        <div className="grid gap-3">
          <TaskDetailSection
            title="Schedule"
            caption="Time, duration, and queue placement."
            action={
              block ? (
                <Button variant="outline" size="sm" onClick={onUnschedule}>
                  Move to queue
                </Button>
              ) : null
            }
          >
            <Field label="Due date">
              <DateTimePicker
                value={dueAt}
                onChange={setDueAt}
                className={compactFieldClassName}
              />
            </Field>
            <Field label="Estimated mins">
              <Input
                type="number"
                min={15}
                step={15}
                value={estimatedMinutes}
                onChange={(event) => {
                  const newDuration = Number(event.target.value);
                  setEstimatedMinutes(newDuration);
                  if (startsAt) {
                    const dt = parseISO(startsAt);
                    if (!isNaN(dt.getTime())) {
                      setEndsAt(toDateTimeInput(addMinutes(dt, newDuration).toISOString()));
                    }
                  }
                }}
                className={compactFieldClassName}
              />
            </Field>
            <Field label="Start">
              <DateTimePicker
                value={startsAt}
                onChange={(val) => {
                  setStartsAt(val);
                  if (val && estimatedMinutes) {
                    const dt = parseISO(val);
                    if (!isNaN(dt.getTime())) {
                      setEndsAt(toDateTimeInput(addMinutes(dt, estimatedMinutes).toISOString()));
                    }
                  }
                }}
                className={compactFieldClassName}
              />
            </Field>
            <Field label="End">
              <DateTimePicker
                value={endsAt}
                onChange={(val) => {
                  setEndsAt(val);
                  if (startsAt && val) {
                    const startDt = parseISO(startsAt);
                    const endDt = parseISO(val);
                    if (!isNaN(startDt.getTime()) && !isNaN(endDt.getTime())) {
                      const diff = differenceInMinutes(endDt, startDt);
                      if (diff > 0) {
                        setEstimatedMinutes(diff);
                      }
                    }
                  }
                }}
                className={compactFieldClassName}
              />
            </Field>
          </TaskDetailSection>

          <TaskDetailSection
            title="Notes & focus"
            caption="Context for the work."
          >
            <Field label="Notes">
              <Textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className={compactTextAreaClassName}
              />
            </Field>
            <Field label="Priority">
              <Select
                value={priority}
                onChange={(event) => setPriority(event.target.value as Priority)}
                className={compactFieldClassName}
              >
                {PRIORITIES.map((item) => (
                  <option key={item} value={item}>
                    {PRIORITY_LABELS[item]}
                  </option>
                ))}
              </Select>
            </Field>
          </TaskDetailSection>
        </div>
        <div className="grid gap-3">
          <TaskDetailSection
            title="Organization"
            caption="Area, project, and tags."
          >
            <Field label="Area">
              <Select
                value={areaId}
                onChange={(event) => setAreaId(event.target.value)}
                className={compactFieldClassName}
              >
                <option value="">No area</option>
                {plannerData.areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Project">
              <Select
                value={projectId}
                onChange={(event) => {
                  const nextProjectId = event.target.value;
                  setProjectId(nextProjectId);
                  if (
                    milestoneId &&
                    !plannerData.milestones.some(
                      (milestone) =>
                        milestone.id === milestoneId &&
                        (!nextProjectId || milestone.projectId === nextProjectId),
                    )
                  ) {
                    setMilestoneId("");
                  }
                }}
                className={compactFieldClassName}
              >
                <option value="">No project</option>
                {plannerData.projects
                  .filter((project) => !areaId || project.areaId === areaId)
                  .map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Milestone">
              <Select
                value={milestoneId}
                onChange={(event) => {
                  const nextMilestoneId = event.target.value;
                  setMilestoneId(nextMilestoneId);
                  if (nextMilestoneId) {
                    const linkedMilestone = plannerData.milestones.find(
                      (milestone) => milestone.id === nextMilestoneId,
                    );

                    if (linkedMilestone) {
                      setProjectId(linkedMilestone.projectId);
                    }
                  }
                }}
                className={compactFieldClassName}
              >
                <option value="">No milestone</option>
                {availableMilestones.map((milestone) => (
                  <option key={milestone.id} value={milestone.id}>
                    {milestone.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Tags">
              <div className="flex flex-wrap gap-1.5">
                {plannerData.tags.map((tag) => {
                  const active = tagIds.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() =>
                        setTagIds((current) =>
                          current.includes(tag.id)
                            ? current.filter((item) => item !== tag.id)
                            : [...current, tag.id],
                        )
                      }
                      className={cn(
                        "rounded-full border px-2.5 py-1.5 text-[11px] font-medium transition",
                        active
                          ? "border-[var(--accent-strong)] bg-[var(--accent-soft)] text-[var(--accent-stronger)]"
                          : "border-[var(--task-modal-border)] bg-[var(--task-modal-neutral)] text-[var(--muted-foreground)]",
                      )}
                    >
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            </Field>
          </TaskDetailSection>

          <TaskDetailSection
            title="Checklist"
            caption="Keep subtasks readable."
          >
            <div className="grid max-h-32 gap-2 overflow-y-auto pr-1">
              {checklist.length ? (
                checklist.map((item, index) => (
                  <div
                    key={item.id ?? `${index}-${item.label}`}
                    className="flex items-center gap-2 rounded-[16px] border border-[var(--task-modal-border)] bg-[var(--task-modal-neutral)] px-2.5 py-2"
                  >
                    <Checkbox
                      checked={item.completed}
                      onChange={(event) =>
                        setChecklist((current) =>
                          current.map((entry, entryIndex) =>
                            entryIndex === index
                              ? { ...entry, completed: event.target.checked }
                              : entry,
                          ),
                        )
                      }
                    />
                    <Input
                      value={item.label}
                      onChange={(event) =>
                        setChecklist((current) =>
                          current.map((entry, entryIndex) =>
                            entryIndex === index
                              ? { ...entry, label: event.target.value }
                              : entry,
                          ),
                        )
                      }
                      className="h-8 border-0 bg-transparent px-0 text-[13px] shadow-none focus:ring-0"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 rounded-full"
                      onClick={() =>
                        setChecklist((current) =>
                          current.filter((_, entryIndex) => entryIndex !== index),
                        )
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))
              ) : (
                <div className="rounded-[16px] border border-dashed border-[var(--task-modal-border)] px-3 py-3 text-[12px] text-[var(--muted-foreground)]">
                  No checklist items yet.
                </div>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setChecklist((current) => [
                  ...current,
                  { label: "", completed: false },
                ])
              }
            >
              Add checklist item
            </Button>
          </TaskDetailSection>

          <RecurrenceFields recurrence={recurrence} onChange={setRecurrence} />
        </div>
      </div>

      <div className="flex flex-wrap justify-between gap-2 border-t border-[var(--border)] pt-3">
        <Button variant="danger" size="sm" onClick={onDelete}>
          Delete task
        </Button>
        <Button
          size="sm"
          onClick={() =>
            onSave({
              title,
              notes,
              priority,
              estimatedMinutes,
              dueAt: dueAt ? new Date(dueAt).toISOString() : null,
              areaId: areaId || null,
              projectId: projectId || null,
              milestoneId: milestoneId || null,
              status,
              tagIds,
              checklist: checklist.filter((item) => item.label.trim()),
              recurrence,
              startsAt: startsAt ? new Date(startsAt).toISOString() : null,
              endsAt: endsAt ? new Date(endsAt).toISOString() : null,
            })
          }
        >
          Save task
        </Button>
      </div>
    </div>
  );
}

function TaskDetailSection({
  title,
  caption,
  action,
  children,
  className,
}: {
  title: string;
  caption: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "grid gap-3 rounded-[20px] border border-[var(--task-modal-border)] bg-[var(--task-modal-card)] p-3",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--foreground-strong)]">
            {title}
          </p>
          <p className="mt-1 text-[12px] leading-5 text-[var(--muted-foreground)]">{caption}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function EventEditor({
  event,
  onSave,
  onDelete,
}: {
  event: EventRecord;
  onSave: (input: Partial<EventRecord>) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(event.title);
  const [notes, setNotes] = useState(event.notes);
  const [location, setLocation] = useState(event.location);
  const [startsAt, setStartsAt] = useState(toDateTimeInput(event.startsAt));
  const [endsAt, setEndsAt] = useState(toDateTimeInput(event.endsAt));
  const [recurrence, setRecurrence] = useState<RecurrenceRule | null>(
    event.recurrence ?? null,
  );
  const compactFieldClassName =
    "h-9 rounded-[14px] border-[var(--task-modal-border)] bg-[var(--task-modal-neutral)] px-3 text-[13px] shadow-none";
  const compactTextAreaClassName =
    "min-h-[88px] rounded-[18px] border-[var(--task-modal-border)] bg-[var(--task-modal-neutral)] px-3 py-2.5 text-[13px] leading-5 shadow-none";

  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)]">
      <div className="grid gap-3">
        <TaskDetailSection title="Details" caption="Edit the essentials.">
          <Field label="Title">
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className={compactFieldClassName}
            />
          </Field>
          <Field label="Notes">
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className={compactTextAreaClassName}
            />
          </Field>
          <Field label="Location">
            <Input
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              className={compactFieldClassName}
            />
          </Field>
        </TaskDetailSection>
      </div>
      <div className="grid gap-3">
        <TaskDetailSection title="Schedule" caption="Start and end stay stacked.">
          <Field label="Start">
            <DateTimePicker
              value={startsAt}
              onChange={setStartsAt}
              className={compactFieldClassName}
            />
          </Field>
          <Field label="End">
            <DateTimePicker
              value={endsAt}
              onChange={setEndsAt}
              className={compactFieldClassName}
            />
          </Field>
        </TaskDetailSection>
        <RecurrenceFields recurrence={recurrence} onChange={setRecurrence} />
      </div>
      <div className="flex flex-wrap justify-between gap-3 border-t border-[var(--border)] pt-3 md:col-span-2">
        <Button variant="danger" onClick={onDelete}>
          Delete event
        </Button>
        <Button
          onClick={() =>
            onSave({
              title,
              notes,
              location,
              startsAt: new Date(startsAt).toISOString(),
              endsAt: new Date(endsAt).toISOString(),
              recurrence,
            })
          }
        >
          Save event
        </Button>
      </div>
    </div>
  );
}

function SettingsEditor({
  settings,
  onSave,
}: {
  settings: PlannerPayload["settings"];
  onSave: (input: UpdateSettingsInput) => void;
}) {
  const [timezone, setTimezone] = useState(settings.timezone);
  const [weekStart, setWeekStart] = useState(settings.weekStart);
  const [slotMinutes, setSlotMinutes] = useState(settings.slotMinutes);
  const [workHours, setWorkHours] = useState(settings.workHours);

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Timezone">
          <Input value={timezone} onChange={(event) => setTimezone(event.target.value)} />
        </Field>
        <Field label="Week starts on">
          <Select
            value={String(weekStart)}
            onChange={(event) => setWeekStart(Number(event.target.value))}
          >
            {DAY_LABELS.map((day, index) => (
              <option key={day} value={index}>
                {day}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Calendar slot size">
        <Select
          value={String(slotMinutes)}
          onChange={(event) => setSlotMinutes(Number(event.target.value))}
        >
          {[15, 30, 60].map((option) => (
            <option key={option} value={option}>
              {option} minutes
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Weekly work hours">
        <div className="grid gap-3 rounded-[22px] border border-[var(--border)] bg-[var(--surface-elevated)] p-3.5">
          {DAY_LABELS.map((day, index) => {
            const current = workHours[index];
            return (
              <div key={day} className="grid grid-cols-[72px_1fr_1fr_auto] items-center gap-3">
                <span className="text-sm font-medium">{day}</span>
                <Input
                  type="time"
                  value={current?.start ?? ""}
                  onChange={(event) =>
                    setWorkHours((value) => ({
                      ...value,
                      [index]: {
                        start: event.target.value,
                        end: value[index]?.end ?? "17:00",
                      },
                    }))
                  }
                />
                <Input
                  type="time"
                  value={current?.end ?? ""}
                  onChange={(event) =>
                    setWorkHours((value) => ({
                      ...value,
                      [index]: {
                        start: value[index]?.start ?? "09:00",
                        end: event.target.value,
                      },
                    }))
                  }
                />
                <Button
                  variant="ghost"
                  onClick={() =>
                    setWorkHours((value) => ({
                      ...value,
                      [index]: null,
                    }))
                  }
                >
                  Clear
                </Button>
              </div>
            );
          })}
        </div>
      </Field>

      <Button onClick={() => onSave({ timezone, weekStart, slotMinutes, workHours })}>
        Save settings
      </Button>
    </div>
  );
}

function RecurrenceFields({
  recurrence,
  onChange,
}: {
  recurrence: RecurrenceRule | null;
  onChange: (value: RecurrenceRule | null) => void;
}) {
  const current = recurrence ?? { frequency: "none" as const };

  return (
    <TaskDetailSection
      title="Recurrence"
      caption={recurrenceLabel(recurrence)}
      action={<Badge tone="neutral">Simple rules</Badge>}
    >
      <Field label="Repeat">
        <Select
          value={current.frequency}
          onChange={(event) => {
            const frequency = event.target.value as RecurrenceRule["frequency"];

            if (frequency === "none") {
              onChange(null);
              return;
            }

            onChange({
              ...current,
              frequency,
            });
          }}
          className="h-9 rounded-[14px] border-[var(--task-modal-border)] bg-[var(--task-modal-neutral)] px-3 text-[13px] shadow-none"
        >
          <option value="none">Does not repeat</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="weekdays">Weekdays</option>
        </Select>
      </Field>

      {current.frequency === "weekly" ? (
        <Field label="Weekdays">
          <div className="flex flex-wrap gap-2">
            {DAY_LABELS.map((day, index) => {
              const active = current.daysOfWeek?.includes(index) ?? false;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() =>
                    onChange({
                      ...current,
                      daysOfWeek: active
                        ? (current.daysOfWeek ?? []).filter((item) => item !== index)
                        : [...(current.daysOfWeek ?? []), index],
                    })
                  }
                  className={cn(
                    "rounded-full border px-3 py-2 text-xs font-medium transition",
                    active
                      ? "border-[var(--accent-strong)] bg-[var(--accent-soft)] text-[var(--accent-stronger)]"
                      : "border-[var(--task-modal-border)] bg-[var(--task-modal-neutral)] text-[var(--muted-foreground)]",
                  )}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </Field>
      ) : null}

      {current.frequency !== "none" ? (
        <Field label="Repeat until">
          <Input
            type="date"
            value={current.until ? toDateTimeInput(current.until).slice(0, 10) : ""}
            onChange={(event) =>
              onChange({
                ...current,
                until: event.target.value
                  ? new Date(`${event.target.value}T23:59:59`).toISOString()
                  : null,
              })
            }
            className="h-9 rounded-[14px] border-[var(--task-modal-border)] bg-[var(--task-modal-neutral)] px-3 text-[13px] shadow-none"
          />
        </Field>
      ) : null}
    </TaskDetailSection>
  );
}

function QuickAddDialog({
  open,
  defaults,
  plannerData,
  onClose,
  onSubmit,
}: {
  open: QuickAddKind;
  defaults: QuickAddDefaults;
  plannerData: PlannerPayload;
  onClose: () => void;
  onSubmit: (kind: Exclude<QuickAddKind, null>, payload: Record<string, unknown>) => void;
}) {
  const visible = Boolean(open);
  const initialTaskScheduled = Boolean(defaults.startsAt && defaults.endsAt);
  const [taskTitle, setTaskTitle] = useState("");
  const [eventTitle, setEventTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [location, setLocation] = useState("");
  const [scheduleTaskNow, setScheduleTaskNow] = useState(initialTaskScheduled);
  const [taskProjectId, setTaskProjectId] = useState(defaults.projectId ?? "");
  const [taskMilestoneId, setTaskMilestoneId] = useState(defaults.milestoneId ?? "");
  const [projectName, setProjectName] = useState("");
  const [areaName, setAreaName] = useState("");
  const [tagName, setTagName] = useState("");
  const [taskPriority, setTaskPriority] = useState<Priority>("medium");
  const [estimatedMinutes, setEstimatedMinutes] = useState(60);
  const [projectAreaId, setProjectAreaId] = useState("");
  const suggestedWindow = (durationMinutes = 60) =>
    buildDefaultEventWindow(plannerData.settings, new Date(), {
      durationMinutes,
      busyWindows: plannerData.scheduledItems.map((item) => ({
        startsAt: item.start,
        endsAt: item.end,
      })),
    });
  const eventDefaultPlanningWindow = suggestedWindow();
  const defaultDateTimes =
    open === "task"
      ? {
          startsAt: initialTaskScheduled ? toDateTimeInput(defaults.startsAt ?? null) : "",
          endsAt: initialTaskScheduled ? toDateTimeInput(defaults.endsAt ?? null) : "",
        }
      : open === "event"
        ? {
            startsAt: toDateTimeInput(defaults.startsAt ?? eventDefaultPlanningWindow.startsAt),
            endsAt: toDateTimeInput(defaults.endsAt ?? eventDefaultPlanningWindow.endsAt),
          }
        : {
            startsAt: "",
            endsAt: "",
        };
  const [startsAt, setStartsAt] = useState(defaultDateTimes.startsAt);
  const [endsAt, setEndsAt] = useState(defaultDateTimes.endsAt);
  const availableMilestones = plannerData.milestones.filter(
    (milestone) => !taskProjectId || milestone.projectId === taskProjectId,
  );

  if (!visible || !open) {
    return null;
  }

  const title =
    open === "task"
      ? "New task"
      : open === "event"
        ? "New event"
        : open === "project"
          ? "New project"
          : open === "area"
            ? "New area"
            : "New tag";

  const submitLabel =
    open === "task"
      ? scheduleTaskNow
        ? "Add to calendar"
        : "Add to inbox"
      : open === "event"
        ? "Create event"
        : open === "project"
          ? "Add project"
          : open === "area"
            ? "Add area"
            : "Add tag";

  const submitDisabled =
    (open === "task" &&
      (!taskTitle.trim() || (scheduleTaskNow && (!startsAt || !endsAt)))) ||
    (open === "event" && (!eventTitle.trim() || !startsAt || !endsAt)) ||
    (open === "project" && !projectName.trim()) ||
    (open === "area" && !areaName.trim()) ||
    (open === "tag" && !tagName.trim());

  const hydrateSuggestedSchedule = () => {
    const window = suggestedWindow(estimatedMinutes);
    setStartsAt(toDateTimeInput(defaults.startsAt ?? window.startsAt));
    setEndsAt(toDateTimeInput(defaults.endsAt ?? window.endsAt));
  };

  return (
    <div className="fixed inset-0 z-40 bg-[var(--modal-backdrop)]">
      <button type="button" className="absolute inset-0" onClick={onClose} aria-label="Close quick add" />
      <div
        data-testid="quick-add-dialog"
        className="absolute inset-x-3 bottom-3 top-6 max-h-[calc(100svh-2.25rem)] overflow-y-auto rounded-[32px] border border-[var(--border-strong)] bg-[var(--surface)] p-6 shadow-[var(--shadow-float)] sm:inset-x-0 sm:top-10 sm:mx-auto sm:max-h-[calc(100svh-5rem)] sm:w-full sm:max-w-xl"
      >
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
              Quick add
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-[-0.04em]">{title}</h2>
          </div>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>

        {open === "task" ? (
          <div className="grid gap-4">
            <div className="flex flex-wrap gap-2">
              <Button
                variant={scheduleTaskNow ? "outline" : "solid"}
                size="sm"
                onClick={() => setScheduleTaskNow(false)}
              >
                Keep in inbox
              </Button>
              <Button
                variant={scheduleTaskNow ? "solid" : "outline"}
                size="sm"
                onClick={() => {
                  setScheduleTaskNow(true);
                  if (!startsAt || !endsAt) {
                    hydrateSuggestedSchedule();
                  }
                }}
              >
                Schedule now
              </Button>
              {scheduleTaskNow ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={hydrateSuggestedSchedule}
                >
                  Use next work slot
                </Button>
              ) : null}
            </div>
            <Field label="Task name">
              <Input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} />
            </Field>
            <Field label="Notes">
              <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Project">
                <Select
                  value={taskProjectId}
                  onChange={(event) => {
                    const nextProjectId = event.target.value;
                    setTaskProjectId(nextProjectId);
                    if (
                      taskMilestoneId &&
                      !plannerData.milestones.some(
                        (milestone) =>
                          milestone.id === taskMilestoneId &&
                          milestone.projectId === nextProjectId,
                      )
                    ) {
                      setTaskMilestoneId("");
                    }
                  }}
                >
                  <option value="">No project</option>
                  {plannerData.projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Milestone">
                <Select
                  value={taskMilestoneId}
                  onChange={(event) => {
                    const nextMilestoneId = event.target.value;
                    setTaskMilestoneId(nextMilestoneId);
                    if (!nextMilestoneId) {
                      return;
                    }

                    const milestone = plannerData.milestones.find(
                      (candidate) => candidate.id === nextMilestoneId,
                    );

                    if (milestone) {
                      setTaskProjectId(milestone.projectId);
                    }
                  }}
                >
                  <option value="">Directly under project</option>
                  {availableMilestones.map((milestone) => (
                    <option key={milestone.id} value={milestone.id}>
                      {milestone.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Priority">
                <Select
                  value={taskPriority}
                  onChange={(event) => setTaskPriority(event.target.value as Priority)}
                >
                  {PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>
                      {PRIORITY_LABELS[priority]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Estimated minutes">
                <Input
                  type="number"
                  step={15}
                  min={15}
                  value={estimatedMinutes}
                  onChange={(event) => {
                    const newDuration = Number(event.target.value);
                    setEstimatedMinutes(newDuration);
                    if (startsAt) {
                      const dt = parseISO(startsAt);
                      if (!isNaN(dt.getTime())) {
                        setEndsAt(toDateTimeInput(addMinutes(dt, newDuration).toISOString()));
                      }
                    }
                  }}
                />
              </Field>
            </div>
            {scheduleTaskNow ? (
              <div className="grid gap-4">
                <Field label="Scheduled start">
                  <DateTimePicker
                    value={startsAt}
                    onChange={(val) => {
                      setStartsAt(val);
                      if (val && estimatedMinutes) {
                        const dt = parseISO(val);
                        if (!isNaN(dt.getTime())) {
                          setEndsAt(toDateTimeInput(addMinutes(dt, estimatedMinutes).toISOString()));
                        }
                      }
                    }}
                  />
                </Field>
                <Field label="Scheduled end">
                  <DateTimePicker
                    value={endsAt}
                    onChange={(val) => {
                      setEndsAt(val);
                      if (startsAt && val) {
                        const startDt = parseISO(startsAt);
                        const endDt = parseISO(val);
                        if (!isNaN(startDt.getTime()) && !isNaN(endDt.getTime())) {
                          const diff = differenceInMinutes(endDt, startDt);
                          if (diff > 0) {
                            setEstimatedMinutes(diff);
                          }
                        }
                      }
                    }}
                  />
                </Field>
              </div>
            ) : null}
          </div>
        ) : null}

        {open === "event" ? (
          <div className="grid gap-4">
            <Field label="Event name">
              <Input value={eventTitle} onChange={(event) => setEventTitle(event.target.value)} />
            </Field>
            <Field label="Location">
              <Input value={location} onChange={(event) => setLocation(event.target.value)} />
            </Field>
            <Field label="Notes">
              <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
            </Field>
            <div className="grid gap-4">
              <Field label="Start">
                <DateTimePicker
                  value={startsAt}
                  onChange={setStartsAt}
                />
              </Field>
              <Field label="End">
                <DateTimePicker
                  value={endsAt}
                  onChange={setEndsAt}
                />
              </Field>
            </div>
          </div>
        ) : null}

        {open === "project" ? (
          <div className="grid gap-4">
            <Field label="Project name">
              <Input value={projectName} onChange={(event) => setProjectName(event.target.value)} />
            </Field>
            <Field label="Area">
              <Select
                value={projectAreaId}
                onChange={(event) => setProjectAreaId(event.target.value)}
              >
                <option value="">No area</option>
                {plannerData.areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        ) : null}

        {open === "area" ? (
          <Field label="Area name">
            <Input value={areaName} onChange={(event) => setAreaName(event.target.value)} />
          </Field>
        ) : null}

        {open === "tag" ? (
          <Field label="Tag name">
            <Input value={tagName} onChange={(event) => setTagName(event.target.value)} />
          </Field>
        ) : null}

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={submitDisabled}
            onClick={() => {
              if (open === "task") {
                onSubmit("task", {
                  title: taskTitle,
                  notes,
                  priority: taskPriority,
                  estimatedMinutes,
                  projectId: taskProjectId || null,
                  milestoneId: taskMilestoneId || null,
                  startsAt:
                    scheduleTaskNow && startsAt ? new Date(startsAt).toISOString() : null,
                  endsAt:
                    scheduleTaskNow && endsAt ? new Date(endsAt).toISOString() : null,
                });
              }
              if (open === "event") {
                onSubmit("event", {
                  title: eventTitle,
                  notes,
                  location,
                  startsAt: new Date(startsAt).toISOString(),
                  endsAt: new Date(endsAt).toISOString(),
                });
              }
              if (open === "project") {
                onSubmit("project", {
                  name: projectName,
                  areaId: projectAreaId || null,
                });
              }
              if (open === "area") {
                onSubmit("area", {
                  name: areaName,
                });
              }
              if (open === "tag") {
                onSubmit("tag", {
                  name: tagName,
                });
              }
            }}
          >
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function KeyboardShortcuts({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-[var(--modal-backdrop)]">
      <button type="button" className="absolute inset-0" onClick={onClose} aria-label="Close keyboard shortcuts" />
      <div className="absolute inset-x-3 bottom-3 top-16 max-h-[calc(100svh-4.75rem)] overflow-y-auto rounded-[28px] border border-[var(--border-strong)] bg-[var(--surface)] p-6 shadow-[var(--shadow-float)] sm:inset-x-0 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
              Keyboard shortcuts
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-[-0.04em]">Move faster</h2>
          </div>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="grid gap-3 text-sm">
          <p className="rounded-[16px] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 text-[12px] leading-5 text-[var(--muted-foreground)]">
            Use `Cmd/Ctrl + Alt + Shift` with the key shown below.
          </p>
          {[
            ["Cmd/Ctrl+Alt+Shift+N", "New task"],
            ["Cmd/Ctrl+Alt+Shift+E", "New event"],
            ["Cmd/Ctrl+Alt+Shift+D", "Switch to day view"],
            ["Cmd/Ctrl+Alt+Shift+W", "Switch to week view"],
            ["Cmd/Ctrl+Alt+Shift+A", "Switch to agenda view"],
            ["Cmd/Ctrl+Alt+Shift+T", "Jump to today"],
            ["Cmd/Ctrl+Alt+Shift+F", "Focus inbox search"],
            ["Cmd/Ctrl+Alt+Shift+← / →", "Move backward or forward"],
            ["Esc", "Close the active panel or dialog"],
            ["Cmd/Ctrl+Alt+Shift+/", "Toggle this help"],
          ].map(([key, label]) => (
            <div
              key={key}
              className="flex items-center justify-between rounded-[18px] border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
            >
              <span>{label}</span>
              <Badge tone="neutral">{key}</Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
