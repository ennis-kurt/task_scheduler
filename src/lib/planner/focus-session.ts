"use client";

import type {
  FocusHistoryRecord,
  FocusSessionPhase,
  FocusSessionPhaseKind,
  FocusSessionState,
} from "@/lib/planner/types";

export const FOCUS_SESSION_EVENT = "inflara:focus-session-updated";
export const FOCUS_SESSION_REMOTE_EVENT = "inflara:focus-session-remote-updated";

export type PersistedFocusPhaseKind = FocusSessionPhaseKind;

export type PersistedFocusPhase = FocusSessionPhase;

export type PersistedFocusSession = FocusSessionState;

export type PersistedFocusHistoryRecord = FocusHistoryRecord;

export type ProjectedFocusSession = PersistedFocusSession & {
  activePhase: PersistedFocusPhase;
  endedSinceLastSave: boolean;
};

export type SyncedFocusSessionSnapshot = {
  session: PersistedFocusSession | null;
  history: PersistedFocusHistoryRecord[];
  updatedAt: string | null;
};

const SESSION_VERSION = 1;

let focusAudioContext: AudioContext | null = null;
let lastChimeStartedAt = 0;

type AudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

export function focusSessionStorageKey(baseKey: string) {
  return `${baseKey}:session:v1`;
}

export function formatFocusTimer(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatFocusPhaseLabel(kind: PersistedFocusPhaseKind) {
  if (kind === "long_break") {
    return "Long Break";
  }

  return kind === "focus" ? "Focus" : "Break";
}

export function readPersistedFocusSession(
  baseKey: string,
): PersistedFocusSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(focusSessionStorageKey(baseKey));
    const parsed = raw ? JSON.parse(raw) : null;

    if (!isPersistedFocusSession(parsed)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function writePersistedFocusSession(
  baseKey: string,
  session: PersistedFocusSession,
  options?: { preserveUpdatedAt?: boolean },
) {
  if (typeof window === "undefined") {
    return null;
  }

  const persisted = {
    ...session,
    version: SESSION_VERSION,
    updatedAt: options?.preserveUpdatedAt
      ? session.updatedAt
      : new Date().toISOString(),
  } satisfies PersistedFocusSession;

  window.localStorage.setItem(
    focusSessionStorageKey(baseKey),
    JSON.stringify(persisted),
  );
  window.dispatchEvent(new Event(FOCUS_SESSION_EVENT));
  return persisted;
}

export function projectPersistedFocusSession(
  session: PersistedFocusSession,
  now = Date.now(),
): ProjectedFocusSession {
  const phases = session.phases.length
    ? session.phases
    : [
        {
          id: "fallback-focus",
          kind: "focus" as const,
          label: "Work 1",
          minutes: Math.max(1, Math.ceil(session.remainingSeconds / 60) || 25),
        },
      ];
  let phaseIndex = Math.min(Math.max(0, session.phaseIndex), phases.length - 1);
  let remainingSeconds = Math.max(0, Math.floor(session.remainingSeconds));
  let running = session.running;
  let endedSinceLastSave = false;

  if (running) {
    const updatedAt = Date.parse(session.updatedAt);
    const elapsedSeconds = Number.isFinite(updatedAt)
      ? Math.max(0, Math.floor((now - updatedAt) / 1000))
      : 0;

    if (elapsedSeconds >= remainingSeconds) {
      endedSinceLastSave = true;
      running = false;

      if (phaseIndex >= phases.length - 1) {
        phaseIndex = 0;
      } else {
        phaseIndex += 1;
      }

      remainingSeconds = Math.max(1, phases[phaseIndex]?.minutes ?? 25) * 60;
    } else {
      remainingSeconds -= elapsedSeconds;
    }
  }

  const activePhase = phases[phaseIndex] ?? phases[0];

  return {
    ...session,
    phases,
    phaseIndex,
    remainingSeconds,
    running,
    activePhase,
    endedSinceLastSave,
  };
}

export function buildPersistedFocusSession(
  input: Omit<PersistedFocusSession, "version" | "updatedAt">,
): PersistedFocusSession {
  return {
    ...input,
    version: SESSION_VERSION,
    updatedAt: new Date().toISOString(),
  };
}

export function focusSessionTimestamp(session: PersistedFocusSession | null) {
  if (!session) {
    return 0;
  }

  const parsed = Date.parse(session.updatedAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isNewerFocusSession(
  candidate: PersistedFocusSession | null,
  current: PersistedFocusSession | null,
) {
  return focusSessionTimestamp(candidate) > focusSessionTimestamp(current);
}

export function mergeFocusHistory(
  localHistory: PersistedFocusHistoryRecord[],
  remoteHistory: PersistedFocusHistoryRecord[],
  limit = 60,
) {
  const records = new Map<string, PersistedFocusHistoryRecord>();

  for (const record of [...localHistory, ...remoteHistory]) {
    if (!records.has(record.id)) {
      records.set(record.id, record);
    }
  }

  return Array.from(records.values())
    .sort((left, right) => right.completedAt.localeCompare(left.completedAt))
    .slice(0, limit);
}

export function focusHistorySignature(history: PersistedFocusHistoryRecord[]) {
  return history.map((record) => `${record.id}:${record.completedAt}`).join("|");
}

export async function readSyncedFocusSession(): Promise<SyncedFocusSessionSnapshot | null> {
  try {
    const response = await fetch("/api/focus-session", {
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as SyncedFocusSessionSnapshot;
  } catch {
    return null;
  }
}

export async function writeSyncedFocusSession(input: {
  session?: PersistedFocusSession | null;
  history?: PersistedFocusHistoryRecord[];
}) {
  try {
    const response = await fetch("/api/focus-session", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as SyncedFocusSessionSnapshot;
  } catch {
    return null;
  }
}

export function primeFocusChime() {
  if (typeof window === "undefined") {
    return;
  }

  const AudioContextCtor =
    window.AudioContext ?? (window as AudioWindow).webkitAudioContext;

  if (!AudioContextCtor) {
    return;
  }

  focusAudioContext ??= new AudioContextCtor();
  void focusAudioContext.resume?.();
}

export function playFocusChime() {
  if (typeof window === "undefined") {
    return;
  }

  const AudioContextCtor =
    window.AudioContext ?? (window as AudioWindow).webkitAudioContext;

  if (!AudioContextCtor) {
    return;
  }

  focusAudioContext ??= new AudioContextCtor();
  const context = focusAudioContext;
  const startedAt = Date.now();

  if (startedAt - lastChimeStartedAt < 350) {
    return;
  }

  lastChimeStartedAt = startedAt;

  const play = () => {
    const now = context.currentTime;
    const output = context.createGain();
    output.gain.setValueAtTime(0.0001, now);
    output.gain.exponentialRampToValueAtTime(0.18, now + 0.035);
    output.gain.exponentialRampToValueAtTime(0.0001, now + 1.25);
    output.connect(context.destination);

    [659.25, 880, 1046.5].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const toneGain = context.createGain();
      const startAt = now + index * 0.11;
      const stopAt = startAt + 0.95;

      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(frequency, startAt);
      toneGain.gain.setValueAtTime(0.0001, startAt);
      toneGain.gain.exponentialRampToValueAtTime(0.45, startAt + 0.03);
      toneGain.gain.exponentialRampToValueAtTime(0.0001, stopAt);

      oscillator.connect(toneGain);
      toneGain.connect(output);
      oscillator.start(startAt);
      oscillator.stop(stopAt + 0.05);
    });
  };

  const resumeResult = context.resume?.();

  if (resumeResult) {
    void resumeResult.then(play).catch(() => {
      lastChimeStartedAt = 0;
    });
    return;
  }

  play();
}

function isPersistedFocusSession(value: unknown): value is PersistedFocusSession {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    candidate.version === SESSION_VERSION &&
    (typeof candidate.selectedTaskId === "string" ||
      candidate.selectedTaskId === null) &&
    typeof candidate.selectedProfileId === "string" &&
    typeof candidate.profileName === "string" &&
    typeof candidate.customFocusMinutes === "number" &&
    typeof candidate.customBreakMinutes === "number" &&
    typeof candidate.customLongBreakMinutes === "number" &&
    typeof candidate.customRounds === "number" &&
    typeof candidate.phaseIndex === "number" &&
    typeof candidate.remainingSeconds === "number" &&
    typeof candidate.running === "boolean" &&
    typeof candidate.updatedAt === "string" &&
    Array.isArray(candidate.phases) &&
    candidate.phases.every(isPersistedFocusPhase)
  );
}

function isPersistedFocusPhase(value: unknown): value is PersistedFocusPhase {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.id === "string" &&
    (candidate.kind === "focus" ||
      candidate.kind === "break" ||
      candidate.kind === "long_break") &&
    typeof candidate.label === "string" &&
    typeof candidate.minutes === "number"
  );
}
