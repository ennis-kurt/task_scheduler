"use client";

import { Icon } from "@iconify/react";
import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { ProjectPlan, AreaRecord } from "@/lib/planner/types";
import { UserButton } from "@clerk/nextjs";

export type ActiveViewType =
  | "inbox"
  | "planning"
  | "focus"
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

export function ThemeSelector() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const selectedTheme = mounted ? theme ?? "system" : "system";
  const activeTheme = selectedTheme === "system" ? resolvedTheme ?? "light" : selectedTheme;
  const options = [
    { value: "system", label: "System", icon: "solar:monitor-linear" },
    { value: "light", label: "Light", icon: "solar:sun-2-linear" },
    { value: "dark", label: "Dark", icon: "solar:moon-linear" },
    { value: "aura", label: "Aura", icon: "solar:palette-linear" },
    { value: "neon", label: "Neon", icon: "solar:bolt-linear" },
    { value: "elegant", label: "Elegant", icon: "solar:stars-linear" },
  ];
  const activeOption =
    options.find((option) => option.value === selectedTheme) ??
    options.find((option) => option.value === activeTheme) ??
    options[0];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[var(--muted-foreground)] transition-colors hover:bg-[var(--button-ghost-hover)] hover:text-[var(--foreground-strong)]"
        >
          <Icon icon={activeOption.icon} width="18" />
          <span className="text-sm">Theme</span>
          <span className="ml-auto text-xs font-medium">{activeOption.label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="right"
        className="w-44 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-elevated)] p-1.5 shadow-[var(--shadow-float)]"
      >
        {options.map((option) => {
          const active = selectedTheme === option.value;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setTheme(option.value)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                active
                  ? "bg-[var(--accent-soft)] font-medium text-[var(--foreground-strong)]"
                  : "text-[var(--muted-foreground)] hover:bg-[var(--button-ghost-hover)] hover:text-[var(--foreground-strong)]",
              )}
            >
              <Icon icon={option.icon} width="17" />
              {option.label}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

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
    <aside className="hidden h-full w-[clamp(12.9rem,15.8vw,14.9rem)] shrink-0 flex-col border-r border-[var(--border-strong)] bg-[var(--surface-muted)] transition-colors md:flex">
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
            onClick={() => onChangeView("focus")}
            className={cn(
              "flex items-center gap-2.5 px-2 py-1.5 rounded-md transition-colors text-sm w-full text-left",
              activeView === "focus"
                ? "bg-[var(--accent-soft)] text-[var(--foreground-strong)] font-medium"
                : "text-[var(--muted-foreground)] hover:bg-[var(--button-ghost-hover)] hover:text-[var(--foreground-strong)]"
            )}
          >
            <Icon icon="solar:target-linear" width="18" />
            <span>Focus</span>
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
          className="w-full flex items-center justify-center gap-2 bg-[var(--button-solid-bg)] hover:bg-[var(--button-solid-hover)] text-[var(--button-solid-fg)] rounded-md py-2 px-3 text-sm font-medium transition-colors shadow-sm"
        >
          <Icon icon="solar:add-circle-linear" width="18" />
          Create Task
        </button>
        <ThemeSelector />
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
