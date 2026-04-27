import React, { useState, useRef, useEffect, ReactNode } from "react";
import { Icon } from "@iconify/react";
import { cn } from "@/lib/utils";
import type { PlannerTask, TaskStatus } from "@/lib/planner/types";
import { format } from "date-fns";

export interface PlanningViewProps {
  tasks: PlannerTask[];
  onTaskDrop: (taskId: string, newStatus: TaskStatus) => void;
  onOpenTask: (taskId: string) => void;
  calendarElement: ReactNode;
  externalDragRef?: React.Ref<HTMLDivElement>;
  surface: "day" | "week" | "agenda";
  onChangeSurface: (surface: "day" | "week" | "agenda") => void;
  focusedDate: string;
  onNavigateDate: (direction: "prev" | "today" | "next") => void;
}

const COLUMNS: { id: TaskStatus; label: string; countClass: string }[] = [
  { id: "todo", label: "TO DO", countClass: "bg-gray-200 text-gray-600" },
  { id: "in_progress", label: "IN PROGRESS", countClass: "bg-blue-100 text-blue-600" },
  { id: "done", label: "DONE", countClass: "bg-green-100 text-green-600" },
];

function formatMinutes(minutes: number) {
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

export function PlanningView({
  tasks,
  onTaskDrop,
  onOpenTask,
  calendarElement,
  externalDragRef,
  surface,
  onChangeSurface,
  focusedDate,
  onNavigateDate,
}: PlanningViewProps) {
  const [topHeight, setTopHeight] = useState(50);
  const resizerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Resizer logic
  useEffect(() => {
    const resizer = resizerRef.current;
    const container = containerRef.current;
    if (!resizer || !container) return;

    let isResizing = false;

    const startResize = () => {
      isResizing = true;
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
    };

    const doResize = (e: MouseEvent) => {
      if (!isResizing) return;
      const containerRect = container.getBoundingClientRect();
      const newHeight = ((e.clientY - containerRect.top) / containerRect.height) * 100;
      if (newHeight > 20 && newHeight < 80) {
        setTopHeight(newHeight);
      }
    };

    const stopResize = () => {
      isResizing = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    resizer.addEventListener("mousedown", startResize);
    document.addEventListener("mousemove", doResize);
    document.addEventListener("mouseup", stopResize);

    return () => {
      resizer.removeEventListener("mousedown", startResize);
      document.removeEventListener("mousemove", doResize);
      document.removeEventListener("mouseup", stopResize);
    };
  }, []);

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData("text/plain", taskId);
    e.currentTarget.classList.add("opacity-50");
  };

  const handleDragEnd = (e: React.DragEvent) => {
    e.currentTarget.classList.remove("opacity-50");
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add("bg-gray-50");
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove("bg-gray-50");
  };

  const handleDrop = (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    e.currentTarget.classList.remove("bg-gray-50");
    const taskId = e.dataTransfer.getData("text/plain");
    if (taskId) {
      onTaskDrop(taskId, status);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-white relative">
      {/* Header */}
      <header className="h-14 flex items-center justify-between px-6 border-b border-[var(--border)] bg-white shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-[var(--foreground-strong)]">Planning</h1>
          <div className="flex items-center bg-[var(--surface-muted)] rounded-md p-0.5">
            <button
              onClick={() => onChangeSurface("day")}
              data-testid="surface-day"
              className={cn(
                "px-3 py-1 text-sm font-medium rounded-sm transition-all",
                surface === "day"
                  ? "bg-white text-[var(--foreground-strong)] shadow-sm"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground-strong)]"
              )}
            >
              Day
            </button>
            <button
              onClick={() => onChangeSurface("week")}
              data-testid="surface-week"
              className={cn(
                "px-3 py-1 text-sm font-medium rounded-sm transition-all",
                surface === "week"
                  ? "bg-white text-[var(--foreground-strong)] shadow-sm"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground-strong)]"
              )}
            >
              Week
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigateDate("prev")}
            aria-label="Go to previous dates"
            className="p-1.5 rounded-md hover:bg-[var(--surface-muted)] text-[var(--muted-foreground)] transition-colors"
          >
            <Icon icon="solar:alt-arrow-left-linear" width="18" />
          </button>
          <span className="text-sm font-medium text-[var(--foreground-strong)] min-w-[120px] text-center">
            {format(new Date(focusedDate + "T12:00:00"), "MMMM d, yyyy")}
          </span>
          <button
            onClick={() => onNavigateDate("next")}
            aria-label="Go to next dates"
            className="p-1.5 rounded-md hover:bg-[var(--surface-muted)] text-[var(--muted-foreground)] transition-colors"
          >
            <Icon icon="solar:alt-arrow-right-linear" width="18" />
          </button>
          <button
            onClick={() => onNavigateDate("today")}
            aria-label="Jump to today"
            className="ml-2 px-3 py-1.5 text-sm font-medium text-[var(--foreground-strong)] bg-[var(--surface-muted)] hover:bg-[var(--border)] rounded-md transition-colors"
          >
            Today
          </button>
        </div>
      </header>

      {/* Main Content (Split View) */}
      <div ref={containerRef} className="flex-1 flex flex-col overflow-hidden relative">
        {/* Top Pane: Kanban */}
        <div style={{ height: `${topHeight}%` }} className="flex flex-col min-h-[200px]">
          <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between shrink-0">
            <h2 className="text-base font-semibold text-[var(--foreground-strong)]">Unscheduled Tasks & Pipeline</h2>
            <button
              type="button"
              disabled
              className="text-sm text-[var(--muted-foreground)] flex items-center gap-1 opacity-50 cursor-not-allowed"
            >
              <Icon icon="solar:filter-linear" width="16" />
              Filter
            </button>
          </div>
          <div className="flex-1 overflow-x-auto overflow-y-hidden p-6" style={{ scrollbarWidth: "thin" }}>
            <div ref={externalDragRef} className="flex gap-6 h-full min-w-max">
              {COLUMNS.map((col) => {
                const columnTasks = tasks.filter((t) => t.status === col.id);
                return (
                  <div
                    key={col.id}
                    data-testid={`planning-column-${col.id}`}
                    className="w-[320px] flex flex-col bg-[var(--surface-muted)] rounded-xl border border-[var(--border)] overflow-hidden transition-colors"
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, col.id)}
                  >
                    <div className="p-3 border-b border-[var(--border)] flex items-center justify-between bg-[var(--surface-muted)]">
                      <h3 className="text-xs font-semibold text-[var(--muted-foreground)] tracking-wider">
                        {col.label}
                      </h3>
                      <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", col.countClass)}>
                        {columnTasks.length}
                      </span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3" style={{ scrollbarWidth: "thin" }}>
                      {columnTasks.map((task) => (
                        <div
                          key={task.id}
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
                          className="bg-white p-3 rounded-lg border border-[var(--border)] shadow-sm cursor-grab active:cursor-grabbing hover:border-gray-300 transition-all group"
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <h4 className="text-sm font-medium text-[var(--foreground-strong)] leading-tight group-hover:text-blue-600 transition-colors">
                              {task.title}
                            </h4>
                            {task.priority === "high" && (
                              <Icon icon="solar:flag-linear" width="14" className="text-red-500 shrink-0" />
                            )}
                          </div>
                          {task.notes && (
                            <p className="text-xs text-[var(--muted-foreground)] line-clamp-2 mb-3">
                              {task.notes}
                            </p>
                          )}
                          <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)] mt-2">
                            <div className="flex items-center gap-1.5">
                              {task.project?.name && (
                                <span className="bg-[var(--surface-muted)] px-1.5 py-0.5 rounded text-[10px] font-medium truncate max-w-[120px]">
                                  {task.project.name}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <Icon icon="solar:clock-circle-linear" width="12" />
                              <span>{formatMinutes(task.estimatedMinutes)}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Resizer */}
        <div
          ref={resizerRef}
          className="h-1.5 bg-[var(--border)] hover:bg-blue-400 cursor-row-resize transition-colors flex items-center justify-center resizer-handle group z-10"
        >
          <div className="w-8 h-1 bg-gray-300 rounded-full group-hover:bg-white transition-colors"></div>
        </div>

        {/* Bottom Pane: Schedule */}
        <div style={{ height: `${100 - topHeight}%` }} className="flex flex-col min-h-[200px] bg-white relative">
          <div className="absolute inset-0 [&_.fc]:h-full [&_.fc-theme-standard_.fc-scrollgrid]:border-none [&_.fc-theme-standard_td]:border-gray-100 [&_.fc-theme-standard_th]:border-gray-100 [&_.fc-col-header-cell-cushion]:py-3 [&_.fc-col-header-cell-cushion]:font-medium [&_.fc-timegrid-slot-label-cushion]:text-xs [&_.fc-timegrid-slot-label-cushion]:text-gray-400 [&_.fc-timegrid-axis-cushion]:text-xs [&_.fc-timegrid-axis-cushion]:text-gray-400 [&_.fc-event]:rounded-md [&_.fc-event]:border-none [&_.fc-event]:shadow-sm">
            {calendarElement}
          </div>
        </div>
      </div>
    </div>
  );
}
