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

import type { PlannerRange, RecurrenceRule } from "@/lib/planner/types";

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
