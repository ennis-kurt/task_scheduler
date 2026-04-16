import type {
  DayCapacity,
  PreferredTimeBand,
  Priority,
  SavedFilter,
  UserSettingsRecord,
} from "@/lib/planner/types";

export const PRIORITIES: Priority[] = ["low", "medium", "high", "critical"];

export const TIME_BANDS: PreferredTimeBand[] = [
  "anytime",
  "morning",
  "afternoon",
  "evening",
];

export const DEFAULT_SETTINGS: UserSettingsRecord = {
  userId: "demo-user",
  timezone: "America/New_York",
  weekStart: 1,
  slotMinutes: 30,
  workHours: {
    0: null,
    1: { start: "08:00", end: "17:00" },
    2: { start: "08:00", end: "17:00" },
    3: { start: "08:00", end: "17:00" },
    4: { start: "08:00", end: "17:00" },
    5: { start: "08:00", end: "16:00" },
    6: null,
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const SAVED_FILTERS: SavedFilter[] = [
  {
    id: "inbox",
    label: "Inbox",
    description: "Everything not placed on the calendar yet.",
  },
  {
    id: "urgent",
    label: "Urgent",
    description: "High-priority work due soon.",
  },
  {
    id: "deep-work",
    label: "Deep Work",
    description: "Long-focus tasks worth protecting space for.",
  },
  {
    id: "morning",
    label: "Morning",
    description: "Tasks best handled before lunch.",
  },
];

export const EMPTY_CAPACITY: DayCapacity = {
  date: "",
  workMinutes: 0,
  scheduledTaskMinutes: 0,
  fixedEventMinutes: 0,
  remainingMinutes: 0,
  overloaded: false,
};
