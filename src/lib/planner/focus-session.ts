"use client";

export const FOCUS_SESSION_EVENT = "inflara:focus-session-updated";

export type PersistedFocusPhaseKind = "focus" | "break" | "long_break";

export type PersistedFocusPhase = {
  id: string;
  kind: PersistedFocusPhaseKind;
  label: string;
  minutes: number;
};

export type PersistedFocusSession = {
  version: 1;
  selectedTaskId: string | null;
  selectedProfileId: string;
  profileName: string;
  customFocusMinutes: number;
  customBreakMinutes: number;
  customLongBreakMinutes: number;
  customRounds: number;
  phaseIndex: number;
  remainingSeconds: number;
  running: boolean;
  phases: PersistedFocusPhase[];
  updatedAt: string;
};

export type ProjectedFocusSession = PersistedFocusSession & {
  activePhase: PersistedFocusPhase;
  endedSinceLastSave: boolean;
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
) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    focusSessionStorageKey(baseKey),
    JSON.stringify({
      ...session,
      version: SESSION_VERSION,
      updatedAt: new Date().toISOString(),
    } satisfies PersistedFocusSession),
  );
  window.dispatchEvent(new Event(FOCUS_SESSION_EVENT));
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
