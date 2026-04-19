import {
  addDays,
  addMinutes,
  differenceInCalendarDays,
  differenceInCalendarWeeks,
  differenceInCalendarMonths,
  eachDayOfInterval,
  endOfDay,
  format,
  isAfter,
  isBefore,
  isEqual,
  isWithinInterval,
  parseISO,
  set,
  startOfDay,
  startOfWeek,
} from "date-fns";

import type {
  PlannerRange,
  RecurrenceRule,
  UserSettingsRecord,
} from "@/lib/planner/types";

type ExpandedRecurrenceOccurrence = {
  start: string;
  end: string;
  recurring: boolean;
  occurrenceKey: string;
};

export function startOfCurrentWeek(weekStartsOn: number) {
  return startOfWeek(new Date(), { weekStartsOn: weekStartsOn as 0 | 1 | 2 | 3 | 4 | 5 | 6 });
}

export function buildDefaultRange(weekStartsOn = 1): PlannerRange {
  const start = startOfCurrentWeek(weekStartsOn);
  const end = addDays(start, 6);

  return {
    start: start.toISOString(),
    end: endOfDay(end).toISOString(),
  };
}

export function parseDate(value: string) {
  return parseISO(value);
}

export function toDateOnly(value: string) {
  return format(parseISO(value), "yyyy-MM-dd");
}

export function toTimeInput(value: string | null) {
  if (!value) {
    return "";
  }

  return format(parseISO(value), "HH:mm");
}

export function toDateTimeInput(value: string | null) {
  if (!value) {
    return "";
  }

  return format(parseISO(value), "yyyy-MM-dd'T'HH:mm");
}

export function combineDateAndTime(dateValue: string, timeValue: string) {
  const [hours, minutes] = timeValue.split(":").map(Number);
  const date = parseISO(`${dateValue}T00:00:00`);

  return set(date, { hours, minutes, seconds: 0, milliseconds: 0 }).toISOString();
}

export function calculateMinutes(start: string, end: string) {
  return Math.max(
    0,
    Math.round((parseISO(end).getTime() - parseISO(start).getTime()) / 60000),
  );
}

function shiftWeekday(day: number, offset: number) {
  return (day + offset + 7) % 7;
}

function recurrenceMatchesDay(
  day: Date,
  baseStart: Date,
  recurrence: RecurrenceRule,
  interval: number,
  baseWeekStart: Date,
) {
  const weekday = day.getDay();

  switch (recurrence.frequency) {
    case "daily":
      return differenceInCalendarDays(day, startOfDay(baseStart)) % interval === 0;
    case "weekdays":
      return weekday >= 1 && weekday <= 5;
    case "weekly": {
      const days = recurrence.daysOfWeek?.length
        ? recurrence.daysOfWeek
        : [baseStart.getDay()];
      const weekOffset =
        differenceInCalendarWeeks(
          startOfWeek(day, { weekStartsOn: 1 }),
          baseWeekStart,
          { weekStartsOn: 1 },
        ) % interval;
      return weekOffset === 0 && days.includes(weekday);
    }
    case "monthly":
      return (
        day.getDate() === baseStart.getDate() &&
        differenceInCalendarMonths(day, baseStart) % interval === 0
      );
    default:
      return false;
  }
}

export function overlapsRange(
  start: string,
  end: string,
  range: PlannerRange,
) {
  const itemStart = parseISO(start);
  const itemEnd = parseISO(end);
  const rangeStart = parseISO(range.start);
  const rangeEnd = parseISO(range.end);

  return (
    isWithinInterval(itemStart, { start: rangeStart, end: rangeEnd }) ||
    isWithinInterval(itemEnd, { start: rangeStart, end: rangeEnd }) ||
    (isBefore(itemStart, rangeStart) && isAfter(itemEnd, rangeEnd))
  );
}

export function expandRecurrence(
  startsAt: string,
  endsAt: string,
  recurrence: RecurrenceRule | null,
  range: PlannerRange,
) {
  if (!recurrence || recurrence.frequency === "none") {
    return overlapsRange(startsAt, endsAt, range)
      ? [{ start: startsAt, end: endsAt, recurring: false, occurrenceKey: startsAt }]
      : [];
  }

  const baseStart = parseISO(startsAt);
  const untilDate = recurrence.until ? parseISO(recurrence.until) : null;
  const visibleDays = eachDayOfInterval({
    start: startOfDay(parseISO(range.start)),
    end: endOfDay(parseISO(range.end)),
  });
  const baseDurationMinutes = calculateMinutes(startsAt, endsAt);
  const interval = recurrence.interval ?? 1;
  const baseWeekStart = startOfWeek(baseStart, { weekStartsOn: 1 });
  const occurrences = new Map<string, ExpandedRecurrenceOccurrence>();

  const addOccurrence = (day: Date) => {
    if (isBefore(day, startOfDay(baseStart))) {
      return;
    }

    if (untilDate && isAfter(day, endOfDay(untilDate))) {
      return;
    }

    if (!recurrenceMatchesDay(day, baseStart, recurrence, interval, baseWeekStart)) {
      return;
    }

    const occurrenceKey = format(day, "yyyy-MM-dd");
    const override = recurrence.overrides?.[occurrenceKey];
    const occurrenceStart = set(day, {
      hours: baseStart.getHours(),
      minutes: baseStart.getMinutes(),
      seconds: baseStart.getSeconds(),
      milliseconds: baseStart.getMilliseconds(),
    });
    const occurrenceEnd = addMinutes(occurrenceStart, baseDurationMinutes);

    if (
      isEqual(occurrenceStart, baseStart) ||
      isAfter(occurrenceStart, baseStart)
    ) {
      const start = override?.startsAt ?? occurrenceStart.toISOString();
      const end = override?.endsAt ?? occurrenceEnd.toISOString();

      if (overlapsRange(start, end, range)) {
        occurrences.set(occurrenceKey, {
          start,
          end,
          recurring: true,
          occurrenceKey,
        });
      }
    }
  };

  visibleDays.forEach(addOccurrence);

  Object.keys(recurrence.overrides ?? {}).forEach((occurrenceKey) => {
    addOccurrence(parseISO(`${occurrenceKey}T00:00:00`));
  });

  return Array.from(occurrences.values()).sort((left, right) =>
    left.start.localeCompare(right.start),
  );
}

export function applyRecurrenceOverride(
  recurrence: RecurrenceRule | null,
  occurrenceKey: string,
  startsAt: string,
  endsAt: string,
) {
  if (!recurrence || recurrence.frequency === "none") {
    return recurrence;
  }

  return {
    ...recurrence,
    overrides: {
      ...(recurrence.overrides ?? {}),
      [occurrenceKey]: {
        startsAt,
        endsAt,
      },
    },
  } satisfies RecurrenceRule;
}

export function shiftRecurringSeries(
  baseStartsAt: string,
  baseEndsAt: string,
  recurrence: RecurrenceRule | null,
  originalOccurrenceStartsAt: string,
  originalOccurrenceEndsAt: string,
  nextOccurrenceStartsAt: string,
  nextOccurrenceEndsAt: string,
) {
  const startShift =
    parseISO(nextOccurrenceStartsAt).getTime() -
    parseISO(originalOccurrenceStartsAt).getTime();
  const endShift =
    parseISO(nextOccurrenceEndsAt).getTime() -
    parseISO(originalOccurrenceEndsAt).getTime();
  const dayShift = differenceInCalendarDays(
    startOfDay(parseISO(nextOccurrenceStartsAt)),
    startOfDay(parseISO(originalOccurrenceStartsAt)),
  );
  const nextRecurrence =
    recurrence && recurrence.frequency !== "none"
      ? {
          ...recurrence,
          overrides: undefined,
          daysOfWeek:
            recurrence.frequency === "weekly" && recurrence.daysOfWeek?.length && dayShift
              ? recurrence.daysOfWeek
                  .map((day) => shiftWeekday(day, dayShift))
                  .filter((day, index, collection) => collection.indexOf(day) === index)
                  .sort((left, right) => left - right)
              : recurrence.daysOfWeek,
        }
      : recurrence;

  return {
    startsAt: new Date(parseISO(baseStartsAt).getTime() + startShift).toISOString(),
    endsAt: new Date(parseISO(baseEndsAt).getTime() + endShift).toISOString(),
    recurrence: nextRecurrence,
  };
}

export function todayDateString() {
  return format(new Date(), "yyyy-MM-dd");
}

type BusyWindow = {
  startsAt: string;
  endsAt: string;
};

type BuildTimeWindowOptions = {
  durationMinutes?: number;
  busyWindows?: BusyWindow[];
};

function parseClock(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return { hours, minutes };
}

function roundUpToSlot(date: Date, slotMinutes: number) {
  const rounded = new Date(date);
  rounded.setSeconds(0, 0);

  const remainder = rounded.getMinutes() % slotMinutes;
  if (remainder) {
    rounded.setMinutes(rounded.getMinutes() + slotMinutes - remainder);
  }

  return rounded;
}

export function buildDefaultEventWindow(
  settings: Pick<UserSettingsRecord, "slotMinutes" | "workHours">,
  now = new Date(),
  options: BuildTimeWindowOptions = {},
) {
  const durationMinutes = Math.max(
    options.durationMinutes ?? 60,
    settings.slotMinutes,
  );
  const roundedNow = roundUpToSlot(now, settings.slotMinutes);
  const busyWindows = options.busyWindows ?? [];

  for (let dayOffset = 0; dayOffset < 14; dayOffset += 1) {
    const day = addDays(startOfDay(roundedNow), dayOffset);
    const workBlock = settings.workHours[day.getDay()];

    if (!workBlock) {
      continue;
    }

    const dayStartClock = parseClock(workBlock.start);
    const dayEndClock = parseClock(workBlock.end);
    const dayStart = set(day, {
      hours: dayStartClock.hours,
      minutes: dayStartClock.minutes,
      seconds: 0,
      milliseconds: 0,
    });
    const dayEnd = set(day, {
      hours: dayEndClock.hours,
      minutes: dayEndClock.minutes,
      seconds: 0,
      milliseconds: 0,
    });
    const candidateStartBase =
      dayOffset === 0 && isAfter(roundedNow, dayStart) ? roundedNow : dayStart;
    let candidateStart = roundUpToSlot(candidateStartBase, settings.slotMinutes);
    const busyIntervals = busyWindows
      .map((window) => {
        const intervalStart = parseISO(window.startsAt);
        const intervalEnd = parseISO(window.endsAt);

        if (
          intervalEnd.getTime() <= dayStart.getTime() ||
          intervalStart.getTime() >= dayEnd.getTime()
        ) {
          return null;
        }

        return {
          start:
            intervalStart.getTime() < dayStart.getTime() ? dayStart : intervalStart,
          end: intervalEnd.getTime() > dayEnd.getTime() ? dayEnd : intervalEnd,
        };
      })
      .filter((interval): interval is { start: Date; end: Date } => interval !== null)
      .sort((left, right) => left.start.getTime() - right.start.getTime());

    for (const interval of busyIntervals) {
      const candidateEnd = addMinutes(candidateStart, durationMinutes);

      if (candidateEnd.getTime() <= interval.start.getTime()) {
        break;
      }

      if (interval.end.getTime() > candidateStart.getTime()) {
        candidateStart = roundUpToSlot(interval.end, settings.slotMinutes);
      }

      if (addMinutes(candidateStart, durationMinutes).getTime() > dayEnd.getTime()) {
        break;
      }
    }

    const candidateEnd = addMinutes(candidateStart, durationMinutes);

    if (isBefore(candidateStart, dayEnd) && !isAfter(candidateEnd, dayEnd)) {
      return {
        startsAt: candidateStart.toISOString(),
        endsAt: candidateEnd.toISOString(),
      };
    }
  }

  const fallbackStart = roundUpToSlot(now, settings.slotMinutes);
  return {
    startsAt: fallbackStart.toISOString(),
    endsAt: addMinutes(fallbackStart, durationMinutes).toISOString(),
  };
}
