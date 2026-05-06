# AI Daily Planner Model Eval Pack

Use this file to compare models for the AI daily planner. The prompt mirrors the current
planner intent in `src/lib/planner/ai-daily-plan.ts`, but is formatted so it can be pasted
into any provider console.

## How To Run

For each model:

1. Use the `System instruction` as the system message.
2. Use the `Developer instruction` as the developer, tool, or high-priority instruction.
3. Use the `User instruction` followed by one sample payload as the user message.
4. Require JSON only. Do not accept markdown, comments, or prose outside JSON.
5. Validate the response with the checks at the bottom of this file.

Recommended generation settings for an apples-to-apples test:

- Temperature: `0.2`
- Reasoning effort: `low`, if the provider supports it
- Max output: enough for roughly `2,000` to `3,500` tokens
- Tools: none

## System Instruction

You are Inflara's AI Office Assistant.
Create humane, realistic daily plans that balance urgency, effort, priority, deadlines,
fixed calendar events, available capacity, and project progress.
Never overload the user just because a project is high priority. Balance priority with
actual deadline risk.
Return only structured JSON matching the DailyPlanResponse schema.

## Developer Instruction

Input includes tasks, projects, milestones, estimated durations, priorities, due dates,
project progress, work hours, fixed events, planning mode, custom user instructions, and
task dependencies.

The `schedule` output is a list of new proposed blocks to create. It is not a full-day
calendar rendering.

Existing calendar items in `scheduledItems` are constraints:

- Fixed events are busy time only. Do not emit them in `schedule`.
- Future scheduled task blocks are busy time only. Do not emit them in `schedule`.
- If a task already has a future scheduled task block today, do not create any additional
  focus block for that task today, even if its estimate is not fully covered.
- Existing fixed events and future scheduled task blocks can be referenced in the summary,
  reasons, warnings, or explanation, but they must not appear as new schedule blocks.
- If a scheduled task block started earlier today, is now in the past, and the task is
  still unfinished, it may be rescheduled after `currentTime`.

Use `buffer` sparingly. A buffer is new protected time the planner wants to create; it must
not stand in for an existing fixed event, existing task block, or meeting. Prefer
`focus_block` and `break` unless a real transition, overflow, or end-of-day protection
block is useful.

Deep Focus should use longer focused blocks and fewer gaps.
Standard should balance urgent work, project progress, breaks, and task variety.
Chill should reduce cognitive load with more breathing room and less total scheduled work.
Custom should follow the user's explicit organization preferences.

Avoid future scheduled task blocks and never overlap fixed events.

For the selected date, respect the provided current time: never schedule blocks in the
past, and leave past selected dates empty.

Honor task dependencies:

- A task with a `blocks` dependency should not be scheduled before the task it depends on.
- If the dependency task is not done and cannot fit today, postpone the dependent task.
- `related` dependencies can influence ordering, but they are not hard blockers.

Warn clearly when available time cannot realistically satisfy deadlines.

Do not put already scheduled tasks in `postponed_tasks` unless they are truly being moved
out of today. If a task is simply already scheduled, leave it out of both `schedule` and
`postponed_tasks`.

The output must include `planning_mode`, `summary`, `generated_at`, `date`, `schedule`,
`warnings`, `postponed_tasks`, `alternatives`, and `explanation_summary`.

## User Instruction

Create a daily plan for the date and timezone in the JSON payload.
Selected planning mode is in `planningMode`.
Custom instructions are in `customInstructions`.
Use the provided JSON context: current time, tasks, projects, milestones, deadlines,
priorities, estimated durations, scheduled task blocks, fixed events, available working
hours, project progress, and dependencies.
Return only new blocks that should be created. Do not return fixed events, meetings, or
future scheduled task blocks as schedule entries.
Return JSON only in the expected DailyPlanResponse format.

## Required Response Shape

```json
{
  "planning_mode": "standard",
  "summary": "Short human-readable summary.",
  "generated_at": "2026-05-05T13:10:00.000Z",
  "date": "2026-05-06",
  "schedule": [
    {
      "start_time": "09:00",
      "end_time": "10:15",
      "type": "focus_block",
      "task_id": "task-id-or-null",
      "task_title": "Task title or Break",
      "project_id": "project-id-or-null",
      "project_name": "Project name or null",
      "reason": "Why this block was placed here."
    }
  ],
  "warnings": [
    {
      "type": "deadline_risk",
      "project_id": "project-id-or-null",
      "milestone_id": "milestone-id-or-null",
      "task_id": "task-id-or-null",
      "message": "Clear warning.",
      "severity": "low"
    }
  ],
  "postponed_tasks": [
    {
      "task_id": "task-id",
      "task_title": "Task title",
      "reason": "Why it was not scheduled."
    }
  ],
  "alternatives": [
    {
      "label": "Lighter plan",
      "summary": "Short description.",
      "schedule": []
    }
  ],
  "explanation_summary": "Brief explanation of prioritization and tradeoffs."
}
```

Allowed values:

- `planning_mode`: `deep_focus`, `standard`, `chill`, or `custom`
- `schedule[].type`: `focus_block`, `break`, or `buffer`
- `warnings[].type`: `deadline_risk`, `capacity_risk`, or `overload`
- `warnings[].severity`: `low`, `medium`, or `high`

Important schedule semantics:

- `schedule` must contain only new proposed blocks.
- Existing fixed events are not schedule output.
- Existing future task blocks are not schedule output.
- Existing future task blocks also make that task ineligible for more focus blocks today.
- A task block that started earlier today and is now missed may be rescheduled if the task
  is still unfinished.

## Sample 1: Standard Day With Meetings

This sample tests normal task selection, deadlines, project progress, breaks, and fixed
meetings. A good model should schedule the highest deadline-risk work, avoid the meetings,
include breaks, and postpone lower-value tasks. It should not output the `09:30-10:00`
standup, the `12:00-12:45` customer call, or the existing `15:30-16:30` weekly report task
block. It should also not add more `task-weekly-report` time, because that task already has
a future scheduled block today.

```json
{
  "planningMode": "standard",
  "date": "2026-05-06",
  "timezone": "America/New_York",
  "currentTime": "2026-05-06T12:35:00.000Z",
  "tasks": [
    {
      "id": "task-launch-copy",
      "title": "Finalize launch email copy",
      "notes": "Needs one polished version for the product announcement.",
      "priority": "high",
      "estimatedMinutes": 75,
      "dueAt": "2026-05-06T21:00:00.000Z",
      "preferredTimeBand": "morning",
      "preferredWindowStart": null,
      "preferredWindowEnd": null,
      "status": "todo",
      "availability": "ready",
      "areaId": "area-growth",
      "projectId": "project-launch",
      "milestoneId": "milestone-launch-assets",
      "project": {
        "id": "project-launch",
        "name": "Spring Launch",
        "deadlineAt": "2026-05-08T21:00:00.000Z",
        "color": "#2563eb"
      },
      "milestone": {
        "id": "milestone-launch-assets",
        "name": "Launch assets ready",
        "deadline": "2026-05-07T21:00:00.000Z"
      }
    },
    {
      "id": "task-pricing-qa",
      "title": "QA pricing table edge cases",
      "notes": "Check annual/monthly toggle, coupon display, and empty-state copy.",
      "priority": "critical",
      "estimatedMinutes": 95,
      "dueAt": "2026-05-06T20:00:00.000Z",
      "preferredTimeBand": "anytime",
      "preferredWindowStart": null,
      "preferredWindowEnd": null,
      "status": "in_progress",
      "availability": "ready",
      "areaId": "area-product",
      "projectId": "project-launch",
      "milestoneId": "milestone-launch-assets",
      "project": {
        "id": "project-launch",
        "name": "Spring Launch",
        "deadlineAt": "2026-05-08T21:00:00.000Z",
        "color": "#2563eb"
      },
      "milestone": {
        "id": "milestone-launch-assets",
        "name": "Launch assets ready",
        "deadline": "2026-05-07T21:00:00.000Z"
      }
    },
    {
      "id": "task-customer-notes",
      "title": "Summarize beta customer notes",
      "notes": "Turn 14 notes into three product themes.",
      "priority": "medium",
      "estimatedMinutes": 60,
      "dueAt": "2026-05-09T21:00:00.000Z",
      "preferredTimeBand": "afternoon",
      "preferredWindowStart": null,
      "preferredWindowEnd": null,
      "status": "todo",
      "availability": "ready",
      "areaId": "area-product",
      "projectId": "project-research",
      "milestoneId": "milestone-beta-synthesis",
      "project": {
        "id": "project-research",
        "name": "Beta Research",
        "deadlineAt": "2026-05-15T21:00:00.000Z",
        "color": "#0f766e"
      },
      "milestone": {
        "id": "milestone-beta-synthesis",
        "name": "Beta synthesis",
        "deadline": "2026-05-10T21:00:00.000Z"
      }
    },
    {
      "id": "task-inbox-cleanup",
      "title": "Clean up planning inbox",
      "notes": "Triage loose notes and old task ideas.",
      "priority": "low",
      "estimatedMinutes": 45,
      "dueAt": null,
      "preferredTimeBand": "evening",
      "preferredWindowStart": null,
      "preferredWindowEnd": null,
      "status": "todo",
      "availability": "ready",
      "areaId": "area-ops",
      "projectId": null,
      "milestoneId": null
    },
    {
      "id": "task-weekly-report",
      "title": "Draft weekly operator report",
      "notes": "Include usage, support load, and launch readiness.",
      "priority": "medium",
      "estimatedMinutes": 80,
      "dueAt": "2026-05-07T17:00:00.000Z",
      "preferredTimeBand": "afternoon",
      "preferredWindowStart": null,
      "preferredWindowEnd": null,
      "status": "todo",
      "availability": "ready",
      "areaId": "area-ops",
      "projectId": "project-ops",
      "milestoneId": null,
      "project": {
        "id": "project-ops",
        "name": "Operator Cadence",
        "deadlineAt": null,
        "color": "#7c3aed"
      }
    }
  ],
  "projects": [
    {
      "id": "project-launch",
      "userId": "user-demo",
      "areaId": "area-product",
      "name": "Spring Launch",
      "color": "#2563eb",
      "status": "active",
      "deadlineAt": "2026-05-08T21:00:00.000Z",
      "createdAt": "2026-04-01T12:00:00.000Z",
      "updatedAt": "2026-05-05T18:00:00.000Z"
    },
    {
      "id": "project-research",
      "userId": "user-demo",
      "areaId": "area-product",
      "name": "Beta Research",
      "color": "#0f766e",
      "status": "active",
      "deadlineAt": "2026-05-15T21:00:00.000Z",
      "createdAt": "2026-04-10T12:00:00.000Z",
      "updatedAt": "2026-05-05T18:00:00.000Z"
    },
    {
      "id": "project-ops",
      "userId": "user-demo",
      "areaId": "area-ops",
      "name": "Operator Cadence",
      "color": "#7c3aed",
      "status": "active",
      "deadlineAt": null,
      "createdAt": "2026-04-02T12:00:00.000Z",
      "updatedAt": "2026-05-05T18:00:00.000Z"
    }
  ],
  "milestones": [
    {
      "id": "milestone-launch-assets",
      "userId": "user-demo",
      "projectId": "project-launch",
      "name": "Launch assets ready",
      "description": "All public launch assets are approved.",
      "startDate": "2026-05-01",
      "deadline": "2026-05-07T21:00:00.000Z",
      "createdAt": "2026-05-01T12:00:00.000Z",
      "updatedAt": "2026-05-05T18:00:00.000Z"
    },
    {
      "id": "milestone-beta-synthesis",
      "userId": "user-demo",
      "projectId": "project-research",
      "name": "Beta synthesis",
      "description": "Summarize beta learnings.",
      "startDate": "2026-05-03",
      "deadline": "2026-05-10T21:00:00.000Z",
      "createdAt": "2026-05-03T12:00:00.000Z",
      "updatedAt": "2026-05-05T18:00:00.000Z"
    }
  ],
  "projectPlans": [
    {
      "project": {
        "id": "project-launch",
        "name": "Spring Launch",
        "deadlineAt": "2026-05-08T21:00:00.000Z"
      },
      "completionPercentage": 68,
      "remainingMinutes": 420,
      "remainingTaskCount": 5
    },
    {
      "project": {
        "id": "project-research",
        "name": "Beta Research",
        "deadlineAt": "2026-05-15T21:00:00.000Z"
      },
      "completionPercentage": 35,
      "remainingMinutes": 520,
      "remainingTaskCount": 8
    },
    {
      "project": {
        "id": "project-ops",
        "name": "Operator Cadence",
        "deadlineAt": null
      },
      "completionPercentage": 50,
      "remainingMinutes": 180,
      "remainingTaskCount": 3
    }
  ],
  "scheduledItems": [
    {
      "id": "event-daily-standup",
      "source": "event",
      "title": "Daily standup",
      "start": "2026-05-06T13:30:00.000Z",
      "end": "2026-05-06T14:00:00.000Z"
    },
    {
      "id": "event-customer-call",
      "source": "event",
      "title": "Customer call",
      "start": "2026-05-06T16:00:00.000Z",
      "end": "2026-05-06T16:45:00.000Z"
    },
    {
      "id": "task-block-weekly-report",
      "source": "task",
      "taskId": "task-weekly-report",
      "title": "Draft weekly operator report",
      "start": "2026-05-06T19:30:00.000Z",
      "end": "2026-05-06T20:30:00.000Z"
    }
  ],
  "capacity": [
    {
      "date": "2026-05-06",
      "availableMinutes": 390,
      "scheduledMinutes": 150,
      "overloaded": false
    }
  ],
  "settings": {
    "userId": "user-demo",
    "timezone": "America/New_York",
    "weekStart": 1,
    "slotMinutes": 30,
    "workHours": {
      "0": null,
      "1": {
        "start": "09:00",
        "end": "17:30"
      },
      "2": {
        "start": "09:00",
        "end": "17:30"
      },
      "3": {
        "start": "09:00",
        "end": "17:30"
      },
      "4": {
        "start": "09:00",
        "end": "17:30"
      },
      "5": {
        "start": "09:00",
        "end": "16:00"
      },
      "6": null
    },
    "createdAt": "2026-04-01T12:00:00.000Z",
    "updatedAt": "2026-05-05T18:00:00.000Z"
  },
  "customInstructions": null,
  "dependencies": [
    {
      "taskId": "task-launch-copy",
      "dependsOnTaskId": "task-pricing-qa",
      "type": "related"
    }
  ]
}
```

## Sample 2: Overloaded Deadline Day

This sample tests whether the model can say no. A good model should issue high-severity
warnings, schedule only what fits, avoid overlapping events, and postpone important work
when capacity is not realistic.

```json
{
  "planningMode": "standard",
  "date": "2026-05-07",
  "timezone": "America/Los_Angeles",
  "currentTime": "2026-05-07T16:10:00.000Z",
  "tasks": [
    {
      "id": "task-security-patch",
      "title": "Patch production auth vulnerability",
      "notes": "Coordinate deploy notes and verify login regression coverage.",
      "priority": "critical",
      "estimatedMinutes": 150,
      "dueAt": "2026-05-07T23:00:00.000Z",
      "preferredTimeBand": "anytime",
      "preferredWindowStart": null,
      "preferredWindowEnd": null,
      "status": "in_progress",
      "availability": "ready",
      "areaId": "area-engineering",
      "projectId": "project-security",
      "milestoneId": "milestone-auth-hardening",
      "project": {
        "id": "project-security",
        "name": "Auth Hardening",
        "deadlineAt": "2026-05-09T00:00:00.000Z",
        "color": "#dc2626"
      },
      "milestone": {
        "id": "milestone-auth-hardening",
        "name": "Critical patch shipped",
        "deadline": "2026-05-07T23:00:00.000Z"
      }
    },
    {
      "id": "task-incident-summary",
      "title": "Write incident summary for leadership",
      "notes": "Include timeline, customer impact, and next mitigations.",
      "priority": "high",
      "estimatedMinutes": 90,
      "dueAt": "2026-05-08T01:00:00.000Z",
      "preferredTimeBand": "afternoon",
      "preferredWindowStart": null,
      "preferredWindowEnd": null,
      "status": "todo",
      "availability": "ready",
      "areaId": "area-engineering",
      "projectId": "project-security",
      "milestoneId": "milestone-auth-hardening",
      "project": {
        "id": "project-security",
        "name": "Auth Hardening",
        "deadlineAt": "2026-05-09T00:00:00.000Z",
        "color": "#dc2626"
      },
      "milestone": {
        "id": "milestone-auth-hardening",
        "name": "Critical patch shipped",
        "deadline": "2026-05-07T23:00:00.000Z"
      }
    },
    {
      "id": "task-dashboard-filters",
      "title": "Finish dashboard filter polish",
      "notes": "Nice-to-have visual cleanup before design review.",
      "priority": "medium",
      "estimatedMinutes": 120,
      "dueAt": "2026-05-08T20:00:00.000Z",
      "preferredTimeBand": "afternoon",
      "preferredWindowStart": null,
      "preferredWindowEnd": null,
      "status": "todo",
      "availability": "ready",
      "areaId": "area-product",
      "projectId": "project-analytics",
      "milestoneId": "milestone-dashboard-demo",
      "project": {
        "id": "project-analytics",
        "name": "Analytics Dashboard",
        "deadlineAt": "2026-05-12T00:00:00.000Z",
        "color": "#0891b2"
      },
      "milestone": {
        "id": "milestone-dashboard-demo",
        "name": "Dashboard demo",
        "deadline": "2026-05-08T20:00:00.000Z"
      }
    },
    {
      "id": "task-release-notes",
      "title": "Prepare release notes",
      "notes": "Draft changelog bullets for support and sales.",
      "priority": "high",
      "estimatedMinutes": 75,
      "dueAt": "2026-05-07T22:00:00.000Z",
      "preferredTimeBand": "anytime",
      "preferredWindowStart": null,
      "preferredWindowEnd": null,
      "status": "todo",
      "availability": "ready",
      "areaId": "area-product",
      "projectId": "project-security",
      "milestoneId": "milestone-auth-hardening",
      "project": {
        "id": "project-security",
        "name": "Auth Hardening",
        "deadlineAt": "2026-05-09T00:00:00.000Z",
        "color": "#dc2626"
      },
      "milestone": {
        "id": "milestone-auth-hardening",
        "name": "Critical patch shipped",
        "deadline": "2026-05-07T23:00:00.000Z"
      }
    }
  ],
  "projects": [
    {
      "id": "project-security",
      "userId": "user-demo",
      "areaId": "area-engineering",
      "name": "Auth Hardening",
      "color": "#dc2626",
      "status": "active",
      "deadlineAt": "2026-05-09T00:00:00.000Z",
      "createdAt": "2026-04-20T12:00:00.000Z",
      "updatedAt": "2026-05-07T15:00:00.000Z"
    },
    {
      "id": "project-analytics",
      "userId": "user-demo",
      "areaId": "area-product",
      "name": "Analytics Dashboard",
      "color": "#0891b2",
      "status": "active",
      "deadlineAt": "2026-05-12T00:00:00.000Z",
      "createdAt": "2026-04-18T12:00:00.000Z",
      "updatedAt": "2026-05-07T15:00:00.000Z"
    }
  ],
  "milestones": [
    {
      "id": "milestone-auth-hardening",
      "userId": "user-demo",
      "projectId": "project-security",
      "name": "Critical patch shipped",
      "description": "Security fix deployed and communicated.",
      "startDate": "2026-05-06",
      "deadline": "2026-05-07T23:00:00.000Z",
      "createdAt": "2026-05-06T12:00:00.000Z",
      "updatedAt": "2026-05-07T15:00:00.000Z"
    },
    {
      "id": "milestone-dashboard-demo",
      "userId": "user-demo",
      "projectId": "project-analytics",
      "name": "Dashboard demo",
      "description": "Demo-ready dashboard for design review.",
      "startDate": "2026-05-04",
      "deadline": "2026-05-08T20:00:00.000Z",
      "createdAt": "2026-05-04T12:00:00.000Z",
      "updatedAt": "2026-05-07T15:00:00.000Z"
    }
  ],
  "projectPlans": [
    {
      "project": {
        "id": "project-security",
        "name": "Auth Hardening",
        "deadlineAt": "2026-05-09T00:00:00.000Z"
      },
      "completionPercentage": 42,
      "remainingMinutes": 620,
      "remainingTaskCount": 7
    },
    {
      "project": {
        "id": "project-analytics",
        "name": "Analytics Dashboard",
        "deadlineAt": "2026-05-12T00:00:00.000Z"
      },
      "completionPercentage": 74,
      "remainingMinutes": 260,
      "remainingTaskCount": 4
    }
  ],
  "scheduledItems": [
    {
      "id": "event-postmortem",
      "source": "event",
      "title": "Incident postmortem prep",
      "start": "2026-05-07T17:00:00.000Z",
      "end": "2026-05-07T18:00:00.000Z"
    },
    {
      "id": "event-customer-escalation",
      "source": "event",
      "title": "Customer escalation",
      "start": "2026-05-07T19:30:00.000Z",
      "end": "2026-05-07T20:30:00.000Z"
    },
    {
      "id": "event-vendor-window",
      "source": "event",
      "title": "Vendor maintenance window",
      "start": "2026-05-07T22:00:00.000Z",
      "end": "2026-05-08T01:00:00.000Z"
    }
  ],
  "capacity": [
    {
      "date": "2026-05-07",
      "availableMinutes": 180,
      "scheduledMinutes": 300,
      "overloaded": true
    }
  ],
  "settings": {
    "userId": "user-demo",
    "timezone": "America/Los_Angeles",
    "weekStart": 1,
    "slotMinutes": 30,
    "workHours": {
      "0": null,
      "1": {
        "start": "08:30",
        "end": "17:30"
      },
      "2": {
        "start": "08:30",
        "end": "17:30"
      },
      "3": {
        "start": "08:30",
        "end": "17:30"
      },
      "4": {
        "start": "08:30",
        "end": "17:30"
      },
      "5": {
        "start": "08:30",
        "end": "15:30"
      },
      "6": null
    },
    "createdAt": "2026-04-01T12:00:00.000Z",
    "updatedAt": "2026-05-07T15:00:00.000Z"
  },
  "customInstructions": null,
  "dependencies": []
}
```

## Sample 3: Custom Lighter Plan With Preferences

This sample tests natural-language custom instructions. A good model should prioritize
urgent deadlines, avoid cleanup-like tasks, use about 45-minute sessions, and keep a lighter
schedule with more breathing room.

```json
{
  "planningMode": "custom",
  "date": "2026-05-08",
  "timezone": "America/New_York",
  "currentTime": "2026-05-08T13:05:00.000Z",
  "tasks": [
    {
      "id": "task-board-brief",
      "title": "Create board meeting brief",
      "notes": "Condense project status into one crisp page.",
      "priority": "critical",
      "estimatedMinutes": 90,
      "dueAt": "2026-05-08T21:00:00.000Z",
      "preferredTimeBand": "morning",
      "preferredWindowStart": null,
      "preferredWindowEnd": null,
      "status": "todo",
      "availability": "ready",
      "areaId": "area-exec",
      "projectId": "project-board-pack",
      "milestoneId": "milestone-board-review",
      "project": {
        "id": "project-board-pack",
        "name": "Board Pack",
        "deadlineAt": "2026-05-11T18:00:00.000Z",
        "color": "#9333ea"
      },
      "milestone": {
        "id": "milestone-board-review",
        "name": "Board review draft",
        "deadline": "2026-05-08T21:00:00.000Z"
      }
    },
    {
      "id": "task-finance-check",
      "title": "Check finance appendix numbers",
      "notes": "Spot-check ARR, burn, runway, and assumptions.",
      "priority": "high",
      "estimatedMinutes": 55,
      "dueAt": "2026-05-08T20:00:00.000Z",
      "preferredTimeBand": "afternoon",
      "preferredWindowStart": null,
      "preferredWindowEnd": null,
      "status": "todo",
      "availability": "ready",
      "areaId": "area-exec",
      "projectId": "project-board-pack",
      "milestoneId": "milestone-board-review",
      "project": {
        "id": "project-board-pack",
        "name": "Board Pack",
        "deadlineAt": "2026-05-11T18:00:00.000Z",
        "color": "#9333ea"
      },
      "milestone": {
        "id": "milestone-board-review",
        "name": "Board review draft",
        "deadline": "2026-05-08T21:00:00.000Z"
      }
    },
    {
      "id": "task-cleanup-tags",
      "title": "Cleanup old CRM tags",
      "notes": "Remove duplicate campaign tags.",
      "priority": "medium",
      "estimatedMinutes": 50,
      "dueAt": "2026-05-13T20:00:00.000Z",
      "preferredTimeBand": "afternoon",
      "preferredWindowStart": null,
      "preferredWindowEnd": null,
      "status": "todo",
      "availability": "ready",
      "areaId": "area-ops",
      "projectId": "project-crm",
      "milestoneId": null,
      "project": {
        "id": "project-crm",
        "name": "CRM Hygiene",
        "deadlineAt": "2026-05-20T20:00:00.000Z",
        "color": "#64748b"
      }
    },
    {
      "id": "task-customer-followups",
      "title": "Send three customer follow-ups",
      "notes": "Follow up with Atlas, Northstar, and Lumina.",
      "priority": "medium",
      "estimatedMinutes": 45,
      "dueAt": "2026-05-09T20:00:00.000Z",
      "preferredTimeBand": "afternoon",
      "preferredWindowStart": null,
      "preferredWindowEnd": null,
      "status": "todo",
      "availability": "ready",
      "areaId": "area-growth",
      "projectId": "project-retention",
      "milestoneId": null,
      "project": {
        "id": "project-retention",
        "name": "Retention Sprint",
        "deadlineAt": "2026-05-16T20:00:00.000Z",
        "color": "#16a34a"
      }
    },
    {
      "id": "task-support-cleanup",
      "title": "Cleanup support macro backlog",
      "notes": "Archive stale drafts and rename duplicates.",
      "priority": "low",
      "estimatedMinutes": 60,
      "dueAt": null,
      "preferredTimeBand": "evening",
      "preferredWindowStart": null,
      "preferredWindowEnd": null,
      "status": "todo",
      "availability": "ready",
      "areaId": "area-support",
      "projectId": "project-support",
      "milestoneId": null,
      "project": {
        "id": "project-support",
        "name": "Support Operations",
        "deadlineAt": null,
        "color": "#f59e0b"
      }
    }
  ],
  "projects": [
    {
      "id": "project-board-pack",
      "userId": "user-demo",
      "areaId": "area-exec",
      "name": "Board Pack",
      "color": "#9333ea",
      "status": "active",
      "deadlineAt": "2026-05-11T18:00:00.000Z",
      "createdAt": "2026-04-15T12:00:00.000Z",
      "updatedAt": "2026-05-08T12:00:00.000Z"
    },
    {
      "id": "project-crm",
      "userId": "user-demo",
      "areaId": "area-ops",
      "name": "CRM Hygiene",
      "color": "#64748b",
      "status": "active",
      "deadlineAt": "2026-05-20T20:00:00.000Z",
      "createdAt": "2026-04-15T12:00:00.000Z",
      "updatedAt": "2026-05-08T12:00:00.000Z"
    },
    {
      "id": "project-retention",
      "userId": "user-demo",
      "areaId": "area-growth",
      "name": "Retention Sprint",
      "color": "#16a34a",
      "status": "active",
      "deadlineAt": "2026-05-16T20:00:00.000Z",
      "createdAt": "2026-04-15T12:00:00.000Z",
      "updatedAt": "2026-05-08T12:00:00.000Z"
    },
    {
      "id": "project-support",
      "userId": "user-demo",
      "areaId": "area-support",
      "name": "Support Operations",
      "color": "#f59e0b",
      "status": "active",
      "deadlineAt": null,
      "createdAt": "2026-04-15T12:00:00.000Z",
      "updatedAt": "2026-05-08T12:00:00.000Z"
    }
  ],
  "milestones": [
    {
      "id": "milestone-board-review",
      "userId": "user-demo",
      "projectId": "project-board-pack",
      "name": "Board review draft",
      "description": "Executive-ready draft for Monday review.",
      "startDate": "2026-05-06",
      "deadline": "2026-05-08T21:00:00.000Z",
      "createdAt": "2026-05-06T12:00:00.000Z",
      "updatedAt": "2026-05-08T12:00:00.000Z"
    }
  ],
  "projectPlans": [
    {
      "project": {
        "id": "project-board-pack",
        "name": "Board Pack",
        "deadlineAt": "2026-05-11T18:00:00.000Z"
      },
      "completionPercentage": 58,
      "remainingMinutes": 360,
      "remainingTaskCount": 5
    },
    {
      "project": {
        "id": "project-crm",
        "name": "CRM Hygiene",
        "deadlineAt": "2026-05-20T20:00:00.000Z"
      },
      "completionPercentage": 20,
      "remainingMinutes": 300,
      "remainingTaskCount": 6
    },
    {
      "project": {
        "id": "project-retention",
        "name": "Retention Sprint",
        "deadlineAt": "2026-05-16T20:00:00.000Z"
      },
      "completionPercentage": 47,
      "remainingMinutes": 240,
      "remainingTaskCount": 4
    }
  ],
  "scheduledItems": [
    {
      "id": "event-1-1",
      "source": "event",
      "title": "Weekly 1:1",
      "start": "2026-05-08T15:30:00.000Z",
      "end": "2026-05-08T16:00:00.000Z"
    },
    {
      "id": "event-legal-review",
      "source": "event",
      "title": "Legal review",
      "start": "2026-05-08T18:00:00.000Z",
      "end": "2026-05-08T18:45:00.000Z"
    }
  ],
  "capacity": [
    {
      "date": "2026-05-08",
      "availableMinutes": 300,
      "scheduledMinutes": 75,
      "overloaded": false
    }
  ],
  "settings": {
    "userId": "user-demo",
    "timezone": "America/New_York",
    "weekStart": 1,
    "slotMinutes": 30,
    "workHours": {
      "0": null,
      "1": {
        "start": "09:00",
        "end": "17:30"
      },
      "2": {
        "start": "09:00",
        "end": "17:30"
      },
      "3": {
        "start": "09:00",
        "end": "17:30"
      },
      "4": {
        "start": "09:00",
        "end": "17:30"
      },
      "5": {
        "start": "09:00",
        "end": "16:30"
      },
      "6": null
    },
    "createdAt": "2026-04-01T12:00:00.000Z",
    "updatedAt": "2026-05-08T12:00:00.000Z"
  },
  "customInstructions": {
    "intensity": "lighter schedule",
    "priorityFocus": "urgent deadlines",
    "avoidTasks": "cleanup",
    "sessionLength": "45"
  },
  "dependencies": []
}
```

## Sample 4: Deep Focus With Dependencies And Existing Schedule

This sample tests harder scheduling rules. A good model should not schedule anything before
the current time, should not duplicate the future scheduled task block, should allow
rescheduling the missed earlier task block, and should respect the hard `blocks`
dependency.

```json
{
  "planningMode": "deep_focus",
  "date": "2026-05-11",
  "timezone": "America/Chicago",
  "currentTime": "2026-05-11T17:22:00.000Z",
  "tasks": [
    {
      "id": "task-architecture-outline",
      "title": "Outline scheduling engine architecture",
      "notes": "Define modules, validator boundaries, and fallback strategy.",
      "priority": "critical",
      "estimatedMinutes": 110,
      "dueAt": "2026-05-11T23:00:00.000Z",
      "preferredTimeBand": "morning",
      "preferredWindowStart": null,
      "preferredWindowEnd": null,
      "status": "in_progress",
      "availability": "ready",
      "areaId": "area-engineering",
      "projectId": "project-agent-planner",
      "milestoneId": "milestone-engine-v1",
      "project": {
        "id": "project-agent-planner",
        "name": "Agent Planner V1",
        "deadlineAt": "2026-05-14T23:00:00.000Z",
        "color": "#2563eb"
      },
      "milestone": {
        "id": "milestone-engine-v1",
        "name": "Planner engine v1",
        "deadline": "2026-05-12T23:00:00.000Z"
      }
    },
    {
      "id": "task-write-validator",
      "title": "Write semantic plan validator",
      "notes": "Reject overlaps, unknown task IDs, dependency violations, and past blocks.",
      "priority": "high",
      "estimatedMinutes": 120,
      "dueAt": "2026-05-12T22:00:00.000Z",
      "preferredTimeBand": "afternoon",
      "preferredWindowStart": null,
      "preferredWindowEnd": null,
      "status": "todo",
      "availability": "ready",
      "areaId": "area-engineering",
      "projectId": "project-agent-planner",
      "milestoneId": "milestone-engine-v1",
      "project": {
        "id": "project-agent-planner",
        "name": "Agent Planner V1",
        "deadlineAt": "2026-05-14T23:00:00.000Z",
        "color": "#2563eb"
      },
      "milestone": {
        "id": "milestone-engine-v1",
        "name": "Planner engine v1",
        "deadline": "2026-05-12T23:00:00.000Z"
      }
    },
    {
      "id": "task-integrate-provider",
      "title": "Integrate provider routing layer",
      "notes": "Add model selection config and usage telemetry.",
      "priority": "high",
      "estimatedMinutes": 105,
      "dueAt": "2026-05-13T22:00:00.000Z",
      "preferredTimeBand": "afternoon",
      "preferredWindowStart": null,
      "preferredWindowEnd": null,
      "status": "todo",
      "availability": "ready",
      "areaId": "area-engineering",
      "projectId": "project-agent-planner",
      "milestoneId": "milestone-engine-v1",
      "project": {
        "id": "project-agent-planner",
        "name": "Agent Planner V1",
        "deadlineAt": "2026-05-14T23:00:00.000Z",
        "color": "#2563eb"
      },
      "milestone": {
        "id": "milestone-engine-v1",
        "name": "Planner engine v1",
        "deadline": "2026-05-12T23:00:00.000Z"
      }
    },
    {
      "id": "task-write-eval-notes",
      "title": "Write model eval notes",
      "notes": "Summarize provider strengths, failures, and recommended routing.",
      "priority": "medium",
      "estimatedMinutes": 70,
      "dueAt": "2026-05-14T21:00:00.000Z",
      "preferredTimeBand": "evening",
      "preferredWindowStart": null,
      "preferredWindowEnd": null,
      "status": "todo",
      "availability": "ready",
      "areaId": "area-product",
      "projectId": "project-agent-planner",
      "milestoneId": null,
      "project": {
        "id": "project-agent-planner",
        "name": "Agent Planner V1",
        "deadlineAt": "2026-05-14T23:00:00.000Z",
        "color": "#2563eb"
      }
    },
    {
      "id": "task-already-scheduled",
      "title": "Review API auth notes",
      "notes": "Already has a future scheduled block today.",
      "priority": "medium",
      "estimatedMinutes": 60,
      "dueAt": "2026-05-12T21:00:00.000Z",
      "preferredTimeBand": "afternoon",
      "preferredWindowStart": null,
      "preferredWindowEnd": null,
      "status": "todo",
      "availability": "ready",
      "areaId": "area-engineering",
      "projectId": "project-agent-planner",
      "milestoneId": null,
      "project": {
        "id": "project-agent-planner",
        "name": "Agent Planner V1",
        "deadlineAt": "2026-05-14T23:00:00.000Z",
        "color": "#2563eb"
      }
    }
  ],
  "projects": [
    {
      "id": "project-agent-planner",
      "userId": "user-demo",
      "areaId": "area-engineering",
      "name": "Agent Planner V1",
      "color": "#2563eb",
      "status": "active",
      "deadlineAt": "2026-05-14T23:00:00.000Z",
      "createdAt": "2026-05-01T12:00:00.000Z",
      "updatedAt": "2026-05-11T16:00:00.000Z"
    }
  ],
  "milestones": [
    {
      "id": "milestone-engine-v1",
      "userId": "user-demo",
      "projectId": "project-agent-planner",
      "name": "Planner engine v1",
      "description": "Provider-backed planner with validator fallback.",
      "startDate": "2026-05-08",
      "deadline": "2026-05-12T23:00:00.000Z",
      "createdAt": "2026-05-08T12:00:00.000Z",
      "updatedAt": "2026-05-11T16:00:00.000Z"
    }
  ],
  "projectPlans": [
    {
      "project": {
        "id": "project-agent-planner",
        "name": "Agent Planner V1",
        "deadlineAt": "2026-05-14T23:00:00.000Z"
      },
      "completionPercentage": 28,
      "remainingMinutes": 780,
      "remainingTaskCount": 9
    }
  ],
  "scheduledItems": [
    {
      "id": "task-block-missed-outline",
      "source": "task",
      "taskId": "task-architecture-outline",
      "title": "Outline scheduling engine architecture",
      "start": "2026-05-11T14:30:00.000Z",
      "end": "2026-05-11T15:30:00.000Z"
    },
    {
      "id": "event-planning-review",
      "source": "event",
      "title": "Planner review",
      "start": "2026-05-11T18:00:00.000Z",
      "end": "2026-05-11T18:45:00.000Z"
    },
    {
      "id": "task-block-auth-notes",
      "source": "task",
      "taskId": "task-already-scheduled",
      "title": "Review API auth notes",
      "start": "2026-05-11T21:00:00.000Z",
      "end": "2026-05-11T22:00:00.000Z"
    }
  ],
  "capacity": [
    {
      "date": "2026-05-11",
      "availableMinutes": 285,
      "scheduledMinutes": 165,
      "overloaded": false
    }
  ],
  "settings": {
    "userId": "user-demo",
    "timezone": "America/Chicago",
    "weekStart": 1,
    "slotMinutes": 30,
    "workHours": {
      "0": null,
      "1": {
        "start": "08:30",
        "end": "18:00"
      },
      "2": {
        "start": "08:30",
        "end": "18:00"
      },
      "3": {
        "start": "08:30",
        "end": "18:00"
      },
      "4": {
        "start": "08:30",
        "end": "18:00"
      },
      "5": {
        "start": "08:30",
        "end": "16:00"
      },
      "6": null
    },
    "createdAt": "2026-05-01T12:00:00.000Z",
    "updatedAt": "2026-05-11T16:00:00.000Z"
  },
  "customInstructions": null,
  "dependencies": [
    {
      "taskId": "task-write-validator",
      "dependsOnTaskId": "task-architecture-outline",
      "type": "blocks"
    },
    {
      "taskId": "task-integrate-provider",
      "dependsOnTaskId": "task-write-validator",
      "type": "blocks"
    },
    {
      "taskId": "task-write-eval-notes",
      "dependsOnTaskId": "task-integrate-provider",
      "type": "related"
    }
  ]
}
```

## Sample 5: Chill Day With Spillover Events And Existing Task Block

This sample tests whether the model can keep a light schedule while respecting an event
that spills into the selected day, a fixed midday appointment, and a future scheduled task
block. A good model should not schedule before `11:00` local time because the carryover
event blocks the morning, should not output the existing `15:00-15:45` docs task block,
and should avoid done or later-unavailable tasks.

```json
{
  "planningMode": "chill",
  "date": "2026-05-12",
  "timezone": "America/New_York",
  "currentTime": "2026-05-12T14:40:00.000Z",
  "tasks": [
    {
      "id": "task-billing-audit",
      "title": "Audit billing export anomalies",
      "notes": "Review the six mismatched accounts and identify whether revenue reports need correction.",
      "priority": "critical",
      "estimatedMinutes": 80,
      "dueAt": "2026-05-12T22:00:00.000Z",
      "preferredTimeBand": "morning",
      "preferredWindowStart": null,
      "preferredWindowEnd": null,
      "status": "todo",
      "availability": "ready",
      "areaId": "area-finance",
      "projectId": "project-billing-trust",
      "milestoneId": "milestone-billing-close",
      "project": {
        "id": "project-billing-trust",
        "name": "Billing Trust",
        "deadlineAt": "2026-05-14T22:00:00.000Z",
        "color": "#dc2626"
      },
      "milestone": {
        "id": "milestone-billing-close",
        "name": "Billing close verified",
        "deadline": "2026-05-12T22:00:00.000Z"
      }
    },
    {
      "id": "task-support-escalation",
      "title": "Respond to enterprise support escalation",
      "notes": "Write a concise customer update with current status and next checkpoint.",
      "priority": "high",
      "estimatedMinutes": 45,
      "dueAt": "2026-05-12T21:00:00.000Z",
      "preferredTimeBand": "afternoon",
      "preferredWindowStart": null,
      "preferredWindowEnd": null,
      "status": "todo",
      "availability": "ready",
      "areaId": "area-support",
      "projectId": "project-customer-trust",
      "milestoneId": "milestone-escalation-response",
      "project": {
        "id": "project-customer-trust",
        "name": "Customer Trust",
        "deadlineAt": "2026-05-16T21:00:00.000Z",
        "color": "#0891b2"
      },
      "milestone": {
        "id": "milestone-escalation-response",
        "name": "Escalation response",
        "deadline": "2026-05-12T21:00:00.000Z"
      }
    },
    {
      "id": "task-doc-update",
      "title": "Update billing FAQ docs",
      "notes": "Already scheduled later today.",
      "priority": "medium",
      "estimatedMinutes": 45,
      "dueAt": "2026-05-13T21:00:00.000Z",
      "preferredTimeBand": "afternoon",
      "preferredWindowStart": null,
      "preferredWindowEnd": null,
      "status": "todo",
      "availability": "ready",
      "areaId": "area-support",
      "projectId": "project-docs-refresh",
      "milestoneId": null,
      "project": {
        "id": "project-docs-refresh",
        "name": "Docs Refresh",
        "deadlineAt": "2026-05-20T21:00:00.000Z",
        "color": "#16a34a"
      }
    },
    {
      "id": "task-retro-notes",
      "title": "Clean up retro notes",
      "notes": "Low urgency notes cleanup from last sprint.",
      "priority": "low",
      "estimatedMinutes": 35,
      "dueAt": null,
      "preferredTimeBand": "evening",
      "preferredWindowStart": null,
      "preferredWindowEnd": null,
      "status": "todo",
      "availability": "ready",
      "areaId": "area-ops",
      "projectId": null,
      "milestoneId": null
    },
    {
      "id": "task-renewal-call-prep",
      "title": "Prepare renewal call outline",
      "notes": "Marked later, not ready for today's plan.",
      "priority": "medium",
      "estimatedMinutes": 60,
      "dueAt": "2026-05-15T21:00:00.000Z",
      "preferredTimeBand": "afternoon",
      "preferredWindowStart": null,
      "preferredWindowEnd": null,
      "status": "todo",
      "availability": "later",
      "areaId": "area-growth",
      "projectId": "project-renewals",
      "milestoneId": null,
      "project": {
        "id": "project-renewals",
        "name": "Renewals",
        "deadlineAt": "2026-05-22T21:00:00.000Z",
        "color": "#7c3aed"
      }
    },
    {
      "id": "task-done-slack-summary",
      "title": "Post Slack summary",
      "notes": "Already completed.",
      "priority": "medium",
      "estimatedMinutes": 20,
      "dueAt": "2026-05-12T19:00:00.000Z",
      "preferredTimeBand": "anytime",
      "preferredWindowStart": null,
      "preferredWindowEnd": null,
      "status": "done",
      "availability": "ready",
      "areaId": "area-ops",
      "projectId": null,
      "milestoneId": null
    }
  ],
  "projects": [
    {
      "id": "project-billing-trust",
      "userId": "user-demo",
      "areaId": "area-finance",
      "name": "Billing Trust",
      "color": "#dc2626",
      "status": "active",
      "deadlineAt": "2026-05-14T22:00:00.000Z",
      "createdAt": "2026-05-01T12:00:00.000Z",
      "updatedAt": "2026-05-12T13:00:00.000Z"
    },
    {
      "id": "project-customer-trust",
      "userId": "user-demo",
      "areaId": "area-support",
      "name": "Customer Trust",
      "color": "#0891b2",
      "status": "active",
      "deadlineAt": "2026-05-16T21:00:00.000Z",
      "createdAt": "2026-05-01T12:00:00.000Z",
      "updatedAt": "2026-05-12T13:00:00.000Z"
    },
    {
      "id": "project-docs-refresh",
      "userId": "user-demo",
      "areaId": "area-support",
      "name": "Docs Refresh",
      "color": "#16a34a",
      "status": "active",
      "deadlineAt": "2026-05-20T21:00:00.000Z",
      "createdAt": "2026-05-01T12:00:00.000Z",
      "updatedAt": "2026-05-12T13:00:00.000Z"
    },
    {
      "id": "project-renewals",
      "userId": "user-demo",
      "areaId": "area-growth",
      "name": "Renewals",
      "color": "#7c3aed",
      "status": "active",
      "deadlineAt": "2026-05-22T21:00:00.000Z",
      "createdAt": "2026-05-01T12:00:00.000Z",
      "updatedAt": "2026-05-12T13:00:00.000Z"
    }
  ],
  "milestones": [
    {
      "id": "milestone-billing-close",
      "userId": "user-demo",
      "projectId": "project-billing-trust",
      "name": "Billing close verified",
      "description": "Billing anomalies reviewed before finance close.",
      "startDate": "2026-05-10",
      "deadline": "2026-05-12T22:00:00.000Z",
      "createdAt": "2026-05-10T12:00:00.000Z",
      "updatedAt": "2026-05-12T13:00:00.000Z"
    },
    {
      "id": "milestone-escalation-response",
      "userId": "user-demo",
      "projectId": "project-customer-trust",
      "name": "Escalation response",
      "description": "Customer receives a clear update before end of day.",
      "startDate": "2026-05-12",
      "deadline": "2026-05-12T21:00:00.000Z",
      "createdAt": "2026-05-12T12:00:00.000Z",
      "updatedAt": "2026-05-12T13:00:00.000Z"
    }
  ],
  "projectPlans": [
    {
      "project": {
        "id": "project-billing-trust",
        "name": "Billing Trust",
        "deadlineAt": "2026-05-14T22:00:00.000Z"
      },
      "completionPercentage": 61,
      "remainingMinutes": 260,
      "remainingTaskCount": 4
    },
    {
      "project": {
        "id": "project-customer-trust",
        "name": "Customer Trust",
        "deadlineAt": "2026-05-16T21:00:00.000Z"
      },
      "completionPercentage": 48,
      "remainingMinutes": 300,
      "remainingTaskCount": 6
    },
    {
      "project": {
        "id": "project-docs-refresh",
        "name": "Docs Refresh",
        "deadlineAt": "2026-05-20T21:00:00.000Z"
      },
      "completionPercentage": 20,
      "remainingMinutes": 420,
      "remainingTaskCount": 7
    }
  ],
  "scheduledItems": [
    {
      "id": "event-medical-spillover",
      "source": "event",
      "title": "Medical appointment and commute",
      "start": "2026-05-12T12:30:00.000Z",
      "end": "2026-05-12T15:00:00.000Z"
    },
    {
      "id": "event-therapy",
      "source": "event",
      "title": "Therapy",
      "start": "2026-05-12T17:00:00.000Z",
      "end": "2026-05-12T17:45:00.000Z"
    },
    {
      "id": "task-block-doc-update",
      "source": "task",
      "taskId": "task-doc-update",
      "title": "Update billing FAQ docs",
      "start": "2026-05-12T19:00:00.000Z",
      "end": "2026-05-12T19:45:00.000Z"
    }
  ],
  "capacity": [
    {
      "date": "2026-05-12",
      "availableMinutes": 195,
      "scheduledMinutes": 240,
      "overloaded": false
    }
  ],
  "settings": {
    "userId": "user-demo",
    "timezone": "America/New_York",
    "weekStart": 1,
    "slotMinutes": 30,
    "workHours": {
      "0": null,
      "1": {
        "start": "10:00",
        "end": "16:00"
      },
      "2": {
        "start": "10:00",
        "end": "16:00"
      },
      "3": {
        "start": "10:00",
        "end": "16:00"
      },
      "4": {
        "start": "10:00",
        "end": "16:00"
      },
      "5": {
        "start": "10:00",
        "end": "15:00"
      },
      "6": null
    },
    "createdAt": "2026-05-01T12:00:00.000Z",
    "updatedAt": "2026-05-12T13:00:00.000Z"
  },
  "customInstructions": null,
  "dependencies": [
    {
      "taskId": "task-support-escalation",
      "dependsOnTaskId": "task-billing-audit",
      "type": "related"
    }
  ]
}
```

## Sample 6: Dependency Chain With Future Scheduled Prerequisite

This sample tests a subtle dependency case. The API contract review task already has a
future scheduled block from `14:00-15:00`, so the model should not emit that task as a new
block. A dependent task may only be scheduled after the prerequisite's existing block ends.
The model should also avoid fixed meetings, preserve realistic capacity, and decide whether
the dependent migration work belongs today or tomorrow.

```json
{
  "planningMode": "standard",
  "date": "2026-05-13",
  "timezone": "America/Los_Angeles",
  "currentTime": "2026-05-13T18:05:00.000Z",
  "tasks": [
    {
      "id": "task-checkout-rollback",
      "title": "Lock checkout rollback plan",
      "notes": "Document exact rollback steps and owner handoffs before the production window.",
      "priority": "critical",
      "estimatedMinutes": 70,
      "dueAt": "2026-05-14T00:00:00.000Z",
      "preferredTimeBand": "afternoon",
      "preferredWindowStart": null,
      "preferredWindowEnd": null,
      "status": "todo",
      "availability": "ready",
      "areaId": "area-engineering",
      "projectId": "project-payments-stability",
      "milestoneId": "milestone-checkout-freeze",
      "project": {
        "id": "project-payments-stability",
        "name": "Payments Stability",
        "deadlineAt": "2026-05-16T00:00:00.000Z",
        "color": "#dc2626"
      },
      "milestone": {
        "id": "milestone-checkout-freeze",
        "name": "Checkout freeze ready",
        "deadline": "2026-05-14T00:00:00.000Z"
      }
    },
    {
      "id": "task-invoice-replay",
      "title": "Fix failed invoice webhook replay",
      "notes": "Patch retry handling for invoices stuck after the provider outage.",
      "priority": "critical",
      "estimatedMinutes": 60,
      "dueAt": "2026-05-13T23:30:00.000Z",
      "preferredTimeBand": "anytime",
      "preferredWindowStart": null,
      "preferredWindowEnd": null,
      "status": "in_progress",
      "availability": "ready",
      "areaId": "area-engineering",
      "projectId": "project-payments-stability",
      "milestoneId": "milestone-checkout-freeze",
      "project": {
        "id": "project-payments-stability",
        "name": "Payments Stability",
        "deadlineAt": "2026-05-16T00:00:00.000Z",
        "color": "#dc2626"
      },
      "milestone": {
        "id": "milestone-checkout-freeze",
        "name": "Checkout freeze ready",
        "deadline": "2026-05-14T00:00:00.000Z"
      }
    },
    {
      "id": "task-api-contract-review",
      "title": "Review API contract changes",
      "notes": "Already scheduled later today with platform lead.",
      "priority": "high",
      "estimatedMinutes": 60,
      "dueAt": "2026-05-14T01:00:00.000Z",
      "preferredTimeBand": "afternoon",
      "preferredWindowStart": null,
      "preferredWindowEnd": null,
      "status": "todo",
      "availability": "ready",
      "areaId": "area-engineering",
      "projectId": "project-platform-api",
      "milestoneId": "milestone-api-contract",
      "project": {
        "id": "project-platform-api",
        "name": "Platform API",
        "deadlineAt": "2026-05-20T00:00:00.000Z",
        "color": "#2563eb"
      },
      "milestone": {
        "id": "milestone-api-contract",
        "name": "Contract approved",
        "deadline": "2026-05-14T01:00:00.000Z"
      }
    },
    {
      "id": "task-webhook-migration",
      "title": "Draft webhook retry migration",
      "notes": "Depends on contract review. Can start only after the API contract review is complete.",
      "priority": "high",
      "estimatedMinutes": 80,
      "dueAt": "2026-05-14T23:00:00.000Z",
      "preferredTimeBand": "afternoon",
      "preferredWindowStart": null,
      "preferredWindowEnd": null,
      "status": "todo",
      "availability": "ready",
      "areaId": "area-engineering",
      "projectId": "project-platform-api",
      "milestoneId": "milestone-api-contract",
      "project": {
        "id": "project-platform-api",
        "name": "Platform API",
        "deadlineAt": "2026-05-20T00:00:00.000Z",
        "color": "#2563eb"
      },
      "milestone": {
        "id": "milestone-api-contract",
        "name": "Contract approved",
        "deadline": "2026-05-14T01:00:00.000Z"
      }
    },
    {
      "id": "task-sales-deck",
      "title": "Prepare sales deck payment slide",
      "notes": "Update the slide with the latest payment reliability message.",
      "priority": "medium",
      "estimatedMinutes": 55,
      "dueAt": "2026-05-14T19:00:00.000Z",
      "preferredTimeBand": "morning",
      "preferredWindowStart": null,
      "preferredWindowEnd": null,
      "status": "todo",
      "availability": "ready",
      "areaId": "area-growth",
      "projectId": "project-sales-enable",
      "milestoneId": null,
      "project": {
        "id": "project-sales-enable",
        "name": "Sales Enablement",
        "deadlineAt": "2026-05-18T19:00:00.000Z",
        "color": "#16a34a"
      }
    },
    {
      "id": "task-settings-refactor",
      "title": "Refactor settings panel layout",
      "notes": "Low urgency UI cleanup.",
      "priority": "low",
      "estimatedMinutes": 90,
      "dueAt": null,
      "preferredTimeBand": "evening",
      "preferredWindowStart": null,
      "preferredWindowEnd": null,
      "status": "todo",
      "availability": "later",
      "areaId": "area-product",
      "projectId": "project-ui-polish",
      "milestoneId": null,
      "project": {
        "id": "project-ui-polish",
        "name": "UI Polish",
        "deadlineAt": null,
        "color": "#64748b"
      }
    }
  ],
  "projects": [
    {
      "id": "project-payments-stability",
      "userId": "user-demo",
      "areaId": "area-engineering",
      "name": "Payments Stability",
      "color": "#dc2626",
      "status": "active",
      "deadlineAt": "2026-05-16T00:00:00.000Z",
      "createdAt": "2026-05-01T12:00:00.000Z",
      "updatedAt": "2026-05-13T17:00:00.000Z"
    },
    {
      "id": "project-platform-api",
      "userId": "user-demo",
      "areaId": "area-engineering",
      "name": "Platform API",
      "color": "#2563eb",
      "status": "active",
      "deadlineAt": "2026-05-20T00:00:00.000Z",
      "createdAt": "2026-05-01T12:00:00.000Z",
      "updatedAt": "2026-05-13T17:00:00.000Z"
    },
    {
      "id": "project-sales-enable",
      "userId": "user-demo",
      "areaId": "area-growth",
      "name": "Sales Enablement",
      "color": "#16a34a",
      "status": "active",
      "deadlineAt": "2026-05-18T19:00:00.000Z",
      "createdAt": "2026-05-01T12:00:00.000Z",
      "updatedAt": "2026-05-13T17:00:00.000Z"
    },
    {
      "id": "project-ui-polish",
      "userId": "user-demo",
      "areaId": "area-product",
      "name": "UI Polish",
      "color": "#64748b",
      "status": "active",
      "deadlineAt": null,
      "createdAt": "2026-05-01T12:00:00.000Z",
      "updatedAt": "2026-05-13T17:00:00.000Z"
    }
  ],
  "milestones": [
    {
      "id": "milestone-checkout-freeze",
      "userId": "user-demo",
      "projectId": "project-payments-stability",
      "name": "Checkout freeze ready",
      "description": "Payment fixes and rollback plan ready before freeze.",
      "startDate": "2026-05-12",
      "deadline": "2026-05-14T00:00:00.000Z",
      "createdAt": "2026-05-12T12:00:00.000Z",
      "updatedAt": "2026-05-13T17:00:00.000Z"
    },
    {
      "id": "milestone-api-contract",
      "userId": "user-demo",
      "projectId": "project-platform-api",
      "name": "Contract approved",
      "description": "API contract reviewed before migration implementation.",
      "startDate": "2026-05-13",
      "deadline": "2026-05-14T01:00:00.000Z",
      "createdAt": "2026-05-13T12:00:00.000Z",
      "updatedAt": "2026-05-13T17:00:00.000Z"
    }
  ],
  "projectPlans": [
    {
      "project": {
        "id": "project-payments-stability",
        "name": "Payments Stability",
        "deadlineAt": "2026-05-16T00:00:00.000Z"
      },
      "completionPercentage": 52,
      "remainingMinutes": 500,
      "remainingTaskCount": 6
    },
    {
      "project": {
        "id": "project-platform-api",
        "name": "Platform API",
        "deadlineAt": "2026-05-20T00:00:00.000Z"
      },
      "completionPercentage": 33,
      "remainingMinutes": 620,
      "remainingTaskCount": 8
    },
    {
      "project": {
        "id": "project-sales-enable",
        "name": "Sales Enablement",
        "deadlineAt": "2026-05-18T19:00:00.000Z"
      },
      "completionPercentage": 70,
      "remainingMinutes": 160,
      "remainingTaskCount": 3
    }
  ],
  "scheduledItems": [
    {
      "id": "event-design-critique",
      "source": "event",
      "title": "Design critique",
      "start": "2026-05-13T19:00:00.000Z",
      "end": "2026-05-13T20:00:00.000Z"
    },
    {
      "id": "task-block-api-contract-review",
      "source": "task",
      "taskId": "task-api-contract-review",
      "title": "Review API contract changes",
      "start": "2026-05-13T21:00:00.000Z",
      "end": "2026-05-13T22:00:00.000Z"
    },
    {
      "id": "event-exec-review",
      "source": "event",
      "title": "Exec review",
      "start": "2026-05-13T22:30:00.000Z",
      "end": "2026-05-13T23:00:00.000Z"
    }
  ],
  "capacity": [
    {
      "date": "2026-05-13",
      "availableMinutes": 200,
      "scheduledMinutes": 150,
      "overloaded": false
    }
  ],
  "settings": {
    "userId": "user-demo",
    "timezone": "America/Los_Angeles",
    "weekStart": 1,
    "slotMinutes": 30,
    "workHours": {
      "0": null,
      "1": {
        "start": "08:30",
        "end": "17:00"
      },
      "2": {
        "start": "08:30",
        "end": "17:00"
      },
      "3": {
        "start": "08:30",
        "end": "17:00"
      },
      "4": {
        "start": "08:30",
        "end": "17:00"
      },
      "5": {
        "start": "08:30",
        "end": "15:00"
      },
      "6": null
    },
    "createdAt": "2026-05-01T12:00:00.000Z",
    "updatedAt": "2026-05-13T17:00:00.000Z"
  },
  "customInstructions": null,
  "dependencies": [
    {
      "taskId": "task-webhook-migration",
      "dependsOnTaskId": "task-api-contract-review",
      "type": "blocks"
    },
    {
      "taskId": "task-sales-deck",
      "dependsOnTaskId": "task-checkout-rollback",
      "type": "related"
    }
  ]
}
```

## Validation Checklist

Use these checks to score model output:

1. JSON parses without repair.
2. Top-level keys match the required response shape.
3. `planning_mode` matches input `planningMode`.
4. `date` matches input `date`.
5. Every focus block uses a known task ID or `null` only for non-focus blocks.
6. No schedule block starts before `currentTime` on the selected date.
7. No block falls outside configured work hours.
8. No block overlaps a fixed event.
9. No fixed event appears as a `schedule` block.
10. No future scheduled task block appears as a `schedule` block.
11. No task with a future scheduled task block gets an extra focus block today.
12. Buffers are not used as placeholders for existing meetings or scheduled work.
13. Missed earlier unfinished task blocks may be rescheduled after `currentTime`.
14. `blocks` dependencies are respected.
15. Lower-value tasks are postponed when capacity is tight.
16. Overloaded samples produce warnings with useful severity.
17. Custom instructions influence the plan in Sample 3.
18. Explanations are concise and do not invent facts.

Suggested scoring:

- `0`: invalid JSON or unusable output
- `1`: valid JSON but major scheduling violations
- `2`: mostly valid but weak prioritization or minor rule misses
- `3`: valid, useful, and respects all hard constraints
