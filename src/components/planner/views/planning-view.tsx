import React, {
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock3,
  GripHorizontal,
  Maximize2,
  MoreHorizontal,
  Minimize2,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { format, parseISO } from "date-fns";

import { cn } from "@/lib/utils";
import type { PlannerTask, TaskStatus } from "@/lib/planner/types";

type PlanningColumn =
  | {
      id: TaskStatus;
      kind: "status";
      label: string;
      status: TaskStatus;
      locked: true;
    }
  | {
      id: string;
      kind: "custom";
      label: string;
      locked?: boolean;
    };

type PlanningWorkload = {
  scheduledMinutes: number;
  workMinutes: number;
  overloaded?: boolean;
};

export interface PlanningViewProps {
  tasks: PlannerTask[];
  onTaskDrop: (taskId: string, newStatus: TaskStatus) => void;
  onOpenTask: (taskId: string) => void;
  onOpenNewTask: () => void;
  calendarElement: ReactNode;
  externalDragRef?: React.Ref<HTMLDivElement>;
  surface: "day" | "week" | "agenda";
  onChangeSurface: (surface: "day" | "week" | "agenda") => void;
  focusedDate: string;
  onNavigateDate: (direction: "prev" | "today" | "next") => void;
  workload: PlanningWorkload;
  storageKey: string;
  overlayOpen?: boolean;
}

const TASK_DRAG_TYPE = "application/x-inflara-planning-task";
const COLUMN_DRAG_TYPE = "application/x-inflara-planning-column";
const REVIEW_COLUMN_ID = "review";
const DEFAULT_KANBAN_HEIGHT = 360;
const MIN_KANBAN_HEIGHT = 260;
const MAX_KANBAN_HEIGHT = 1100;
const SCHEDULE_PANEL_HEIGHT = 720;
const DEFAULT_KANBAN_VIEWPORT_RATIO = 0.5;

const DEFAULT_COLUMNS: PlanningColumn[] = [
  {
    id: "todo",
    kind: "status",
    label: "To Do",
    status: "todo",
    locked: true,
  },
  {
    id: "in_progress",
    kind: "status",
    label: "In Progress",
    status: "in_progress",
    locked: true,
  },
  {
    id: REVIEW_COLUMN_ID,
    kind: "custom",
    label: "Review",
    locked: true,
  },
  {
    id: "done",
    kind: "status",
    label: "Done",
    status: "done",
    locked: true,
  },
];

function cloneDefaultColumns() {
  return DEFAULT_COLUMNS.map((column) => ({ ...column }));
}

function isTaskStatus(value: unknown): value is TaskStatus {
  return value === "todo" || value === "in_progress" || value === "done";
}

function normalizeColumns(value: unknown): PlanningColumn[] {
  if (!Array.isArray(value)) {
    return cloneDefaultColumns();
  }

  const seen = new Set<string>();
  const columns: PlanningColumn[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const raw = item as Record<string, unknown>;
    const id = typeof raw.id === "string" ? raw.id : "";
    const label = typeof raw.label === "string" ? raw.label.trim() : "";

    if (!id || seen.has(id)) {
      continue;
    }

    if (isTaskStatus(id)) {
      const fallback = DEFAULT_COLUMNS.find((column) => column.id === id);

      if (fallback?.kind === "status") {
        columns.push({ ...fallback, label: label || fallback.label });
        seen.add(id);
      }

      continue;
    }

    if (raw.kind === "custom" || id === REVIEW_COLUMN_ID) {
      columns.push({
        id,
        kind: "custom",
        label: label || (id === REVIEW_COLUMN_ID ? "Review" : "Custom Column"),
        locked: id === REVIEW_COLUMN_ID,
      });
      seen.add(id);
    }
  }

  for (const fallback of DEFAULT_COLUMNS) {
    if (!seen.has(fallback.id)) {
      columns.push({ ...fallback });
      seen.add(fallback.id);
    }
  }

  return columns;
}

function normalizeTaskColumnMap(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      ([taskId, columnId]) => taskId && typeof columnId === "string" && columnId,
    ),
  ) as Record<string, string>;
}

function formatMinutes(minutes: number) {
  const safeMinutes = Math.max(0, Math.round(minutes));

  if (safeMinutes < 60) {
    return `${safeMinutes}m`;
  }

  const hours = Math.floor(safeMinutes / 60);
  const remainder = safeMinutes % 60;

  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function formatFocusedDate(focusedDate: string) {
  const parsed = parseISO(`${focusedDate}T12:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return focusedDate;
  }

  return format(parsed, "MMMM d, yyyy");
}

function getColumnTone(column: PlanningColumn) {
  if (column.kind === "status" && column.status === "in_progress") {
    return {
      label: "text-[color:#2563eb]",
      count: "bg-[rgba(37,99,235,0.12)] text-[color:#2563eb]",
      drop: "planning-drop-active-blue",
    };
  }

  if (column.kind === "status" && column.status === "done") {
    return {
      label: "text-[var(--muted-foreground)]",
      count: "bg-[var(--surface-muted)] text-[var(--muted-foreground)]",
      drop: "planning-drop-active-neutral",
    };
  }

  if (column.id === REVIEW_COLUMN_ID) {
    return {
      label: "text-[color:#7c3aed]",
      count: "bg-[rgba(124,58,237,0.12)] text-[color:#7c3aed]",
      drop: "planning-drop-active-purple",
    };
  }

  return {
    label: "text-[var(--foreground)]",
    count: "bg-[var(--surface-muted)] text-[var(--muted-foreground)]",
    drop: "planning-drop-active-neutral",
  };
}

function getTaskAccent(task: PlannerTask, column: PlanningColumn) {
  if (column.kind === "status" && column.status === "in_progress") {
    return "border-l-[#3b82f6]";
  }

  if (column.id === REVIEW_COLUMN_ID) {
    return "border-l-[#8b5cf6]";
  }

  if (task.priority === "critical" || task.priority === "high") {
    return "border-l-[#fb923c]";
  }

  return "border-l-transparent";
}

function taskProgress(task: PlannerTask) {
  const total = task.checklist.length;

  if (!total) {
    return null;
  }

  const completed = task.checklist.filter((item) => item.completed).length;

  return {
    completed,
    total,
    percentage: Math.round((completed / total) * 100),
  };
}

function omitTaskColumn(map: Record<string, string>, taskId: string) {
  if (!(taskId in map)) {
    return map;
  }

  const next = { ...map };
  delete next[taskId];
  return next;
}

function fallbackColumnLabel(column: PlanningColumn) {
  const fallback = DEFAULT_COLUMNS.find((item) => item.id === column.id);
  return fallback?.label ?? "Custom Column";
}

function clampKanbanHeight(height: number) {
  return Math.min(MAX_KANBAN_HEIGHT, Math.max(MIN_KANBAN_HEIGHT, Math.round(height)));
}

function defaultKanbanHeightFromViewport() {
  if (typeof window === "undefined") {
    return DEFAULT_KANBAN_HEIGHT;
  }

  return clampKanbanHeight(window.innerHeight * DEFAULT_KANBAN_VIEWPORT_RATIO);
}

export function PlanningView({
  tasks,
  onTaskDrop,
  onOpenTask,
  onOpenNewTask,
  calendarElement,
  externalDragRef,
  surface,
  onChangeSurface,
  focusedDate,
  onNavigateDate,
  workload,
  storageKey,
  overlayOpen = false,
}: PlanningViewProps) {
  const [kanbanHeight, setKanbanHeight] = useState(() => defaultKanbanHeightFromViewport());
  const [expandedKanbanHeight, setExpandedKanbanHeight] = useState(() =>
    defaultKanbanHeightFromViewport(),
  );
  const [useViewportDefaultHeight, setUseViewportDefaultHeight] = useState(true);
  const [kanbanFullscreen, setKanbanFullscreen] = useState(false);
  const [kanbanCollapsed, setKanbanCollapsed] = useState(false);
  const [columns, setColumns] = useState<PlanningColumn[]>(() => cloneDefaultColumns());
  const [taskColumnMap, setTaskColumnMap] = useState<Record<string, string>>({});
  const [storageReady, setStorageReady] = useState(false);
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [draggingColumnId, setDraggingColumnId] = useState<string | null>(null);
  const [calendarFullscreen, setCalendarFullscreen] = useState(false);
  const resizerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const kanbanHeaderRef = useRef<HTMLDivElement>(null);
  const kanbanScrollRef = useRef<HTMLDivElement>(null);
  const columnListRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement | null>(null);

  const columnsStorageKey = `${storageKey}:columns:v1`;
  const taskColumnsStorageKey = `${storageKey}:task-columns:v1`;
  const calendarResizeKey = [
    calendarFullscreen,
    kanbanFullscreen,
    kanbanCollapsed,
    kanbanHeight,
    surface,
  ].join(":");

  const setColumnListRefs = (node: HTMLDivElement | null) => {
    columnListRef.current = node;

    if (typeof externalDragRef === "function") {
      externalDragRef(node);
      return;
    }

    if (externalDragRef && "current" in externalDragRef) {
      (externalDragRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    }
  };

  useEffect(() => {
    setStorageReady(false);

    try {
      const savedColumns = window.localStorage.getItem(columnsStorageKey);
      const savedTaskColumns = window.localStorage.getItem(taskColumnsStorageKey);

      setColumns(normalizeColumns(savedColumns ? JSON.parse(savedColumns) : null));
      setTaskColumnMap(
        normalizeTaskColumnMap(savedTaskColumns ? JSON.parse(savedTaskColumns) : null),
      );
    } catch {
      setColumns(cloneDefaultColumns());
      setTaskColumnMap({});
    } finally {
      setStorageReady(true);
    }
  }, [columnsStorageKey, taskColumnsStorageKey]);

  useEffect(() => {
    if (!storageReady) {
      return;
    }

    window.localStorage.setItem(columnsStorageKey, JSON.stringify(columns));
  }, [columns, columnsStorageKey, storageReady]);

  useEffect(() => {
    if (!storageReady) {
      return;
    }

    window.localStorage.setItem(taskColumnsStorageKey, JSON.stringify(taskColumnMap));
  }, [storageReady, taskColumnMap, taskColumnsStorageKey]);

  useEffect(() => {
    if (!editingColumnId) {
      return;
    }

    window.requestAnimationFrame(() => {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    });
  }, [editingColumnId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setKanbanFullscreen(false);
        setCalendarFullscreen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const dispatchResize = () => window.dispatchEvent(new Event("resize"));
    const frame = window.requestAnimationFrame(dispatchResize);
    const timeout = window.setTimeout(dispatchResize, 240);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [calendarResizeKey]);

  useEffect(() => {
    if (!calendarFullscreen && !kanbanFullscreen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [calendarFullscreen, kanbanFullscreen]);

  useEffect(() => {
    if (!overlayOpen) {
      return;
    }

    setKanbanFullscreen(false);
    setCalendarFullscreen(false);
  }, [overlayOpen]);

  useEffect(() => {
    if (!useViewportDefaultHeight) {
      return;
    }

    const syncToViewport = () => {
      const nextHeight = defaultKanbanHeightFromViewport();
      setKanbanHeight((current) => (Math.abs(current - nextHeight) < 1 ? current : nextHeight));
      setExpandedKanbanHeight((current) =>
        Math.abs(current - nextHeight) < 1 ? current : nextHeight,
      );
    };

    syncToViewport();
    window.addEventListener("resize", syncToViewport);

    return () => {
      window.removeEventListener("resize", syncToViewport);
    };
  }, [useViewportDefaultHeight]);

  useEffect(() => {
    const resizer = resizerRef.current;
    const container = containerRef.current;
    if (!resizer || !container || kanbanCollapsed || kanbanFullscreen) return;

    let isResizing = false;
    let activePointerId: number | null = null;

    const applyResize = (clientY: number) => {
      const containerRect = container.getBoundingClientRect();
      const proposedHeight = clientY - containerRect.top + container.scrollTop;
      const nextHeight = clampKanbanHeight(proposedHeight);

      setKanbanHeight(nextHeight);
      setExpandedKanbanHeight(nextHeight);
    };

    const startResize = (event: PointerEvent) => {
      if (event.button !== 0) {
        return;
      }

      event.preventDefault();
      if (isResizing) {
        return;
      }

      isResizing = true;
      setUseViewportDefaultHeight(false);
      activePointerId = event.pointerId;
      resizer.setPointerCapture?.(event.pointerId);
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
    };

    const doResize = (event: PointerEvent) => {
      if (!isResizing) return;
      applyResize(event.clientY);
    };

    const stopResize = (event: PointerEvent) => {
      if (!isResizing) return;

      isResizing = false;
      if (activePointerId !== null) {
        resizer.releasePointerCapture?.(activePointerId);
      }
      activePointerId = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      event.preventDefault();
    };

    const startMouseResize = (event: MouseEvent) => {
      if (event.button !== 0 || isResizing) {
        return;
      }

      event.preventDefault();
      isResizing = true;
      setUseViewportDefaultHeight(false);
      activePointerId = null;
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
    };

    const doMouseResize = (event: MouseEvent) => {
      if (!isResizing) return;
      applyResize(event.clientY);
    };

    const stopMouseResize = (event: MouseEvent) => {
      if (!isResizing) return;

      isResizing = false;
      activePointerId = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      event.preventDefault();
    };

    resizer.addEventListener("pointerdown", startResize);
    document.addEventListener("pointermove", doResize);
    document.addEventListener("pointerup", stopResize);
    document.addEventListener("pointercancel", stopResize);
    resizer.addEventListener("mousedown", startMouseResize);
    document.addEventListener("mousemove", doMouseResize);
    document.addEventListener("mouseup", stopMouseResize);

    return () => {
      resizer.removeEventListener("pointerdown", startResize);
      document.removeEventListener("pointermove", doResize);
      document.removeEventListener("pointerup", stopResize);
      document.removeEventListener("pointercancel", stopResize);
      resizer.removeEventListener("mousedown", startMouseResize);
      document.removeEventListener("mousemove", doMouseResize);
      document.removeEventListener("mouseup", stopMouseResize);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [kanbanCollapsed, kanbanFullscreen]);

  const customColumnIds = useMemo(
    () =>
      new Set(
        columns
          .filter((column) => column.kind === "custom")
          .map((column) => column.id),
      ),
    [columns],
  );

  const tasksByColumn = useMemo(() => {
    const buckets = new Map<string, PlannerTask[]>();
    for (const column of columns) {
      buckets.set(column.id, []);
    }

    for (const task of tasks) {
      const mappedColumnId = taskColumnMap[task.id];
      const targetColumnId =
        mappedColumnId && customColumnIds.has(mappedColumnId)
          ? mappedColumnId
          : task.status;
      const bucket = buckets.get(targetColumnId) ?? buckets.get(task.status);
      bucket?.push(task);
    }

    return buckets;
  }, [columns, customColumnIds, taskColumnMap, tasks]);

  const workloadLabel = `${formatMinutes(workload.scheduledMinutes)} / ${formatMinutes(
    workload.workMinutes,
  )}`;
  const workloadState = workload.overloaded
    ? "is-overloaded"
    : workload.workMinutes > 0 && workload.scheduledMinutes >= workload.workMinutes
      ? "is-full"
      : "is-healthy";

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData(TASK_DRAG_TYPE, taskId);
    e.dataTransfer.setData("text/plain", taskId);
    e.dataTransfer.effectAllowed = "move";
    e.currentTarget.classList.add("opacity-50");
  };

  const handleDragEnd = (e: React.DragEvent) => {
    e.currentTarget.classList.remove("opacity-50");
  };

  const persistTaskColumnMap = (next: Record<string, string>) => {
    if (!storageReady) {
      return;
    }

    window.localStorage.setItem(taskColumnsStorageKey, JSON.stringify(next));
  };

  const isColumnDrag = (e: React.DragEvent) =>
    draggingColumnId || Array.from(e.dataTransfer.types).includes(COLUMN_DRAG_TYPE);

  const handleColumnDragStart = (e: React.DragEvent, columnId: string) => {
    e.stopPropagation();
    setDraggingColumnId(columnId);
    e.dataTransfer.setData(COLUMN_DRAG_TYPE, columnId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleColumnDragEnd = () => {
    setDraggingColumnId(null);
  };

  const reorderColumn = (sourceId: string, targetId: string) => {
    if (!sourceId || sourceId === targetId) {
      return;
    }

    setColumns((current) => {
      const sourceIndex = current.findIndex((column) => column.id === sourceId);
      const targetIndex = current.findIndex((column) => column.id === targetId);

      if (sourceIndex < 0 || targetIndex < 0) {
        return current;
      }

      const next = [...current];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  };

  const handleDragOver = (e: React.DragEvent, column: PlanningColumn) => {
    e.preventDefault();

    if (isColumnDrag(e)) {
      e.dataTransfer.dropEffect = "move";
      return;
    }

    e.currentTarget.classList.add(getColumnTone(column).drop);
  };

  const handleDragLeave = (e: React.DragEvent, column: PlanningColumn) => {
    e.currentTarget.classList.remove(getColumnTone(column).drop);
  };

  const handleDrop = (e: React.DragEvent, column: PlanningColumn) => {
    e.preventDefault();
    e.currentTarget.classList.remove(getColumnTone(column).drop);

    if (isColumnDrag(e)) {
      const sourceId = e.dataTransfer.getData(COLUMN_DRAG_TYPE) || draggingColumnId;
      if (sourceId) {
        reorderColumn(sourceId, column.id);
      }
      setDraggingColumnId(null);
      return;
    }

    const taskId =
      e.dataTransfer.getData(TASK_DRAG_TYPE) || e.dataTransfer.getData("text/plain");

    if (!taskId) {
      return;
    }

    if (column.kind === "status") {
      setTaskColumnMap((current) => {
        const next = omitTaskColumn(current, taskId);
        persistTaskColumnMap(next);
        return next;
      });
      onTaskDrop(taskId, column.status);
      return;
    }

    setTaskColumnMap((current) => {
      const next = { ...current, [taskId]: column.id };
      persistTaskColumnMap(next);
      return next;
    });
  };

  const updateColumnLabel = (columnId: string, label: string) => {
    setColumns((current) =>
      current.map((column) =>
        column.id === columnId ? { ...column, label } : column,
      ),
    );
  };

  const finishEditingColumn = (columnId: string) => {
    setColumns((current) =>
      current.map((column) => {
        if (column.id !== columnId) {
          return column;
        }

        const label = column.label.trim();
        return {
          ...column,
          label: label || fallbackColumnLabel(column),
        };
      }),
    );
    setEditingColumnId(null);
  };

  const deleteColumn = (columnId: string) => {
    const column = columns.find((item) => item.id === columnId);

    if (!column || column.kind !== "custom" || column.locked) {
      return;
    }

    setColumns((current) => current.filter((item) => item.id !== columnId));
    setTaskColumnMap((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([, mappedColumnId]) => mappedColumnId !== columnId),
      ) as Record<string, string>;
      persistTaskColumnMap(next);
      return next;
    });
    setEditingColumnId((current) => (current === columnId ? null : current));
  };

  const addCustomColumn = () => {
    const existingNumbers = columns
      .map((column) => /^Custom Column (\d+)$/.exec(column.label)?.[1])
      .filter(Boolean)
      .map(Number);
    const nextNumber = existingNumbers.length ? Math.max(...existingNumbers) + 1 : 1;
    const newColumn: PlanningColumn = {
      id: `custom-${Date.now().toString(36)}`,
      kind: "custom",
      label: `Custom Column ${nextNumber}`,
    };

    setColumns((current) => {
      return [...current, newColumn];
    });
    setEditingColumnId(newColumn.id);
  };

  const toggleKanban = () => {
    setKanbanCollapsed((current) => {
      if (current) {
        setKanbanHeight(expandedKanbanHeight);
        return false;
      }

      setKanbanFullscreen(false);
      setExpandedKanbanHeight(kanbanHeight);
      return true;
    });
  };

  const toggleKanbanFullscreen = () => {
    setKanbanCollapsed(false);
    setKanbanFullscreen((current) => !current);
  };

  const openNewTaskOutsideFullscreen = () => {
    setKanbanFullscreen(false);
    setCalendarFullscreen(false);
    onOpenNewTask();
  };

  const kanbanPanelHeight = kanbanCollapsed
    ? "3.25rem"
    : `${kanbanHeight}px`;

  return (
    <div className="relative flex h-full flex-1 flex-col bg-[var(--background)]">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-6">
        <div className="flex min-w-0 items-center gap-4">
          <h1 className="shrink-0 text-lg font-semibold text-[var(--foreground-strong)]">
            Planning
          </h1>
          <div className="h-5 w-px bg-[var(--border)]" aria-hidden />
          <div className="flex items-center rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-0.5">
            <button
              onClick={() => onChangeSurface("day")}
              data-testid="surface-day"
              className={cn(
                "rounded-md px-3.5 py-1.5 text-sm font-medium transition-all",
                surface === "day"
                  ? "bg-[var(--surface)] text-[var(--foreground-strong)] shadow-sm"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground-strong)]",
              )}
            >
              Day
            </button>
            <button
              onClick={() => onChangeSurface("week")}
              data-testid="surface-week"
              className={cn(
                "rounded-md px-3.5 py-1.5 text-sm font-medium transition-all",
                surface === "week"
                  ? "bg-[var(--surface)] text-[var(--foreground-strong)] shadow-sm"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground-strong)]",
              )}
            >
              Week
            </button>
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-3">
          <div className="hidden items-center gap-1 sm:flex">
            <button
              onClick={() => onNavigateDate("prev")}
              aria-label="Go to previous dates"
              className="rounded-md p-1.5 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--foreground-strong)]"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[132px] text-center text-sm font-medium text-[var(--foreground-strong)]">
              {formatFocusedDate(focusedDate)}
            </span>
            <button
              onClick={() => onNavigateDate("next")}
              aria-label="Go to next dates"
              className="rounded-md p-1.5 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--foreground-strong)]"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => onNavigateDate("today")}
              aria-label="Jump to today"
              className="ml-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm font-medium text-[var(--foreground-strong)] transition-colors hover:bg-[var(--surface-muted)]"
            >
              Today
            </button>
          </div>
          <button
            type="button"
            data-testid="planning-workload"
            aria-label={`Workload ${workloadLabel}`}
            className={cn("planning-workload-pill", workloadState)}
          >
            <span className="planning-workload-pill__dot" aria-hidden />
            <span>{workloadLabel}</span>
          </button>
          <button
            type="button"
            aria-label="Search planning"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] shadow-sm transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--foreground-strong)]"
          >
            <Search className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div
        ref={containerRef}
        className="relative flex flex-1 flex-col overflow-y-auto overflow-x-hidden"
      >
        <section
          data-testid="planning-kanban"
          style={
            kanbanFullscreen
              ? {
                  position: "fixed",
                  inset: 0,
                  zIndex: 90,
                  width: "100vw",
                  height: "100vh",
                  minHeight: "100vh",
                }
              : { height: kanbanPanelHeight }
          }
          className={cn(
            "planning-kanban-panel flex flex-none min-h-[52px] min-w-0 flex-col overflow-hidden bg-[var(--surface)] transition-[height] duration-200",
            kanbanCollapsed ? "" : "min-h-[240px]",
            kanbanFullscreen && "is-fullscreen",
          )}
        >
          <div
            ref={kanbanHeaderRef}
            className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-6 py-2.5"
          >
            <h2 className="text-sm font-medium text-[var(--foreground-strong)]">
              Task Flow
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleKanbanFullscreen}
                data-testid="planning-fit-toggle"
                aria-pressed={kanbanFullscreen}
                aria-label={
                  kanbanFullscreen
                    ? "Exit Task Flow full screen"
                    : "Open Task Flow full screen"
                }
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] shadow-sm transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--foreground-strong)]"
              >
                {kanbanFullscreen ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </button>
              <button
                type="button"
                onClick={toggleKanban}
                data-testid="planning-collapse-toggle"
                aria-expanded={!kanbanCollapsed}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] shadow-sm transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--foreground-strong)]"
              >
                {kanbanCollapsed ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronUp className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {!kanbanCollapsed ? (
            <div
              ref={kanbanScrollRef}
              className="min-h-0 flex-1 overflow-auto px-6 py-5"
              style={{ scrollbarWidth: "thin" }}
            >
              <div
                ref={setColumnListRefs}
                className="flex min-w-max items-start gap-6"
                data-testid="planning-column-list"
              >
                {columns.map((column) => {
                  const columnTasks = tasksByColumn.get(column.id) ?? [];
                  const tone = getColumnTone(column);
                  const isEditing = editingColumnId === column.id;

                  return (
                    <div
                      key={column.id}
                      data-testid={`planning-column-${column.id}`}
                      data-planning-column="true"
                      className={cn(
                        "flex w-[17.6rem] shrink-0 flex-col gap-3 p-0 transition-colors",
                        draggingColumnId === column.id && "opacity-50",
                      )}
                      onDragOver={(e) => handleDragOver(e, column)}
                      onDragLeave={(e) => handleDragLeave(e, column)}
                      onDrop={(e) => handleDrop(e, column)}
                    >
                      <div
                        data-testid={`planning-column-grip-${column.id}`}
                        className="flex min-h-8 items-center gap-2"
                        draggable
                        onDragStart={(e) => handleColumnDragStart(e, column.id)}
                        onDragEnd={handleColumnDragEnd}
                      >
                        <GripHorizontal className="h-4 w-4 cursor-grab text-[var(--muted-foreground)]" />
                        {isEditing ? (
                          <input
                            ref={editInputRef}
                            aria-label="Column name"
                            value={column.label}
                            onChange={(event) =>
                              updateColumnLabel(column.id, event.target.value)
                            }
                            onBlur={() => finishEditingColumn(column.id)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === "Escape") {
                                event.preventDefault();
                                finishEditingColumn(column.id);
                              }
                            }}
                            className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm font-semibold text-[var(--foreground-strong)] outline-none focus:border-[var(--accent-strong)]"
                          />
                        ) : (
                          <h3
                            className={cn(
                              "min-w-0 truncate text-xs font-bold uppercase tracking-normal",
                              tone.label,
                            )}
                            onDoubleClick={() => {
                              setEditingColumnId(column.id);
                            }}
                          >
                            {column.label}
                          </h3>
                        )}
                        <span
                          className={cn(
                            "rounded px-2 py-1 text-xs font-semibold",
                            tone.count,
                          )}
                        >
                          {columnTasks.length}
                        </span>
                        <button
                          type="button"
                          aria-label={`Rename ${column.label}`}
                          onClick={() => setEditingColumnId(column.id)}
                          className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--foreground-strong)]"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                        {column.kind === "custom" && !column.locked ? (
                          <button
                            type="button"
                            aria-label={`Delete ${column.label}`}
                            onClick={() => deleteColumn(column.id)}
                            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--danger)]"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>

                      <div
                        className="flex flex-col gap-3 pr-1"
                        style={{ scrollbarWidth: "thin" }}
                      >
                        {columnTasks.map((task) => {
                          const progress = taskProgress(task);
                          const projectColor = task.project?.color ?? task.area?.color;
                          const isDone =
                            column.kind === "status" && column.status === "done";

                          return (
                            <button
                              key={task.id}
                              type="button"
                              data-testid={`planning-card-${task.id}`}
                              data-draggable-queue-task="true"
                              data-task-id={task.id}
                              data-block-id={task.primaryBlock?.id ?? ""}
                              data-title={task.title}
                              data-duration={task.estimatedMinutes}
                              draggable
                              onDragStart={(e) => handleDragStart(e, task.id)}
                              onDragEnd={handleDragEnd}
                              onClick={() => onOpenTask(task.id)}
                              className={cn(
                                "group rounded-lg border border-l-4 border-[var(--border)] bg-[var(--surface)] p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-soft)] active:cursor-grabbing",
                                getTaskAccent(task, column),
                                column.kind === "status" &&
                                  column.status === "in_progress" &&
                                  "border-dashed border-[rgba(59,130,246,0.32)] bg-[rgba(59,130,246,0.03)]",
                                isDone &&
                                  "bg-[var(--surface-muted)] opacity-75 hover:opacity-100",
                              )}
                            >
                              <div className="flex items-start gap-3">
                                {isDone ? (
                                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
                                ) : null}
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-3">
                                    <h4
                                      className={cn(
                                        "min-w-0 text-sm font-normal leading-snug text-[var(--foreground-strong)] transition-colors group-hover:text-[var(--accent-strong)]",
                                        isDone && "text-[var(--muted-foreground)] line-through",
                                      )}
                                    >
                                      {task.title}
                                    </h4>
                                    {task.priority === "critical" ||
                                    task.priority === "high" ? (
                                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]" />
                                    ) : null}
                                  </div>

                                  {progress ? (
                                    <div className="mt-4 flex items-center gap-3">
                                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-muted)]">
                                        <div
                                          className="h-full rounded-full bg-[var(--accent-strong)]"
                                          style={{ width: `${progress.percentage}%` }}
                                        />
                                      </div>
                                      <span className="text-xs font-medium text-[var(--muted-foreground)]">
                                        {progress.completed}/{progress.total}
                                      </span>
                                    </div>
                                  ) : null}

                                  <div className="mt-4 flex items-center justify-between gap-3 text-sm text-[var(--muted-foreground)]">
                                    <div className="min-w-0">
                                      {task.project?.name || task.area?.name ? (
                                        <span className="inline-flex max-w-[160px] items-center gap-1.5 rounded bg-[var(--surface-muted)] px-2 py-1 text-xs font-semibold">
                                          {projectColor ? (
                                            <span
                                              className="h-1.5 w-1.5 shrink-0 rounded-full"
                                              style={{ backgroundColor: projectColor }}
                                            />
                                          ) : null}
                                          <span className="truncate">
                                            {task.project?.name ?? task.area?.name}
                                          </span>
                                        </span>
                                      ) : null}
                                    </div>
                                    <span className="inline-flex shrink-0 items-center gap-1 text-xs">
                                      <Clock3 className="h-3.5 w-3.5" />
                                      {formatMinutes(task.estimatedMinutes)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      <button
                        type="button"
                        onClick={openNewTaskOutsideFullscreen}
                        className="inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--foreground-strong)]"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add Task
                      </button>
                    </div>
                  );
                })}
                <div className="flex w-[17.6rem] shrink-0 flex-col pt-8">
                  <button
                    type="button"
                    onClick={addCustomColumn}
                    data-testid="planning-new-column"
                    className="inline-flex h-10 w-fit items-center gap-2 rounded-lg border border-dashed border-[var(--border-strong)] bg-transparent px-3 text-sm font-medium text-[var(--muted-foreground)] transition-colors hover:border-[var(--foreground)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground-strong)]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    New Column
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        {!kanbanCollapsed && !kanbanFullscreen ? (
          <div
            ref={resizerRef}
            className="group z-10 flex h-1.5 shrink-0 cursor-row-resize items-center justify-center border-y border-[var(--border)] bg-[var(--surface-muted)] transition-colors hover:bg-[var(--border)]"
          >
            <div className="h-1 w-8 rounded-full bg-[var(--border-strong)] transition-colors group-hover:bg-[var(--muted-foreground)]" />
          </div>
        ) : null}

        <section
          className={cn(
            "planning-schedule-panel relative flex flex-none flex-col",
            calendarFullscreen && "is-fullscreen",
          )}
          style={
            calendarFullscreen
              ? {
                  position: "fixed",
                  inset: 0,
                  zIndex: 100,
                  width: "100vw",
                  height: "100vh",
                  minHeight: "100vh",
                }
              : {
                  height: `${SCHEDULE_PANEL_HEIGHT}px`,
                  minHeight: `${SCHEDULE_PANEL_HEIGHT}px`,
                }
          }
        >
          <div className="planning-schedule-header flex shrink-0 items-center justify-between gap-3 px-6 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <CalendarDays className="h-4 w-4 text-[var(--muted-foreground)]" />
              <h2 className="text-sm font-medium text-[var(--foreground-strong)]">
                Schedule
              </h2>
              <p className="text-sm text-[var(--muted-foreground)]">
                Drag tasks from pipeline to schedule
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCalendarFullscreen((current) => !current)}
              aria-label={
                calendarFullscreen
                  ? "Exit calendar full screen"
                  : "Open calendar full screen"
              }
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--foreground-strong)]"
            >
              {calendarFullscreen ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </button>
          </div>
          <div className="planning-calendar-shell relative flex-1 overflow-hidden px-2 pb-4 pr-4">
            {calendarElement}
          </div>
        </section>
      </div>
    </div>
  );
}
