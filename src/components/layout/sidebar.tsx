import { Icon } from "@iconify/react";
import { cn } from "@/lib/utils";
import type { ProjectPlan, AreaRecord } from "@/lib/planner/types";
import { UserButton } from "@clerk/nextjs";

export type ActiveViewType =
  | "inbox"
  | "planning"
  | "capacity"
  | `project:${string}`
  | `area:${string}`;

export type SidebarProps = {
  activeView: ActiveViewType;
  onChangeView: (view: ActiveViewType) => void;
  projectPlans: ProjectPlan[];
  areas: AreaRecord[];
  onOpenNewProject: () => void;
  onOpenNewArea: () => void;
  onOpenCreateTask: () => void;
  onOpenSettings: () => void;
  showUserButton: boolean;
  inboxCount: number;
};

export function Sidebar({
  activeView,
  onChangeView,
  projectPlans,
  areas,
  onOpenNewProject,
  onOpenNewArea,
  onOpenCreateTask,
  onOpenSettings,
  showUserButton,
  inboxCount,
}: SidebarProps) {
  return (
    <aside className="w-60 h-full border-r border-[var(--border-strong)] bg-[var(--surface-muted)] flex-col hidden md:flex shrink-0 transition-colors">
      {/* Brand / User */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-2 w-full p-1.5 -ml-1.5 rounded-md">
          <div className="w-6 h-6 rounded bg-[var(--foreground-strong)] text-[var(--surface)] flex items-center justify-center font-semibold text-xs tracking-tighter">
            IN
          </div>
          <span className="font-semibold tracking-tight text-[var(--foreground-strong)] text-sm uppercase">INFLARA</span>
        </div>
        {showUserButton ? (
          <UserButton
            appearance={{
              elements: {
                avatarBox: "w-6 h-6",
              },
            }}
          />
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-6">
        {/* Main Nav */}
        <nav className="flex flex-col gap-0.5">
          <button
            onClick={() => onChangeView("inbox")}
            className={cn(
              "flex items-center gap-2.5 px-2 py-1.5 rounded-md transition-colors text-sm w-full text-left",
              activeView === "inbox"
                ? "bg-[var(--accent-soft)] text-[var(--foreground-strong)] font-medium"
                : "text-[var(--muted-foreground)] hover:bg-[var(--button-ghost-hover)] hover:text-[var(--foreground-strong)]"
            )}
          >
            <Icon icon="solar:inbox-in-linear" width="18" />
            <span>Inbox</span>
            {inboxCount ? (
              <span className="ml-auto text-xs font-medium text-[var(--muted-foreground)]">
                {inboxCount}
              </span>
            ) : null}
          </button>
          <button
            onClick={() => onChangeView("planning")}
            className={cn(
              "flex items-center gap-2.5 px-2 py-1.5 rounded-md transition-colors text-sm w-full text-left",
              activeView === "planning"
                ? "bg-[var(--accent-soft)] text-[var(--foreground-strong)] font-medium"
                : "text-[var(--muted-foreground)] hover:bg-[var(--button-ghost-hover)] hover:text-[var(--foreground-strong)]"
            )}
          >
            <Icon icon="solar:calendar-date-linear" width="18" />
            <span>Planning</span>
          </button>
          <button
            onClick={() => onChangeView("capacity")}
            className={cn(
              "flex items-center gap-2.5 px-2 py-1.5 rounded-md transition-colors text-sm w-full text-left",
              activeView === "capacity"
                ? "bg-[var(--accent-soft)] text-[var(--foreground-strong)] font-medium"
                : "text-[var(--muted-foreground)] hover:bg-[var(--button-ghost-hover)] hover:text-[var(--foreground-strong)]"
            )}
          >
            <Icon icon="solar:layers-minimalistic-linear" width="18" />
            <span>Capacity</span>
          </button>
        </nav>

        {/* Projects */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between px-2 py-1 group">
            <span className="text-xs font-medium tracking-tight text-[var(--muted-foreground)] uppercase">Projects</span>
            <button
              type="button"
              aria-label="Add project"
              className="text-[var(--muted-foreground)] opacity-0 group-hover:opacity-100 hover:text-[var(--foreground-strong)] transition-all"
              onClick={onOpenNewProject}
            >
              <Icon icon="solar:add-square-linear" width="16" />
            </button>
          </div>
          {projectPlans.map((plan) => {
            const isActive = activeView === `project:${plan.project.id}`;

            return (
              <button
                key={plan.project.id}
                onClick={() => onChangeView(`project:${plan.project.id}`)}
                className={cn(
                  "flex items-center gap-2.5 px-2 py-1.5 rounded-md transition-colors text-sm w-full text-left",
                  isActive
                    ? "bg-[var(--accent-soft)] text-[var(--foreground-strong)] font-medium"
                    : "text-[var(--muted-foreground)] hover:bg-[var(--button-ghost-hover)] hover:text-[var(--foreground-strong)]"
                )}
              >
                <div
                  className="w-2 h-2 rounded-full border"
                  style={{
                    borderColor: plan.project.color,
                    backgroundColor: isActive ? plan.project.color : "transparent",
                  }}
                />
                <span className="truncate">{plan.project.name}</span>
              </button>
            );
          })}
        </div>

        {/* Areas */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between px-2 py-1 group">
            <span className="text-xs font-medium tracking-tight text-[var(--muted-foreground)] uppercase">Areas</span>
            <button
              type="button"
              aria-label="Add area"
              className="text-[var(--muted-foreground)] opacity-0 group-hover:opacity-100 hover:text-[var(--foreground-strong)] transition-all"
              onClick={onOpenNewArea}
            >
              <Icon icon="solar:add-square-linear" width="16" />
            </button>
          </div>
          {areas.map((area) => {
             const isActive = activeView === `area:${area.id}`;
             return (
               <button
                 key={area.id}
                 onClick={() => onChangeView(`area:${area.id}`)}
                 className={cn(
                   "flex items-center gap-2.5 px-2 py-1.5 rounded-md transition-colors text-sm w-full text-left",
                   isActive
                     ? "bg-[var(--accent-soft)] text-[var(--foreground-strong)] font-medium"
                     : "text-[var(--muted-foreground)] hover:bg-[var(--button-ghost-hover)] hover:text-[var(--foreground-strong)]"
                 )}
               >
                 <Icon icon="solar:hashtag-linear" width="16" className="text-[var(--muted-foreground)]" />
                 <span className="truncate">{area.name}</span>
               </button>
             );
          })}
        </div>
      </div>

      {/* Settings / Quick Add */}
      <div className="p-3 border-t border-[var(--border)] flex flex-col gap-2">
        <button
          onClick={onOpenCreateTask}
          className="w-full flex items-center justify-center gap-2 bg-[var(--foreground-strong)] hover:bg-black/90 text-[var(--surface)] dark:text-black rounded-md py-2 px-3 text-sm font-medium transition-colors shadow-sm"
        >
          <Icon icon="solar:add-circle-linear" width="18" />
          Create Task
        </button>
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-2.5 px-2 py-1.5 rounded-md text-[var(--muted-foreground)] hover:bg-[var(--button-ghost-hover)] hover:text-[var(--foreground-strong)] transition-colors mt-1 w-full text-left"
        >
          <Icon icon="solar:settings-linear" width="18" />
          <span className="text-sm">Settings</span>
        </button>
      </div>
    </aside>
  );
}
