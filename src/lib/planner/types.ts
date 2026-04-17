export type Priority = "low" | "medium" | "high" | "critical";
export type PreferredTimeBand =
  | "anytime"
  | "morning"
  | "afternoon"
  | "evening";
export type TaskStatus = "todo" | "in_progress" | "done";
export type PlannerItemSource = "task" | "event";
export type PlannerView = "timeGridWeek" | "timeGridDay" | "listDay";
export type PlannerSurface = "week" | "day" | "agenda";

export type RecurrenceRule = {
  frequency: "none" | "daily" | "weekly" | "monthly" | "weekdays";
  interval?: number;
  daysOfWeek?: number[];
  until?: string | null;
};

export type AppUserRecord = {
  id: string;
  email: string;
  fullName: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkHourBlock = {
  start: string;
  end: string;
};

export type UserSettingsRecord = {
  userId: string;
  timezone: string;
  weekStart: number;
  slotMinutes: number;
  workHours: Record<number, WorkHourBlock | null>;
  createdAt: string;
  updatedAt: string;
};

export type AreaRecord = {
  id: string;
  userId: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectRecord = {
  id: string;
  userId: string;
  areaId: string | null;
  name: string;
  color: string;
  deadlineAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MilestoneRecord = {
  id: string;
  userId: string;
  projectId: string;
  name: string;
  description: string;
  startDate: string;
  deadline: string;
  createdAt: string;
  updatedAt: string;
};

export type TagRecord = {
  id: string;
  userId: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
};

export type TaskRecord = {
  id: string;
  userId: string;
  title: string;
  notes: string;
  priority: Priority;
  estimatedMinutes: number;
  dueAt: string | null;
  preferredTimeBand: PreferredTimeBand;
  preferredWindowStart: string | null;
  preferredWindowEnd: string | null;
  status: TaskStatus;
  completedAt: string | null;
  areaId: string | null;
  projectId: string | null;
  milestoneId: string | null;
  recurrence: RecurrenceRule | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskBlockRecord = {
  id: string;
  userId: string;
  taskId: string;
  startsAt: string;
  endsAt: string;
  createdAt: string;
  updatedAt: string;
};

export type EventRecord = {
  id: string;
  userId: string;
  title: string;
  notes: string;
  location: string;
  startsAt: string;
  endsAt: string;
  recurrence: RecurrenceRule | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskChecklistItemRecord = {
  id: string;
  taskId: string;
  label: string;
  completed: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type TaskTagRecord = {
  taskId: string;
  tagId: string;
};

export type WorkspaceSnapshot = {
  user: AppUserRecord;
  settings: UserSettingsRecord;
  areas: AreaRecord[];
  projects: ProjectRecord[];
  milestones: MilestoneRecord[];
  tags: TagRecord[];
  tasks: TaskRecord[];
  taskBlocks: TaskBlockRecord[];
  events: EventRecord[];
  checklistItems: TaskChecklistItemRecord[];
  taskTags: TaskTagRecord[];
};

export type PlannerTask = TaskRecord & {
  area: AreaRecord | null;
  project: ProjectRecord | null;
  milestone: MilestoneRecord | null;
  tags: TagRecord[];
  checklist: TaskChecklistItemRecord[];
  hasBlock: boolean;
  primaryBlock: {
    id: string;
    startsAt: string;
    endsAt: string;
  } | null;
};

export type PlannerCalendarItem = {
  id: string;
  sourceId: string;
  instanceId: string;
  source: PlannerItemSource;
  taskId?: string;
  title: string;
  start: string;
  end: string;
  notes: string;
  location?: string;
  priority?: Priority;
  status?: TaskStatus;
  areaId?: string | null;
  projectId?: string | null;
  recurring: boolean;
  readOnly: boolean;
};

export type DayCapacity = {
  date: string;
  workMinutes: number;
  scheduledTaskMinutes: number;
  fixedEventMinutes: number;
  remainingMinutes: number;
  overloaded: boolean;
};

export type SavedFilter = {
  id: string;
  label: string;
  description: string;
};

export type MilestoneHealth = "not_started" | "on_track" | "at_risk" | "done";

export type PlannerMilestone = MilestoneRecord & {
  project: ProjectRecord | null;
  tasks: PlannerTask[];
  completionPercentage: number;
  completedTaskCount: number;
  totalTaskCount: number;
  completedMinutes: number;
  totalMinutes: number;
  remainingMinutes: number;
  health: MilestoneHealth;
};

export type ProjectBurndownPoint = {
  date: string;
  remainingMinutes: number;
  idealRemainingMinutes: number;
  completedMinutes: number;
};

export type ProjectStatusBreakdown = {
  status: TaskStatus;
  label: string;
  count: number;
  minutes: number;
};

export type ProjectPlan = {
  project: ProjectRecord;
  milestones: PlannerMilestone[];
  standaloneTasks: PlannerTask[];
  tasks: PlannerTask[];
  completionPercentage: number;
  completedTaskCount: number;
  totalTaskCount: number;
  completedMinutes: number;
  totalMinutes: number;
  remainingMinutes: number;
  statusBreakdown: ProjectStatusBreakdown[];
  burndown: ProjectBurndownPoint[];
  scheduleRange: {
    start: string;
    end: string;
  };
  health: Exclude<MilestoneHealth, "not_started">;
};

export type PlannerPayload = {
  generatedAt: string;
  mode: "clerk" | "demo";
  user: AppUserRecord;
  settings: UserSettingsRecord;
  areas: AreaRecord[];
  projects: ProjectRecord[];
  milestones: MilestoneRecord[];
  projectPlans: ProjectPlan[];
  tags: TagRecord[];
  events: EventRecord[];
  tasks: PlannerTask[];
  unscheduledTasks: PlannerTask[];
  overdueTasks: PlannerTask[];
  scheduledItems: PlannerCalendarItem[];
  capacity: DayCapacity[];
  overdueCount: number;
  todayCount: number;
  unscheduledCount: number;
  savedFilters: SavedFilter[];
};

export type PlannerRange = {
  start: string;
  end: string;
};

export type NewTaskInput = {
  title: string;
  notes?: string;
  priority?: Priority;
  estimatedMinutes?: number;
  dueAt?: string | null;
  preferredTimeBand?: PreferredTimeBand;
  preferredWindowStart?: string | null;
  preferredWindowEnd?: string | null;
  areaId?: string | null;
  projectId?: string | null;
  milestoneId?: string | null;
  tagIds?: string[];
  checklist?: Array<{
    id?: string;
    label: string;
    completed?: boolean;
  }>;
  recurrence?: RecurrenceRule | null;
  startsAt?: string | null;
  endsAt?: string | null;
};

export type UpdateTaskInput = Partial<NewTaskInput> & {
  status?: TaskStatus;
  completedAt?: string | null;
};

export type NewMilestoneInput = {
  projectId: string;
  name: string;
  description?: string;
  startDate: string;
  deadline: string;
};

export type UpdateMilestoneInput = Partial<NewMilestoneInput>;

export type NewTaskBlockInput = {
  taskId: string;
  startsAt: string;
  endsAt: string;
};

export type UpdateTaskBlockInput = Partial<NewTaskBlockInput>;

export type NewEventInput = {
  title: string;
  notes?: string;
  location?: string;
  startsAt: string;
  endsAt: string;
  recurrence?: RecurrenceRule | null;
};

export type UpdateEventInput = Partial<NewEventInput>;

export type NewTaxonomyInput = {
  name: string;
  color?: string;
  areaId?: string | null;
  deadlineAt?: string | null;
};

export type UpdateSettingsInput = Partial<
  Pick<UserSettingsRecord, "timezone" | "weekStart" | "slotMinutes" | "workHours">
>;
