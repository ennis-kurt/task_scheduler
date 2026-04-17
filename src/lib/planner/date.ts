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
      ? [{ start: startsAt, end: endsAt, recurring: false }]
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

  return visibleDays.flatMap((day) => {
    if (isBefore(day, startOfDay(baseStart))) {
      return [];
    }

    if (untilDate && isAfter(day, endOfDay(untilDate))) {
      return [];
    }

    const weekday = day.getDay();
    const matches = (() => {
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
    })();

    if (!matches) {
      return [];
    }

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
      const start = occurrenceStart.toISOString();
      const end = occurrenceEnd.toISOString();

      return overlapsRange(start, end, range)
        ? [{ start, end, recurring: true }]
        : [];
    }

    return [];
  });
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
