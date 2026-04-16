"use client";

import { UserButton } from "@clerk/nextjs";
import FullCalendar from "@fullcalendar/react";
import interactionPlugin, {
  Draggable,
  type EventReceiveArg,
  type EventResizeDoneArg,
} from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import timeGridPlugin from "@fullcalendar/timegrid";
import type {
  DateSelectArg,
  DatesSetArg,
  EventClickArg,
  EventDropArg,
} from "@fullcalendar/core";
import {
  CalendarClock,
  CircleAlert,
  Clock3,
  GripVertical,
  ListTodo,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import type { ReactNode } from "react";
import { format, isBefore, isToday, parseISO } from "date-fns";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PRIORITIES, TIME_BANDS } from "@/lib/planner/constants";
import { toDateTimeInput, todayDateString } from "@/lib/planner/date";
import type {
  DayCapacity,
  EventRecord,
  NewTaskInput,
  PlannerCalendarItem,
  PlannerPayload,
  PlannerRange,
  PlannerTask,
  PlannerView,
  PreferredTimeBand,
  Priority,
  RecurrenceRule,
  UpdateSettingsInput,
} from "@/lib/planner/types";
import { cn } from "@/lib/utils";

type PlannerAppProps = {
  initialData: PlannerPayload;
  initialRange: PlannerRange;
};

type DrawerState =
  | { type: "task"; taskId: string; blockId?: string }
  | { type: "event"; eventId: string }
  | { type: "settings" }
  | null;

type QuickAddKind = "task" | "event" | "project" | "area" | "tag" | null;

type QuickAddDefaults = {
  startsAt?: string;
  endsAt?: string;
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

const TIME_BAND_LABELS: Record<PreferredTimeBand, string> = {
  anytime: "Anytime",
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
};

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
    return "border-[rgba(190,24,93,0.22)] bg-[rgba(244,63,94,0.14)] text-[rgb(159,18,57)]";
  }
  if (priority === "high") {
    return "border-[rgba(217,119,6,0.22)] bg-[rgba(245,158,11,0.14)] text-[rgb(146,64,14)]";
  }
  if (priority === "low") {
    return "border-[rgba(51,65,85,0.16)] bg-[rgba(148,163,184,0.14)] text-[rgb(51,65,85)]";
  }
  return "border-[rgba(15,118,110,0.22)] bg-[rgba(45,212,191,0.16)] text-[rgb(15,118,110)]";
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
  const externalTasksRef = useRef<HTMLDivElement | null>(null);
  const [plannerData, setPlannerData] = useState(initialData);
  const [visibleRange, setVisibleRange] = useState(initialRange);
  const [drawerState, setDrawerState] = useState<DrawerState>(null);
  const [quickAddKind, setQuickAddKind] = useState<QuickAddKind>(null);
  const [quickAddDefaults, setQuickAddDefaults] = useState<QuickAddDefaults>({});
  const [activeView, setActiveView] = useState<PlannerView>("timeGridWeek");
  const [calendarTitle, setCalendarTitle] = useState("This week");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [activeFilter, setActiveFilter] = useState("inbox");
  const [helpOpen, setHelpOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isPending, startTransition] = useTransition();

  const selectedTask =
    drawerState?.type === "task"
      ? plannerData.tasks.find((task) => task.id === drawerState.taskId) ?? null
      : null;
  const selectedEvent =
    drawerState?.type === "event"
      ? plannerData.events.find((event) => event.id === drawerState.eventId) ?? null
      : null;
  const selectedBlock =
    drawerState?.type === "task" && drawerState.blockId
      ? plannerData.scheduledItems.find(
          (item) => item.source === "task" && item.sourceId === drawerState.blockId,
        ) ?? null
      : null;

  const filteredUnscheduledTasks = plannerData.unscheduledTasks.filter((task) => {
    const matchesQuery =
      !deferredQuery ||
      task.title.toLowerCase().includes(deferredQuery.toLowerCase()) ||
      task.notes.toLowerCase().includes(deferredQuery.toLowerCase());

    if (!matchesQuery) {
      return false;
    }

    if (activeFilter === "urgent") {
      return (
        task.priority === "high" ||
        task.priority === "critical" ||
        (task.dueAt && isBefore(parseISO(task.dueAt), parseISO(visibleRange.end)))
      );
    }

    if (activeFilter === "deep-work") {
      return task.estimatedMinutes >= 90;
    }

    if (activeFilter === "morning") {
      return task.preferredTimeBand === "morning";
    }

    return true;
  });

  const overloadedDays = plannerData.capacity.filter((day) => day.overloaded);
  const todayCapacity =
    plannerData.capacity.find((day) => day.date === todayDateString()) ??
    plannerData.capacity[0];

  async function refreshPlanner(range: PlannerRange = visibleRange) {
    const params = new URLSearchParams({
      start: range.start,
      end: range.end,
    });

    const nextData = await requestJson<PlannerPayload>(`/api/planner?${params}`);
    setPlannerData(nextData);
  }

  function optimisticallyScheduleTask(taskId: string, startsAt: string, endsAt: string) {
    setPlannerData((current) => {
      const task = current.tasks.find((item) => item.id === taskId);

      if (!task) {
        return current;
      }

      const scheduledItem: PlannerCalendarItem = {
        id: `task:temp:${taskId}`,
        sourceId: `temp-${taskId}`,
        instanceId: `temp-${taskId}-${startsAt}`,
        source: "task",
        taskId,
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

      return {
        ...current,
        tasks: current.tasks.map((item) =>
          item.id === taskId ? { ...item, hasBlock: true } : item,
        ),
        unscheduledTasks: current.unscheduledTasks.filter((item) => item.id !== taskId),
        scheduledItems: [
          ...current.scheduledItems.filter((item) => item.taskId !== taskId),
          scheduledItem,
        ].sort((left, right) => left.start.localeCompare(right.start)),
      };
    });
  }

  function optimisticallyMoveCalendarItem(
    sourceId: string,
    source: "task" | "event",
    startsAt: string,
    endsAt: string,
  ) {
    setPlannerData((current) => ({
      ...current,
      scheduledItems: current.scheduledItems.map((item) =>
        item.source === source && item.sourceId === sourceId
          ? { ...item, start: startsAt, end: endsAt }
          : item,
      ),
    }));
  }

  function markTaskStatus(taskId: string, status: "todo" | "done") {
    setPlannerData((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              status,
              completedAt: status === "done" ? new Date().toISOString() : null,
            }
          : task,
      ),
      unscheduledTasks: current.unscheduledTasks
        .map((task) =>
          task.id === taskId
            ? {
                ...task,
                status,
                completedAt: status === "done" ? new Date().toISOString() : null,
              }
            : task,
        )
        .filter((task) => task.status !== "done"),
      scheduledItems: current.scheduledItems.map((item) =>
        item.source === "task" && item.taskId === taskId
          ? { ...item, status }
          : item,
      ),
    }));
  }

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1024px)");

    const apply = () => {
      setIsMobile(media.matches);
      setActiveView((current) => {
        if (media.matches) {
          return current === "timeGridWeek" ? "listDay" : current;
        }
        return current === "listDay" ? "timeGridWeek" : current;
      });
    };

    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const calendarApi = calendarRef.current?.getApi();

    if (calendarApi && calendarApi.view.type !== activeView) {
      calendarApi.changeView(activeView);
    }
  }, [activeView]);

  useEffect(() => {
    if (!externalTasksRef.current || isMobile) {
      return;
    }

    const draggable = new Draggable(externalTasksRef.current, {
      itemSelector: "[data-draggable-task='true']",
      eventData(eventEl) {
        const element = eventEl as HTMLElement;
        const duration = Number(element.dataset.duration ?? "60");

        return {
          title: element.dataset.title ?? "",
          duration: { minutes: duration },
          extendedProps: {
            taskId: element.dataset.taskId,
          },
        };
      },
    });

    return () => {
      draggable.destroy();
    };
  }, [isMobile, plannerData.unscheduledTasks]);

  useEffect(() => {
    const keyboardHandler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const inTextInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.getAttribute("contenteditable") === "true" ||
          target.tagName === "SELECT");

      if (inTextInput) {
        return;
      }

      if (event.key === "n") {
        event.preventDefault();
        setQuickAddDefaults({});
        setQuickAddKind("task");
      }

      if (event.key === "e") {
        event.preventDefault();
        setQuickAddDefaults({});
        setQuickAddKind("event");
      }

      if (event.key === "d") {
        event.preventDefault();
        setActiveView("timeGridDay");
      }

      if (event.key === "w") {
        event.preventDefault();
        setActiveView("timeGridWeek");
      }

      if (event.key === "?") {
        event.preventDefault();
        setHelpOpen((current) => !current);
      }
    };

    window.addEventListener("keydown", keyboardHandler);
    return () => window.removeEventListener("keydown", keyboardHandler);
  }, []);

  const handleDatesSet = (info: DatesSetArg) => {
    setCalendarTitle(info.view.title);
    const nextRange = {
      start: info.start.toISOString(),
      end: info.end.toISOString(),
    };

    if (
      nextRange.start === visibleRange.start &&
      nextRange.end === visibleRange.end
    ) {
      return;
    }

    setVisibleRange(nextRange);
    startTransition(async () => {
      await refreshPlanner(nextRange);
    });
  };

  const handleEventClick = (info: EventClickArg) => {
    const source = info.event.extendedProps.source as "task" | "event";
    const sourceId = info.event.extendedProps.sourceId as string;

    if (source === "task") {
      const taskId = info.event.extendedProps.taskId as string | undefined;
      const task = plannerData.tasks.find((candidate) => candidate.id === taskId);

      if (task) {
        setDrawerState({ type: "task", taskId: task.id, blockId: sourceId });
      }
    } else {
      setDrawerState({ type: "event", eventId: sourceId });
    }
  };

  const handleTaskReceive = (info: EventReceiveArg) => {
    const taskId = info.event.extendedProps.taskId as string | undefined;
    const startsAt = info.event.start?.toISOString();
    const endsAt = info.event.end?.toISOString();

    if (!taskId || !startsAt || !endsAt) {
      info.revert();
      return;
    }

    optimisticallyScheduleTask(taskId, startsAt, endsAt);

    startTransition(async () => {
      try {
        await requestJson("/api/task-blocks", {
          method: "POST",
          body: JSON.stringify({
            taskId,
            startsAt,
            endsAt,
          }),
        });
        toast.success("Task scheduled");
        await refreshPlanner();
      } catch (error) {
        info.revert();
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

    if (!startsAt || !endsAt) {
      info.revert();
      return;
    }

    optimisticallyMoveCalendarItem(sourceId, source, startsAt, endsAt);

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
    setQuickAddDefaults({
      startsAt: info.start.toISOString(),
      endsAt: info.end.toISOString(),
    });
    setQuickAddKind("task");
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
    ],
  }));

  return (
    <div className="min-h-screen bg-[var(--surface)]">
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[rgba(248,246,241,0.9)] backdrop-blur">
        <div className="mx-auto flex max-w-[1680px] items-center gap-3 px-4 py-4 lg:px-6">
          <div className="mr-auto">
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--muted-foreground)]">
              Daycraft Planner
            </p>
            <div className="mt-1 flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-[-0.05em] text-[var(--foreground-strong)]">
                {calendarTitle}
              </h1>
              {plannerData.mode === "demo" ? (
                <Badge tone="accent">Demo mode</Badge>
              ) : (
                <Badge tone="success">Private workspace</Badge>
              )}
            </div>
          </div>

          <div className="hidden items-center gap-2 lg:flex">
            <Button variant="outline" onClick={() => calendarRef.current?.getApi().prev()}>
              Prev
            </Button>
            <Button variant="outline" onClick={() => calendarRef.current?.getApi().today()}>
              Today
            </Button>
            <Button variant="outline" onClick={() => calendarRef.current?.getApi().next()}>
              Next
            </Button>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-white/90 p-1 shadow-sm">
            <Button
              variant={activeView === "timeGridDay" ? "solid" : "ghost"}
              size="sm"
              onClick={() => setActiveView("timeGridDay")}
            >
              Day
            </Button>
            <Button
              variant={activeView === "timeGridWeek" ? "solid" : "ghost"}
              size="sm"
              onClick={() => setActiveView("timeGridWeek")}
            >
              Week
            </Button>
            <Button
              variant={activeView === "listDay" ? "solid" : "ghost"}
              size="sm"
              onClick={() => setActiveView("listDay")}
            >
              Agenda
            </Button>
          </div>

          <div className="hidden items-center gap-2 md:flex">
            <Button
              variant="outline"
              onClick={() => {
                setQuickAddDefaults({});
                setQuickAddKind("event");
              }}
            >
              <CalendarClock className="h-4 w-4" />
              New event
            </Button>
            <Button
              onClick={() => {
                setQuickAddDefaults({});
                setQuickAddKind("task");
              }}
            >
              <Plus className="h-4 w-4" />
              New task
            </Button>
          </div>

          <Button variant="ghost" onClick={() => setDrawerState({ type: "settings" })}>
            <Settings2 className="h-4 w-4" />
          </Button>

          {plannerData.mode === "clerk" ? (
            <div className="ml-1 hidden lg:block">
              <UserButton />
            </div>
          ) : null}
        </div>
      </header>

      <main className="mx-auto grid max-w-[1680px] gap-4 px-4 py-4 lg:grid-cols-[340px_1fr] lg:px-6">
        <aside className="grid gap-4 lg:sticky lg:top-[88px] lg:h-[calc(100vh-112px)] lg:overflow-hidden">
          <section className="grid gap-3 rounded-[28px] border border-[var(--border)] bg-white/90 p-5 shadow-[var(--shadow-soft)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                  Today at a glance
                </p>
                <h2 className="mt-1 text-2xl font-semibold tracking-[-0.04em]">
                  {format(new Date(), "EEEE")}
                </h2>
              </div>
              <Sparkles className="h-5 w-5 text-[var(--accent-strong)]" />
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <MetricCard
                icon={<Clock3 className="h-4 w-4" />}
                label="Planned load"
                value={`${formatMinutes(todayCapacity?.scheduledTaskMinutes ?? 0)} / ${formatMinutes(todayCapacity?.workMinutes ?? 0)}`}
                tone="accent"
              />
              <MetricCard
                icon={<CircleAlert className="h-4 w-4" />}
                label="Overdue"
                value={`${plannerData.overdueCount}`}
                tone={plannerData.overdueCount ? "danger" : "neutral"}
              />
              <MetricCard
                icon={<ListTodo className="h-4 w-4" />}
                label="Unscheduled"
                value={`${plannerData.unscheduledCount}`}
                tone="neutral"
              />
            </div>
            <div className="rounded-[24px] border border-[var(--border)] bg-[var(--panel-subtle)] p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold">Capacity</p>
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                  Fixed + planned
                </p>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white">
                <div
                  className={cn(
                    "h-full rounded-full bg-[var(--accent-strong)] transition-all",
                    (todayCapacity?.remainingMinutes ?? 0) < 0 && "bg-[var(--danger)]",
                  )}
                  style={{
                    width: todayCapacity?.workMinutes
                      ? `${Math.min(
                          100,
                          ((todayCapacity.scheduledTaskMinutes +
                            todayCapacity.fixedEventMinutes) /
                            todayCapacity.workMinutes) *
                            100,
                        )}%`
                      : "0%",
                  }}
                />
              </div>
              <p className="mt-3 text-sm text-[var(--muted-foreground)]">
                {todayCapacity?.remainingMinutes ?? 0 >= 0
                  ? `${formatMinutes(todayCapacity?.remainingMinutes ?? 0)} left in your workday`
                  : `${formatMinutes(Math.abs(todayCapacity?.remainingMinutes ?? 0))} overbooked today`}
              </p>
            </div>
          </section>

          <section className="grid min-h-0 gap-4 rounded-[28px] border border-[var(--border)] bg-white/90 p-5 shadow-[var(--shadow-soft)]">
            <div className="flex items-center gap-3 rounded-[22px] border border-[var(--border)] bg-[var(--panel-subtle)] px-4 py-3">
              <Search className="h-4 w-4 text-[var(--muted-foreground)]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search unscheduled tasks"
                className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--muted-foreground)]"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {plannerData.savedFilters.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setActiveFilter(filter.id)}
                  className={cn(
                    "rounded-full border px-3 py-2 text-xs font-medium uppercase tracking-[0.16em] transition",
                    activeFilter === filter.id
                      ? "border-[var(--accent-strong)] bg-[var(--accent-soft)] text-[var(--accent-stronger)]"
                      : "border-[var(--border)] bg-white text-[var(--muted-foreground)] hover:bg-[var(--panel-subtle)]",
                  )}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setQuickAddKind("project")}>
                New project
              </Button>
              <Button variant="outline" size="sm" onClick={() => setQuickAddKind("area")}>
                New area
              </Button>
              <Button variant="outline" size="sm" onClick={() => setQuickAddKind("tag")}>
                New tag
              </Button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-[-0.03em]">Inbox</h2>
                <p className="text-sm text-[var(--muted-foreground)]">
                  Drag tasks into the calendar to place real time blocks.
                </p>
              </div>
              <Badge tone="neutral">{filteredUnscheduledTasks.length}</Badge>
            </div>

            <div
              ref={externalTasksRef}
              className="grid min-h-0 gap-3 overflow-y-auto pr-1"
            >
              {filteredUnscheduledTasks.length ? (
                filteredUnscheduledTasks.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    data-draggable-task="true"
                    data-task-id={task.id}
                    data-title={task.title}
                    data-duration={task.estimatedMinutes}
                    onClick={() => setDrawerState({ type: "task", taskId: task.id })}
                    className="group grid gap-3 rounded-[24px] border border-[var(--border)] bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--border-strong)]"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-1 text-[var(--muted-foreground)]">
                        <GripVertical className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-[var(--foreground-strong)]">
                            {task.title}
                          </p>
                          <span className={cn("rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]", priorityClass(task.priority))}>
                            {PRIORITY_LABELS[task.priority]}
                          </span>
                        </div>
                        <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--muted-foreground)]">
                          {task.notes || "No task notes yet."}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="neutral">{formatMinutes(task.estimatedMinutes)}</Badge>
                      <Badge tone="accent">{TIME_BAND_LABELS[task.preferredTimeBand]}</Badge>
                      {task.dueAt ? (
                        <Badge tone={isBefore(parseISO(task.dueAt), new Date()) ? "danger" : "neutral"}>
                          Due {format(parseISO(task.dueAt), "MMM d, h:mm a")}
                        </Badge>
                      ) : null}
                    </div>
                  </button>
                ))
              ) : (
                <div className="rounded-[24px] border border-dashed border-[var(--border-strong)] bg-[var(--panel-subtle)] p-6 text-sm leading-7 text-[var(--muted-foreground)]">
                  No unscheduled tasks match this view.
                </div>
              )}
            </div>

            <div className="grid gap-3 rounded-[24px] border border-[var(--border)] bg-[var(--panel-subtle)] p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Conflict radar</p>
                <CircleAlert className="h-4 w-4 text-[var(--danger)]" />
              </div>
              {overloadedDays.length ? (
                overloadedDays.map((day) => (
                  <div key={day.date} className="flex items-center justify-between text-sm">
                    <span>{format(parseISO(day.date), "EEEE, MMM d")}</span>
                    <span className="font-medium text-[var(--danger)]">
                      {formatMinutes(Math.abs(day.remainingMinutes))} over
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-6 text-[var(--muted-foreground)]">
                  No overbooked days in the visible range.
                </p>
              )}
            </div>
          </section>
        </aside>

        <section className="relative rounded-[32px] border border-[var(--border)] bg-white/94 p-4 shadow-[var(--shadow-soft)] lg:p-5">
          <div className="mb-4 grid gap-3 md:grid-cols-3">
            {plannerData.capacity.map((day) => (
              <DayChip
                key={day.date}
                day={day}
                active={isToday(parseISO(day.date))}
              />
            ))}
          </div>
          <div className="rounded-[28px] border border-[var(--border)] bg-[var(--panel-subtle)] p-2">
            <FullCalendar
              ref={calendarRef}
              plugins={[timeGridPlugin, interactionPlugin, listPlugin]}
              initialView={activeView}
              headerToolbar={false}
              height="auto"
              editable
              selectable
              selectMirror
              eventResizableFromStart
              droppable={!isMobile}
              nowIndicator
              allDaySlot={false}
              slotDuration={`00:${String(plannerData.settings.slotMinutes).padStart(2, "0")}:00`}
              slotMinTime="06:00:00"
              slotMaxTime="22:00:00"
              firstDay={plannerData.settings.weekStart}
              eventTimeFormat={{
                hour: "numeric",
                minute: "2-digit",
                meridiem: "short",
              }}
              events={calendarEvents}
              datesSet={handleDatesSet}
              eventClick={handleEventClick}
              eventReceive={handleTaskReceive}
              eventDrop={handleCalendarMove}
              eventResize={handleCalendarMove}
              select={handleCalendarSelect}
            />
          </div>

          {isPending ? (
            <div className="absolute right-8 top-8 rounded-full bg-[var(--foreground-strong)] px-3 py-2 text-xs font-medium text-white shadow-lg">
              Updating planner...
            </div>
          ) : null}
        </section>
      </main>

      <EditorDrawer
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
        onToggleTask={(taskId, status) => {
          markTaskStatus(taskId, status);
          startTransition(async () => {
            try {
              await requestJson(`/api/tasks/${taskId}`, {
                method: "PATCH",
                body: JSON.stringify({ status }),
              });
              toast.success(status === "done" ? "Task completed" : "Task reopened");
              await refreshPlanner();
            } catch (error) {
              await refreshPlanner();
              toast.error(error instanceof Error ? error.message : "Could not update task");
            }
          });
        }}
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

      <QuickAddDialog
        key={`${quickAddKind ?? "closed"}:${quickAddDefaults.startsAt ?? ""}:${quickAddDefaults.endsAt ?? ""}`}
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

      {helpOpen ? <KeyboardShortcuts onClose={() => setHelpOpen(false)} /> : null}
    </div>
  );
}

type MetricCardProps = {
  icon: ReactNode;
  label: string;
  value: string;
  tone: "neutral" | "accent" | "danger";
};

function MetricCard({ icon, label, value, tone }: MetricCardProps) {
  return (
    <div className="rounded-[22px] border border-[var(--border)] bg-[var(--panel-subtle)] p-4">
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full",
            tone === "accent" && "bg-[var(--accent-soft)] text-[var(--accent-stronger)]",
            tone === "danger" && "bg-[var(--danger-soft)] text-[var(--danger)]",
            tone === "neutral" && "bg-white text-[var(--muted-foreground)]",
          )}
        >
          {icon}
        </span>
        <p className="text-2xl font-semibold tracking-[-0.04em]">{value}</p>
      </div>
      <p className="mt-3 text-sm text-[var(--muted-foreground)]">{label}</p>
    </div>
  );
}

function DayChip({ day, active }: { day: DayCapacity; active: boolean }) {
  return (
    <div
      className={cn(
        "rounded-[24px] border px-4 py-3",
        active
          ? "border-[var(--accent-strong)] bg-[var(--accent-soft)]"
          : "border-[var(--border)] bg-white/85",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
            {format(parseISO(day.date), "EEE")}
          </p>
          <p className="text-base font-semibold">{format(parseISO(day.date), "MMM d")}</p>
        </div>
        {day.overloaded ? <Badge tone="danger">Over</Badge> : <Badge tone="success">Open</Badge>}
      </div>
      <div className="mt-3 grid gap-2 text-sm text-[var(--muted-foreground)]">
        <div className="flex items-center justify-between">
          <span>Tasks</span>
          <span>{formatMinutes(day.scheduledTaskMinutes)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Meetings</span>
          <span>{formatMinutes(day.fixedEventMinutes)}</span>
        </div>
      </div>
    </div>
  );
}

type EditorDrawerProps = {
  drawerState: DrawerState;
  onClose: () => void;
  task: PlannerTask | null;
  block: PlannerCalendarItem | null;
  event: EventRecord | null;
  plannerData: PlannerPayload;
  onSaveTask: (taskId: string, input: Partial<NewTaskInput> & { status?: "todo" | "done" }) => void;
  onDeleteTask: (taskId: string) => void;
  onToggleTask: (taskId: string, status: "todo" | "done") => void;
  onUnscheduleTask: (blockId: string) => void;
  onSaveEvent: (eventId: string, input: Partial<EventRecord>) => void;
  onDeleteEvent: (eventId: string) => void;
  onSaveSettings: (input: UpdateSettingsInput) => void;
};

function EditorDrawer({
  drawerState,
  onClose,
  task,
  block,
  event,
  plannerData,
  onSaveTask,
  onDeleteTask,
  onToggleTask,
  onUnscheduleTask,
  onSaveEvent,
  onDeleteEvent,
  onSaveSettings,
}: EditorDrawerProps) {
  const open = Boolean(drawerState);

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-0 z-30 bg-[rgba(20,22,18,0.12)] transition",
        open ? "opacity-100" : "opacity-0",
      )}
    >
      <div
        className={cn(
          "pointer-events-auto absolute inset-y-0 right-0 w-full max-w-[420px] overflow-y-auto border-l border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_40px_120px_-48px_rgba(23,23,23,0.5)] transition duration-300",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
              {drawerState?.type === "task"
                ? "Task details"
                : drawerState?.type === "event"
                  ? "Event details"
                  : drawerState?.type === "settings"
                    ? "Planning settings"
                    : ""}
            </p>
          </div>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>

        {drawerState?.type === "task" && task ? (
          <TaskEditor
            key={`${task.id}:${block?.sourceId ?? "inbox"}`}
            task={task}
            block={block}
            plannerData={plannerData}
            onSave={(input) => onSaveTask(task.id, input)}
            onDelete={() => onDeleteTask(task.id)}
            onToggle={(status) => onToggleTask(task.id, status)}
            onUnschedule={() => (block ? onUnscheduleTask(block.sourceId) : undefined)}
          />
        ) : null}

        {drawerState?.type === "event" && event ? (
          <EventEditor
            key={event.id}
            event={event}
            onSave={(input) => onSaveEvent(event.id, input)}
            onDelete={() => onDeleteEvent(event.id)}
          />
        ) : null}

        {drawerState?.type === "settings" ? (
          <SettingsEditor
            key={plannerData.settings.updatedAt}
            settings={plannerData.settings}
            onSave={onSaveSettings}
          />
        ) : null}
      </div>
      {open ? <button type="button" className="absolute inset-0 -z-10" onClick={onClose} /> : null}
    </div>
  );
}

function TaskEditor({
  task,
  block,
  plannerData,
  onSave,
  onDelete,
  onToggle,
  onUnschedule,
}: {
  task: PlannerTask;
  block: PlannerCalendarItem | null;
  plannerData: PlannerPayload;
  onSave: (input: Partial<NewTaskInput> & { status?: "todo" | "done" }) => void;
  onDelete: () => void;
  onToggle: (status: "todo" | "done") => void;
  onUnschedule: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes);
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [estimatedMinutes, setEstimatedMinutes] = useState(task.estimatedMinutes);
  const [dueAt, setDueAt] = useState(toDateTimeInput(task.dueAt));
  const [startsAt, setStartsAt] = useState(toDateTimeInput(block?.start ?? null));
  const [endsAt, setEndsAt] = useState(toDateTimeInput(block?.end ?? null));
  const [preferredTimeBand, setPreferredTimeBand] = useState<PreferredTimeBand>(
    task.preferredTimeBand,
  );
  const [preferredWindowStart, setPreferredWindowStart] = useState(
    task.preferredWindowStart ?? "",
  );
  const [preferredWindowEnd, setPreferredWindowEnd] = useState(
    task.preferredWindowEnd ?? "",
  );
  const [areaId, setAreaId] = useState(task.areaId ?? "");
  const [projectId, setProjectId] = useState(task.projectId ?? "");
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

  return (
    <div className="grid gap-5">
      <div className="flex items-center gap-2">
        <Button
          variant={task.status === "done" ? "outline" : "solid"}
          onClick={() => onToggle(task.status === "done" ? "todo" : "done")}
        >
          {task.status === "done" ? "Reopen task" : "Mark complete"}
        </Button>
        {block ? (
          <Button variant="outline" onClick={onUnschedule}>
            Move to inbox
          </Button>
        ) : null}
      </div>

      <Field label="Title">
        <Input value={title} onChange={(event) => setTitle(event.target.value)} />
      </Field>

      <Field label="Notes">
        <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Priority">
          <Select value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>
            {PRIORITIES.map((item) => (
              <option key={item} value={item}>
                {PRIORITY_LABELS[item]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Estimated duration">
          <Input
            type="number"
            min={15}
            step={15}
            value={estimatedMinutes}
            onChange={(event) => setEstimatedMinutes(Number(event.target.value))}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Due date">
          <Input
            type="datetime-local"
            value={dueAt}
            onChange={(event) => setDueAt(event.target.value)}
          />
        </Field>
        <Field label="Preferred band">
          <Select
            value={preferredTimeBand}
            onChange={(event) =>
              setPreferredTimeBand(event.target.value as PreferredTimeBand)
            }
          >
            {TIME_BANDS.map((item) => (
              <option key={item} value={item}>
                {TIME_BAND_LABELS[item]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Preferred window start">
          <Input
            type="time"
            value={preferredWindowStart}
            onChange={(event) => setPreferredWindowStart(event.target.value)}
          />
        </Field>
        <Field label="Preferred window end">
          <Input
            type="time"
            value={preferredWindowEnd}
            onChange={(event) => setPreferredWindowEnd(event.target.value)}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Scheduled start">
          <Input
            type="datetime-local"
            value={startsAt}
            onChange={(event) => setStartsAt(event.target.value)}
          />
        </Field>
        <Field label="Scheduled end">
          <Input
            type="datetime-local"
            value={endsAt}
            onChange={(event) => setEndsAt(event.target.value)}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Area">
          <Select value={areaId} onChange={(event) => setAreaId(event.target.value)}>
            <option value="">No area</option>
            {plannerData.areas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Project">
          <Select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
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
      </div>

      <Field label="Tags">
        <div className="flex flex-wrap gap-2">
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
                  "rounded-full border px-3 py-2 text-xs font-medium uppercase tracking-[0.16em]",
                  active
                    ? "border-[var(--accent-strong)] bg-[var(--accent-soft)] text-[var(--accent-stronger)]"
                    : "border-[var(--border)] bg-white text-[var(--muted-foreground)]",
                )}
              >
                {tag.name}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Checklist">
        <div className="grid gap-2 rounded-[24px] border border-[var(--border)] bg-white p-4">
          {checklist.map((item, index) => (
            <div key={item.id ?? `${index}-${item.label}`} className="flex items-center gap-3">
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
              />
              <Button
                variant="ghost"
                onClick={() =>
                  setChecklist((current) =>
                    current.filter((_, entryIndex) => entryIndex !== index),
                  )
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            onClick={() =>
              setChecklist((current) => [
                ...current,
                { label: "", completed: false },
              ])
            }
          >
            Add checklist item
          </Button>
        </div>
      </Field>

      <RecurrenceFields recurrence={recurrence} onChange={setRecurrence} />

      <div className="flex flex-wrap justify-between gap-3 border-t border-[var(--border)] pt-4">
        <Button variant="danger" onClick={onDelete}>
          Delete task
        </Button>
        <Button
          onClick={() =>
            onSave({
              title,
              notes,
              priority,
              estimatedMinutes,
              dueAt: dueAt ? new Date(dueAt).toISOString() : null,
              preferredTimeBand,
              preferredWindowStart: preferredWindowStart || null,
              preferredWindowEnd: preferredWindowEnd || null,
              areaId: areaId || null,
              projectId: projectId || null,
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

  return (
    <div className="grid gap-5">
      <Field label="Title">
        <Input value={title} onChange={(event) => setTitle(event.target.value)} />
      </Field>
      <Field label="Notes">
        <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
      </Field>
      <Field label="Location">
        <Input value={location} onChange={(event) => setLocation(event.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Start">
          <Input
            type="datetime-local"
            value={startsAt}
            onChange={(event) => setStartsAt(event.target.value)}
          />
        </Field>
        <Field label="End">
          <Input
            type="datetime-local"
            value={endsAt}
            onChange={(event) => setEndsAt(event.target.value)}
          />
        </Field>
      </div>
      <RecurrenceFields recurrence={recurrence} onChange={setRecurrence} />
      <div className="flex flex-wrap justify-between gap-3 border-t border-[var(--border)] pt-4">
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
    <div className="grid gap-5">
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
        <div className="grid gap-3 rounded-[24px] border border-[var(--border)] bg-white p-4">
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
    <div className="grid gap-4 rounded-[24px] border border-[var(--border)] bg-[var(--panel-subtle)] p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Recurrence</p>
          <p className="text-sm text-[var(--muted-foreground)]">{recurrenceLabel(recurrence)}</p>
        </div>
        <Badge tone="neutral">Simple rules</Badge>
      </div>

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
                    "rounded-full border px-3 py-2 text-xs font-medium uppercase tracking-[0.16em]",
                    active
                      ? "border-[var(--accent-strong)] bg-[var(--accent-soft)] text-[var(--accent-stronger)]"
                      : "border-[var(--border)] bg-white text-[var(--muted-foreground)]",
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
          />
        </Field>
      ) : null}
    </div>
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
  const fallbackStart = new Date();
  const fallbackEnd = new Date(fallbackStart.getTime() + 60 * 60 * 1000);
  const [taskTitle, setTaskTitle] = useState("");
  const [eventTitle, setEventTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [location, setLocation] = useState("");
  const [startsAt, setStartsAt] = useState(
    toDateTimeInput(defaults.startsAt ?? fallbackStart.toISOString()),
  );
  const [endsAt, setEndsAt] = useState(
    toDateTimeInput(defaults.endsAt ?? fallbackEnd.toISOString()),
  );
  const [projectName, setProjectName] = useState("");
  const [areaName, setAreaName] = useState("");
  const [tagName, setTagName] = useState("");
  const [taskPriority, setTaskPriority] = useState<Priority>("medium");
  const [estimatedMinutes, setEstimatedMinutes] = useState(60);
  const [projectAreaId, setProjectAreaId] = useState("");

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

  return (
    <div className="fixed inset-0 z-40 bg-[rgba(22,24,18,0.18)]">
      <div className="absolute inset-x-0 top-10 mx-auto w-full max-w-xl rounded-[32px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_40px_120px_-48px_rgba(23,23,23,0.45)]">
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
            <Field label="Task name">
              <Input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} />
            </Field>
            <Field label="Notes">
              <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
            </Field>
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
                  onChange={(event) => setEstimatedMinutes(Number(event.target.value))}
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Start">
                <Input
                  type="datetime-local"
                  value={startsAt}
                  onChange={(event) => setStartsAt(event.target.value)}
                />
              </Field>
              <Field label="End">
                <Input
                  type="datetime-local"
                  value={endsAt}
                  onChange={(event) => setEndsAt(event.target.value)}
                />
              </Field>
            </div>
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
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Start">
                <Input
                  type="datetime-local"
                  value={startsAt}
                  onChange={(event) => setStartsAt(event.target.value)}
                />
              </Field>
              <Field label="End">
                <Input
                  type="datetime-local"
                  value={endsAt}
                  onChange={(event) => setEndsAt(event.target.value)}
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
            onClick={() => {
              if (open === "task") {
                onSubmit("task", {
                  title: taskTitle,
                  notes,
                  priority: taskPriority,
                  estimatedMinutes,
                  startsAt: startsAt ? new Date(startsAt).toISOString() : null,
                  endsAt: endsAt ? new Date(endsAt).toISOString() : null,
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
            Add
          </Button>
        </div>
      </div>
    </div>
  );
}

function KeyboardShortcuts({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-[rgba(22,24,18,0.18)]">
      <div className="absolute inset-x-0 top-16 mx-auto w-full max-w-md rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_40px_120px_-48px_rgba(23,23,23,0.45)]">
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
          {[
            ["N", "New task"],
            ["E", "New event"],
            ["D", "Switch to day view"],
            ["W", "Switch to week view"],
            ["?", "Toggle this help"],
          ].map(([key, label]) => (
            <div
              key={key}
              className="flex items-center justify-between rounded-[18px] border border-[var(--border)] bg-white px-4 py-3"
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
