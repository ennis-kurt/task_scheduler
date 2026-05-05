"use client";

import {
  CheckCircle2,
  ChevronDown,
  Filter,
  Flame,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Rocket,
  RotateCcw,
  Search,
  SkipForward,
  Timer,
  TrendingUp,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  buildPersistedFocusSession,
  formatFocusPhaseLabel,
  formatFocusTimer,
  playFocusChime,
  primeFocusChime,
  projectPersistedFocusSession,
  readPersistedFocusSession,
  writePersistedFocusSession,
  type PersistedFocusPhase as FocusPhase,
  type PersistedFocusPhaseKind as FocusPhaseKind,
} from "@/lib/planner/focus-session";
import { TASK_STATUS_LABELS, type PlannerTask, type TaskStatus } from "@/lib/planner/types";
import { cn } from "@/lib/utils";

type SprintProfileId =
  | "launch"
  | "admin"
  | "classic"
  | "dynamic"
  | "custom";

type SprintProfile = {
  id: SprintProfileId;
  name: string;
  bestFor: string;
  description: string;
  phases: FocusPhase[];
};

type FocusColumn =
  | {
      id: TaskStatus;
      kind: "status";
      label: string;
      status: TaskStatus;
    }
  | {
      id: string;
      kind: "custom";
      label: string;
    };

type FocusHistoryRecord = {
  id: string;
  taskId: string | null;
  taskTitle: string;
  projectName: string | null;
  profileName: string;
  minutes: number;
  completedAt: string;
};

export type FocusViewProps = {
  tasks: PlannerTask[];
  planningStorageKey: string;
  focusStorageKey: string;
  onTaskStatusChange: (taskId: string, status: TaskStatus) => void;
};

const DEFAULT_COLUMNS: FocusColumn[] = [
  { id: "todo", kind: "status", label: "To Do", status: "todo" },
  { id: "in_progress", kind: "status", label: "In Progress", status: "in_progress" },
  { id: "review", kind: "status", label: "Review", status: "review" },
  { id: "qa", kind: "status", label: "QA", status: "qa" },
  { id: "done", kind: "status", label: "Done", status: "done" },
];

const RING_RADIUS = 166;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function repeatingProfile(
  id: SprintProfileId,
  name: string,
  bestFor: string,
  focusMinutes: number,
  shortBreakMinutes: number,
  longBreakMinutes: number,
  description: string,
): SprintProfile {
  const phases: FocusPhase[] = [];

  for (let index = 0; index < 4; index += 1) {
    phases.push({
      id: `${id}-focus-${index + 1}`,
      kind: "focus",
      label: `Work ${index + 1}`,
      minutes: focusMinutes,
    });
    phases.push({
      id: `${id}-${index === 3 ? "long" : "break"}-${index + 1}`,
      kind: index === 3 ? "long_break" : "break",
      label: index === 3 ? "Long break" : "Break",
      minutes: index === 3 ? longBreakMinutes : shortBreakMinutes,
    });
  }

  return { id, name, bestFor, description, phases };
}

function dynamicProfile(): SprintProfile {
  const sequence: Array<[number, number]> = [
    [10, 3],
    [20, 5],
    [25, 5],
    [25, 8],
    [35, 15],
  ];

  return {
    id: "dynamic",
    name: "Dynamic Ramp",
    bestFor: "ADHD friendly deep work ramp up",
    description:
      "Starts easy, builds momentum, then ends with a longer deep work sprint.",
    phases: sequence.flatMap(([focusMinutes, breakMinutes], index) => [
      {
        id: `dynamic-focus-${index + 1}`,
        kind: "focus" as const,
        label: `Work ${index + 1}`,
        minutes: focusMinutes,
      },
      {
        id: `dynamic-break-${index + 1}`,
        kind: index === sequence.length - 1 ? "long_break" as const : "break" as const,
        label: index === sequence.length - 1 ? "Long break" : "Break",
        minutes: breakMinutes,
      },
    ]),
  };
}

const BASE_PROFILES: SprintProfile[] = [
  repeatingProfile(
    "launch",
    "Launch Sprint",
    "Starting when motivation is low",
    10,
    3,
    10,
    "A low friction starter mode for task initiation, procrastination, ADHD overwhelm, or beginning a task.",
  ),
  repeatingProfile(
    "admin",
    "Quick Admin",
    "Email, chores, cleanup, small tasks",
    15,
    5,
    15,
    "Short, structured work blocks for shallow work and task batching.",
  ),
  repeatingProfile(
    "classic",
    "Focus Classic",
    "Coding, writing, studying, analysis",
    25,
    5,
    15,
    "The default focused work profile, framed around one concrete outcome per sprint.",
  ),
  dynamicProfile(),
];

function buildCustomProfile(
  focusMinutes: number,
  breakMinutes: number,
  longBreakMinutes: number,
  rounds: number,
): SprintProfile {
  const phases: FocusPhase[] = [];

  for (let index = 0; index < rounds; index += 1) {
    phases.push({
      id: `custom-focus-${index + 1}`,
      kind: "focus",
      label: `Work ${index + 1}`,
      minutes: focusMinutes,
    });
    phases.push({
      id: `custom-${index === rounds - 1 ? "long" : "break"}-${index + 1}`,
      kind: index === rounds - 1 ? "long_break" : "break",
      label: index === rounds - 1 ? "Long break" : "Break",
      minutes: index === rounds - 1 ? longBreakMinutes : breakMinutes,
    });
  }

  return {
    id: "custom",
    name: "Custom",
    bestFor: "User defined",
    description: "Full control for users who already know their ideal rhythm.",
    phases,
  };
}

function isTaskStatus(value: unknown): value is TaskStatus {
  return (
    value === "todo" ||
    value === "in_progress" ||
    value === "review" ||
    value === "qa" ||
    value === "done"
  );
}

function normalizeColumns(value: unknown): FocusColumn[] {
  if (!Array.isArray(value)) {
    return DEFAULT_COLUMNS.map((column) => ({ ...column }));
  }

  const seen = new Set<string>();
  const columns: FocusColumn[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const raw = item as Record<string, unknown>;
    const id = typeof raw.id === "string" ? raw.id : "";
    const label = typeof raw.label === "string" && raw.label.trim()
      ? raw.label.trim()
      : "";

    if (!id || seen.has(id)) {
      continue;
    }

    if (isTaskStatus(id)) {
      columns.push({
        id,
        kind: "status",
        label: label || TASK_STATUS_LABELS[id],
        status: id,
      });
      seen.add(id);
      continue;
    }

    if (raw.kind === "custom" || id === "review") {
      columns.push({
        id,
        kind: "custom",
        label: label || (id === "review" ? "Review" : "Custom Column"),
      });
      seen.add(id);
    }
  }

  for (const column of DEFAULT_COLUMNS) {
    if (!seen.has(column.id)) {
      columns.push({ ...column });
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

function compareTasks(left: PlannerTask, right: PlannerTask) {
  const statusOrder: Record<TaskStatus, number> = {
    in_progress: 0,
    review: 1,
    qa: 2,
    todo: 3,
    done: 4,
  };

  return (
    statusOrder[left.status] - statusOrder[right.status] ||
    (left.dueAt ?? "").localeCompare(right.dueAt ?? "") ||
    left.title.localeCompare(right.title)
  );
}

function formatMinutes(minutes: number) {
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function phaseKindLabel(kind: FocusPhaseKind) {
  return formatFocusPhaseLabel(kind);
}

function phaseColor(kind: FocusPhaseKind) {
  if (kind === "long_break") {
    return "#17c98d";
  }

  return kind === "break" ? "#7957f6" : "#1688f3";
}

function phaseSoftColor(kind: FocusPhaseKind) {
  if (kind === "long_break") {
    return "rgba(22, 201, 141, 0.16)";
  }

  return kind === "break" ? "rgba(121, 87, 246, 0.14)" : "rgba(22, 136, 243, 0.14)";
}

function buildPhaseLabel(
  phase: FocusPhase,
  focusOrdinal: number,
  breakOrdinal: number,
) {
  if (phase.kind === "long_break") {
    return "LB";
  }

  return phase.kind === "focus" ? `W${focusOrdinal}` : `B${breakOrdinal}`;
}

function readHistory(storageKey: string): FocusHistoryRecord[] {
  try {
    const raw = window.localStorage.getItem(`${storageKey}:history:v1`);
    const parsed = raw ? JSON.parse(raw) : [];

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((record): record is FocusHistoryRecord => {
      if (!record || typeof record !== "object") {
        return false;
      }

      const candidate = record as Record<string, unknown>;
      return (
        typeof candidate.id === "string" &&
        typeof candidate.taskTitle === "string" &&
        typeof candidate.profileName === "string" &&
        typeof candidate.minutes === "number" &&
        typeof candidate.completedAt === "string"
      );
    });
  } catch {
    return [];
  }
}

function sameDayKey(value: string) {
  return value.slice(0, 10);
}

function isSprintProfileId(value: unknown): value is SprintProfileId {
  return (
    value === "launch" ||
    value === "admin" ||
    value === "classic" ||
    value === "dynamic" ||
    value === "custom"
  );
}

export function FocusView({
  tasks,
  planningStorageKey,
  focusStorageKey,
  onTaskStatusChange,
}: FocusViewProps) {
  const [restoredSession] = useState(() => readPersistedFocusSession(focusStorageKey));
  const [restoredRuntime] = useState(() =>
    restoredSession ? projectPersistedFocusSession(restoredSession) : null,
  );
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(
    () => {
      if (
        restoredSession?.selectedTaskId &&
        tasks.some((task) => task.id === restoredSession.selectedTaskId)
      ) {
        return restoredSession.selectedTaskId;
      }

      return tasks.find((task) => task.status === "in_progress")?.id ?? tasks[0]?.id ?? null;
    },
  );
  const [pendingTask, setPendingTask] = useState<PlannerTask | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<SprintProfileId>(() =>
    isSprintProfileId(restoredSession?.selectedProfileId)
      ? restoredSession.selectedProfileId
      : "dynamic",
  );
  const [customFocusMinutes, setCustomFocusMinutes] = useState(
    () => restoredSession?.customFocusMinutes ?? 38,
  );
  const [customBreakMinutes, setCustomBreakMinutes] = useState(
    () => restoredSession?.customBreakMinutes ?? 5,
  );
  const [customLongBreakMinutes, setCustomLongBreakMinutes] = useState(
    () => restoredSession?.customLongBreakMinutes ?? 15,
  );
  const [customRounds, setCustomRounds] = useState(
    () => restoredSession?.customRounds ?? 4,
  );
  const [phaseIndex, setPhaseIndex] = useState(() => restoredRuntime?.phaseIndex ?? 0);
  const [remainingSeconds, setRemainingSeconds] = useState(
    () => restoredRuntime?.remainingSeconds ?? 25 * 60,
  );
  const [running, setRunning] = useState(() => restoredRuntime?.running ?? false);
  const [history, setHistory] = useState<FocusHistoryRecord[]>([]);
  const [columns, setColumns] = useState<FocusColumn[]>(() =>
    DEFAULT_COLUMNS.map((column) => ({ ...column })),
  );
  const [taskColumnMap, setTaskColumnMap] = useState<Record<string, string>>({});
  const [activeTaskColumnId, setActiveTaskColumnId] = useState<string>("todo");

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [selectedTaskId, tasks],
  );

  const customProfile = useMemo(
    () =>
      buildCustomProfile(
        customFocusMinutes,
        customBreakMinutes,
        customLongBreakMinutes,
        customRounds,
      ),
    [customBreakMinutes, customFocusMinutes, customLongBreakMinutes, customRounds],
  );

  const profiles = useMemo(() => [...BASE_PROFILES, customProfile], [customProfile]);
  const profileOptions = useMemo(() => [customProfile, ...BASE_PROFILES], [customProfile]);
  const profileCards = useMemo(() => [...BASE_PROFILES, customProfile], [customProfile]);
  const selectedProfile =
    profiles.find((profile) => profile.id === selectedProfileId) ?? profiles[2];
  const activePhase = selectedProfile.phases[phaseIndex] ?? selectedProfile.phases[0];
  const activeDurationSeconds = Math.max(1, activePhase.minutes * 60);
  const profileSignature = `${selectedProfileId}:${customFocusMinutes}:${customBreakMinutes}:${customLongBreakMinutes}:${customRounds}`;
  const durationSignature = `${selectedProfile.id}:${phaseIndex}:${activeDurationSeconds}`;
  const profileSignatureRef = useRef(profileSignature);
  const durationSignatureRef = useRef(durationSignature);

  const totalSprintSeconds = useMemo(() => {
    return selectedProfile.phases.reduce((sum, phase) => sum + phase.minutes * 60, 0);
  }, [selectedProfile.phases]);

  const phaseTimeline = useMemo(() => {
    return selectedProfile.phases.map((phase, index) => {
      const previousPhases = selectedProfile.phases.slice(0, index);
      const elapsedSeconds = previousPhases.reduce(
        (sum, previousPhase) => sum + previousPhase.minutes * 60,
        0,
      );
      const focusOrdinal =
        previousPhases.filter((previousPhase) => previousPhase.kind === "focus").length +
        (phase.kind === "focus" ? 1 : 0);
      const breakOrdinal =
        previousPhases.filter((previousPhase) => previousPhase.kind === "break").length +
        (phase.kind === "break" ? 1 : 0);

      const durationSeconds = Math.max(1, phase.minutes * 60);
      const startRatio = totalSprintSeconds
        ? elapsedSeconds / totalSprintSeconds
        : 0;
      const midRatio = totalSprintSeconds
        ? (elapsedSeconds + durationSeconds / 2) / totalSprintSeconds
        : 0;

      return {
        phase,
        index,
        label: buildPhaseLabel(phase, focusOrdinal, breakOrdinal),
        startRatio,
        midRatio,
        widthRatio: totalSprintSeconds ? durationSeconds / totalSprintSeconds : 1,
      };
    });
  }, [selectedProfile.phases, totalSprintSeconds]);

  const elapsedSprintSeconds = useMemo(() => {
    let sum = 0;
    for (let i = 0; i < phaseIndex; i++) {
      sum += selectedProfile.phases[i]?.minutes * 60 || 0;
    }
    const currentPhaseElapsed = activeDurationSeconds - remainingSeconds;
    return sum + currentPhaseElapsed;
  }, [phaseIndex, selectedProfile.phases, activeDurationSeconds, remainingSeconds]);

  const focusPhases = useMemo(
    () => selectedProfile.phases.filter((phase) => phase.kind === "focus"),
    [selectedProfile.phases],
  );
  const completedFocusPhases = selectedProfile.phases
    .slice(0, phaseIndex)
    .filter((phase) => phase.kind === "focus").length;
  const totalFocusPhases = focusPhases.length;
  const activeFocusOrdinal =
    completedFocusPhases + (activePhase.kind === "focus" ? 1 : 0);
  const displayedFocusOrdinal = Math.min(
    totalFocusPhases,
    Math.max(1, activeFocusOrdinal || completedFocusPhases || 1),
  );
  const phaseMarkers = useMemo(() => {
    return phaseTimeline.map((item) => {
      const angle = -90 + item.midRatio * 360;
      const radians = (angle * Math.PI) / 180;

      return {
        ...item,
        left: 50 + Math.cos(radians) * 43,
        top: 50 + Math.sin(radians) * 43,
      };
    });
  }, [phaseTimeline]);

  useEffect(() => {
    if (selectedTaskId && tasks.some((task) => task.id === selectedTaskId)) {
      return;
    }

    setSelectedTaskId(tasks.find((task) => task.status === "in_progress")?.id ?? tasks[0]?.id ?? null);
  }, [selectedTaskId, tasks]);

  useEffect(() => {
    try {
      const savedColumns = window.localStorage.getItem(`${planningStorageKey}:columns:v1`);
      const savedTaskColumns = window.localStorage.getItem(
        `${planningStorageKey}:task-columns:v1`,
      );

      setColumns(normalizeColumns(savedColumns ? JSON.parse(savedColumns) : null));
      setTaskColumnMap(
        normalizeTaskColumnMap(savedTaskColumns ? JSON.parse(savedTaskColumns) : null),
      );
    } catch {
      setColumns(DEFAULT_COLUMNS.map((column) => ({ ...column })));
      setTaskColumnMap({});
    }
  }, [planningStorageKey]);

  useEffect(() => {
    setHistory(readHistory(focusStorageKey));
  }, [focusStorageKey]);

  useEffect(() => {
    window.localStorage.setItem(`${focusStorageKey}:history:v1`, JSON.stringify(history));
  }, [focusStorageKey, history]);

  useEffect(() => {
    if (!restoredSession || !restoredRuntime?.endedSinceLastSave) {
      return;
    }

    playFocusChime();
    writePersistedFocusSession(
      focusStorageKey,
      buildPersistedFocusSession({
        selectedTaskId,
        selectedProfileId,
        profileName: selectedProfile.name,
        customFocusMinutes,
        customBreakMinutes,
        customLongBreakMinutes,
        customRounds,
        phaseIndex,
        remainingSeconds,
        running,
        phases: selectedProfile.phases,
      }),
    );
  }, [
    customBreakMinutes,
    customFocusMinutes,
    customLongBreakMinutes,
    customRounds,
    focusStorageKey,
    phaseIndex,
    remainingSeconds,
    restoredRuntime,
    restoredSession,
    running,
    selectedProfile.name,
    selectedProfile.phases,
    selectedProfileId,
    selectedTaskId,
  ]);

  useEffect(() => {
    if (profileSignatureRef.current === profileSignature) {
      return;
    }

    profileSignatureRef.current = profileSignature;
    setPhaseIndex(0);
    setRunning(false);
  }, [profileSignature]);

  useEffect(() => {
    if (durationSignatureRef.current === durationSignature) {
      return;
    }

    durationSignatureRef.current = durationSignature;
    setRemainingSeconds(activeDurationSeconds);
  }, [activeDurationSeconds, durationSignature]);

  useEffect(() => {
    writePersistedFocusSession(
      focusStorageKey,
      buildPersistedFocusSession({
        selectedTaskId,
        selectedProfileId,
        profileName: selectedProfile.name,
        customFocusMinutes,
        customBreakMinutes,
        customLongBreakMinutes,
        customRounds,
        phaseIndex,
        remainingSeconds,
        running,
        phases: selectedProfile.phases,
      }),
    );
  }, [
    customBreakMinutes,
    customFocusMinutes,
    customLongBreakMinutes,
    customRounds,
    focusStorageKey,
    phaseIndex,
    remainingSeconds,
    running,
    selectedProfile.name,
    selectedProfile.phases,
    selectedProfileId,
    selectedTaskId,
  ]);

  const recordFocusSession = useCallback(
    (phase: FocusPhase) => {
      const record: FocusHistoryRecord = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        taskId: selectedTask?.id ?? null,
        taskTitle: selectedTask?.title ?? "Untitled focus session",
        projectName: selectedTask?.project?.name ?? null,
        profileName: selectedProfile.name,
        minutes: phase.minutes,
        completedAt: new Date().toISOString(),
      };

      setHistory((current) => [record, ...current].slice(0, 60));
    },
    [selectedProfile.name, selectedTask],
  );

  const advancePhase = useCallback(
    (options?: { countFocus?: boolean }) => {
      const completedPhase = selectedProfile.phases[phaseIndex] ?? selectedProfile.phases[0];

      if (options?.countFocus && completedPhase.kind === "focus") {
        recordFocusSession(completedPhase);
        playFocusChime();
      }

      setRunning(false);

      if (phaseIndex >= selectedProfile.phases.length - 1) {
        setPhaseIndex(0);
        return;
      }

      setPhaseIndex((current) => current + 1);
    },
    [phaseIndex, recordFocusSession, selectedProfile.phases],
  );

  useEffect(() => {
    if (!running) {
      return;
    }

    const interval = window.setInterval(() => {
      setRemainingSeconds((current) => {
        if (current <= 1) {
          window.setTimeout(() => advancePhase({ countFocus: true }), 0);
          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [advancePhase, running]);

  const customColumnIds = useMemo(
    () => new Set(columns.filter((column) => column.kind === "custom").map((column) => column.id)),
    [columns],
  );

  const tasksByColumn = useMemo(() => {
    const buckets = new Map<string, PlannerTask[]>();

    for (const column of columns) {
      buckets.set(column.id, []);
    }

    for (const task of tasks.slice().sort(compareTasks)) {
      const mappedColumnId = taskColumnMap[task.id];
      const targetColumnId =
        mappedColumnId && customColumnIds.has(mappedColumnId) ? mappedColumnId : task.status;
      const bucket = buckets.get(targetColumnId) ?? buckets.get(task.status);
      bucket?.push(task);
    }

    return buckets;
  }, [columns, customColumnIds, taskColumnMap, tasks]);

  useEffect(() => {
    if (columns.some((column) => column.id === activeTaskColumnId)) {
      return;
    }

    setActiveTaskColumnId(columns[0]?.id ?? "todo");
  }, [activeTaskColumnId, columns]);

  const todayKey = sameDayKey(new Date().toISOString());
  const todayMinutes = history
    .filter((record) => sameDayKey(record.completedAt) === todayKey)
    .reduce((total, record) => total + record.minutes, 0);
  const completedSessions = history.length;
  const historyDays = useMemo(() => {
    const days: Array<{ key: string; minutes: number }> = [];
    const now = new Date();

    for (let offset = 20; offset >= 0; offset -= 1) {
      const day = new Date(now);
      day.setDate(now.getDate() - offset);
      const key = day.toISOString().slice(0, 10);
      days.push({
        key,
        minutes: history
          .filter((record) => sameDayKey(record.completedAt) === key)
          .reduce((total, record) => total + record.minutes, 0),
      });
    }

    return days;
  }, [history]);
  const todayFocusSessions = history.filter(
    (record) => sameDayKey(record.completedAt) === todayKey,
  ).length;
  const shortBreakMinutes =
    selectedProfile.phases.find((phase) => phase.kind === "break")?.minutes ?? 5;
  const longBreakMinutes =
    selectedProfile.phases.find((phase) => phase.kind === "long_break")?.minutes ?? 15;
  const todayBreakMinutes = Math.min(
    90,
    Math.max(0, Math.min(todayFocusSessions, Math.max(0, totalFocusPhases - 1))) *
      shortBreakMinutes,
  );
  const todayLongBreakMinutes = todayFocusSessions >= totalFocusPhases
    ? longBreakMinutes
    : 0;
  const dailyGoalMinutes = 150;
  const todayProgressMinutes =
    todayMinutes + todayBreakMinutes + todayLongBreakMinutes;
  const todayGoalRatio = Math.min(1, todayProgressMinutes / dailyGoalMinutes);
  const weekMinutes = historyDays.slice(-7).map((day) => day.minutes);
  const peakWeekMinutes = Math.max(60, ...weekMinutes);
  const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const currentStreak = (() => {
    let streak = 0;

    for (let index = historyDays.length - 1; index >= 0; index -= 1) {
      if (historyDays[index]?.minutes) {
        streak += 1;
      } else if (streak > 0) {
        break;
      }
    }

    return streak;
  })();
  const activeTaskColumn =
    columns.find((column) => column.id === activeTaskColumnId) ?? columns[0];
  const activeColumnTasks = activeTaskColumn
    ? tasksByColumn.get(activeTaskColumn.id) ?? []
    : [];
  const activePhaseMeta = phaseTimeline[phaseIndex] ?? phaseTimeline[0];

  const clearPlanningColumnAssignment = (taskId: string) => {
    const next = { ...taskColumnMap };
    delete next[taskId];
    setTaskColumnMap(next);
    window.localStorage.setItem(`${planningStorageKey}:task-columns:v1`, JSON.stringify(next));
  };

  const selectTask = (task: PlannerTask) => {
    if (task.status !== "in_progress") {
      setPendingTask(task);
      return;
    }

    setPendingTask(null);
    setSelectedTaskId(task.id);
  };

  const confirmPendingTask = (markInProgress: boolean) => {
    if (!pendingTask) {
      return;
    }

    setSelectedTaskId(pendingTask.id);

    if (markInProgress) {
      clearPlanningColumnAssignment(pendingTask.id);
      onTaskStatusChange(pendingTask.id, "in_progress");
    }

    setPendingTask(null);
  };

  const resetSprint = () => {
    setRunning(false);
    setPhaseIndex(0);
    setRemainingSeconds(selectedProfile.phases[0]?.minutes ? selectedProfile.phases[0].minutes * 60 : 0);
  };

  const toggleRunning = () => {
    if (!running) {
      primeFocusChime();
    }

    setRunning((current) => !current);
  };

  const selectSprintProfile = (profileId: SprintProfileId) => {
    setSelectedProfileId(profileId);
  };

  return (
    <section className="focus-redesign-shell flex min-h-0 flex-1 bg-[#f6f7fb] text-[#111827]" data-testid="focus-view">
      <div className="focus-redesign-grid flex min-h-0 flex-1 flex-col gap-5 p-3 lg:flex-row">
        <div className="focus-dashboard-card min-w-0 rounded-[1.6rem] border border-[#e6e9f2] bg-white/94 p-6 shadow-[0_24px_80px_-48px_rgba(39,54,87,0.34)] md:p-8 lg:flex-1 lg:overflow-y-auto">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <div className="focus-brand-mark" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="relative">
                  <select
                    value={selectedProfileId}
                    onChange={(event) =>
                      selectSprintProfile(event.target.value as SprintProfileId)
                    }
                    className="focus-profile-select appearance-none rounded-full bg-transparent py-1 pr-8 text-[1.05rem] font-medium text-[#101828] outline-none"
                    aria-label="Sprint profile"
                  >
                    {profileOptions.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-[#111827]" />
                </div>
              </div>
              <div className="mt-3 text-[0.76rem] font-medium text-[#6d7484]">
                {selectedProfile.description.split(".")[0]}{" "}
                <span className="mx-2 text-[#a1a7b4]">•</span>
                {selectedProfile.phases.length} sessions, ~{formatMinutes(Math.floor(totalSprintSeconds / 60))} total
              </div>
            </div>
            <button
              type="button"
              className="grid h-9 w-9 place-items-center rounded-full text-[#0f172a] transition hover:bg-[#f5f6fa]"
              aria-label="Focus options"
            >
              <MoreHorizontal className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-5 grid gap-7 xl:grid-cols-[minmax(380px,1fr)_340px] xl:items-center 2xl:grid-cols-[minmax(420px,1fr)_360px]">
            <div className="focus-ring-stage relative mx-auto flex min-h-[370px] w-full max-w-[510px] items-center justify-center 2xl:min-h-[400px] 2xl:max-w-[560px]">
              <svg
                className="focus-ring-svg absolute inset-0 h-full w-full overflow-visible"
                viewBox="0 0 420 420"
                aria-hidden="true"
              >
                <defs>
                  <filter id="focus-ring-glow" x="-40%" y="-40%" width="180%" height="180%">
                    <feGaussianBlur stdDeviation="5" result="blur" />
                    <feColorMatrix
                      in="blur"
                      type="matrix"
                      values="0 0 0 0 0.17 0 0 0 0 0.33 0 0 0 0 0.95 0 0 0 0.38 0"
                    />
                    <feMerge>
                      <feMergeNode />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                <circle
                  cx="210"
                  cy="210"
                  r={RING_RADIUS}
                  fill="none"
                  stroke="#edf1f8"
                  strokeWidth="12"
                />
                {phaseTimeline.map((item) => {
                  const dashLength = Math.max(3, RING_CIRCUMFERENCE * item.widthRatio - 3);
                  return (
                    <circle
                      key={item.phase.id}
                      cx="210"
                      cy="210"
                      r={RING_RADIUS}
                      fill="none"
                      stroke={phaseColor(item.phase.kind)}
                      strokeWidth="12"
                      strokeLinecap="butt"
                      strokeDasharray={`${dashLength} ${RING_CIRCUMFERENCE - dashLength}`}
                      strokeDashoffset={-(RING_CIRCUMFERENCE * item.startRatio)}
                      transform="rotate(-90 210 210)"
                      filter="url(#focus-ring-glow)"
                      opacity={item.index <= phaseIndex ? 1 : 0.72}
                    />
                  );
                })}
                <circle
                  cx="210"
                  cy="210"
                  r={RING_RADIUS}
                  fill="none"
                  stroke="rgba(255,255,255,0.8)"
                  strokeWidth="3"
                  strokeDasharray="2 12"
                  transform="rotate(-90 210 210)"
                />
                <circle
                  cx={210 + Math.cos((-90 + (elapsedSprintSeconds / Math.max(1, totalSprintSeconds)) * 360) * Math.PI / 180) * RING_RADIUS}
                  cy={210 + Math.sin((-90 + (elapsedSprintSeconds / Math.max(1, totalSprintSeconds)) * 360) * Math.PI / 180) * RING_RADIUS}
                  r="9"
                  fill="#ffffff"
                  stroke="#b9c4f8"
                  strokeWidth="3"
                  filter="url(#focus-ring-glow)"
                />
              </svg>

              <div className="pointer-events-none absolute inset-0" aria-hidden="true">
                {phaseMarkers.map((marker) => (
                  <div
                    key={marker.phase.id}
                    className={cn(
                      "focus-phase-bubble",
                      marker.index === phaseIndex && "is-active",
                      marker.phase.kind === "break" && "is-break",
                      marker.phase.kind === "long_break" && "is-long-break",
                    )}
                    style={{
                      left: `${marker.left}%`,
                      top: `${marker.top}%`,
                    }}
                  >
                    <span>{marker.label}</span>
                    <small>{marker.phase.minutes}m</small>
                  </div>
                ))}
              </div>

              <div className="relative z-10 grid place-items-center text-center">
                <div className="text-[0.78rem] font-semibold uppercase tracking-[0.28em] text-[#687386]">
                  {activePhase.kind === "focus" ? "Focus Time" : phaseKindLabel(activePhase.kind)}
                </div>
                <div className="mt-5 text-[4.2rem] font-light leading-none tracking-normal text-[#0a1a2d] tabular-nums drop-shadow-[0_5px_8px_rgba(13,31,57,0.16)] md:text-[4.85rem] 2xl:text-[5.45rem]">
                  {formatFocusTimer(remainingSeconds)}
                </div>
                <div className="mt-5 text-[0.8rem] font-semibold uppercase tracking-[0.26em] text-[#5d6678]">
                  Remaining
                </div>
                <div className="mt-5 rounded-full border border-[#edf0f8] bg-[#f8fbff] px-6 py-2 text-[0.9rem] font-semibold text-[#2184f6] shadow-[0_9px_24px_-18px_rgba(31,120,245,0.45)]">
                  {activePhaseMeta?.label ?? `W${displayedFocusOrdinal}`} - {phaseKindLabel(activePhase.kind)}
                </div>
              </div>
            </div>

            <div className="focus-current-task mx-auto w-full max-w-[360px]">
              <div className="mb-5 flex justify-center xl:justify-start">
                <span className="rounded-full bg-[#f3efff] px-6 py-2 text-[0.82rem] font-semibold text-[#7048f4]">
                  Current Task
                </span>
              </div>
              <h2 className="text-[2rem] font-normal leading-tight tracking-normal text-[#0d111a] 2xl:text-[2.25rem]">
                {selectedTask?.title ?? "Select a task"}
              </h2>
              {selectedTask?.project ? (
                <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#f7f8fb] px-3 py-1.5 text-[0.9rem] font-medium text-[#232b3d]">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: selectedTask.project.color }}
                  />
                  {selectedTask.project.name}
                </div>
              ) : null}
              <p className="mt-6 max-w-[21rem] text-[0.95rem] leading-7 text-[#667085]">
                {selectedTask?.notes?.trim() ||
                  "Choose a task from the right panel, then start a focused sprint."}
              </p>

              <div className="mt-7 grid gap-4">
                <button
                  type="button"
                  onClick={toggleRunning}
                  className="focus-primary-action"
                >
                  {running ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 fill-current" />}
                  {running ? "Pause" : "Start"}
                </button>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => advancePhase()}
                    className="focus-secondary-action"
                  >
                    <SkipForward className="h-4 w-4 fill-current" />
                    Skip {activePhase.kind === "focus" ? "Focus" : "Break"}
                  </button>
                  <button
                    type="button"
                    onClick={resetSprint}
                    className="focus-secondary-action"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Reset
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="focus-session-strip mt-5">
            <div
              className="focus-session-playhead"
              style={{
                left: `calc(${Math.min(100, Math.max(0, (elapsedSprintSeconds / Math.max(1, totalSprintSeconds)) * 100))}% - 5px)`,
              }}
            />
            {phaseTimeline.map((item) => (
              <div
                key={item.phase.id}
                className={cn(
                  "focus-session-cell",
                  item.phase.kind === "break" && "is-break",
                  item.phase.kind === "long_break" && "is-long-break",
                  item.index === phaseIndex && "is-active",
                )}
                style={{
                  width: `${Math.max(5, item.widthRatio * 100)}%`,
                  backgroundColor: phaseSoftColor(item.phase.kind),
                }}
              >
                <strong>{item.label}</strong>
                <span>{item.phase.minutes}m</span>
              </div>
            ))}
          </div>

          <div className="mt-3 flex justify-center gap-8 text-[0.75rem] font-medium text-[#667085]">
            <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-[#1688f3]" />Focus</span>
            <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-[#7957f6]" />Break</span>
            <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-[#17c98d]" />Long Break</span>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="focus-stat-card">
              <h3>Today&apos;s Progress</h3>
              <div className="mt-4 flex items-center gap-5">
                <div
                  className="focus-donut"
                  style={{
                    background: `conic-gradient(#226bf3 ${todayGoalRatio * 360}deg, #7652ee ${Math.min(360, todayGoalRatio * 360 + 58)}deg, #17c98d ${Math.min(360, todayGoalRatio * 360 + 72)}deg, #eef1f7 0deg)`,
                  }}
                >
                  <span>{todayProgressMinutes}</span>
                  <small>min</small>
                </div>
                <div className="grid gap-2 text-[0.75rem] text-[#667085]">
                  <span><i className="bg-[#1688f3]" />Focus <b>{todayMinutes} min</b></span>
                  <span><i className="bg-[#7957f6]" />Breaks <b>{todayBreakMinutes} min</b></span>
                  <span><i className="bg-[#17c98d]" />Long Breaks <b>{todayLongBreakMinutes} min</b></span>
                </div>
              </div>
              <div className="mt-3 text-[0.72rem] font-medium text-[#6d7484]">Daily Goal: {dailyGoalMinutes} min</div>
              <div className="mt-2 h-2 rounded-full bg-[#eef1f7]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#336df4] to-[#8a56f6]"
                  style={{ width: `${Math.round(todayGoalRatio * 100)}%` }}
                />
              </div>
            </div>

            <div className="focus-stat-card">
              <div className="flex items-center justify-between">
                <h3>Focus Minutes (This Week)</h3>
                <span className="focus-goal-chip">Goal 150</span>
              </div>
              <div className="focus-week-chart mt-5">
                {weekMinutes.map((minutes, index) => (
                  <div key={`${weekdayLabels[index]}-${index}`} className="grid justify-items-center gap-2">
                    <div className="flex h-24 items-end">
                      <span
                        style={{ height: `${Math.max(16, (minutes / peakWeekMinutes) * 88)}px` }}
                      />
                    </div>
                    <small>{weekdayLabels[index]}</small>
                  </div>
                ))}
              </div>
            </div>

            <div className="focus-stat-card text-center">
              <h3 className="text-left">Current Streak</h3>
              <div className="mt-6 grid place-items-center">
                <div className="grid h-16 w-16 place-items-center rounded-full bg-[#fff4ed] text-[#ff7438]">
                  <Flame className="h-8 w-8 fill-current" />
                </div>
              </div>
              <div className="mt-3 text-4xl font-light tracking-normal text-[#101828]">
                {currentStreak || Math.min(12, completedSessions)}
                <span className="ml-2 text-base tracking-normal text-[#667085]">days</span>
              </div>
              <p className="mt-2 text-[0.78rem] text-[#667085]">Keep it going.</p>
            </div>

            <div className="focus-stat-card">
              <h3>Session Chain</h3>
              <p className="mt-3 text-[0.82rem] leading-6 text-[#667085]">
                Complete 4 focus sessions today to earn a long break.
              </p>
              <div className="mt-5 flex items-center gap-3">
                {Array.from({ length: 4 }).map((_, index) => {
                  const complete = index < Math.min(4, todayFocusSessions);
                  return (
                    <span
                      key={index}
                      className={cn("focus-chain-dot", complete && "is-complete")}
                    >
                      {complete ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                    </span>
                  );
                })}
              </div>
              <div className="mt-4 text-[0.82rem] font-semibold text-[#7048f4]">
                {todayFocusSessions >= 4 ? "Long break unlocked." : "Long break pending."}
              </div>
            </div>
          </div>

          <div className="mt-8">
            <div className="mb-4 flex items-center gap-4">
              <h3 className="text-[1rem] font-semibold text-[#111827]">Focus Profiles</h3>
              <div className="h-px flex-1 bg-[#edf0f6]" />
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              {profileCards.map((profile) => {
                const selected = selectedProfileId === profile.id;
                const icon =
                  profile.id === "launch" ? <Rocket className="h-8 w-8" /> :
                  profile.id === "admin" ? <CheckCircle2 className="h-8 w-8" /> :
                  profile.id === "classic" ? <Timer className="h-8 w-8" /> :
                  profile.id === "dynamic" ? <TrendingUp className="h-8 w-8" /> :
                  <Plus className="h-8 w-8" />;

                return (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => selectSprintProfile(profile.id)}
                    className={cn(
                      "focus-profile-card",
                      selected && "is-selected",
                      profile.id === "custom" && "is-custom",
                    )}
                  >
                    <span className="focus-profile-icon">{icon}</span>
                    <span className="min-w-0 text-left">
                      <strong>{profile.id === "custom" ? "Create Custom Profile" : profile.name}</strong>
                      <small>{profile.id === "custom" ? "Full control" : profile.bestFor}</small>
                    </span>
                    {selected ? <span className="focus-selected-dot" /> : null}
                  </button>
                );
              })}
            </div>
            {selectedProfileId === "custom" ? (
              <div className="mt-5 grid gap-5 rounded-3xl border border-[#e6e9f2] bg-[#fbfcff] p-5 md:grid-cols-2 xl:grid-cols-4">
                <FocusRange label="Focus Duration" value={customFocusMinutes} min={5} max={90} onChange={setCustomFocusMinutes} />
                <FocusRange label="Short Break" value={customBreakMinutes} min={1} max={30} onChange={setCustomBreakMinutes} />
                <FocusRange label="Long Break" value={customLongBreakMinutes} min={5} max={45} onChange={setCustomLongBreakMinutes} />
                <FocusRange label="Rounds" value={customRounds} min={1} max={8} onChange={setCustomRounds} />
              </div>
            ) : null}
          </div>
        </div>

        <aside
          className="focus-tasks-panel flex min-h-[28rem] w-full flex-shrink-0 flex-col rounded-[1.4rem] border border-[#e7eaf2] bg-white/96 shadow-[0_24px_80px_-52px_rgba(39,54,87,0.34)] lg:w-[292px] xl:w-[324px]"
          data-testid="focus-task-menu"
        >
          <div className="flex items-center justify-between gap-4 px-6 pb-5 pt-6">
            <h2 className="text-[1.65rem] font-normal tracking-normal text-[#0f172a]">Tasks</h2>
            <div className="flex items-center gap-3 text-[#0f172a]">
              <button type="button" className="focus-queue-icon" aria-label="Filter tasks"><Filter className="h-5 w-5" /></button>
              <button type="button" className="focus-queue-icon" aria-label="Search tasks"><Search className="h-5 w-5" /></button>
              <button type="button" className="focus-add-button" aria-label="Create task"><Plus className="h-5 w-5" /></button>
            </div>
          </div>

          <div className="focus-task-tabs px-5">
            {columns.slice(0, 4).map((column) => (
              <button
                key={column.id}
                type="button"
                onClick={() => setActiveTaskColumnId(column.id)}
                className={cn(column.id === activeTaskColumnId && "is-active")}
                data-testid={`focus-task-category-${column.id}`}
              >
                {column.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            <div className="grid gap-1">
              {activeColumnTasks.length ? (
                activeColumnTasks.map((task) => {
                  const selected = selectedTaskId === task.id;
                  return (
                    <div key={task.id} className="relative">
                      <button
                        type="button"
                        onClick={() => selectTask(task)}
                        className={cn("focus-queue-task", selected && "is-selected")}
                      >
                        <span className={cn("focus-task-radio", selected && "is-selected")}>
                          {selected ? <span /> : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-3">
                            <strong>{task.title}</strong>
                            <MoreHorizontal className="mt-1 h-4 w-4 shrink-0 text-[#0f172a]" />
                          </span>
                          <span className="mt-2 flex items-center justify-between gap-3 text-[0.78rem] font-medium text-[#687386]">
                            <span className="inline-flex min-w-0 items-center gap-2">
                              <i
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: task.project?.color ?? "#7048f4" }}
                              />
                              <span className="truncate">{task.project?.name ?? "Work"}</span>
                            </span>
                            <span className="shrink-0">{formatMinutes(task.estimatedMinutes || 25)}</span>
                          </span>
                        </span>
                      </button>
                      {pendingTask?.id === task.id ? (
                        <div className="focus-task-card-popover absolute left-8 right-4 top-[72%] z-20 rounded-2xl border border-[#e2e7f1] bg-white p-4 shadow-[0_24px_56px_-34px_rgba(31,41,55,0.45)]">
                          <p className="text-sm font-semibold text-[#111827]">
                            Mark this task In Progress?
                          </p>
                          <p className="mt-1 text-xs leading-relaxed text-[#667085]">
                            This syncs the status across Planning, Project Design, and Calendar.
                          </p>
                          <div className="mt-4 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => confirmPendingTask(true)}
                              className="h-9 rounded-full bg-[#6c3cf4] px-4 text-xs font-semibold text-white shadow-[0_12px_28px_-16px_rgba(108,60,244,0.8)]"
                            >
                              Yes
                            </button>
                            <button
                              type="button"
                              onClick={() => confirmPendingTask(false)}
                              className="h-9 rounded-full border border-[#e2e7f1] bg-white px-4 text-xs font-semibold text-[#475467]"
                            >
                              Not now
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <div className="rounded-3xl border border-dashed border-[#dfe4ef] p-8 text-center text-sm text-[#667085]">
                  No tasks in {activeTaskColumn?.label ?? "this list"}.
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

function FocusRange({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-4">
      <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--muted-foreground)]">
        <span>{label}</span>
        <span className="text-[var(--foreground-strong)] tabular-nums">{value} {label === "Rounds" ? "" : "min"}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full h-2 bg-[var(--border-strong)] rounded-full appearance-none cursor-pointer accent-[var(--foreground-strong)] hover:accent-cyan-500 transition-colors"
      />
    </label>
  );
}
