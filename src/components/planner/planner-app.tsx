"use client";

import { UserButton } from "@clerk/nextjs";
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
import {
  Archive,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Command,
  FolderKanban,
  GripVertical,
  Monitor,
  MoreHorizontal,
  Moon,
  Palette,
  Pencil,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import {
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import type { DragEvent as ReactDragEvent, ReactNode } from "react";
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
import { useTheme } from "next-themes";

import { Badge } from "@/components/ui/badge";
import { InflaraLogo } from "@/components/brand/inflara-logo";
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
  ProjectStatus,
  PlannerRange,
  PlannerSurface,
  PlannerTask,
  Priority,
  RecurrenceRule,
  TaskStatus,
  UpdateSettingsInput,
} from "@/lib/planner/types";
import { cn } from "@/lib/utils";

type PlannerAppProps = {
  initialData: PlannerPayload;
  initialRange: PlannerRange;
};

type PlannerMode = "schedule" | "projects";
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

const SURFACE_LABELS: Record<PlannerSurface, string> = {
  week: "Week",
  day: "Day",
  agenda: "Agenda",
};

const PROJECT_SURFACE_LABELS: Record<ProjectPlanningSurface, string> = {
  plan: "Plan",
  timeline: "Timeline",
  charts: "Charts",
};

const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: "Active",
  completed: "Completed",
  archived: "Archived",
};

const PROJECT_STATUS_ORDER: ProjectStatus[] = ["active", "completed", "archived"];

function withAlpha(color: string, alpha: number) {
  const normalized = color.replace("#", "");
  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((value) => `${value}${value}`)
          .join("")
      : normalized;

  const safe =
    expanded.length === 6 && /^[0-9a-f]+$/i.test(expanded) ? expanded : "475569";
  const red = Number.parseInt(safe.slice(0, 2), 16);
  const green = Number.parseInt(safe.slice(2, 4), 16);
  const blue = Number.parseInt(safe.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function pickInitialProjectId(projectPlans: ProjectPlan[]) {
  return (
    projectPlans.find((plan) => plan.project.status === "active")?.project.id ??
    projectPlans[0]?.project.id ??
    ""
  );
}

function plannerAccentButtonClass(
  active: boolean,
  accent: "project" | "schedule",
) {
  if (!active) {
    return "text-[var(--foreground-strong)] hover:bg-[var(--button-ghost-hover)] hover:text-[var(--foreground-strong)]";
  }

  if (accent === "project") {
    return "border border-[rgba(225,29,72,0.14)] bg-[rgba(225,29,72,0.16)] text-[color:#9f1239] hover:bg-[rgba(225,29,72,0.2)] hover:text-[color:#881337] dark:border-[rgba(251,113,133,0.22)] dark:bg-[rgba(244,63,94,0.22)] dark:text-[color:#ffe4e6] dark:hover:bg-[rgba(244,63,94,0.28)] dark:hover:text-white";
  }

  return "border border-[rgba(59,130,246,0.14)] bg-[rgba(59,130,246,0.16)] text-[color:#1d4ed8] hover:bg-[rgba(59,130,246,0.2)] hover:text-[color:#1e40af] dark:border-[rgba(96,165,250,0.22)] dark:bg-[rgba(59,130,246,0.22)] dark:text-[color:#dbeafe] dark:hover:bg-[rgba(59,130,246,0.28)] dark:hover:text-white";
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

function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  if (!mounted) {
    return (
      <Button
        variant="outline"
        size="icon"
        className="h-9 w-9 rounded-full"
        title="Theme settings"
      >
        <Monitor className="h-4 w-4" />
        <span className="sr-only">Theme settings</span>
      </Button>
    );
  }

  const selectedTheme = theme ?? "system";
  const activeVisualTheme =
    selectedTheme === "system" ? resolvedTheme ?? "light" : selectedTheme;
  const TriggerIcon =
    selectedTheme === "system"
      ? Monitor
      : selectedTheme === "pulse"
        ? Sparkles
        : selectedTheme === "aura"
          ? Palette
          : activeVisualTheme === "dark"
            ? Moon
            : Sun;

  const options = [
    {
      value: "system" as const,
      label: "System",
      description: `Following ${resolvedTheme ?? "light"}`,
      icon: Monitor,
    },
    {
      value: "light" as const,
      label: "Light",
      description: "Always use the light theme",
      icon: Sun,
    },
    {
      value: "dark" as const,
      label: "Dark",
      description: "Always use the dark theme",
      icon: Moon,
    },
    {
      value: "aura" as const,
      label: "Aura",
      description: "Pastel glass workspace",
      icon: Palette,
    },
    {
      value: "pulse" as const,
      label: "Pulse",
      description: "Vivid energetic workspace",
      icon: Sparkles,
    },
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 rounded-full"
          title={`Theme: ${selectedTheme}`}
        >
          <TriggerIcon className="h-4 w-4" />
          <span className="sr-only">Change theme</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[192px] rounded-[22px] border border-[var(--border-strong)] bg-[var(--surface-elevated)] p-1.5 shadow-[var(--shadow-soft)]"
      >
        <div className="grid gap-1">
          {options.map((option) => {
            const OptionIcon = option.icon;
            const active = selectedTheme === option.value;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setTheme(option.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-[18px] px-3 py-2 text-left transition",
                  active
                    ? "bg-[var(--accent-soft)] text-[var(--foreground-strong)]"
                    : "text-[var(--foreground)] hover:bg-[var(--button-ghost-hover)]",
                )}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-elevated)] text-[var(--muted-foreground)]">
                  <OptionIcon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{option.label}</span>
                  <span className="block truncate text-[11px] text-[var(--muted-foreground)]">
                    {option.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

type QueueMode = "unscheduled" | "overdue";

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

function CalendarTaskGripIcon() {
  return (
    <svg
      viewBox="0 0 14 18"
      aria-hidden="true"
      className="planner-calendar-event__grip-icon"
    >
      {[0, 1, 2].flatMap((row) =>
        [0, 1].map((column) => (
          <rect
            key={`${row}-${column}`}
            x={3 + column * 4}
            y={3 + row * 4}
            width="2"
            height="2.6"
            rx="1"
            fill="currentColor"
          />
        )),
      )}
    </svg>
  );
}

function renderCalendarEventContent(info: EventContentArg) {
  const source = info.event.extendedProps.source as PlannerCalendarItem["source"] | undefined;
  const recurring = Boolean(info.event.extendedProps.recurring);
  const durationMinutes =
    info.event.start && info.event.end
      ? Math.max(0, differenceInMinutes(info.event.end, info.event.start))
      : 0;
  const compact =
    info.view.type.startsWith("timeGrid") ||
    (durationMinutes > 0 && durationMinutes <= 30);

  return (
    <div
      className={cn(
        "planner-calendar-event",
        source === "task" ? "is-task" : "is-event",
        compact && "is-compact",
        recurring && "is-recurring",
      )}
    >
      <div className="planner-calendar-event__shell">
        <span
          className={cn(
            source === "task"
              ? "planner-calendar-event__handle"
              : "planner-calendar-event__dot",
          )}
          aria-hidden
        >
          {source === "task" ? <CalendarTaskGripIcon /> : null}
        </span>
        <div className="planner-calendar-event__body">
          {!compact && info.timeText ? (
            <span className="planner-calendar-event__time">{info.timeText}</span>
          ) : null}
          <span className="planner-calendar-event__title" title={info.event.title}>
            {info.event.title}
          </span>
        </div>
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

function taskMatchesQuery(task: PlannerTask, query: string) {
  if (!query) {
    return true;
  }

  const needle = query.toLowerCase();
  return [
    task.title,
    task.notes,
    task.project?.name ?? "",
    task.area?.name ?? "",
    ...task.tags.map((tag) => tag.name),
  ]
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

function taskFallsInRange(task: PlannerTask, range: PlannerRange) {
  const rangeStart = parseISO(range.start);
  const rangeEnd = parseISO(range.end);
  const inRange = (value: string | null | undefined) =>
    value != null &&
    !isBefore(parseISO(value), rangeStart) &&
    !isBefore(rangeEnd, parseISO(value));

  if (task.status === "done") {
    return (
      inRange(task.completedAt) ||
      inRange(task.primaryBlock?.startsAt) ||
      inRange(task.dueAt)
    );
  }

  return (
    inRange(task.primaryBlock?.startsAt) ||
    inRange(task.dueAt) ||
    (isTaskOverdue(task, parseISO(range.start)) &&
      (task.primaryBlock == null ||
        isBefore(parseISO(task.primaryBlock.startsAt), rangeStart) ||
        task.dueAt == null ||
        isBefore(parseISO(task.dueAt), rangeStart)))
  );
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

function formatSurfaceTitle(surface: PlannerSurface, focusedDate: string, range: PlannerRange) {
  if (surface === "day") {
    return format(parseISO(`${focusedDate}T12:00:00`), "EEEE, MMM d");
  }

  if (surface === "agenda") {
    return `Agenda for ${format(parseISO(range.start), "MMM d")} - ${format(parseISO(range.end), "MMM d")}`;
  }

  return `Week of ${format(parseISO(range.start), "MMM d")}`;
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

export function PlannerApp({ initialData, initialRange }: PlannerAppProps) {
  const calendarRef = useRef<FullCalendar | null>(null);
  const queueRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [plannerData, setPlannerData] = useState(initialData);
  const [visibleRange, setVisibleRange] = useState(initialRange);
  const [plannerMode, setPlannerMode] = useState<PlannerMode>("projects");
  const [projectSurface, setProjectSurface] = useState<ProjectPlanningSurface>("plan");
  const [activeProjectId, setActiveProjectId] = useState(() =>
    pickInitialProjectId(initialData.projectPlans),
  );
  const [surface, setSurface] = useState<PlannerSurface>("week");
  const [focusedDate, setFocusedDate] = useState(todayDateString());
  const [drawerState, setDrawerState] = useState<DrawerState>(null);
  const [quickAddKind, setQuickAddKind] = useState<QuickAddKind>(null);
  const [quickAddDefaults, setQuickAddDefaults] = useState<QuickAddDefaults>({});
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [queueMode, setQueueMode] = useState<QueueMode>("unscheduled");
  const [helpOpen, setHelpOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showWeekends, setShowWeekends] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [projectRenameState, setProjectRenameState] = useState<{
    id: string;
    name: string;
  } | null>(null);
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
  const selectedWeekRange = useMemo(() => {
    const focus = parseISO(`${focusedDate}T12:00:00`);
    const from = startOfWeek(focus, {
      weekStartsOn: plannerData.settings.weekStart as 0 | 1 | 2 | 3 | 4 | 5 | 6,
    });

    return {
      from,
      to: addDays(from, 6),
    };
  }, [focusedDate, plannerData.settings.weekStart]);
  const selectedWeekModifiers = useMemo(
    () => ({
      range_start: selectedWeekRange.from,
      range_middle: {
        from: addDays(selectedWeekRange.from, 1),
        to: addDays(selectedWeekRange.to, -1),
      },
      range_end: selectedWeekRange.to,
    }),
    [selectedWeekRange],
  );

  const surfaceTitle = useMemo(
    () => formatSurfaceTitle(surface, focusedDate, visibleRange),
    [focusedDate, surface, visibleRange],
  );
  const queueTasks = useMemo(() => {
    const base =
      queueMode === "overdue"
        ? plannerData.overdueTasks
        : plannerData.unscheduledTasks.filter((task) => !isTaskOverdue(task));

    return base
      .filter((task) => taskMatchesQuery(task, deferredQuery))
      .sort(compareBoardTasks);
  }, [deferredQuery, plannerData.overdueTasks, plannerData.unscheduledTasks, queueMode]);
  const boardTasks = useMemo(
    () =>
      plannerData.tasks
        .filter((task) => taskFallsInRange(task, visibleRange))
        .sort(compareBoardTasks),
    [plannerData.tasks, visibleRange],
  );
  const boardColumns = BOARD_COLUMNS.map((column) => ({
    ...column,
    tasks: boardTasks.filter((task) => task.status === column.id),
  }));
  const agendaItems = plannerData.scheduledItems.filter((item) =>
    isSameDay(parseISO(item.start), parseISO(`${focusedDate}T12:00:00`)),
  );
  const selectedProjectId = plannerData.projectPlans.some(
    (plan) => plan.project.id === activeProjectId,
  )
    ? activeProjectId
    : pickInitialProjectId(plannerData.projectPlans);
  const activeProjectPlan = useMemo(
    () =>
      plannerData.projectPlans.find((plan) => plan.project.id === selectedProjectId) ??
      plannerData.projectPlans[0] ??
      null,
    [plannerData.projectPlans, selectedProjectId],
  );
  const headerTitle =
    plannerMode === "projects"
      ? activeProjectPlan?.project.name ?? "Project planning"
      : surfaceTitle;

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

  async function updateProject(projectId: string, input: Record<string, unknown>) {
    try {
      await requestJson(`/api/projects/${projectId}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      });
      toast.success("Project updated");
      await refreshPlanner();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update project");
      throw error;
    }
  }

  async function deleteProject(projectId: string) {
    try {
      await requestJson(`/api/projects/${projectId}`, {
        method: "DELETE",
      });
      toast.success("Project deleted");
      await refreshPlanner();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete project");
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

  function suggestTimeWindow(durationMinutes: number) {
    return buildDefaultEventWindow(plannerData.settings, new Date(), {
      durationMinutes,
      busyWindows: plannerData.scheduledItems.map((item) => ({
        startsAt: item.start,
        endsAt: item.end,
        })),
    });
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

  function scheduleTaskIntoSuggestedWindow(task: PlannerTask) {
    const suggestion = suggestTimeWindow(task.estimatedMinutes);
    const blockId = task.primaryBlock?.id;
    optimisticallyScheduleTask(task.id, suggestion.startsAt, suggestion.endsAt, {
      sourceId: blockId,
    });

    startTransition(async () => {
      try {
        if (blockId) {
          await requestJson(`/api/task-blocks/${blockId}`, {
            method: "PATCH",
            body: JSON.stringify({
              startsAt: suggestion.startsAt,
              endsAt: suggestion.endsAt,
            }),
          });
          toast.success("Task rescheduled into the next open slot");
        } else {
          await requestJson("/api/task-blocks", {
            method: "POST",
            body: JSON.stringify({
              taskId: task.id,
              startsAt: suggestion.startsAt,
              endsAt: suggestion.endsAt,
            }),
          });
          toast.success("Task scheduled for the next open slot");
        }
        await refreshPlanner();
      } catch (error) {
        await refreshPlanner();
        toast.error(error instanceof Error ? error.message : "Could not schedule task");
      }
    });
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

    if (surface === "week") {
      calendarApi.changeView("timeGridWeek", focusedDate);
    } else {
      calendarApi.changeView("timeGridDay", focusedDate);
    }
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
  }, [isMobile, plannerData.overdueTasks, plannerData.unscheduledTasks, queueMode]);

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

  const calendarEvents = plannerData.scheduledItems.map((item) => ({
    id: item.id,
    title: item.title,
    start: item.start,
    end: item.end,
    editable: !item.readOnly,
    durationEditable: !item.readOnly,
    startEditable: !item.readOnly,
    extendedProps: item,
    classNames: [
      item.source === "task" ? "planner-task-event" : "planner-meeting-event",
      item.priority ? `priority-${item.priority}` : "",
      item.status === "done" ? "is-done" : "",
      item.recurring ? "is-recurring" : "",
    ],
  }));

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

  function handleBoardDrop(status: TaskStatus, event: ReactDragEvent<HTMLElement>) {
    event.preventDefault();
    const taskId = event.dataTransfer.getData("text/planner-task-id");

    if (!taskId) {
      return;
    }

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
      className={cn("min-h-screen bg-[var(--background)]", isMobile && "pb-24")}
    >
      <header
        data-planner-topbar
        className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--topbar-bg)] backdrop-blur-xl"
      >
        <div className="mx-auto flex max-w-[1600px] items-center gap-2 px-4 py-2.5 lg:px-5">
          <div className="mr-auto flex min-w-0 items-center gap-3">
            <InflaraLogo compactWordmark markClassName="h-8 w-8" wordmarkClassName="text-sm" />
            {plannerData.mode === "demo" ? (
              <Badge tone="accent">Demo mode</Badge>
            ) : (
              <Badge tone="success">Private workspace</Badge>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-elevated)] p-1 shadow-[var(--shadow-soft)]">
              <Button
                variant="ghost"
                size="sm"
                className={plannerAccentButtonClass(plannerMode === "projects", "project")}
                onClick={() => setPlannerMode("projects")}
              >
                Projects
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={plannerAccentButtonClass(plannerMode === "schedule", "schedule")}
                onClick={() => setPlannerMode("schedule")}
              >
                Schedule
              </Button>
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setHelpOpen(true)}
            aria-label="Shortcuts"
            title="Shortcuts"
          >
            <Command className="h-4 w-4" />
          </Button>

          <ThemeToggle />

          <Button
            variant="ghost"
            onClick={() => setDrawerState({ type: "settings" })}
            aria-label="Planner settings"
            title="Planner settings"
          >
            <Settings2 className="h-4 w-4" />
          </Button>

          {plannerData.mode === "clerk" ? (
            <div className="ml-1 hidden lg:block">
              <UserButton />
            </div>
          ) : null}
        </div>
      </header>

      <main data-planner-main className="mx-auto max-w-[1600px] px-4 py-3 lg:px-5">
        <div
          className={cn(
            "grid gap-3",
            plannerMode === "schedule" && "lg:grid-cols-[198px_minmax(0,1fr)]",
            plannerMode === "projects" && "lg:grid-cols-[220px_minmax(0,1fr)]",
          )}
        >
        {plannerMode === "schedule" ? (
        <aside className="hidden min-w-0 w-[198px] flex-col gap-3 overflow-y-auto pb-4 pr-1 lg:sticky lg:top-[66px] lg:flex lg:h-[calc(100vh-82px)]" style={{ scrollbarWidth: 'none' }}>


          <div className="flex flex-col gap-0.5">
            <div className="mb-1.5 px-2 text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
              Workspaces
            </div>

            <button
              type="button"
              data-testid="queue-unscheduled"
              onClick={() => {
                setQuery("");
                setQueueMode("unscheduled");
              }}
              className={cn(
                "flex items-center rounded-xl px-2 py-1.5 text-left text-[12px] font-medium transition-colors",
                query === "" && queueMode === "unscheduled"
                  ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                  : "text-[var(--foreground)] hover:bg-[var(--panel-subtle)]",
              )}
            >
              Inbox
              <span
                className={cn(
                  "ml-auto rounded-full px-2 py-0.5 text-[10px] opacity-80",
                  plannerData.unscheduledCount > 0
                    ? "bg-[var(--button-solid-bg)] text-[var(--button-solid-fg)]"
                    : "bg-[var(--panel-subtle)]",
                )}
              >
                {plannerData.unscheduledCount}
              </span>
            </button>

            <button
              type="button"
              data-testid="queue-overdue"
              onClick={() => {
                setQuery("");
                setQueueMode("overdue");
              }}
              className={cn(
                "flex items-center rounded-xl px-2 py-1.5 text-left text-[12px] font-medium transition-colors",
                query === "" && queueMode === "overdue"
                  ? "bg-[var(--danger-soft)] text-[var(--danger)]"
                  : "text-[var(--foreground)] hover:bg-[var(--panel-subtle)]",
              )}
            >
              Overdue
              {plannerData.overdueCount > 0 ? (
                <span className="ml-auto rounded-full bg-[var(--danger)] px-2 py-0.5 text-[10px] text-white">
                  {plannerData.overdueCount}
                </span>
              ) : null}
            </button>

            {plannerData.projects?.length ? (
              <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between px-2 text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                  <span>Projects</span>
                  <button
                    type="button"
                    onClick={() => openQuickAdd("project")}
                    className="hover:text-[var(--foreground)]"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
                {plannerData.projects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setQuery(`project:"${p.name}"`)}
                    className={cn(
                      "flex w-full items-center rounded-xl px-2 py-1.5 text-left text-[12px] font-medium transition-colors",
                      query.includes(`project:"${p.name}"`)
                        ? "bg-[var(--panel-subtle)] text-[var(--foreground-strong)]"
                        : "text-[var(--foreground)] hover:bg-[var(--panel-subtle)]",
                    )}
                  >
                    <span className="mr-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-strong)] opacity-60" />
                    <span className="truncate">{p.name}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <section className="flex flex-col flex-1 min-h-[200px] min-w-0 gap-2.5 overflow-hidden rounded-[20px] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2.5 shadow-[var(--shadow-soft)]">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                  {queueMode === "unscheduled" ? "Queue" : "Recovery"}
                </p>
                <h2 className="mt-1 text-[14px] font-semibold tracking-[-0.03em] text-[var(--foreground-strong)]">
                  {queueMode === "unscheduled" ? "Ready to place" : "Needs a new slot"}
                </h2>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Badge tone={queueMode === "overdue" ? "danger" : "neutral"}>
                  {queueTasks.length}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-[var(--muted-foreground)]"
                  onClick={() => openQuickAdd("task")}
                  aria-label="New task"
                  title="New task"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <div className="flex min-w-0 items-center gap-2 rounded-[14px] border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-2">
              <Search className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
              <input
                ref={searchInputRef}
                aria-label="Search task queue"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={queueMode === "unscheduled" ? "Find in inbox..." : "Find overdue work..."}
                className="min-w-0 w-full bg-transparent text-[12px] outline-none placeholder:text-[var(--muted-foreground)]"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="shrink-0 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted-foreground)] transition hover:text-[var(--foreground)]"
                >
                  Clear
                </button>
              ) : null}
            </div>

            {queueTasks.length ? (
              <div ref={queueRef} className="grid min-w-0 gap-2 overflow-y-auto flex-1 pr-1" style={{ scrollbarWidth: "thin" }}>
                {queueTasks.map((task) => (
                  <QueueTaskCard
                    key={task.id}
                    queueMode={queueMode}
                    task={task}
                    onEdit={() => setDrawerState({ type: "task", taskId: task.id })}
                    onPlaceNext={() => scheduleTaskIntoSuggestedWindow(task)}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-[18px] border border-dashed border-[var(--border)] bg-[var(--surface-muted)] px-3 py-4 text-center">
                <p className="text-[12px] font-medium text-[var(--foreground-strong)]">
                  {queueMode === "unscheduled" ? "Inbox is clear" : "Nothing overdue"}
                </p>
              </div>
            )}

            <div className="grid gap-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-center"
                onClick={() => openQuickAdd("task")}
              >
                <Plus className="h-3.5 w-3.5" />
                New task
              </Button>
              <Button
                size="sm"
                className="w-full justify-center"
                onClick={() =>
                  queueTasks[0]
                    ? scheduleTaskIntoSuggestedWindow(queueTasks[0])
                    : openQuickAdd("event")
                }
              >
                <CalendarClock className="h-3.5 w-3.5" />
                {queueTasks[0]
                  ? queueMode === "overdue"
                    ? "Reschedule next"
                    : "Place next"
                  : "New event"}
              </Button>
            </div>
          </section>
        </aside>
        ) : (
        <ProjectSidebar
          projectPlans={plannerData.projectPlans}
          activeProjectId={selectedProjectId}
          onSelectProject={(projectId) => setActiveProjectId(projectId)}
          onAddProject={() => openQuickAdd("project")}
          onRenameProject={(project) =>
            setProjectRenameState({ id: project.id, name: project.name })
          }
          onMoveProject={(projectId, status) => updateProject(projectId, { status })}
          onDeleteProject={deleteProject}
        />
        )}

        <div className="min-w-0">
          <section
            data-planner-context-header
            className="sticky top-[66px] z-10 mb-3 rounded-[22px] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 shadow-[var(--shadow-soft)] backdrop-blur-xl"
          >
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                    {plannerMode === "projects" ? "Project planning" : "Schedule"}
                  </p>
                  {plannerMode === "schedule" ? (
                    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                      <PopoverTrigger asChild>
                        <button className="mt-1 flex max-w-full items-center gap-1 text-left text-[1.6rem] font-semibold tracking-[-0.045em] text-[var(--foreground-strong)] transition hover:text-[var(--accent-strong)]">
                          <span className="truncate">{headerTitle}</span>
                          <ChevronDown className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="start"
                        className="my-1 w-auto overflow-hidden rounded-[24px] border border-[var(--border-strong)] bg-[var(--surface-elevated)] p-0 shadow-[var(--shadow-soft)]"
                      >
                        {surface === "week" ? (
                          <Calendar
                            modifiers={selectedWeekModifiers}
                            weekStartsOn={
                              plannerData.settings.weekStart as 0 | 1 | 2 | 3 | 4 | 5 | 6
                            }
                            onDayClick={(date) => {
                              moveToSurface(surface, format(date, "yyyy-MM-dd"));
                              setPopoverOpen(false);
                            }}
                            initialFocus
                          />
                        ) : (
                          <Calendar
                            mode="single"
                            selected={parseISO(focusedDate)}
                            weekStartsOn={
                              plannerData.settings.weekStart as 0 | 1 | 2 | 3 | 4 | 5 | 6
                            }
                            onDayClick={(date) => {
                              moveToSurface(surface, format(date, "yyyy-MM-dd"));
                              setPopoverOpen(false);
                            }}
                            initialFocus
                          />
                        )}
                      </PopoverContent>
                    </Popover>
                  ) : (
                    <h1 className="mt-1 truncate text-[1.6rem] font-semibold tracking-[-0.045em] text-[var(--foreground-strong)]">
                      {headerTitle}
                    </h1>
                  )}
                </div>

                <div className="hidden h-8 w-px bg-[var(--border)] lg:block" />

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-elevated)] p-1 shadow-[var(--shadow-soft)]">
                    {plannerMode === "schedule"
                      ? (Object.keys(SURFACE_LABELS) as PlannerSurface[]).map((view) => (
                          <Button
                            key={view}
                            variant="ghost"
                            size="sm"
                            className={plannerAccentButtonClass(surface === view, "schedule")}
                            data-testid={`surface-${view}`}
                            onClick={() => moveToSurface(view)}
                          >
                            {SURFACE_LABELS[view]}
                          </Button>
                        ))
                      : (Object.keys(PROJECT_SURFACE_LABELS) as ProjectPlanningSurface[]).map((view) => (
                          <Button
                            key={view}
                            variant="ghost"
                            size="sm"
                            className={plannerAccentButtonClass(projectSurface === view, "project")}
                            data-testid={`project-surface-${view}`}
                            onClick={() => setProjectSurface(view)}
                          >
                            {PROJECT_SURFACE_LABELS[view]}
                          </Button>
                        ))}
                  </div>

                  {plannerMode === "projects" ? (
                    <div className="flex gap-2 lg:hidden">
                      {plannerData.projectPlans.map((plan) => (
                        <button
                          key={plan.project.id}
                          type="button"
                          onClick={() => setActiveProjectId(plan.project.id)}
                          className={cn(
                            "rounded-full border px-3 py-1.5 text-[12px] font-medium transition",
                            plan.project.id === selectedProjectId
                              ? "border-transparent text-[var(--foreground-strong)]"
                              : "border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--muted-foreground)] hover:text-[var(--foreground-strong)]",
                          )}
                          style={
                            plan.project.id === selectedProjectId
                              ? {
                                  backgroundColor: withAlpha(plan.project.color, 0.14),
                                  color: plan.project.color,
                                }
                              : undefined
                          }
                        >
                          {plan.project.name}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {plannerMode === "schedule" ? (
                  <>
                    <Button variant="outline" size="sm" onClick={() => navigateSurface("prev")}>
                      Prev
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => navigateSurface("today")}>
                      Today
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => navigateSurface("next")}>
                      Next
                    </Button>
                    {surface === "week" ? (
                      <Select
                        value={showWeekends ? "full" : "work"}
                        onChange={(e) => setShowWeekends(e.target.value === "full")}
                        className="h-9 w-[134px] rounded-full bg-[var(--surface-elevated)] shadow-[var(--shadow-soft)]"
                      >
                        <option value="work">Work week</option>
                        <option value="full">Full week</option>
                      </Select>
                    ) : null}
                    <Button variant="outline" size="sm" onClick={() => openQuickAdd("event")}>
                      <CalendarClock className="h-4 w-4" />
                      New event
                    </Button>
                    <Button size="sm" onClick={() => openQuickAdd("task")}>
                      <Plus className="h-4 w-4" />
                      New task
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" size="sm" onClick={() => openQuickAdd("project")}>
                      <FolderKanban className="h-4 w-4" />
                      New project
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        openQuickAdd("task", {
                          projectId: activeProjectPlan?.project.id ?? undefined,
                        })
                      }
                    >
                      <Plus className="h-4 w-4" />
                      Add task
                    </Button>
                    <Button size="sm" onClick={() => setMilestoneComposerOpen(true)}>
                      <Plus className="h-4 w-4" />
                      Add milestone
                    </Button>
                  </>
                )}
              </div>
            </div>
          </section>

          {plannerMode === "schedule" ? (
          <section
            data-schedule-surface
            className="relative grid gap-4 rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[var(--shadow-soft)] backdrop-blur-md sm:p-4"
          >
            {surface === "agenda" ? (
              <div className="grid gap-4">
                <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-0.5 pb-3" style={{ scrollbarWidth: 'thin' }}>
                  {plannerData.capacity.map((day) => (
                    <div key={day.date} className="min-w-[188px] shrink-0 snap-start">
                      <AgendaDayCard
                        active={day.date === focusedDate}
                        day={day}
                        onClick={() => setFocusedDate(day.date)}
                      />
                    </div>
                  ))}
                </div>

                {agendaItems.length ? null : (
                  <AgendaEmptyState
                    hasQueueTasks={queueTasks.length > 0}
                    queueMode={queueMode}
                    onCreateEvent={() => openQuickAdd("event")}
                    onCreateTask={() => openQuickAdd("task")}
                    onPlaceNextTask={
                      queueTasks[0] ? () => scheduleTaskIntoSuggestedWindow(queueTasks[0]) : undefined
                    }
                  />
                )}
              </div>
            ) : (
              <KanbanBoard
                columns={boardColumns}
                dateLabel={
                  surface === "day"
                    ? format(parseISO(`${focusedDate}T12:00:00`), "EEEE, MMM d")
                    : `${format(parseISO(visibleRange.start), "MMM d")} - ${format(parseISO(visibleRange.end), "MMM d")}`
                }
                onCardClick={(task) => setDrawerState({ type: "task", taskId: task.id })}
                onColumnDrop={handleBoardDrop}
              />
            )}

            <div
              data-calendar-shell
              className="min-h-[460px] rounded-[22px] border border-[var(--border)] bg-[var(--surface-muted)] p-1.5 shadow-[var(--shadow-soft)]"
            >
              <FullCalendar
                ref={calendarRef}
                plugins={[timeGridPlugin, interactionPlugin]}
                initialView={surface === "week" ? "timeGridWeek" : "timeGridDay"}
                initialDate={focusedDate}
                headerToolbar={false}
                height="560px"
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
            </div>

            {isPending ? (
              <div className="absolute right-5 top-5 rounded-full bg-[var(--button-solid-bg)] px-3 py-2 text-xs font-medium text-[var(--button-solid-fg)] shadow-[var(--shadow-soft)]">
                Updating planner...
              </div>
            ) : null}
          </section>
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
            />
          )}
        </div>
        </div>
      </main>

      <ProjectRenameDialog
        project={projectRenameState}
        onClose={() => setProjectRenameState(null)}
        onSubmit={(projectId, name) => updateProject(projectId, { name })}
      />

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

function AgendaDayCard({
  active,
  day,
  onClick,
}: {
  active: boolean;
  day: DayCapacity;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={`agenda-day-${day.date}`}
      onClick={onClick}
      className={cn(
        "grid gap-3 rounded-[22px] border px-3.5 py-3.5 text-left transition hover:border-[var(--border-strong)]",
        active
          ? "border-[var(--accent-strong)] bg-[var(--accent-soft)]"
          : "border-[var(--border)] bg-[var(--surface)] opacity-85",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-medium text-[var(--muted-foreground)]">
            {format(parseISO(day.date), "EEE")}
          </p>
          <p className="text-[15px] font-semibold">{format(parseISO(day.date), "MMM d")}</p>
        </div>
        <Badge tone={day.overloaded ? "danger" : "neutral"}>
          {day.overloaded ? "Over capacity" : "Plannable"}
        </Badge>
      </div>
      <div className="grid gap-1.5 text-[13px] text-[var(--muted-foreground)]">
        <div className="flex items-center justify-between">
          <span>Tasks</span>
          <span>{formatMinutes(day.scheduledTaskMinutes)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Meetings</span>
          <span>{formatMinutes(day.fixedEventMinutes)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Open time</span>
          <span>{formatMinutes(Math.max(0, day.remainingMinutes))}</span>
        </div>
      </div>
    </button>
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

function ProjectSidebar({
  projectPlans,
  activeProjectId,
  onSelectProject,
  onAddProject,
  onRenameProject,
  onMoveProject,
  onDeleteProject,
}: {
  projectPlans: ProjectPlan[];
  activeProjectId: string;
  onSelectProject: (projectId: string) => void;
  onAddProject: () => void;
  onRenameProject: (project: ProjectPlan["project"]) => void;
  onMoveProject: (projectId: string, status: ProjectStatus) => Promise<void>;
  onDeleteProject: (projectId: string) => Promise<void>;
}) {
  return (
    <aside
      className="hidden min-w-0 w-[220px] flex-col gap-3 overflow-y-auto pb-4 pr-1 lg:sticky lg:top-[66px] lg:flex lg:h-[calc(100vh-82px)]"
      style={{ scrollbarWidth: "none" }}
    >
      <div className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[var(--shadow-soft)]">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
            Projects
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 rounded-full p-0"
            onClick={onAddProject}
            aria-label="Add project"
            title="Add project"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-4 grid gap-4">
          {PROJECT_STATUS_ORDER.map((status) => {
            const items = projectPlans.filter((plan) => plan.project.status === status);

            if (!items.length) {
              return null;
            }

            return (
              <div key={status} className="grid gap-2">
                <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                  {PROJECT_STATUS_LABELS[status]}
                </p>
                <div className="grid gap-1.5">
                  {items.map((plan) => (
                    <ProjectSidebarItem
                      key={plan.project.id}
                      plan={plan}
                      active={plan.project.id === activeProjectId}
                      onSelect={() => onSelectProject(plan.project.id)}
                      onRename={() => onRenameProject(plan.project)}
                      onMoveProject={onMoveProject}
                      onDeleteProject={onDeleteProject}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

function ProjectSidebarItem({
  plan,
  active,
  onSelect,
  onRename,
  onMoveProject,
  onDeleteProject,
}: {
  plan: ProjectPlan;
  active: boolean;
  onSelect: () => void;
  onRename: () => void;
  onMoveProject: (projectId: string, status: ProjectStatus) => Promise<void>;
  onDeleteProject: (projectId: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const accentStyle = active
    ? {
        backgroundColor: withAlpha(plan.project.color, 0.14),
        borderColor: withAlpha(plan.project.color, 0.28),
      }
    : undefined;
  const accentTextStyle = active ? { color: plan.project.color } : undefined;

  return (
    <div
      className={cn(
        "group flex items-center gap-1 rounded-[16px] border border-transparent px-1.5 py-1 transition duration-150 hover:-translate-y-[1px] hover:bg-[var(--surface-muted)]",
        active && "shadow-[var(--shadow-soft)]",
      )}
      style={accentStyle}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-[12px] px-2 py-2 text-left"
      >
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: plan.project.color }}
        />
        <span
          className="truncate text-[13px] font-medium text-[var(--foreground-strong)]"
          style={accentTextStyle}
        >
          {plan.project.name}
        </span>
      </button>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 rounded-full p-0 opacity-70 transition group-hover:opacity-100"
            aria-label={`Project options for ${plan.project.name}`}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-56 rounded-[18px] border border-[var(--border-strong)] bg-[var(--surface-elevated)] p-1.5 shadow-[var(--shadow-soft)]"
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-[12px] px-3 py-2 text-left text-[13px] font-medium text-[var(--foreground-strong)] transition hover:bg-[var(--button-ghost-hover)]"
            onClick={() => {
              setOpen(false);
              onRename();
            }}
          >
            <Pencil className="h-4 w-4 text-[var(--muted-foreground)]" />
            Rename project
          </button>

          {plan.project.status !== "active" ? (
            <button
              type="button"
              className="mt-1 flex w-full items-center gap-2 rounded-[12px] px-3 py-2 text-left text-[13px] font-medium text-[var(--foreground-strong)] transition hover:bg-[var(--button-ghost-hover)]"
              onClick={async () => {
                setOpen(false);
                await onMoveProject(plan.project.id, "active");
              }}
            >
              <FolderKanban className="h-4 w-4 text-[var(--muted-foreground)]" />
              Move to active
            </button>
          ) : null}

          {plan.project.status !== "completed" ? (
            <button
              type="button"
              className="mt-1 flex w-full items-center gap-2 rounded-[12px] px-3 py-2 text-left text-[13px] font-medium text-[var(--foreground-strong)] transition hover:bg-[var(--button-ghost-hover)]"
              onClick={async () => {
                setOpen(false);
                await onMoveProject(plan.project.id, "completed");
              }}
            >
              <CheckCircle2 className="h-4 w-4 text-[var(--muted-foreground)]" />
              Mark completed
            </button>
          ) : null}

          {plan.project.status !== "archived" ? (
            <button
              type="button"
              className="mt-1 flex w-full items-center gap-2 rounded-[12px] px-3 py-2 text-left text-[13px] font-medium text-[var(--foreground-strong)] transition hover:bg-[var(--button-ghost-hover)]"
              onClick={async () => {
                setOpen(false);
                await onMoveProject(plan.project.id, "archived");
              }}
            >
              <Archive className="h-4 w-4 text-[var(--muted-foreground)]" />
              Archive project
            </button>
          ) : null}

          <button
            type="button"
            className="mt-1 flex w-full items-center gap-2 rounded-[12px] px-3 py-2 text-left text-[13px] font-medium text-[color:#be123c] transition hover:bg-[rgba(225,29,72,0.08)] dark:text-[color:#fecdd3]"
            onClick={async () => {
              setOpen(false);
              if (!window.confirm(`Delete ${plan.project.name}?`)) {
                return;
              }
              await onDeleteProject(plan.project.id);
            }}
          >
            <Trash2 className="h-4 w-4" />
            Delete project
          </button>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function ProjectRenameDialog({
  project,
  onClose,
  onSubmit,
}: {
  project: { id: string; name: string } | null;
  onClose: () => void;
  onSubmit: (projectId: string, name: string) => Promise<void>;
}) {
  const [name, setName] = useState(project?.name ?? "");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setName(project?.name ?? "");
  }, [project]);

  if (!project) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 bg-[var(--modal-backdrop)]">
      <button type="button" className="absolute inset-0" onClick={onClose} aria-label="Close rename project dialog" />
      <div className="absolute inset-x-3 top-10 rounded-[28px] border border-[var(--border-strong)] bg-[var(--surface)] p-5 shadow-[var(--shadow-float)] sm:left-1/2 sm:max-w-md sm:-translate-x-1/2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
              Project
            </p>
            <h2 className="mt-1 text-[1.35rem] font-semibold tracking-[-0.04em] text-[var(--foreground-strong)]">
              Rename project
            </h2>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="mt-4 grid gap-3">
          <Field label="Project name">
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={submitting || !name.trim()}
            onClick={async () => {
              setSubmitting(true);
              try {
                await onSubmit(project.id, name.trim());
                onClose();
              } finally {
                setSubmitting(false);
              }
            }}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

function QueueTaskCard({
  queueMode,
  task,
  onEdit,
  onPlaceNext,
}: {
  queueMode: QueueMode;
  task: PlannerTask;
  onEdit: () => void;
  onPlaceNext: () => void;
}) {
  return (
    <article className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-2 rounded-[16px] border border-[var(--border)] bg-[var(--surface-muted)] px-2 py-2 transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-elevated)]">
      <button
        type="button"
        data-draggable-queue-task="true"
        data-task-id={task.id}
        data-block-id={task.primaryBlock?.id ?? ""}
        data-title={task.title}
        data-duration={task.estimatedMinutes}
        aria-label={`Drag ${task.title} onto the agenda`}
        className="mt-0.5 flex h-[26px] w-[26px] shrink-0 cursor-grab touch-none items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] transition hover:border-[var(--border-strong)] hover:text-[var(--foreground)] active:cursor-grabbing"
      >
        <GripVertical className="h-3 w-3" />
      </button>

      <div className="min-w-0">
        <button
          type="button"
          data-testid={`queue-card-${task.id}`}
          onClick={onEdit}
          className="block min-w-0 w-full text-left"
        >
          <p className="line-clamp-2 min-w-0 text-[12px] font-semibold leading-[1.15rem] text-[var(--foreground-strong)]">
            {task.title}
          </p>
        </button>
      </div>
    </article>
  );
}

function AgendaEmptyState({
  hasQueueTasks,
  queueMode,
  onCreateTask,
  onCreateEvent,
  onPlaceNextTask,
}: {
  hasQueueTasks: boolean;
  queueMode: QueueMode;
  onCreateTask: () => void;
  onCreateEvent: () => void;
  onPlaceNextTask?: () => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-[var(--border)] bg-[var(--panel-subtle)] px-4 py-3.5">
      <div className="grid gap-1">
        <p className="text-[15px] font-semibold tracking-[-0.03em] text-[var(--foreground-strong)]">
          Nothing is placed on this agenda day yet
        </p>
        <p className="text-[13px] leading-5 text-[var(--muted-foreground)]">
          {hasQueueTasks
            ? `Start with the ${queueMode} queue and place the next task into an open work slot.`
            : "Add a task or a fixed event to start shaping this day visually."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {hasQueueTasks && onPlaceNextTask ? (
          <Button size="sm" onClick={onPlaceNextTask}>
            Place next task
          </Button>
        ) : null}
        <Button variant="outline" size="sm" onClick={onCreateEvent}>
          New event
        </Button>
        <Button size="sm" onClick={onCreateTask}>
          New task
        </Button>
      </div>
    </div>
  );
}

function KanbanBoard({
  columns,
  dateLabel,
  onCardClick,
  onColumnDrop,
}: {
  columns: Array<(typeof BOARD_COLUMNS)[number] & { tasks: PlannerTask[] }>;
  dateLabel: string;
  onCardClick: (task: PlannerTask) => void;
  onColumnDrop: (status: TaskStatus, event: ReactDragEvent<HTMLElement>) => void;
}) {
  const totalTasks = columns.reduce((sum, column) => sum + column.tasks.length, 0);

  if (!totalTasks) {
    return (
      <div className="grid gap-3 rounded-[22px] border border-dashed border-[var(--border-strong)] bg-[var(--panel-subtle)] p-5">
        <p className="text-[18px] font-semibold tracking-[-0.03em] text-[var(--foreground-strong)]">
          No tasks fall inside {dateLabel}
        </p>
      </div>
    );
  }

  return (
      <div className="grid gap-3 xl:grid-cols-3">
      {columns.map((column) => (
        <section
          key={column.id}
          data-testid={`kanban-column-${column.id}`}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => onColumnDrop(column.id, event)}
          className="flex min-h-[340px] flex-col rounded-[20px] border border-[var(--border)] bg-[var(--panel-subtle)] p-2"
        >
          <div className="mb-2.5 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-[15px] font-semibold tracking-[-0.03em]">{column.label}</h3>
            </div>
            <Badge tone="neutral">{column.tasks.length}</Badge>
          </div>

          <div className="grid flex-1 content-start gap-2">
            {column.tasks.length ? (
              column.tasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  draggable
                  data-testid={`kanban-card-${task.id}`}
                  onDragStart={(event) => {
                    event.dataTransfer.setData("text/planner-task-id", task.id);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  onClick={() => onCardClick(task)}
                  className="rounded-[16px] border border-[var(--border)] bg-[var(--surface-elevated)] p-2.5 text-left shadow-[var(--shadow-soft)] transition hover:-translate-y-0.5 hover:border-[var(--border-strong)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-[14px] font-semibold leading-5 text-[var(--foreground-strong)]">
                        {task.title}
                      </p>
                      <p className="mt-1.5 line-clamp-2 text-[12px] leading-5 text-[var(--muted-foreground)]">
                        {task.notes || "No notes yet."}
                      </p>
                    </div>
                    <span className="mt-0.5 rounded-full bg-[var(--panel-subtle)] p-1.5 text-[var(--muted-foreground)]">
                      <GripVertical className="h-3.5 w-3.5" />
                    </span>
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    <Badge tone="neutral">{formatMinutes(task.estimatedMinutes)}</Badge>
                    {task.primaryBlock ? (
                      <Badge tone="accent">
                        {format(parseISO(task.primaryBlock.startsAt), "EEE h:mm a")}
                      </Badge>
                    ) : null}
                    {task.dueAt ? (
                      <Badge tone={isTaskOverdue(task) ? "danger" : "neutral"}>
                        Due {format(parseISO(task.dueAt), "MMM d")}
                      </Badge>
                    ) : null}
                  </div>
                </button>
              ))
            ) : (
              <div className="rounded-[22px] border border-dashed border-[var(--border)] bg-[var(--surface)] opacity-60 p-4 text-sm leading-6 text-[var(--muted-foreground)]">
                No tasks in {column.label.toLowerCase()} for this range.
              </div>
            )}
          </div>
        </section>
      ))}
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
      <div className="absolute inset-x-3 bottom-3 top-6 max-h-[calc(100svh-2.25rem)] overflow-y-auto rounded-[32px] border border-[var(--border-strong)] bg-[var(--surface)] p-6 shadow-[var(--shadow-float)] sm:inset-x-0 sm:top-10 sm:mx-auto sm:max-h-[calc(100svh-5rem)] sm:w-full sm:max-w-xl">
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
