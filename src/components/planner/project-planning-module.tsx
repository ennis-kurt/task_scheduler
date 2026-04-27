"use client";

import { Fragment, type ReactNode, useEffect, useMemo, useState } from "react";
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
  Target,
  TrendingDown,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  NewMilestoneInput,
  PlannerMilestone,
  ProjectPlan,
  UpdateMilestoneInput,
} from "@/lib/planner/types";
import { cn } from "@/lib/utils";
import { Icon } from "@iconify/react";

export type ProjectPlanningSurface = "plan" | "timeline" | "charts";

const DAY_WIDTH = 42;
const LABEL_WIDTH = 240;
const CHART_COLORS = {
  accent: "#3b82f6",
  accentSoft: "#93c5fd",
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#fb7185",
  muted: "#94a3b8",
};
const RESPONSIVE_CHART_INITIAL_DIMENSION = { width: 1, height: 1 };

type ProjectPlanningModuleProps = {
  projectPlans: ProjectPlan[];
  activeProjectId: string;
  surface: ProjectPlanningSurface;
  isPending: boolean;
  onOpenTask: (taskId: string) => void;
  onOpenNewTask: (defaults?: { projectId?: string; milestoneId?: string | null }) => void;
  onOpenNewProject: () => void;
  milestoneComposerOpen: boolean;
  onOpenMilestoneComposer: () => void;
  onCloseMilestoneComposer: () => void;
  onCreateMilestone: (input: NewMilestoneInput) => Promise<void>;
  onUpdateMilestone: (
    milestoneId: string,
    input: UpdateMilestoneInput,
  ) => Promise<void>;
  onDeleteMilestone: (milestoneId: string) => Promise<void>;
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
          <Field label="Description">
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
  onClick,
}: {
  taskTitle: string;
  meta: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start justify-between gap-3 rounded-[16px] border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-left transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-elevated)]"
    >
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-semibold text-[var(--foreground-strong)]">
          {taskTitle}
        </span>
        <span className="mt-1 block text-[12px] text-[var(--muted-foreground)]">{meta}</span>
      </span>
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
        Open
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
          <Field label="Description">
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
  activeProjectId,
  surface,
  isPending,
  onOpenTask,
  onOpenNewTask,
  onOpenNewProject,
  milestoneComposerOpen,
  onOpenMilestoneComposer,
  onCloseMilestoneComposer,
  onCreateMilestone,
  onUpdateMilestone,
  onDeleteMilestone,
}: ProjectPlanningModuleProps) {
  const [activeTab, setActiveTab] = useState<ProjectPlanningSurface>(surface || "plan");
  const [expandedMilestoneId, setExpandedMilestoneId] = useState<string | null>(null);
  const [editorState, setEditorState] = useState<MilestoneEditorState | null>(null);
  const [draftMilestones, setDraftMilestones] = useState<
    Record<string, { startDate: string; deadline: string }>
  >({});
  const [dragState, setDragState] = useState<DragState | null>(null);

  useEffect(() => {
    setExpandedMilestoneId(null);
    setEditorState(null);
  }, [activeProjectId]);

  useEffect(() => {
    if (!dragState) {
      return;
    }

    const currentDrag = dragState;
    const activeProject = projectPlans.find((plan) => plan.project.id === activeProjectId);

    if (!activeProject) {
      return;
    }

    const currentProject = activeProject;

    function handlePointerMove(event: PointerEvent) {
      const deltaDays = Math.round((event.clientX - currentDrag.pointerStartX) / DAY_WIDTH);

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
  }, [activeProjectId, draftMilestones, dragState, onUpdateMilestone, projectPlans]);

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

  const timelineWidth = Math.max(timelineDays.length * DAY_WIDTH, 760);
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
          : CHART_COLORS.warning,
  }));
  const plottedMilestones = activeProject.plottedMilestones;
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
    <section data-project-planning-module className="flex-1 flex flex-col h-full bg-white relative">
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

      <header className="h-14 flex items-center justify-between px-6 border-b border-[var(--border)] bg-white shrink-0">
        <div className="flex items-center gap-4 h-full">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-[var(--foreground-strong)]">{activeProject.project.name}</h1>
            <Icon icon="solar:alt-arrow-down-linear" width="18" className="text-[var(--muted-foreground)]" />
          </div>
          <nav className="flex items-center gap-6 ml-8 h-full">
            <button
              onClick={() => setActiveTab("plan")}
              className={cn("text-sm font-medium h-14 border-b-2 transition-colors", activeTab === "plan" ? "text-blue-600 border-blue-600" : "text-[var(--muted-foreground)] hover:text-[var(--foreground-strong)] border-transparent")}
            >
              Project Design
            </button>
            <button
              onClick={() => setActiveTab("timeline")}
              className={cn("text-sm font-medium h-14 border-b-2 transition-colors", activeTab === "timeline" ? "text-blue-600 border-blue-600" : "text-[var(--muted-foreground)] hover:text-[var(--foreground-strong)] border-transparent")}
            >
              Gantt Chart
            </button>
            <button
              onClick={() => setActiveTab("charts")}
              className={cn("text-sm font-medium h-14 border-b-2 transition-colors", activeTab === "charts" ? "text-blue-600 border-blue-600" : "text-[var(--muted-foreground)] hover:text-[var(--foreground-strong)] border-transparent")}
            >
              Dashboard
            </button>
            <button
              type="button"
              disabled
              className="text-sm font-medium text-[var(--muted-foreground)] border-b-2 border-transparent h-14 cursor-not-allowed opacity-50"
            >
              Notes
            </button>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center -space-x-2">
            <div className="w-8 h-8 rounded-full border-2 border-white bg-blue-100 flex items-center justify-center text-xs font-medium text-blue-700 z-30">JD</div>
            <div className="w-8 h-8 rounded-full border-2 border-white bg-green-100 flex items-center justify-center text-xs font-medium text-green-700 z-20">AS</div>
            <div className="w-8 h-8 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-600 z-10">+3</div>
          </div>
          <button
            type="button"
            disabled
            className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm font-medium transition-colors shadow-sm opacity-50 cursor-not-allowed"
          >
            Share
          </button>
        </div>
      </header>

      {activeTab === "plan" ? (
        <div className="flex-1 overflow-y-auto bg-[#FAFAFA] dark:bg-[var(--background)] p-6" style={{ scrollbarWidth: "thin" }}>
          <div className="max-w-5xl mx-auto space-y-6">
            {plottedMilestones.map((milestone) => (
              <div key={milestone.id} className="bg-white rounded-xl border border-[var(--border)] shadow-[var(--shadow-soft)] overflow-hidden">
                <div
                  className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--surface-muted)] cursor-pointer group"
                  onClick={() => openMilestoneEditor(milestone)}
                >
                  <div className="flex items-center gap-3">
                    <Icon icon="solar:alt-arrow-down-linear" width="18" className="text-[var(--muted-foreground)] group-hover:text-[var(--foreground-strong)] transition-colors" />
                    <h2 className="text-base font-semibold text-[var(--foreground-strong)]">{milestone.name}</h2>
                    <span className="px-2 py-0.5 bg-white border border-[var(--border)] rounded text-xs font-medium text-[var(--muted-foreground)]">
                      {milestone.tasks.length} tasks
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <div className="w-32 h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-blue-600"
                          style={{
                            width: `${Math.min(milestone.completionPercentage, 100)}%`,
                          }}
                        />
                      </div>
                      <span className="w-8 text-xs font-medium text-[var(--muted-foreground)]">
                        {Math.round(milestone.completionPercentage)}%
                      </span>
                    </div>
                    {milestone.deadline && (
                      <span className="text-sm font-medium text-[var(--muted-foreground)]">
                        {format(parseISO(milestone.deadline), "MMM d")}
                      </span>
                    )}
                  </div>
                </div>
                <div className="divide-y divide-[var(--border)]">
                  {milestone.tasks.map((task) => (
                    <div key={task.id} className="px-5 py-3 flex items-center justify-between hover:bg-[var(--surface-muted)] transition-colors group/task" onClick={() => onOpenTask(task.id)}>
                      <div className="flex items-center gap-3">
                        <label className="relative flex items-center cursor-pointer" onClick={(e) => { e.stopPropagation(); }}>
                          <input type="checkbox" className="peer sr-only task-checkbox" checked={task.status === "done"} onChange={() => {}} />
                          <div className="w-5 h-5 border-2 border-[var(--border-strong)] rounded flex items-center justify-center peer-checked:bg-blue-600 peer-checked:border-blue-600 transition-all">
                            <Icon icon="solar:check-read-linear" width="14" className="text-white opacity-0 transition-all absolute" />
                          </div>
                        </label>
                        <span className={cn("text-sm font-medium transition-colors cursor-pointer", task.status === "done" ? "text-[var(--muted-foreground)] line-through" : "text-[var(--foreground-strong)] group-hover/task:text-blue-600")}>
                          {task.title}
                        </span>
                        {task.priority === "high" && (
                          <Icon icon="solar:flag-bold" width="14" className="text-red-500" />
                        )}
                      </div>
                      <div className="flex items-center gap-4 opacity-0 group-hover/task:opacity-100 transition-opacity">
                        <div className="w-6 h-6 rounded-full bg-[var(--accent-soft)] flex items-center justify-center text-[10px] font-medium text-[var(--accent-strong)]">
                          {task.id.slice(0, 2).toUpperCase()}
                        </div>
                        {task.dueAt && (
                          <span className="text-xs font-medium text-[var(--muted-foreground)]">
                            {format(parseISO(task.dueAt), "MMM d")}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="px-5 py-3 bg-[var(--surface-muted)] border-t border-[var(--border)]">
                  <button
                    className="text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground-strong)] flex items-center gap-2 transition-colors"
                    onClick={() => onOpenNewTask?.({ projectId: activeProject.project.id, milestoneId: milestone.id })}
                  >
                    <Icon icon="solar:add-square-linear" width="16" />
                    Add Task...
                  </button>
                </div>
              </div>
            ))}

            <button
              className="w-full py-4 border-2 border-dashed border-[var(--border)] rounded-xl text-[var(--muted-foreground)] hover:text-[var(--foreground-strong)] hover:border-[var(--muted-foreground)] transition-colors font-medium flex items-center justify-center gap-2"
              onClick={onOpenMilestoneComposer}
            >
              <Icon icon="solar:add-circle-linear" width="20" />
              Add Milestone
            </button>
          </div>
        </div>
      ) : null}

      {activeTab === "charts" ? (
        <>
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
        </>
      ) : null}

      {activeTab === "timeline" ? (
        <>
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

        <div className="mt-5 w-full max-w-full overflow-x-auto rounded-[24px] border border-[var(--border)] bg-[var(--surface-muted)]">
          <div style={{ width: LABEL_WIDTH + timelineWidth }} className="min-w-full">
            <div
              className="sticky top-0 z-10 grid border-b border-[var(--border)] bg-[var(--surface)]"
              style={{ gridTemplateColumns: `${LABEL_WIDTH}px ${timelineWidth}px` }}
            >
              <div className="sticky left-0 border-r border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                  Milestone
                </p>
              </div>
              <div
                className="grid"
                style={{ gridTemplateColumns: `repeat(${timelineDays.length}, ${DAY_WIDTH}px)` }}
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
                const left = startOffset * DAY_WIDTH + 4;
                const width = Math.max(durationDays * DAY_WIDTH - 8, 44);
                const isExpanded = expandedMilestoneId === milestone.id;
                const canEditMilestone = !milestone.synthetic;

                return (
                  <Fragment key={milestone.id}>
                    <div
                      className="grid border-b border-[var(--border)]"
                      style={{ gridTemplateColumns: `${LABEL_WIDTH}px ${timelineWidth}px` }}
                    >
                      <div className="sticky left-0 z-[1] border-r border-[var(--border)] bg-[var(--surface)] px-4 py-4 transition duration-150 hover:bg-[var(--surface-muted)]">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-[14px] font-semibold text-[var(--foreground-strong)]">
                              {milestone.name}
                            </p>
                            <p className="mt-1 text-[12px] leading-5 text-[var(--muted-foreground)]">
                              {milestone.description || "Milestone without a short brief yet."}
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
                          style={{ gridTemplateColumns: `repeat(${timelineDays.length}, ${DAY_WIDTH}px)` }}
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
                                  className="absolute left-2 top-1/2 z-[2] flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-[color:rgba(255,255,255,0.12)] bg-[color:rgba(255,255,255,0.08)] text-white/80"
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
                                "relative z-[1] flex h-full w-full items-center justify-between gap-3 pr-4 text-left",
                                canEditMilestone ? "pl-12" : "pl-4",
                              )}
                              onClick={() =>
                                setExpandedMilestoneId((current) =>
                                  current === milestone.id ? null : milestone.id,
                                )
                              }
                            >
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
                      <div className="sticky left-0 border-r border-[var(--border)] bg-[var(--surface)] px-4 py-4">
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
        </>
      ) : null}
    </section>
  );
}
