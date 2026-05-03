# Inflara

Inflara is a desktop-first personal planning app built with Next.js App Router. It combines unscheduled tasks, hour-by-hour calendar scheduling, fixed events, and workload review in one visual planner.

## What is implemented

- Task inbox with saved filters, search, and drag-to-schedule behavior
- Day, week, and agenda planner views powered by FullCalendar
- Shared task and event calendar surface with move and resize support
- Task detail drawer with notes, checklist, priority, estimates, due dates, preferred times, and recurrence
- Planning settings for timezone, week start, slot size, and weekday work hours
- CRUD API routes for tasks, task blocks, events, areas, projects, tags, and settings
- Clerk-ready auth shell with a landing page, plus demo mode when auth is not configured
- Neon + Drizzle schema/client for hosted persistence, with a local JSON demo store fallback for development

## Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Clerk
- Neon Postgres
- Drizzle ORM
- FullCalendar

## Local development

1. Install dependencies:

```bash
pnpm install
```

2. Copy the environment template:

```bash
cp .env.example .env.local
```

3. Start the app:

```bash
pnpm dev
```

If you do not configure Clerk or Neon, the app still runs in demo mode using a generated local JSON store under `data/`.

## Environment variables

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `DATABASE_URL`
- `PLANNER_DEMO_STORE_PATH` optional, defaults to `planner-demo-store.json`

## Database

Generate SQL artifacts:

```bash
pnpm db:generate
```

Push the schema directly to a configured database:

```bash
pnpm db:push
```

The schema lives in `src/db/schema.ts`.

## Planner behavior

- Creating a task with start and end times automatically creates a task block.
- Unscheduled tasks stay in the inbox until they are dragged into the calendar or scheduled in the drawer.
- Moving or resizing a task block updates the underlying task timing.
- Fixed meetings and appointments share the same planner grid as task blocks.
- Capacity cards compare scheduled load against per-weekday work hours.

## Future feature projects

### Stylus and handwriting support for Notes

Add an embedded ink canvas block to project notes so users can write or sketch with a stylus, pen, touch, or mouse. The first practical version should work as a custom rich-text editor node instead of turning the whole Notes page into a drawing surface.

Recommended first scope:

- Add a Tiptap `inkCanvas` node that can be inserted between normal note content.
- Capture pointer input for mouse, touch, and stylus through Pointer Events.
- Store strokes as structured JSON, with optional PNG preview data for fast rendering.
- Support pen color, stroke width, eraser, undo, and clear canvas.
- Keep drawing gestures from fighting page scroll on mobile and tablet.

Later OneNote-style extensions:

- Pressure-sensitive stroke smoothing.
- Lasso select, move, resize, and delete.
- Image and PDF annotation.
- Stroke-level erase.
- Better Apple Pencil and Safari/iPad behavior.
- Export and print fidelity for mixed text, images, and ink.

## Deployment

The app is set up for Vercel deployment. Configure Clerk and Neon environment variables in the target environment before deploying.
