"use client";

import {
  Fragment,
  type ReactNode,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfDay,
  format,
  isToday,
  isWeekend,
  parseISO,
  startOfDay,
} from "date-fns";
import type { DateRange } from "react-day-picker";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CalendarClock,
  CheckCircle2,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Target,
  TrendingDown,
  Trash2,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ProjectNotesNotebook } from "@/components/planner/project-notes-notebook";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  TASK_STATUS_LABELS,
  type AreaRecord,
  type NewMilestoneInput,
  type PlannerMilestone,
  type PlannerTask,
  type Priority,
  type ProjectPlan,
  type ProjectStatus,
  type TaskStatus,
  type UpdateMilestoneInput,
  type UpdateProjectInput,
  type UpdateTaskInput,
} from "@/lib/planner/types";
import { cn } from "@/lib/utils";
import { Icon } from "@iconify/react";

export type ProjectPlanningSurface = "plan" | "timeline" | "charts" | "notes";

const MIN_TIMELINE_DAY_WIDTH = 42;
const LABEL_WIDTH = 240;
const MIN_TIMELINE_WIDTH = 760;
const GANTT_DESCRIPTION_LIMIT = 118;
const COMPACT_MILESTONE_BAR_WIDTH = 156;
const CHART_COLORS = {
  accent: "#3b82f6",
  accentSoft: "#93c5fd",
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#fb7185",
  muted: "#94a3b8",
};

function normalizeTaskSearchValue(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_-]+/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function levenshteinDistance(left: string, right: string) {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array.from({ length: right.length + 1 }, () => 0);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + substitutionCost,
      );
    }

    for (let index = 0; index < previous.length; index += 1) {
      previous[index] = current[index];
    }
  }

  return previous[right.length];
}

function fuzzyIncludesTaskTerm(haystack: string, needle: string) {
  if (!needle) return true;
  if (haystack.includes(needle)) return true;

  const maxDistance = needle.length <= 4 ? 1 : Math.min(2, Math.ceil(needle.length * 0.24));

  if (levenshteinDistance(haystack, needle) <= maxDistance) {
    return true;
  }

  if (needle.length > haystack.length) {
    return levenshteinDistance(haystack, needle) <= maxDistance;
  }

  for (let index = 0; index <= haystack.length - needle.length; index += 1) {
    const segment = haystack.slice(index, index + needle.length);
    if (levenshteinDistance(segment, needle) <= maxDistance) {
      return true;
    }
  }

  return false;
}

function taskMatchesProjectSearch(taskTitle: string, query: string) {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return true;

  const normalizedTitle = normalizeTaskSearchValue(taskTitle);
  const normalizedQuery = normalizeTaskSearchValue(trimmedQuery);
  const normalizedTerms = trimmedQuery
    .split(/\s+/)
    .map(normalizeTaskSearchValue)
    .filter(Boolean);

  return (
    fuzzyIncludesTaskTerm(normalizedTitle, normalizedQuery) ||
    normalizedTerms.every((term) => fuzzyIncludesTaskTerm(normalizedTitle, term))
  );
}

function normalizeMilestoneSummaryText(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[`*_>#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateText(value: string, maxLength: number) {
  const text = value.trim();

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function summarizeMilestoneDescription(description: string) {
  const normalized = normalizeMilestoneSummaryText(description);

  if (!normalized) {
    return "Milestone without a short brief yet.";
  }

  const sentence = normalized.match(/^[^.!?]+[.!?]/)?.[0]?.trim() ?? "";
  const candidate =
    sentence && sentence.length <= GANTT_DESCRIPTION_LIMIT + 24
      ? sentence
      : normalized;

  return truncateText(candidate, GANTT_DESCRIPTION_LIMIT);
}
const RESPONSIVE_CHART_INITIAL_DIMENSION = { width: 1, height: 1 };

type ProjectPlanningModuleProps = {
  projectPlans: ProjectPlan[];
  areas: AreaRecord[];
  activeProjectId: string;
  surface: ProjectPlanningSurface;
  isPending: boolean;
  onOpenTask: (taskId: string) => void;
  onOpenNewTask: (defaults?: { projectId?: string; milestoneId?: string | null }) => void;
  onOpenNewProject: () => void;
  milestoneComposerOpen: boolean;
  githubRepoUrls: Record<string, string>;
  onOpenMilestoneComposer: () => void;
  onCloseMilestoneComposer: () => void;
  onCreateMilestone: (input: NewMilestoneInput) => Promise<void>;
  onUpdateMilestone: (
    milestoneId: string,
    input: UpdateMilestoneInput,
  ) => Promise<void>;
  onDeleteMilestone: (milestoneId: string) => Promise<void>;
  onUpdateProject: (projectId: string, input: UpdateProjectInput) => Promise<void>;
  onUpdateProjectGithubRepo: (projectId: string, repoUrl: string) => void;
  onUpdateTask: (taskId: string, input: UpdateTaskInput) => Promise<void>;
};

type MilestoneComposerState = {
  projectId: string;
  name: string;
  description: string;
  startDate: string;
  deadline: string;
};

type DragState = {
  milestoneId: string;
  mode: "move" | "start" | "end";
  pointerStartX: number;
  startDate: string;
  deadline: string;
};

type MilestoneEditorState = {
  milestoneId: string;
  projectId: string;
  name: string;
  description: string;
  startDate: string;
  deadline: string;
};

type ProjectEditorState = {
  projectId: string;
  name: string;
  areaId: string;
  color: string;
  status: ProjectStatus;
  deadlineAt: string;
  githubRepoUrl: string;
};

function toInputDate(value: string) {
  return format(parseISO(value), "yyyy-MM-dd");
}

function dateInputToIso(value: string) {
  return `${value}T12:00:00.000Z`;
}

function MilestoneDatePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const selected = value ? parseISO(`${value}T12:00:00`) : undefined;
  const hasValidDate = selected && !isNaN(selected.getTime());

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-10 w-full justify-start bg-[var(--surface-muted)] px-3 text-left font-normal",
            !hasValidDate && "text-[var(--muted-foreground)]",
          )}
        >
          <CalendarClock className="mr-2 h-4 w-4 opacity-70" />
          {hasValidDate ? format(selected, "MMM d, yyyy") : "Pick date"}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        collisionPadding={16}
        className="z-[70] w-auto overflow-hidden rounded-[24px] border border-[var(--border-strong)] bg-[var(--surface-elevated)] p-0 shadow-[var(--shadow-float)]"
      >
        <Calendar
          mode="single"
          selected={hasValidDate ? selected : undefined}
          onSelect={(date) => {
            if (date) {
              onChange(format(date, "yyyy-MM-dd"));
            }
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

function dateToInputValue(date: Date | undefined) {
  return date && !Number.isNaN(date.getTime()) ? format(date, "yyyy-MM-dd") : "";
}

function inputDateToDate(value: string) {
  const parsed = parseISO(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function formatRangeLabel(startDate: string, deadline: string) {
  const start = parseISO(startDate);
  const end = parseISO(deadline);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "Set dates";
  }

  if (format(start, "yyyy") === format(end, "yyyy")) {
    return `${format(start, "MMM d")} - ${format(end, "MMM d")}`;
  }

  return `${format(start, "MMM d, yyyy")} - ${format(end, "MMM d, yyyy")}`;
}

function InlineMilestoneRangePicker({
  milestone,
  disabled,
  onChange,
}: {
  milestone: PlannerMilestone;
  disabled?: boolean;
  onChange: (input: Pick<UpdateMilestoneInput, "startDate" | "deadline">) => Promise<void>;
}) {
  const milestoneRange = useMemo(
    () => ({
      from: parseISO(milestone.startDate),
      to: parseISO(milestone.deadline),
    }),
    [milestone.deadline, milestone.startDate],
  );
  const [open, setOpen] = useState(false);
  const [draftRange, setDraftRange] = useState<DateRange | undefined>(milestoneRange);

  const startInput = dateToInputValue(draftRange?.from);
  const endInput = dateToInputValue(draftRange?.to);

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setDraftRange(milestoneRange);
        }
        setOpen(nextOpen);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={`Edit ${milestone.name} dates`}
          className="inline-flex h-8 min-w-[9rem] items-center justify-center gap-1.5 rounded-md border border-transparent px-2 text-xs font-medium text-[var(--muted-foreground)] transition hover:border-[var(--border)] hover:bg-[var(--surface)] hover:text-[var(--foreground-strong)] disabled:cursor-not-allowed disabled:opacity-60"
          onClick={(event) => event.stopPropagation()}
        >
          <CalendarClock className="h-3.5 w-3.5" />
          {formatRangeLabel(milestone.startDate, milestone.deadline)}
        </button>
      </PopoverTrigger>
      <PopoverContent
        data-testid={`milestone-date-popover-${milestone.id}`}
        align="end"
        sideOffset={8}
        onClick={(event) => event.stopPropagation()}
        className="z-[70] w-auto overflow-hidden rounded-[18px] border border-[var(--border-strong)] bg-[var(--surface-elevated)] p-0 shadow-[var(--shadow-float)]"
      >
        <div className="grid gap-3 border-b border-[var(--border)] p-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Start">
              <Input
                type="date"
                aria-label={`Start date for ${milestone.name}`}
                value={startInput}
                className="h-8 rounded-md text-xs"
                onChange={(event) => {
                  const from = inputDateToDate(event.target.value);
                  setDraftRange((current) => ({
                    from,
                    to: current?.to ?? from,
                  }));
                }}
              />
            </Field>
            <Field label="End">
              <Input
                type="date"
                aria-label={`End date for ${milestone.name}`}
                value={endInput}
                className="h-8 rounded-md text-xs"
                onChange={(event) => {
                  const to = inputDateToDate(event.target.value);
                  setDraftRange((current) => ({
                    from: current?.from ?? to,
                    to,
                  }));
                }}
              />
            </Field>
          </div>
        </div>
        <Calendar
          mode="range"
          selected={draftRange}
          onSelect={setDraftRange}
          defaultMonth={draftRange?.from}
          initialFocus
          className="p-3"
        />
        <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] p-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!draftRange?.from || !draftRange?.to}
            onClick={async () => {
              if (!draftRange?.from || !draftRange.to) {
                return;
              }

              const from = startOfDay(draftRange.from);
              const to = startOfDay(draftRange.to);
              const start = from <= to ? from : to;
              const end = from <= to ? to : from;
              await onChange({
                startDate: dateInputToIso(format(start, "yyyy-MM-dd")),
                deadline: dateInputToIso(format(end, "yyyy-MM-dd")),
              });
              setOpen(false);
            }}
          >
            Save dates
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function InlineTaskDuePicker({
  task,
  onChange,
}: {
  task: PlannerTask;
  onChange: (dueAt: string | null) => Promise<void>;
}) {
  const selected = task.dueAt ? parseISO(task.dueAt) : undefined;
  const hasValidDate = selected && !Number.isNaN(selected.getTime());
  const selectedInput = hasValidDate ? dateToInputValue(selected) : "";
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Edit due date for ${task.title}`}
          className={cn(
            "justify-self-end rounded-md px-2.5 py-1 text-xs font-medium transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground-strong)]",
            taskDueLabel(task) === "Today"
              ? "border border-[rgba(245,158,11,0.28)] bg-[rgba(245,158,11,0.08)] text-[color:#d97706] dark:text-[color:#fbbf24]"
              : "text-[var(--muted-foreground)]",
          )}
          onClick={(event) => event.stopPropagation()}
        >
          {taskDueLabel(task)}
        </button>
      </PopoverTrigger>
      <PopoverContent
        data-testid={`task-due-popover-${task.id}`}
        align="end"
        sideOffset={8}
        onClick={(event) => event.stopPropagation()}
        className="z-[70] w-auto overflow-hidden rounded-[18px] border border-[var(--border-strong)] bg-[var(--surface-elevated)] p-0 shadow-[var(--shadow-float)]"
      >
        <div className="border-b border-[var(--border)] p-3">
          <Field label="Due date">
            <Input
              type="date"
              aria-label={`Due date for ${task.title}`}
              value={selectedInput}
              className="h-8 rounded-md text-xs"
              onChange={async (event) => {
                const date = inputDateToDate(event.target.value);
                if (!date) {
                  return;
                }

                await onChange(dateInputToIso(format(date, "yyyy-MM-dd")));
                setOpen(false);
              }}
            />
          </Field>
        </div>
        <Calendar
          mode="single"
          selected={hasValidDate ? selected : undefined}
          onSelect={async (date) => {
            if (!date) {
              return;
            }

            await onChange(dateInputToIso(format(date, "yyyy-MM-dd")));
            setOpen(false);
          }}
          initialFocus
          className="p-3"
        />
        <div className="flex items-center justify-end border-t border-[var(--border)] p-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={async () => {
              await onChange(null);
              setOpen(false);
            }}
          >
            Clear deadline
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

const STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> = [
  { value: "todo", label: TASK_STATUS_LABELS.todo },
  { value: "in_progress", label: "Doing" },
  { value: "review", label: TASK_STATUS_LABELS.review },
  { value: "qa", label: TASK_STATUS_LABELS.qa },
  { value: "done", label: TASK_STATUS_LABELS.done },
];

function InlineTaskStatusPicker({
  task,
  onChange,
}: {
  task: PlannerTask;
  onChange: (status: TaskStatus) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Change status for ${task.title}`}
          className={cn(
            "flex h-8 items-center justify-between rounded-md border px-2.5 text-left text-xs font-medium shadow-sm",
            statusClassName(task.status),
          )}
          onClick={(event) => event.stopPropagation()}
        >
          {statusLabel(task.status)}
          <Icon icon="solar:alt-arrow-down-linear" width="14" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        data-testid={`task-status-popover-${task.id}`}
        align="end"
        sideOffset={8}
        onClick={(event) => event.stopPropagation()}
        className="z-[70] w-40 rounded-[16px] border border-[var(--border-strong)] bg-[var(--surface-elevated)] p-1.5 shadow-[var(--shadow-soft)]"
      >
        {STATUS_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className="flex w-full items-center justify-between rounded-[10px] px-2.5 py-2 text-left text-xs font-medium text-[var(--foreground-strong)] transition hover:bg-[var(--button-ghost-hover)]"
            onClick={async () => {
              await onChange(option.value);
              setOpen(false);
            }}
          >
            {option.label}
            {task.status === option.value ? (
              <Icon icon="solar:check-read-linear" width="14" />
            ) : null}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

const PRIORITY_OPTIONS: Array<{ value: Priority; label: string }> = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

function priorityLabel(priority: Priority) {
  return PRIORITY_OPTIONS.find((option) => option.value === priority)?.label ?? "Medium";
}

function InlineTaskPriorityPicker({
  task,
  onChange,
}: {
  task: PlannerTask;
  onChange: (priority: Priority) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const isUrgent = task.priority === "critical" || task.priority === "high";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Change priority for ${task.title}`}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-md text-[var(--muted-foreground)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground-strong)]",
            isUrgent && "text-[var(--danger)]",
          )}
          onClick={(event) => event.stopPropagation()}
        >
          <Icon
            icon={isUrgent ? "solar:shield-warning-linear" : "solar:flag-linear"}
            width="17"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        data-testid={`task-priority-popover-${task.id}`}
        align="end"
        sideOffset={8}
        onClick={(event) => event.stopPropagation()}
        className="z-[70] w-44 rounded-[16px] border border-[var(--border-strong)] bg-[var(--surface-elevated)] p-1.5 shadow-[var(--shadow-soft)]"
      >
        {PRIORITY_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className="flex w-full items-center justify-between rounded-[10px] px-2.5 py-2 text-left text-xs font-medium text-[var(--foreground-strong)] transition hover:bg-[var(--button-ghost-hover)]"
            onClick={async () => {
              await onChange(option.value);
              setOpen(false);
            }}
          >
            <span className="flex items-center gap-2">
              <Icon
                icon={option.value === "critical" || option.value === "high" ? "solar:shield-warning-linear" : "solar:flag-linear"}
                width="14"
                className={option.value === "critical" || option.value === "high" ? "text-[var(--danger)]" : "text-[var(--muted-foreground)]"}
              />
              {option.label}
            </span>
            {task.priority === option.value ? (
              <Icon icon="solar:check-read-linear" width="14" />
            ) : null}
          </button>
        ))}
        <div className="border-t border-[var(--border)] px-2.5 py-2 text-[11px] text-[var(--muted-foreground)]">
          Current: {priorityLabel(task.priority)}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function formatHours(minutes: number) {
  return `${Math.round(minutes / 60)}h`;
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function milestoneTone(health: PlannerMilestone["health"]) {
  switch (health) {
    case "done":
      return "success";
    case "at_risk":
      return "danger";
    case "on_track":
      return "accent";
    default:
      return "neutral";
  }
}

function milestoneFill(health: PlannerMilestone["health"]) {
  switch (health) {
    case "done":
      return CHART_COLORS.success;
    case "at_risk":
      return CHART_COLORS.danger;
    case "on_track":
      return CHART_COLORS.accent;
    default:
      return CHART_COLORS.muted;
  }
}

function clampMilestoneDates(
  startDate: string,
  deadline: string,
  rangeStart: string,
  rangeEnd: string,
) {
  let start = parseISO(startDate);
  let end = parseISO(deadline);
  const min = startOfDay(parseISO(rangeStart));
  const max = endOfDay(parseISO(rangeEnd));

  if (start < min) {
    const diff = differenceInCalendarDays(min, startOfDay(start));
    start = addDays(start, diff);
    end = addDays(end, diff);
  }

  if (end > max) {
    const diff = differenceInCalendarDays(startOfDay(end), startOfDay(max));
    start = addDays(start, -diff);
    end = addDays(end, -diff);
  }

  if (start < min) {
    start = min;
  }

  if (end <= start) {
    end = addDays(start, 1);
  }

  return {
    startDate: start.toISOString(),
    deadline: end.toISOString(),
  };
}

function shiftMilestone(
  startDate: string,
  deadline: string,
  deltaDays: number,
  mode: DragState["mode"],
  rangeStart: string,
  rangeEnd: string,
) {
  const originalStart = parseISO(startDate);
  const originalEnd = parseISO(deadline);
  let nextStart = originalStart;
  let nextEnd = originalEnd;

  if (mode === "move") {
    nextStart = addDays(originalStart, deltaDays);
    nextEnd = addDays(originalEnd, deltaDays);
  }

  if (mode === "start") {
    nextStart = addDays(originalStart, deltaDays);
    if (nextStart >= originalEnd) {
      nextStart = addDays(originalEnd, -1);
    }
  }

  if (mode === "end") {
    nextEnd = addDays(originalEnd, deltaDays);
    if (nextEnd <= originalStart) {
      nextEnd = addDays(originalStart, 1);
    }
  }

  return clampMilestoneDates(
    nextStart.toISOString(),
    nextEnd.toISOString(),
    rangeStart,
    rangeEnd,
  );
}

function ChartCard({
  title,
  caption,
  icon,
  children,
}: {
  title: string;
  caption?: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <article className="grid min-w-0 gap-4 rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-soft)]">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
            {title}
          </p>
          {caption ? (
            <p className="mt-1 text-[13px] leading-6 text-[var(--muted-foreground)]">
              {caption}
            </p>
          ) : null}
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--muted-foreground)]">
          {icon}
        </span>
      </div>
      {children}
    </article>
  );
}

function ProjectMemberStack() {
  return (
    <div className="flex items-center -space-x-1.5">
      <span className="z-30 flex h-7 w-7 items-center justify-center rounded-full border border-[var(--surface)] bg-[rgba(96,165,250,0.18)] text-[11px] font-semibold text-[var(--accent-strong)] shadow-sm">
        JD
      </span>
      <span className="z-20 flex h-7 w-7 items-center justify-center rounded-full border border-[var(--surface)] bg-[rgba(34,197,94,0.18)] text-[11px] font-semibold text-[var(--success)] shadow-sm">
        AL
      </span>
      <span className="z-10 flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)] text-[11px] font-semibold text-[var(--muted-foreground)]">
        +
      </span>
    </div>
  );
}

function taskOwnerInitials(task: PlannerTask, index: number) {
  const presets = ["JD", "AL", ""];

  if (presets[index % presets.length]) {
    return presets[index % presets.length];
  }

  return task.title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function TaskOwnerAvatar({ task, index }: { task: PlannerTask; index: number }) {
  const initials = taskOwnerInitials(task, index);

  if (!initials) {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)] text-[var(--muted-foreground)]">
        <Icon icon="solar:user-linear" width="13" />
      </span>
    );
  }

  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-muted)] text-[10px] font-semibold text-[var(--muted-foreground)] shadow-sm">
      {initials}
    </span>
  );
}

function statusLabel(status: PlannerTask["status"]) {
  if (status === "done") {
    return TASK_STATUS_LABELS.done;
  }

  if (status === "in_progress") {
    return "Doing";
  }

  return TASK_STATUS_LABELS[status];
}

function statusClassName(status: PlannerTask["status"]) {
  if (status === "done") {
    return "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--muted-foreground)]";
  }

  if (status === "in_progress") {
    return "border-[var(--border-strong)] bg-[var(--accent-soft)] text-[var(--accent-strong)]";
  }

  if (status === "review") {
    return "border-[rgba(124,58,237,0.28)] bg-[rgba(124,58,237,0.10)] text-[color:#7c3aed]";
  }

  if (status === "qa") {
    return "border-[rgba(14,165,233,0.28)] bg-[rgba(14,165,233,0.10)] text-[color:#0284c7]";
  }

  return "border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)]";
}

function taskDueLabel(task: PlannerTask) {
  if (!task.dueAt) {
    return "Set Date";
  }

  if (isToday(parseISO(task.dueAt))) {
    return "Today";
  }

  return format(parseISO(task.dueAt), "MMM d");
}

function MilestoneComposer({
  open,
  projectPlans,
  initialProjectId,
  onClose,
  onSubmit,
}: {
  open: boolean;
  projectPlans: ProjectPlan[];
  initialProjectId: string;
  onClose: () => void;
  onSubmit: (input: NewMilestoneInput) => Promise<void>;
}) {
  const [form, setForm] = useState<MilestoneComposerState>({
    projectId: initialProjectId,
    name: "",
    description: "",
    startDate: toInputDate(new Date().toISOString()),
    deadline: toInputDate(addDays(new Date(), 7).toISOString()),
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setForm({
      projectId: initialProjectId,
      name: "",
      description: "",
      startDate: toInputDate(new Date().toISOString()),
      deadline: toInputDate(addDays(new Date(), 7).toISOString()),
    });
  }, [initialProjectId, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-[var(--modal-backdrop)]">
      <div className="absolute inset-x-3 bottom-3 top-6 max-h-[calc(100svh-2.25rem)] overflow-y-auto rounded-[32px] border border-[var(--task-modal-border)] bg-[var(--task-modal-shell)] p-6 text-[var(--foreground)] shadow-[var(--shadow-float)] backdrop-blur-[14px] sm:inset-x-0 sm:top-10 sm:mx-auto sm:max-h-[calc(100svh-5rem)] sm:w-full sm:max-w-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
              Project Planning
            </p>
            <h3 className="mt-1 text-[1.45rem] font-semibold tracking-[-0.04em] text-[var(--foreground-strong)]">
              New milestone
            </h3>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="mt-5 grid gap-3">
          <Field label="Project">
              <Select
                value={form.projectId}
                onChange={(event) =>
                  setForm((current) => ({ ...current, projectId: event.target.value }))
                }
              className="h-10 rounded-[16px] bg-[var(--surface-muted)]"
            >
              {projectPlans.map((plan) => (
                <option key={plan.project.id} value={plan.project.id}>
                  {plan.project.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Milestone name">
            <Input
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              className="h-10 rounded-[16px] bg-[var(--surface-muted)]"
            />
          </Field>
          <Field label="Description / notes">
            <Textarea
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
              className="min-h-[96px] rounded-[18px] bg-[var(--surface-muted)]"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Start date">
              <MilestoneDatePicker
                value={form.startDate}
                onChange={(value) =>
                  setForm((current) => ({ ...current, startDate: value }))
                }
              />
            </Field>
            <Field label="Deadline">
              <MilestoneDatePicker
                value={form.deadline}
                onChange={(value) =>
                  setForm((current) => ({ ...current, deadline: value }))
                }
              />
            </Field>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-[var(--border)] pt-4">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={
                submitting ||
                !form.projectId ||
                !form.name.trim() ||
                !form.startDate ||
                !form.deadline
              }
              onClick={async () => {
                setSubmitting(true);
                try {
                  await onSubmit({
                    projectId: form.projectId,
                    name: form.name.trim(),
                    description: form.description.trim(),
                    startDate: dateInputToIso(form.startDate),
                    deadline: dateInputToIso(form.deadline),
                  });
                  onClose();
                } catch {
                  // Error toast is handled by the parent action.
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              Create milestone
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MilestoneTaskCard({
  taskTitle,
  meta,
  availability,
  onClick,
}: {
  taskTitle: string;
  meta: string;
  availability?: PlannerTask["availability"];
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-start justify-between gap-3 rounded-[16px] border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-left transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-elevated)]",
        availability === "later" && "bg-[var(--surface-muted)] opacity-80",
      )}
    >
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-semibold text-[var(--foreground-strong)]">
          {taskTitle}
        </span>
        <span className="mt-1 block text-[12px] text-[var(--muted-foreground)]">{meta}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {availability === "later" ? <Badge tone="neutral">Later</Badge> : null}
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
          Open
        </span>
      </span>
    </button>
  );
}

function MilestoneEditor({
  milestone,
  projectPlans,
  onClose,
  onSave,
  onDelete,
}: {
  milestone: MilestoneEditorState | null;
  projectPlans: ProjectPlan[];
  onClose: () => void;
  onSave: (milestoneId: string, input: UpdateMilestoneInput) => Promise<void>;
  onDelete: (milestoneId: string) => Promise<void>;
}) {
  const [form, setForm] = useState<MilestoneEditorState | null>(milestone);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setForm(milestone);
  }, [milestone]);

  if (!form) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-[var(--modal-backdrop)]">
      <div className="absolute inset-x-3 bottom-3 top-6 max-h-[calc(100svh-2.25rem)] overflow-y-auto rounded-[32px] border border-[var(--task-modal-border)] bg-[var(--task-modal-shell)] p-6 text-[var(--foreground)] shadow-[var(--shadow-float)] backdrop-blur-[14px] sm:inset-x-0 sm:top-10 sm:mx-auto sm:max-h-[calc(100svh-5rem)] sm:w-full sm:max-w-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
              Milestone
            </p>
            <h3 className="mt-1 text-[1.45rem] font-semibold tracking-[-0.04em] text-[var(--foreground-strong)]">
              Edit milestone
            </h3>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="mt-5 grid gap-3">
          <Field label="Project">
            <Select
              value={form.projectId}
              onChange={(event) =>
                setForm((current) =>
                  current ? { ...current, projectId: event.target.value } : current,
                )
              }
              className="h-10 rounded-[16px] bg-[var(--surface-muted)]"
            >
              {projectPlans.map((plan) => (
                <option key={plan.project.id} value={plan.project.id}>
                  {plan.project.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Milestone name">
            <Input
              value={form.name}
              onChange={(event) =>
                setForm((current) =>
                  current ? { ...current, name: event.target.value } : current,
                )
              }
              className="h-10 rounded-[16px] bg-[var(--surface-muted)]"
            />
          </Field>
          <Field label="Description / notes">
            <Textarea
              value={form.description}
              onChange={(event) =>
                setForm((current) =>
                  current ? { ...current, description: event.target.value } : current,
                )
              }
              className="min-h-[96px] rounded-[18px] bg-[var(--surface-muted)]"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Start date">
              <MilestoneDatePicker
                value={form.startDate}
                onChange={(value) =>
                  setForm((current) =>
                    current ? { ...current, startDate: value } : current,
                  )
                }
              />
            </Field>
            <Field label="Deadline">
              <MilestoneDatePicker
                value={form.deadline}
                onChange={(value) =>
                  setForm((current) =>
                    current ? { ...current, deadline: value } : current,
                  )
                }
              />
            </Field>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-4">
          <Button
            variant="ghost"
            size="sm"
            className="text-[color:#be123c] hover:bg-[rgba(225,29,72,0.08)] hover:text-[color:#9f1239] dark:text-[color:#fecdd3]"
            onClick={async () => {
              setSubmitting(true);
              try {
                await onDelete(form.milestoneId);
                onClose();
              } finally {
                setSubmitting(false);
              }
            }}
          >
            <Trash2 className="h-4 w-4" />
            Delete milestone
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={
                submitting ||
                !form.projectId ||
                !form.name.trim() ||
                !form.startDate ||
                !form.deadline
              }
              onClick={async () => {
                setSubmitting(true);
                try {
                  await onSave(form.milestoneId, {
                    projectId: form.projectId,
                    name: form.name.trim(),
                    description: form.description.trim(),
                    startDate: dateInputToIso(form.startDate),
                    deadline: dateInputToIso(form.deadline),
                  });
                  onClose();
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              Save changes
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProjectEditor({
  project,
  areas,
  githubRepoUrl,
  onClose,
  onSave,
  onSaveGithubRepo,
}: {
  project: ProjectPlan["project"] | null;
  areas: AreaRecord[];
  githubRepoUrl: string;
  onClose: () => void;
  onSave: (projectId: string, input: UpdateProjectInput) => Promise<void>;
  onSaveGithubRepo: (projectId: string, repoUrl: string) => void;
}) {
  const [form, setForm] = useState<ProjectEditorState | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setForm(
      project
        ? {
            projectId: project.id,
            name: project.name,
            areaId: project.areaId ?? "",
            color: project.color,
            status: project.status,
            deadlineAt: project.deadlineAt ? toInputDate(project.deadlineAt) : "",
            githubRepoUrl,
          }
        : null,
    );
  }, [githubRepoUrl, project]);

  if (!project || !form) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-[var(--modal-backdrop)]">
      <button
        type="button"
        className="absolute inset-0"
        onClick={onClose}
        aria-label="Close project details"
      />
      <div className="absolute inset-x-3 bottom-3 top-6 max-h-[calc(100svh-2.25rem)] overflow-y-auto rounded-[32px] border border-[var(--task-modal-border)] bg-[var(--task-modal-shell)] p-6 text-[var(--foreground)] shadow-[var(--shadow-float)] sm:inset-x-0 sm:top-10 sm:mx-auto sm:max-h-[calc(100svh-5rem)] sm:w-full sm:max-w-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
              Project
            </p>
            <h3 className="mt-1 text-[1.45rem] font-semibold tracking-[-0.04em] text-[var(--foreground-strong)]">
              Project details
            </h3>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="mt-5 grid gap-4">
          <div className="grid gap-3 rounded-[22px] border border-[var(--task-modal-border)] bg-[var(--task-modal-card)] p-4">
            <Field label="Project name">
              <Input
                value={form.name}
                onChange={(event) =>
                  setForm((current) =>
                    current ? { ...current, name: event.target.value } : current,
                  )
                }
                className="h-10 rounded-[16px] bg-[var(--task-modal-neutral)]"
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <Field label="Area">
                <Select
                  value={form.areaId}
                  onChange={(event) =>
                    setForm((current) =>
                      current ? { ...current, areaId: event.target.value } : current,
                    )
                  }
                  className="h-10 rounded-[16px] bg-[var(--task-modal-neutral)]"
                >
                  <option value="">No area</option>
                  {areas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Color">
                <Input
                  type="color"
                  value={form.color}
                  onChange={(event) =>
                    setForm((current) =>
                      current ? { ...current, color: event.target.value } : current,
                    )
                  }
                  className="h-10 w-20 rounded-[16px] bg-[var(--task-modal-neutral)] px-2"
                />
              </Field>
            </div>
          </div>

          <div className="grid gap-3 rounded-[22px] border border-[var(--task-modal-border)] bg-[var(--task-modal-card)] p-4 sm:grid-cols-2">
            <Field label="Status">
              <Select
                value={form.status}
                onChange={(event) =>
                  setForm((current) =>
                    current
                      ? { ...current, status: event.target.value as ProjectStatus }
                      : current,
                  )
                }
                className="h-10 rounded-[16px] bg-[var(--task-modal-neutral)]"
              >
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
              </Select>
            </Field>
            <Field label="Deadline">
              <Input
                type="date"
                value={form.deadlineAt}
                onChange={(event) =>
                  setForm((current) =>
                    current ? { ...current, deadlineAt: event.target.value } : current,
                  )
                }
                className="h-10 rounded-[16px] bg-[var(--task-modal-neutral)]"
              />
            </Field>
          </div>

          <div className="grid gap-3 rounded-[22px] border border-[var(--task-modal-border)] bg-[var(--task-modal-card)] p-4">
            <Field
              label="GitHub repository"
              description="Use org/repo or a GitHub repository URL. Task issue creation uses this link."
            >
              <Input
                value={form.githubRepoUrl}
                onChange={(event) =>
                  setForm((current) =>
                    current ? { ...current, githubRepoUrl: event.target.value } : current,
                  )
                }
                placeholder="https://github.com/org/repo"
                className="h-10 rounded-[16px] bg-[var(--task-modal-neutral)]"
              />
            </Field>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-[var(--border)] pt-4">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={submitting || !form.name.trim()}
            onClick={async () => {
              setSubmitting(true);
              try {
                await onSave(form.projectId, {
                  name: form.name.trim(),
                  areaId: form.areaId || null,
                  color: form.color,
                  status: form.status,
                  deadlineAt: form.deadlineAt
                    ? dateInputToIso(form.deadlineAt)
                    : null,
                });
                onSaveGithubRepo(form.projectId, form.githubRepoUrl);
                onClose();
              } finally {
                setSubmitting(false);
              }
            }}
          >
            Save project
          </Button>
        </div>
      </div>
    </div>
  );
}

function MilestoneActionMenu({
  milestone,
  onEdit,
  onDelete,
}: {
  milestone: PlannerMilestone;
  onEdit: () => void;
  onDelete: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  if (milestone.synthetic) {
    return null;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 rounded-full p-0">
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Open milestone actions</span>
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
            onEdit();
          }}
        >
          <Pencil className="h-4 w-4 text-[var(--muted-foreground)]" />
          Edit milestone
        </button>
        <button
          type="button"
          className="mt-1 flex w-full items-center gap-2 rounded-[12px] px-3 py-2 text-left text-[13px] font-medium text-[color:#be123c] transition hover:bg-[rgba(225,29,72,0.08)] dark:text-[color:#fecdd3]"
          onClick={async () => {
            setOpen(false);
            await onDelete();
          }}
        >
          <Trash2 className="h-4 w-4" />
          Remove milestone
        </button>
      </PopoverContent>
    </Popover>
  );
}

export function ProjectPlanningModule({
  projectPlans,
  areas,
  activeProjectId,
  surface,
  isPending,
  onOpenTask,
  onOpenNewTask,
  onOpenNewProject,
  milestoneComposerOpen,
  githubRepoUrls,
  onOpenMilestoneComposer,
  onCloseMilestoneComposer,
  onCreateMilestone,
  onUpdateMilestone,
  onDeleteMilestone,
  onUpdateProject,
  onUpdateProjectGithubRepo,
  onUpdateTask,
}: ProjectPlanningModuleProps) {
  const [activeTab, setActiveTab] = useState<ProjectPlanningSurface>(surface || "plan");
  const [projectTaskSearch, setProjectTaskSearch] = useState("");
  const deferredProjectTaskSearch = useDeferredValue(projectTaskSearch);
  const [expandedMilestoneId, setExpandedMilestoneId] = useState<string | null>(null);
  const [editorState, setEditorState] = useState<MilestoneEditorState | null>(null);
  const [projectEditorOpen, setProjectEditorOpen] = useState(false);
  const [draftMilestones, setDraftMilestones] = useState<
    Record<string, { startDate: string; deadline: string }>
  >({});
  const [dragState, setDragState] = useState<DragState | null>(null);
  const timelineViewportRef = useRef<HTMLDivElement | null>(null);
  const [timelineViewportWidth, setTimelineViewportWidth] = useState(0);

  const activeProject = useMemo(
    () =>
      projectPlans.find((plan) => plan.project.id === activeProjectId) ??
      projectPlans[0] ??
      null,
    [activeProjectId, projectPlans],
  );

  const timelineDays = useMemo(() => {
    if (!activeProject) {
      return [];
    }

    return eachDayOfInterval({
      start: startOfDay(parseISO(activeProject.scheduleRange.start)),
      end: startOfDay(parseISO(activeProject.scheduleRange.end)),
    });
  }, [activeProject]);

  const minimumTimelineWidth = Math.max(timelineDays.length * MIN_TIMELINE_DAY_WIDTH, MIN_TIMELINE_WIDTH);
  const availableTimelineWidth = Math.max(timelineViewportWidth - LABEL_WIDTH, 0);
  const timelineWidth = Math.ceil(Math.max(minimumTimelineWidth, availableTimelineWidth));
  const timelineDayWidth = timelineDays.length
    ? timelineWidth / timelineDays.length
    : MIN_TIMELINE_DAY_WIDTH;

  useEffect(() => {
    setExpandedMilestoneId(null);
    setEditorState(null);
    setProjectEditorOpen(false);
    setProjectTaskSearch("");
  }, [activeProjectId]);

  useEffect(() => {
    const element = timelineViewportRef.current;

    if (!element) {
      return;
    }

    const updateWidth = () => setTimelineViewportWidth(element.clientWidth);
    updateWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateWidth);
      return () => window.removeEventListener("resize", updateWidth);
    }

    const observer = new ResizeObserver((entries) => {
      const [entry] = entries;
      setTimelineViewportWidth(entry?.contentRect.width ?? element.clientWidth);
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [activeProjectId, activeTab, timelineDays.length]);

  useEffect(() => {
    if (!dragState) {
      return;
    }

    const currentDrag = dragState;

    if (!activeProject) {
      return;
    }

    const currentProject = activeProject;

    function handlePointerMove(event: PointerEvent) {
      const deltaDays = Math.round((event.clientX - currentDrag.pointerStartX) / timelineDayWidth);

      if (deltaDays === 0) {
        return;
      }

      const nextDates = shiftMilestone(
        currentDrag.startDate,
        currentDrag.deadline,
        deltaDays,
        currentDrag.mode,
        currentProject.scheduleRange.start,
        currentProject.scheduleRange.end,
      );

      setDraftMilestones((current) => ({
        ...current,
        [currentDrag.milestoneId]: nextDates,
      }));
    }

    async function handlePointerUp() {
      const draft = draftMilestones[currentDrag.milestoneId];
      setDragState(null);

      if (!draft) {
        return;
      }

      try {
        await onUpdateMilestone(currentDrag.milestoneId, draft);
      } catch {
        // Error toast is handled by the parent action.
      } finally {
        setDraftMilestones((current) => {
          const next = { ...current };
          delete next[currentDrag.milestoneId];
          return next;
        });
      }
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [activeProject, draftMilestones, dragState, onUpdateMilestone, timelineDayWidth]);

  const plottedMilestones = useMemo(
    () => activeProject?.plottedMilestones ?? [],
    [activeProject],
  );
  const normalizedProjectTaskSearch = deferredProjectTaskSearch.trim();
  const visibleProjectMilestones = useMemo(() => {
    if (!normalizedProjectTaskSearch) {
      return plottedMilestones;
    }

    return plottedMilestones
      .map((milestone) => ({
        ...milestone,
        tasks: milestone.tasks.filter((task) =>
          taskMatchesProjectSearch(task.title, normalizedProjectTaskSearch),
        ),
      }))
      .filter((milestone) => milestone.tasks.length > 0);
  }, [normalizedProjectTaskSearch, plottedMilestones]);
  const visibleProjectTaskCount = visibleProjectMilestones.reduce(
    (total, milestone) => total + milestone.tasks.length,
    0,
  );

  if (!projectPlans.length || !activeProject) {
    return (
      <section
        data-project-planning-module
        className="grid gap-4 rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)]"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
          Project Planning
        </p>
        <h2 className="text-[1.6rem] font-semibold tracking-[-0.04em] text-[var(--foreground-strong)]">
          Start by creating a project
        </h2>
        <p className="max-w-xl text-[14px] leading-7 text-[var(--muted-foreground)]">
          Projects drive milestones, Gantt planning, and portfolio analytics. Create one to
          begin plotting delivery windows and task rollups.
        </p>
        <div>
          <Button onClick={onOpenNewProject}>
            <Plus className="h-4 w-4" />
            New project
          </Button>
        </div>
      </section>
    );
  }

  const overallChartData = [
    { name: "Completed", value: activeProject.completionPercentage, fill: CHART_COLORS.success },
    {
      name: "Remaining",
      value: Math.max(100 - activeProject.completionPercentage, 0),
      fill: "rgba(148,163,184,0.18)",
    },
  ];
  const statusChartData = activeProject.statusBreakdown.map((entry) => ({
    ...entry,
    fill:
      entry.status === "done"
        ? CHART_COLORS.success
        : entry.status === "in_progress"
          ? CHART_COLORS.accent
          : entry.status === "review"
            ? "#8b5cf6"
            : entry.status === "qa"
              ? "#0ea5e9"
          : CHART_COLORS.warning,
  }));
  const milestoneChartData = plottedMilestones.map((milestone) => ({
    name: milestone.name,
    progress: milestone.completionPercentage,
  }));
  const projectHealthTone =
    activeProject.health === "at_risk"
      ? "danger"
      : activeProject.health === "done"
        ? "success"
        : "accent";
  const openMilestoneEditor = (milestone: PlannerMilestone) => {
    setEditorState({
      milestoneId: milestone.id,
      projectId: milestone.projectId,
      name: milestone.name,
      description: milestone.description,
      startDate: toInputDate(milestone.startDate),
      deadline: toInputDate(milestone.deadline),
    });
  };

  return (
    <section
      data-project-planning-module
      className="relative flex h-full flex-1 flex-col bg-[var(--background)]"
    >
      <MilestoneComposer
        open={milestoneComposerOpen}
        projectPlans={projectPlans}
        initialProjectId={activeProject.project.id}
        onClose={onCloseMilestoneComposer}
        onSubmit={onCreateMilestone}
      />
      <MilestoneEditor
        milestone={editorState}
        projectPlans={projectPlans}
        onClose={() => setEditorState(null)}
        onSave={onUpdateMilestone}
        onDelete={onDeleteMilestone}
      />
      <ProjectEditor
        project={projectEditorOpen ? activeProject.project : null}
        areas={areas}
        githubRepoUrl={githubRepoUrls[activeProject.project.id] ?? ""}
        onClose={() => setProjectEditorOpen(false)}
        onSave={onUpdateProject}
        onSaveGithubRepo={onUpdateProjectGithubRepo}
      />

      <header className="shrink-0 border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="flex min-h-14 flex-col items-stretch gap-3 px-4 py-3 sm:h-14 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-0">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="h-2 w-2 shrink-0 rounded-full border-2"
              style={{ borderColor: activeProject.project.color }}
            />
            <h1 className="truncate text-xl font-semibold tracking-[-0.02em] text-[var(--foreground-strong)]">
              {activeProject.project.name}
            </h1>
          </div>

          <div className="flex min-w-0 shrink-0 items-center gap-2 overflow-x-auto pb-0.5 sm:gap-2.5 sm:overflow-visible sm:pb-0">
            <button
              type="button"
              onClick={() => setProjectEditorOpen(true)}
              className="flex h-8 shrink-0 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-medium text-[var(--muted-foreground)] shadow-sm transition hover:border-[var(--border-strong)] hover:text-[var(--foreground-strong)]"
            >
              <Icon icon="solar:tuning-2-linear" width="16" />
              Project Details
            </button>
            <span className="hidden h-6 w-px bg-[var(--border)] sm:block" />
            <div className="shrink-0">
              <ProjectMemberStack />
            </div>
            <button
              type="button"
              aria-label="Share project"
              className="flex h-8 shrink-0 items-center gap-2 rounded-lg bg-[var(--button-solid-bg)] px-3 text-xs font-medium text-[var(--button-solid-fg)] shadow-sm transition hover:bg-[var(--button-solid-hover)]"
            >
              <Icon icon="solar:user-plus-linear" width="16" />
              Share
            </button>
          </div>
        </div>

        <div className="flex h-10 items-end overflow-x-auto px-4 sm:px-6">
          <nav className="flex h-full min-w-max items-end gap-6 sm:gap-8">
            <button
              onClick={() => setActiveTab("plan")}
              className={cn(
                "h-full border-b-2 text-sm font-medium transition-colors",
                activeTab === "plan"
                  ? "border-[var(--foreground-strong)] text-[var(--foreground-strong)]"
                  : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground-strong)]",
              )}
            >
              Project Design
            </button>
            <button
              onClick={() => setActiveTab("timeline")}
              className={cn(
                "h-full border-b-2 text-sm font-medium transition-colors",
                activeTab === "timeline"
                  ? "border-[var(--foreground-strong)] text-[var(--foreground-strong)]"
                  : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground-strong)]",
              )}
            >
              Gantt Chart
            </button>
            <button
              onClick={() => setActiveTab("charts")}
              className={cn(
                "h-full border-b-2 text-sm font-medium transition-colors",
                activeTab === "charts"
                  ? "border-[var(--foreground-strong)] text-[var(--foreground-strong)]"
                  : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground-strong)]",
              )}
            >
              Dashboard
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("notes")}
              className={cn(
                "h-full border-b-2 text-sm font-medium transition-colors",
                activeTab === "notes"
                  ? "border-[var(--foreground-strong)] text-[var(--foreground-strong)]"
                  : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground-strong)]",
              )}
            >
              Notes
            </button>
          </nav>
        </div>
      </header>

      {activeTab === "plan" ? (
        <div className="flex-1 overflow-y-auto bg-[var(--background)] px-4 pb-8 pt-4 sm:px-6 sm:py-5" style={{ scrollbarWidth: "thin" }}>
          <div className="mx-auto grid max-w-7xl gap-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-[var(--foreground-strong)]">
                Milestones & Tasks
              </h2>
              <div className="flex min-w-0 flex-1 justify-end">
                <label className="sr-only" htmlFor="project-task-search">
                  Search project tasks
                </label>
                <div className="relative w-full max-w-[360px]">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
                  <Input
                    id="project-task-search"
                    data-testid="project-task-search"
                    value={projectTaskSearch}
                    onChange={(event) => setProjectTaskSearch(event.target.value)}
                    placeholder="Search tasks"
                    className="h-9 rounded-lg border-[var(--border)] bg-[var(--surface)] pl-9 pr-9 text-sm shadow-sm"
                  />
                  {projectTaskSearch ? (
                    <button
                      type="button"
                      data-testid="project-task-search-clear"
                      aria-label="Clear project task search"
                      onClick={() => setProjectTaskSearch("")}
                      className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-[var(--muted-foreground)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground-strong)]"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
            {normalizedProjectTaskSearch ? (
              <p
                data-testid="project-task-search-count"
                className="text-xs font-medium text-[var(--muted-foreground)]"
              >
                {visibleProjectTaskCount} matching{" "}
                {visibleProjectTaskCount === 1 ? "task" : "tasks"}
              </p>
            ) : null}

            {visibleProjectMilestones.length ? (
              visibleProjectMilestones.map((milestone) => (
              <div
                key={milestone.id}
                className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-soft)]"
              >
                <div
                  className={cn(
                    "group flex flex-col items-stretch gap-3 border-b border-[var(--border)] bg-[var(--surface-muted)] px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-4",
                    !milestone.synthetic && "cursor-pointer",
                  )}
                  onClick={() => {
                    if (!milestone.synthetic) {
                      openMilestoneEditor(milestone);
                    }
                  }}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Icon icon="solar:alt-arrow-down-linear" width="16" className="text-[var(--muted-foreground)] group-hover:text-[var(--foreground-strong)] transition-colors" />
                    <h2 className="truncate text-sm font-semibold text-[var(--foreground-strong)]">{milestone.name}</h2>
                    <span className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-xs font-medium text-[var(--muted-foreground)]">
                      {milestone.tasks.length} tasks
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-4">
                    <div className="flex min-w-[8rem] flex-1 items-center gap-2 sm:flex-none">
                      <div className="h-1.5 w-28 overflow-hidden rounded-full bg-[var(--border)]">
                        <div
                          className="h-full rounded-full bg-[var(--foreground-strong)]"
                          style={{
                            width: `${Math.min(milestone.completionPercentage, 100)}%`,
                          }}
                        />
                      </div>
                      <span className="w-8 text-xs font-medium text-[var(--muted-foreground)]">
                        {Math.round(milestone.completionPercentage)}%
                      </span>
                    </div>
                    <InlineMilestoneRangePicker
                      milestone={milestone}
                      disabled={milestone.synthetic}
                      onChange={(input) => onUpdateMilestone(milestone.id, input)}
                    />
                    <span className="hidden h-5 w-px bg-[var(--border)] sm:block" />
                    <button
                      type="button"
                      className="flex items-center gap-1.5 text-sm font-medium text-[var(--muted-foreground)] transition hover:text-[var(--foreground-strong)]"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenNewTask?.({
                          projectId: activeProject.project.id,
                          milestoneId: milestone.id,
                        });
                      }}
                    >
                      <Icon icon="solar:add-circle-linear" width="18" />
                      Add Task
                    </button>
                    <span onClick={(event) => event.stopPropagation()}>
                      <MilestoneActionMenu
                        milestone={milestone}
                        onEdit={() => openMilestoneEditor(milestone)}
                        onDelete={async () => {
                          if (!window.confirm(`Delete ${milestone.name}?`)) {
                            return;
                          }
                          await onDeleteMilestone(milestone.id);
                        }}
                      />
                    </span>
                  </div>
                </div>
                <div className="divide-y divide-[var(--border)]">
                  {milestone.tasks.map((task, taskIndex) => (
	                    <div
	                      key={task.id}
	                      data-testid={`project-task-row-${task.id}`}
	                      className={cn(
                          "group/task grid min-h-12 cursor-pointer grid-cols-[minmax(0,1fr)_36px] items-center gap-2 px-3 py-3 transition hover:bg-[var(--surface-muted)] md:grid-cols-[minmax(0,1fr)_36px_128px_36px_108px] md:gap-3 md:px-4 md:py-2.5",
                          task.availability === "later" && "bg-[var(--surface-muted)] opacity-80",
                        )}
	                      onClick={() => onOpenTask(task.id)}
	                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <label className="relative flex cursor-pointer items-center" onClick={(event) => event.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="peer sr-only task-checkbox"
                            checked={task.status === "done"}
                            onChange={(event) =>
                              onUpdateTask(task.id, {
                                status: event.target.checked ? "done" : "todo",
                              })
                            }
                          />
                          <div className="flex h-4 w-4 items-center justify-center rounded border-2 border-[var(--border)] bg-[var(--surface)] transition-all peer-checked:border-[var(--foreground-strong)] peer-checked:bg-[var(--foreground-strong)]">
                            <Icon icon="solar:check-read-linear" width="12" className="absolute text-[var(--surface)] opacity-0 transition-all" />
                          </div>
                        </label>
                        <span className={cn("truncate text-sm font-medium transition-colors", task.status === "done" ? "text-[var(--muted-foreground)] line-through" : "text-[var(--foreground-strong)] group-hover/task:text-[var(--accent-strong)]")}>
                          {task.title}
                        </span>
                        {task.priority === "high" && (
                          <Icon icon="solar:flag-bold" width="14" className="shrink-0 text-[var(--danger)]" />
                        )}
                        {task.availability === "later" ? <Badge tone="neutral">Later</Badge> : null}
                      </div>
                      <TaskOwnerAvatar task={task} index={taskIndex} />
                      <div className="col-span-2 md:col-span-1">
                        <InlineTaskStatusPicker
                          task={task}
                          onChange={(status) => onUpdateTask(task.id, { status })}
                        />
                      </div>
                      <div className="justify-self-start md:justify-self-center">
                        <InlineTaskPriorityPicker
                          task={task}
                          onChange={(priority) => onUpdateTask(task.id, { priority })}
                        />
                      </div>
                      <div className="justify-self-end">
                        <InlineTaskDuePicker
                          task={task}
                          onChange={(dueAt) => onUpdateTask(task.id, { dueAt })}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-[var(--border)] bg-[var(--surface-muted)] px-4 py-2.5">
                  <button
                    className="flex items-center gap-2 text-sm font-medium text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground-strong)]"
                    onClick={() => onOpenNewTask?.({ projectId: activeProject.project.id, milestoneId: milestone.id })}
                  >
                    <Icon icon="solar:add-square-linear" width="16" />
                    Add Task...
                  </button>
                </div>
              </div>
              ))
            ) : normalizedProjectTaskSearch ? (
              <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-4 py-8 text-center text-sm leading-6 text-[var(--muted-foreground)]">
                No tasks match &quot;{projectTaskSearch.trim()}&quot;. Try a shorter term or a
                nearby task name.
              </div>
            ) : null}

            <button
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--surface)] py-5 text-sm font-medium text-[var(--muted-foreground)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--foreground-strong)]"
              onClick={onOpenMilestoneComposer}
            >
              <Icon icon="solar:add-circle-linear" width="20" />
              Add Milestone
            </button>
          </div>
        </div>
      ) : null}

      {activeTab === "charts" ? (
        <div
          data-testid="project-dashboard"
          className="flex-1 overflow-y-auto bg-[var(--background)] px-4 pb-8 pt-4 sm:px-6 sm:py-5"
          style={{ scrollbarWidth: "thin" }}
        >
          <div className="mx-auto grid max-w-7xl gap-4">
      <div className="grid min-w-0 gap-4 md:grid-cols-2 2xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <ChartCard
          title="Overall Progress"
          icon={<Target className="h-4 w-4" />}
        >
          <div className="grid min-w-0 items-center gap-4 md:grid-cols-[172px_minmax(0,1fr)]">
            <div className="relative h-[172px]">
              <ResponsiveContainer
                width="100%"
                height="100%"
                initialDimension={RESPONSIVE_CHART_INITIAL_DIMENSION}
              >
                <PieChart>
                  <Pie
                    data={overallChartData}
                    dataKey="value"
                    innerRadius={52}
                    outerRadius={72}
                    startAngle={90}
                    endAngle={-270}
                    stroke="none"
                    paddingAngle={0}
                  >
                    {overallChartData.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-[2rem] font-semibold tracking-[-0.05em] text-[var(--foreground-strong)]">
                  {formatPercent(activeProject.completionPercentage)}
                </span>
                <span className="text-[12px] text-[var(--muted-foreground)]">project complete</span>
              </div>
            </div>
            <div className="grid gap-3">
              <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                  Completed
                </p>
                <p className="mt-1 text-[1.25rem] font-semibold text-[var(--foreground-strong)]">
                  {activeProject.completedTaskCount} / {activeProject.totalTaskCount} tasks
                </p>
              </div>
              <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                  Remaining effort
                </p>
                <p className="mt-1 text-[1.25rem] font-semibold text-[var(--foreground-strong)]">
                  {formatHours(activeProject.remainingMinutes)}
                </p>
              </div>
            </div>
          </div>
        </ChartCard>

        <ChartCard
          title="Status Breakdown"
          icon={<CheckCircle2 className="h-4 w-4" />}
        >
          <div className="grid min-w-0 items-center gap-4 md:grid-cols-[170px_minmax(0,1fr)]">
            <div className="h-[168px]">
              <ResponsiveContainer
                width="100%"
                height="100%"
                initialDimension={RESPONSIVE_CHART_INITIAL_DIMENSION}
              >
                <PieChart>
                  <Pie
                    data={statusChartData}
                    dataKey="count"
                    innerRadius={44}
                    outerRadius={70}
                    paddingAngle={3}
                    stroke="none"
                  >
                    {statusChartData.map((entry) => (
                      <Cell key={entry.status} fill={entry.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid gap-2">
              {statusChartData.map((entry) => (
                <div
                  key={entry.status}
                  className="flex items-center justify-between rounded-[16px] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2.5"
                >
                  <span className="flex items-center gap-2 text-[12px] font-medium text-[var(--foreground-strong)]">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: entry.fill }}
                    />
                    {entry.label}
                  </span>
                  <span className="text-[12px] text-[var(--muted-foreground)]">
                    {entry.count} tasks
                  </span>
                </div>
              ))}
            </div>
          </div>
        </ChartCard>

        <ChartCard
          title="Milestone Progress"
          icon={<CalendarClock className="h-4 w-4" />}
        >
          <div className="h-[220px]">
            <ResponsiveContainer
              width="100%"
              height="100%"
              initialDimension={RESPONSIVE_CHART_INITIAL_DIMENSION}
            >
              <BarChart data={milestoneChartData} layout="vertical" margin={{ left: 4, right: 8 }}>
                <CartesianGrid horizontal={false} stroke="rgba(148,163,184,0.12)" />
                <XAxis type="number" domain={[0, 100]} hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={92}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                />
                <Tooltip
                  formatter={(value) => `${Number(value ?? 0)}%`}
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "16px",
                  }}
                />
                <Bar dataKey="progress" radius={[10, 10, 10, 10]} fill={CHART_COLORS.accent} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Burndown"
          icon={<TrendingDown className="h-4 w-4" />}
        >
          <div className="h-[220px]">
            <ResponsiveContainer
              width="100%"
              height="100%"
              initialDimension={RESPONSIVE_CHART_INITIAL_DIMENSION}
            >
              <AreaChart data={activeProject.burndown}>
                <defs>
                  <linearGradient id="burndown-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS.accentSoft} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={CHART_COLORS.accentSoft} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) => format(parseISO(value), "MMM d")}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                />
                <YAxis
                  tickFormatter={(value) => `${Math.round(value / 60)}h`}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  width={38}
                />
                <Tooltip
                  formatter={(value) => `${Math.round(Number(value ?? 0) / 60)}h`}
                  labelFormatter={(value) => format(parseISO(String(value)), "MMM d")}
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "16px",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="remainingMinutes"
                  stroke={CHART_COLORS.accent}
                  fill="url(#burndown-fill)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="idealRemainingMinutes"
                  stroke={CHART_COLORS.muted}
                  fill="transparent"
                  strokeDasharray="5 5"
                  strokeWidth={1.5}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <article className="grid min-w-0 gap-3 rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-soft)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
              Timeline Summary
            </p>
            <h3 className="mt-1 text-[1.35rem] font-semibold tracking-[-0.04em] text-[var(--foreground-strong)]">
              Phases at a glance
            </h3>
          </div>
          <Badge tone={activeProject.hasFallbackMilestone ? "neutral" : "accent"}>
            {activeProject.hasFallbackMilestone ? "Project-wide phase" : `${plottedMilestones.length} plotted phases`}
          </Badge>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {plottedMilestones.map((milestone) => (
            <div
              key={milestone.id}
              className="rounded-[20px] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-[14px] font-semibold text-[var(--foreground-strong)]">
                  {milestone.name}
                </p>
                <Badge tone={milestoneTone(milestone.health)}>
                  {formatPercent(milestone.completionPercentage)}
                </Badge>
              </div>
              <p className="mt-2 text-[12px] leading-5 text-[var(--muted-foreground)]">
                {format(parseISO(milestone.startDate), "MMM d")} -{" "}
                {format(parseISO(milestone.deadline), "MMM d")}
              </p>
            </div>
          ))}
        </div>
      </article>
          </div>
        </div>
      ) : null}

      {activeTab === "timeline" ? (
        <div
          className="flex-1 overflow-y-auto bg-[var(--background)] px-4 pb-8 pt-4 sm:px-6 sm:py-5"
          data-testid="project-gantt-panel"
          style={{ scrollbarWidth: "thin" }}
        >
          <div className="grid min-w-0 gap-4">
      <article className="min-w-0 rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-soft)] sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
              Gantt Timeline
            </p>
            <h3 className="mt-1 text-[1.5rem] font-semibold tracking-[-0.04em] text-[var(--foreground-strong)]">
              Milestones and delivery windows
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={projectHealthTone}>
              {activeProject.health === "at_risk"
                ? "At risk"
                : activeProject.health === "done"
                  ? "Complete"
                  : "On track"}
            </Badge>
            <Badge tone="neutral">
              {activeProject.hasFallbackMilestone
                ? "Project-wide timeline"
                : `${plottedMilestones.length} milestones`}
            </Badge>
          </div>
        </div>

        <div
          className="mt-5 w-full max-w-full overflow-x-auto rounded-[24px] border border-[var(--border)] bg-[var(--surface-muted)]"
          data-testid="project-gantt-scroll"
          ref={timelineViewportRef}
        >
          <div style={{ width: LABEL_WIDTH + timelineWidth }} className="min-w-full">
            <div
              className="sticky top-0 z-10 grid border-b border-[var(--border)] bg-[var(--surface)]"
              style={{ gridTemplateColumns: `${LABEL_WIDTH}px ${timelineWidth}px` }}
            >
              <div
                className="border-r border-[var(--border)] bg-[var(--surface)] px-4 py-3 md:sticky md:left-0"
                data-testid="project-gantt-label-header"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                  Milestone
                </p>
              </div>
              <div
                className="grid"
                style={{ gridTemplateColumns: `repeat(${timelineDays.length}, ${timelineDayWidth}px)` }}
              >
                {timelineDays.map((day) => (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      "border-r border-[var(--border)] px-2 py-3 text-center",
                      isToday(day) && "bg-[color:rgba(59,130,246,0.08)]",
                      isWeekend(day) && "bg-[color:rgba(148,163,184,0.08)]",
                    )}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                      {format(day, "EEE")}
                    </p>
                    <p className="mt-1 text-[12px] font-semibold text-[var(--foreground-strong)]">
                      {format(day, "d")}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {plottedMilestones.length ? (
              plottedMilestones.map((milestone) => {
                const effectiveDates = draftMilestones[milestone.id] ?? {
                  startDate: milestone.startDate,
                  deadline: milestone.deadline,
                };
                const startOffset = Math.max(
                  0,
                  differenceInCalendarDays(
                    startOfDay(parseISO(effectiveDates.startDate)),
                    startOfDay(parseISO(activeProject.scheduleRange.start)),
                  ),
                );
                const durationDays = Math.max(
                  1,
                  differenceInCalendarDays(
                    startOfDay(parseISO(effectiveDates.deadline)),
                    startOfDay(parseISO(effectiveDates.startDate)),
                  ) + 1,
                );
                const left = startOffset * timelineDayWidth + 4;
                const width = Math.max(durationDays * timelineDayWidth - 8, 44);
                const isCompactBar = width < COMPACT_MILESTONE_BAR_WIDTH;
                const isExpanded = expandedMilestoneId === milestone.id;
                const canEditMilestone = !milestone.synthetic;
                const milestoneSummary = summarizeMilestoneDescription(milestone.description);

                return (
                  <Fragment key={milestone.id}>
                    <div
                      className="grid border-b border-[var(--border)]"
                      style={{ gridTemplateColumns: `${LABEL_WIDTH}px ${timelineWidth}px` }}
                    >
                      <div className="z-[1] border-r border-[var(--border)] bg-[var(--surface)] px-4 py-4 transition duration-150 hover:bg-[var(--surface-muted)] md:sticky md:left-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-[14px] font-semibold text-[var(--foreground-strong)]">
                              {milestone.name}
                            </p>
                            <p
                              className="mt-1 text-[12px] leading-5 text-[var(--muted-foreground)]"
                              title={milestone.description || undefined}
                            >
                              {milestoneSummary}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            <Badge tone={milestoneTone(milestone.health)} className="shrink-0">
                              {formatPercent(milestone.completionPercentage)}
                            </Badge>
                            <MilestoneActionMenu
                              milestone={milestone}
                              onEdit={() =>
                                setEditorState({
                                  milestoneId: milestone.id,
                                  projectId: milestone.projectId,
                                  name: milestone.name,
                                  description: milestone.description,
                                  startDate: toInputDate(milestone.startDate),
                                  deadline: toInputDate(milestone.deadline),
                                })
                              }
                              onDelete={async () => {
                                if (!window.confirm(`Delete ${milestone.name}?`)) {
                                  return;
                                }
                                await onDeleteMilestone(milestone.id);
                              }}
                            />
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          <Badge tone="neutral">{milestone.totalTaskCount} tasks</Badge>
                          <Badge tone="neutral">{formatHours(milestone.remainingMinutes)} left</Badge>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-3 h-7 rounded-full px-3 text-[11px]"
                          onClick={() =>
                            setExpandedMilestoneId((current) =>
                              current === milestone.id ? null : milestone.id,
                            )
                          }
                        >
                          {isExpanded ? "Hide tasks" : "View tasks"}
                        </Button>
                      </div>

                      <div className="relative h-[92px] bg-[var(--surface-muted)]">
                        <div
                          className="absolute inset-0 grid"
                          style={{ gridTemplateColumns: `repeat(${timelineDays.length}, ${timelineDayWidth}px)` }}
                        >
                          {timelineDays.map((day) => (
                            <div
                              key={day.toISOString()}
                              className={cn(
                                "border-r border-[color:rgba(148,163,184,0.12)]",
                                isWeekend(day) && "bg-[color:rgba(148,163,184,0.06)]",
                              )}
                            />
                          ))}
                        </div>

                        <div
                          className="absolute top-1/2 -translate-y-1/2"
                          style={{ left, width }}
                        >
                          <div className="relative h-[48px] overflow-hidden rounded-[18px] border border-[color:rgba(255,255,255,0.08)] bg-[color:rgba(15,23,42,0.92)] shadow-[0_14px_28px_rgba(15,23,42,0.22)]">
                            <div
                              className="absolute inset-y-0 left-0 rounded-[18px]"
                              style={{
                                width: `${milestone.completionPercentage}%`,
                                background: `linear-gradient(90deg, ${milestoneFill(milestone.health)}, rgba(255,255,255,0.14))`,
                                opacity: 0.9,
                              }}
                            />
                            {canEditMilestone ? (
                              <>
                                <button
                                  type="button"
                                  className={cn(
                                    "absolute left-2 top-1/2 z-[2] flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-[color:rgba(255,255,255,0.12)] bg-[color:rgba(255,255,255,0.08)] text-white/80",
                                    isCompactBar && "hidden",
                                  )}
                                  onPointerDown={(event) => {
                                    event.preventDefault();
                                    setDragState({
                                      milestoneId: milestone.id,
                                      mode: "move",
                                      pointerStartX: event.clientX,
                                      startDate: effectiveDates.startDate,
                                      deadline: effectiveDates.deadline,
                                    });
                                  }}
                                  aria-label={`Move ${milestone.name}`}
                                >
                                  <GripVertical className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  className="absolute inset-y-0 left-0 z-[3] w-3 cursor-ew-resize bg-transparent"
                                  onPointerDown={(event) => {
                                    event.preventDefault();
                                    setDragState({
                                      milestoneId: milestone.id,
                                      mode: "start",
                                      pointerStartX: event.clientX,
                                      startDate: effectiveDates.startDate,
                                      deadline: effectiveDates.deadline,
                                    });
                                  }}
                                  aria-label={`Resize start of ${milestone.name}`}
                                />
                                <button
                                  type="button"
                                  className="absolute inset-y-0 right-0 z-[3] w-3 cursor-ew-resize bg-transparent"
                                  onPointerDown={(event) => {
                                    event.preventDefault();
                                    setDragState({
                                      milestoneId: milestone.id,
                                      mode: "end",
                                      pointerStartX: event.clientX,
                                      startDate: effectiveDates.startDate,
                                      deadline: effectiveDates.deadline,
                                    });
                                  }}
                                  aria-label={`Resize end of ${milestone.name}`}
                                />
                              </>
                            ) : null}
                            <button
                              type="button"
                              className={cn(
                                "relative z-[1] flex h-full w-full items-center gap-3 text-left",
                                isCompactBar
                                  ? "justify-center px-3"
                                  : "justify-between pr-4",
                                !isCompactBar && (canEditMilestone ? "pl-12" : "pl-4"),
                              )}
                              onClick={() =>
                                setExpandedMilestoneId((current) =>
                                  current === milestone.id ? null : milestone.id,
                                )
                              }
                              title={`${milestone.name}: ${format(parseISO(effectiveDates.startDate), "MMM d")} to ${format(parseISO(effectiveDates.deadline), "MMM d")} (${formatPercent(milestone.completionPercentage)})`}
                            >
                              {isCompactBar ? (
                                <>
                                  <span className="sr-only">
                                    {milestone.name}, {format(parseISO(effectiveDates.startDate), "MMM d")} to{" "}
                                    {format(parseISO(effectiveDates.deadline), "MMM d")},{" "}
                                    {formatPercent(milestone.completionPercentage)}
                                  </span>
                                  <span className="h-1.5 w-1.5 rounded-full bg-white/80" aria-hidden />
                                </>
                              ) : (
                                <>
                                  <span className="min-w-0">
                                    <span className="block truncate text-[13px] font-semibold text-white">
                                      {milestone.name}
                                    </span>
                                    <span className="block text-[11px] text-white/65">
                                      {format(parseISO(effectiveDates.startDate), "MMM d")} to{" "}
                                      {format(parseISO(effectiveDates.deadline), "MMM d")}
                                    </span>
                                  </span>
                                  <span className="shrink-0 text-[12px] font-semibold text-white/90">
                                    {formatPercent(milestone.completionPercentage)}
                                  </span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {isExpanded ? (
                      <div
                        className="grid border-b border-[var(--border)]"
                        style={{ gridTemplateColumns: `${LABEL_WIDTH}px ${timelineWidth}px` }}
                      >
                      <div className="border-r border-[var(--border)] bg-[var(--surface)] px-4 py-4 md:sticky md:left-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                          Task drill-down
                        </p>
                        </div>
                        <div className="grid gap-3 bg-[var(--surface)] p-4 md:grid-cols-2">
                          {milestone.tasks.length ? (
                            milestone.tasks.map((task) => (
                              <MilestoneTaskCard
                                key={task.id}
                                taskTitle={task.title}
                                meta={`${task.status.replace("_", " ")} • ${formatHours(task.estimatedMinutes)}${task.dueAt ? ` • due ${format(parseISO(task.dueAt), "MMM d")}` : ""}`}
                                onClick={() => onOpenTask(task.id)}
                              />
                            ))
                          ) : (
                            <div className="rounded-[18px] border border-dashed border-[var(--border)] bg-[var(--surface-muted)] px-4 py-5 text-[13px] text-[var(--muted-foreground)]">
                              No tasks are assigned to this milestone yet.
                            </div>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </Fragment>
                );
              })
            ) : null}
          </div>
        </div>
      </article>

      <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        {!activeProject.hasFallbackMilestone ? (
        <article className="grid min-w-0 gap-3 rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-soft)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                Independent Tasks
              </p>
              <h3 className="mt-1 text-[1.25rem] font-semibold tracking-[-0.04em] text-[var(--foreground-strong)]">
                Project tasks outside milestones
              </h3>
            </div>
            <Badge tone="neutral">{activeProject.standaloneTasks.length}</Badge>
          </div>

          {activeProject.standaloneTasks.length ? (
            <div className="grid gap-2">
              {activeProject.standaloneTasks.map((task) => (
                <MilestoneTaskCard
                  key={task.id}
                  taskTitle={task.title}
                  meta={`${task.status.replace("_", " ")} • ${formatHours(task.estimatedMinutes)}${task.dueAt ? ` • due ${format(parseISO(task.dueAt), "MMM d")}` : ""}`}
                  availability={task.availability}
                  onClick={() => onOpenTask(task.id)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-[18px] border border-dashed border-[var(--border)] bg-[var(--surface-muted)] px-4 py-5 text-[13px] leading-6 text-[var(--muted-foreground)]">
              All active project tasks are already attached to milestones.
            </div>
          )}
        </article>
        ) : null}

        <article className="grid min-w-0 gap-3 rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-soft)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                Delivery Summary
              </p>
              <h3 className="mt-1 text-[1.25rem] font-semibold tracking-[-0.04em] text-[var(--foreground-strong)]">
                Planning metrics
              </h3>
            </div>
            {isPending ? <Badge tone="accent">Updating</Badge> : null}
          </div>

          <div className="grid gap-2">
            {[
              {
                label: activeProject.hasFallbackMilestone ? "Phases on track" : "Milestones on track",
                value: `${plottedMilestones.filter((milestone) => milestone.health === "on_track" || milestone.health === "done").length} / ${plottedMilestones.length}`,
              },
              {
                label: "Tasks completed",
                value: `${activeProject.completedTaskCount}`,
              },
              {
                label: "Remaining effort",
                value: formatHours(activeProject.remainingMinutes),
              },
              {
                label: "Timeline window",
                value: `${format(parseISO(activeProject.scheduleRange.start), "MMM d")} - ${format(parseISO(activeProject.scheduleRange.end), "MMM d")}`,
              },
            ].map((metric) => (
              <div
                key={metric.label}
                className="flex items-center justify-between rounded-[16px] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-3"
              >
                <span className="text-[12px] text-[var(--muted-foreground)]">{metric.label}</span>
                <span className="text-[13px] font-semibold text-[var(--foreground-strong)]">
                  {metric.value}
                </span>
              </div>
            ))}
          </div>
        </article>
      </div>
          </div>
        </div>
      ) : null}

      {activeTab === "notes" ? (
        <ProjectNotesNotebook key={activeProject.project.id} projectPlan={activeProject} />
      ) : null}
    </section>
  );
}
