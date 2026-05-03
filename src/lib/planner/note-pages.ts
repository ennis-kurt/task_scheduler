import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { and, eq, asc } from "drizzle-orm";

import { getDb } from "@/db";
import { projectNotePages, projects } from "@/db/schema";
import { isDatabaseConfigured } from "@/lib/env";
import { readDemoSnapshot } from "@/lib/planner/demo-store";
import type {
  MilestoneRecord,
  NewProjectNotePageInput,
  ProjectNoteCommentRecord,
  ProjectNoteKind,
  ProjectNoteLinkedEntityType,
  ProjectNotePageRecord,
  ProjectNoteStatus,
  TaskRecord,
  UpdateProjectNotePageInput,
} from "@/lib/planner/types";

type DemoNotesStore = Record<string, Record<string, ProjectNotePageRecord[]>>;

const volatileDemoNotes = new Map<string, DemoNotesStore>();

function now() {
  return new Date().toISOString();
}

function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

function noteStorePath() {
  return path.join(process.cwd(), "data", ".planner-demo-note-pages.json");
}

function shouldUseVolatileStore(error?: unknown) {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;

  return (
    process.env.VERCEL === "1" ||
    code === "EROFS" ||
    code === "EACCES" ||
    code === "EPERM"
  );
}

function normalizeStatus(value: unknown): ProjectNoteStatus {
  return value === "Shared" || value === "Final" ? value : "Draft";
}

function normalizeKind(value: unknown): ProjectNoteKind {
  return value === "section" ? "section" : "note";
}

function normalizeLinkedEntityType(value: unknown): ProjectNoteLinkedEntityType {
  return value === "project" || value === "milestone" || value === "task"
    ? value
    : "manual";
}

function nullableString(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function normalizeComments(value: unknown): ProjectNoteCommentRecord[] {
  return Array.isArray(value)
    ? value.filter(
        (comment): comment is ProjectNoteCommentRecord =>
          Boolean(comment) &&
          typeof comment === "object" &&
          typeof (comment as ProjectNoteCommentRecord).id === "string" &&
          typeof (comment as ProjectNoteCommentRecord).author === "string" &&
          typeof (comment as ProjectNoteCommentRecord).initials === "string" &&
          typeof (comment as ProjectNoteCommentRecord).body === "string" &&
          typeof (comment as ProjectNoteCommentRecord).createdAt === "string",
      )
    : [];
}

function defaultContent(title: string) {
  return {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: title }],
      },
      {
        type: "paragraph",
      },
    ],
  };
}

function emptySectionContent(title: string) {
  return {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: title }],
      },
    ],
  };
}

function plainTextContent(markdown: string) {
  return markdown.trim() ? markdown.trim() : "";
}

function mapNotePage(
  record: typeof projectNotePages.$inferSelect,
): ProjectNotePageRecord {
  return {
    id: record.id,
    userId: record.userId,
    projectId: record.projectId,
    kind: normalizeKind(record.kind),
    sectionId: record.sectionId,
    parentSectionId: record.parentSectionId,
    linkedEntityType: normalizeLinkedEntityType(record.linkedEntityType),
    linkedEntityId: record.linkedEntityId,
    systemKey: record.systemKey,
    title: record.title,
    status: normalizeStatus(record.status),
    content: record.content,
    markdown: record.markdown,
    comments: normalizeComments(record.comments),
    sortOrder: record.sortOrder,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

async function ensureDbProject(userId: string, projectId: string) {
  const db = getDb();
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);

  if (!project) {
    throw new Error("NOT_FOUND");
  }
}

async function readDemoNotesStore(userId: string): Promise<DemoNotesStore> {
  const target = noteStorePath();

  try {
    const raw = await readFile(target, "utf8");
    return JSON.parse(raw) as DemoNotesStore;
  } catch (error) {
    if (shouldUseVolatileStore(error)) {
      return volatileDemoNotes.get(userId) ?? {};
    }

    return {};
  }
}

async function writeDemoNotesStore(userId: string, store: DemoNotesStore) {
  volatileDemoNotes.set(userId, store);
  const target = noteStorePath();

  try {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, JSON.stringify(store, null, 2));
  } catch (error) {
    if (shouldUseVolatileStore(error)) {
      return;
    }

    throw error;
  }
}

async function ensureDemoProject(userId: string, projectId: string) {
  const snapshot = await readDemoSnapshot(userId);
  const project = snapshot.projects.find(
    (candidate) => candidate.id === projectId && candidate.userId === userId,
  );

  if (!project) {
    throw new Error("NOT_FOUND");
  }
}

async function withDemoProjectPages<T>(
  userId: string,
  projectId: string,
  mutator: (pages: ProjectNotePageRecord[], store: DemoNotesStore) => T | Promise<T>,
) {
  await ensureDemoProject(userId, projectId);
  const store = await readDemoNotesStore(userId);
  store[userId] ??= {};
  store[userId][projectId] ??= [];

  const result = await mutator(store[userId][projectId], store);
  await writeDemoNotesStore(userId, store);
  return result;
}

function normalizeStoredPage(
  value: ProjectNotePageRecord,
  userId: string,
  projectId: string,
  index: number,
): ProjectNotePageRecord {
  const raw = value as ProjectNotePageRecord & Record<string, unknown>;
  const title = typeof raw.title === "string" && raw.title.trim() ? raw.title : "Untitled page";
  const kind = normalizeKind(raw.kind);

  return {
    ...value,
    id: typeof raw.id === "string" && raw.id ? raw.id : id(kind === "section" ? "section" : "note"),
    userId,
    projectId,
    kind,
    sectionId: nullableString(raw.sectionId),
    parentSectionId: nullableString(raw.parentSectionId),
    linkedEntityType: normalizeLinkedEntityType(raw.linkedEntityType),
    linkedEntityId: nullableString(raw.linkedEntityId),
    systemKey: nullableString(raw.systemKey),
    title,
    status: normalizeStatus(raw.status),
    content:
      raw.content === undefined || raw.content === null
        ? kind === "section"
          ? emptySectionContent(title)
          : defaultContent(title)
        : raw.content,
    markdown: typeof raw.markdown === "string" ? raw.markdown : "",
    comments: normalizeComments(raw.comments),
    sortOrder: typeof raw.sortOrder === "number" ? raw.sortOrder : index,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : now(),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : now(),
  };
}

function normalizeStoredPages(
  pages: ProjectNotePageRecord[],
  userId: string,
  projectId: string,
) {
  const normalized = pages
    .map((page, index) => normalizeStoredPage(page, userId, projectId, index))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  pages.splice(0, pages.length, ...normalized);
  return pages;
}

function resequencePages(pages: ProjectNotePageRecord[]) {
  pages.sort((a, b) => a.sortOrder - b.sortOrder);
  pages.forEach((page, index) => {
    page.sortOrder = index;
  });
}

function createStoredPage(
  userId: string,
  projectId: string,
  input: NewProjectNotePageInput,
  sortOrder: number,
): ProjectNotePageRecord {
  const timestamp = now();
  const kind = normalizeKind(input.kind);
  const title = input.title?.trim() || (kind === "section" ? "Untitled section" : "Untitled page");
  const markdown = kind === "section" ? "" : input.markdown ?? "";

  return {
    id: id(kind === "section" ? "section" : "note"),
    userId,
    projectId,
    kind,
    sectionId: kind === "note" ? input.sectionId ?? null : null,
    parentSectionId: kind === "section" ? input.parentSectionId ?? null : null,
    linkedEntityType: input.linkedEntityType ?? "manual",
    linkedEntityId: input.linkedEntityId ?? null,
    systemKey: input.systemKey ?? null,
    title,
    status: normalizeStatus(input.status),
    content:
      input.content ??
      (kind === "section" ? emptySectionContent(title) : defaultContent(title)),
    markdown,
    comments: input.comments ?? [],
    sortOrder: input.sortOrder ?? sortOrder,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

const demoNotePagesRepository = {
  async list(userId: string, projectId: string) {
    return withDemoProjectPages(userId, projectId, (pages) => {
      normalizeStoredPages(pages, userId, projectId);
      return [...pages].sort((a, b) => a.sortOrder - b.sortOrder);
    });
  },

  async create(userId: string, projectId: string, input: NewProjectNotePageInput) {
    return withDemoProjectPages(userId, projectId, (pages) => {
      normalizeStoredPages(pages, userId, projectId);
      const page = createStoredPage(userId, projectId, input, pages.length);

      pages.push(page);
      resequencePages(pages);
      return page;
    });
  },

  async update(
    userId: string,
    projectId: string,
    notePageId: string,
    input: UpdateProjectNotePageInput,
  ) {
    return withDemoProjectPages(userId, projectId, (pages) => {
      normalizeStoredPages(pages, userId, projectId);
      const page = pages.find((candidate) => candidate.id === notePageId);

      if (!page) {
        throw new Error("NOT_FOUND");
      }

      const nextKind = input.kind ? normalizeKind(input.kind) : page.kind;
      page.kind = nextKind;
      page.sectionId =
        input.sectionId === undefined
          ? page.sectionId
          : nextKind === "note"
            ? input.sectionId
            : null;
      page.parentSectionId =
        input.parentSectionId === undefined
          ? page.parentSectionId
          : nextKind === "section"
            ? input.parentSectionId
            : null;
      page.linkedEntityType = input.linkedEntityType
        ? normalizeLinkedEntityType(input.linkedEntityType)
        : page.linkedEntityType;
      page.linkedEntityId =
        input.linkedEntityId === undefined ? page.linkedEntityId : input.linkedEntityId;
      page.systemKey = input.systemKey === undefined ? page.systemKey : input.systemKey;
      page.title = input.title ?? page.title;
      page.status = input.status ? normalizeStatus(input.status) : page.status;
      page.content = input.content ?? page.content;
      page.markdown = input.markdown ?? page.markdown;
      page.comments = input.comments ?? page.comments;
      page.sortOrder = input.sortOrder ?? page.sortOrder;
      page.updatedAt = now();

      resequencePages(pages);
      return page;
    });
  },

  async delete(userId: string, projectId: string, notePageId: string) {
    return withDemoProjectPages(userId, projectId, (pages, store) => {
      normalizeStoredPages(pages, userId, projectId);
      const noteCount = pages.filter((page) => page.kind === "note").length;
      const targetPage = pages.find((page) => page.id === notePageId);

      if (targetPage?.kind === "note" && noteCount <= 1) {
        return { ok: false, reason: "LAST_PAGE" as const };
      }

      const index = pages.findIndex((candidate) => candidate.id === notePageId);
      if (index < 0) {
        throw new Error("NOT_FOUND");
      }

      pages.splice(index, 1);
      for (const page of pages) {
        if (page.sectionId === notePageId) {
          page.sectionId = null;
        }

        if (page.parentSectionId === notePageId) {
          page.parentSectionId = null;
        }
      }
      resequencePages(pages);
      store[userId][projectId] = pages;
      return { ok: true };
    });
  },
};

const databaseNotePagesRepository = {
  async list(userId: string, projectId: string) {
    await ensureDbProject(userId, projectId);
    const db = getDb();
    const rows = await db
      .select()
      .from(projectNotePages)
      .where(
        and(
          eq(projectNotePages.userId, userId),
          eq(projectNotePages.projectId, projectId),
        ),
      )
      .orderBy(asc(projectNotePages.sortOrder), asc(projectNotePages.createdAt));

    return rows.map(mapNotePage);
  },

  async create(userId: string, projectId: string, input: NewProjectNotePageInput) {
    await ensureDbProject(userId, projectId);
    const db = getDb();
    const kind = normalizeKind(input.kind);
    const title = input.title?.trim() || (kind === "section" ? "Untitled section" : "Untitled page");
    const pageId = id(kind === "section" ? "section" : "note");
    const currentPages = await this.list(userId, projectId);

    await db.insert(projectNotePages).values({
      id: pageId,
      userId,
      projectId,
      kind,
      sectionId: kind === "note" ? input.sectionId ?? null : null,
      parentSectionId: kind === "section" ? input.parentSectionId ?? null : null,
      linkedEntityType: input.linkedEntityType ?? "manual",
      linkedEntityId: input.linkedEntityId ?? null,
      systemKey: input.systemKey ?? null,
      title,
      status: normalizeStatus(input.status),
      content:
        input.content ??
        (kind === "section" ? emptySectionContent(title) : defaultContent(title)),
      markdown: kind === "section" ? "" : input.markdown ?? "",
      comments: input.comments ?? [],
      sortOrder: input.sortOrder ?? currentPages.length,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const [record] = await db
      .select()
      .from(projectNotePages)
      .where(eq(projectNotePages.id, pageId))
      .limit(1);

    return mapNotePage(record);
  },

  async update(
    userId: string,
    projectId: string,
    notePageId: string,
    input: UpdateProjectNotePageInput,
  ) {
    await ensureDbProject(userId, projectId);
    const db = getDb();
    const updateValues: Partial<typeof projectNotePages.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (input.title !== undefined) {
      updateValues.title = input.title;
    }

    if (input.kind !== undefined) {
      updateValues.kind = normalizeKind(input.kind);
    }

    if (input.sectionId !== undefined) {
      updateValues.sectionId = input.sectionId;
    }

    if (input.parentSectionId !== undefined) {
      updateValues.parentSectionId = input.parentSectionId;
    }

    if (input.linkedEntityType !== undefined) {
      updateValues.linkedEntityType = normalizeLinkedEntityType(input.linkedEntityType);
    }

    if (input.linkedEntityId !== undefined) {
      updateValues.linkedEntityId = input.linkedEntityId;
    }

    if (input.systemKey !== undefined) {
      updateValues.systemKey = input.systemKey;
    }

    if (input.status !== undefined) {
      updateValues.status = input.status;
    }

    if (input.content !== undefined) {
      updateValues.content = input.content;
    }

    if (input.markdown !== undefined) {
      updateValues.markdown = input.markdown;
    }

    if (input.comments !== undefined) {
      updateValues.comments = input.comments;
    }

    if (input.sortOrder !== undefined) {
      updateValues.sortOrder = input.sortOrder;
    }

    await db
      .update(projectNotePages)
      .set(updateValues)
      .where(
        and(
          eq(projectNotePages.id, notePageId),
          eq(projectNotePages.userId, userId),
          eq(projectNotePages.projectId, projectId),
        ),
      );

    const [record] = await db
      .select()
      .from(projectNotePages)
      .where(
        and(
          eq(projectNotePages.id, notePageId),
          eq(projectNotePages.userId, userId),
          eq(projectNotePages.projectId, projectId),
        ),
      )
      .limit(1);

    if (!record) {
      throw new Error("NOT_FOUND");
    }

    return mapNotePage(record);
  },

  async delete(userId: string, projectId: string, notePageId: string) {
    await ensureDbProject(userId, projectId);
    const currentPages = await this.list(userId, projectId);
    const targetPage = currentPages.find((page) => page.id === notePageId);

    if (targetPage?.kind === "note" && currentPages.filter((page) => page.kind === "note").length <= 1) {
      return { ok: false, reason: "LAST_PAGE" as const };
    }

    const db = getDb();
    await db
      .delete(projectNotePages)
      .where(
        and(
          eq(projectNotePages.id, notePageId),
          eq(projectNotePages.userId, userId),
          eq(projectNotePages.projectId, projectId),
        ),
      );
    await db
      .update(projectNotePages)
      .set({
        sectionId: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(projectNotePages.userId, userId),
          eq(projectNotePages.projectId, projectId),
          eq(projectNotePages.sectionId, notePageId),
        ),
      );
    await db
      .update(projectNotePages)
      .set({
        parentSectionId: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(projectNotePages.userId, userId),
          eq(projectNotePages.projectId, projectId),
          eq(projectNotePages.parentSectionId, notePageId),
        ),
      );

    return { ok: true };
  },
};

type NotePagesRepositoryCore = typeof demoNotePagesRepository;

const PROJECT_DESCRIPTION_KEY = "project:description";
const PROJECT_MILESTONES_KEY = "project:milestones";
const PROJECT_GENERAL_NOTES_KEY = "project:general-notes";
const LEGACY_TASK_NOTE_KEY_PATTERN = /^task:[^:]+:note$/;
const EXPLICIT_TASK_NOTE_KEY_SUFFIX = "project-note";

function milestoneKey(milestoneId: string, role: string) {
  return `milestone:${milestoneId}:${role}`;
}

function legacyTaskKey(taskId: string) {
  return `task:${taskId}:note`;
}

function explicitTaskKey(taskId: string) {
  return `task:${taskId}:${EXPLICIT_TASK_NOTE_KEY_SUFFIX}`;
}

function parseMilestoneSystemKey(systemKey: string | null | undefined) {
  const match = systemKey?.match(/^milestone:([^:]+):([^:]+)$/);

  return match ? { milestoneId: match[1], role: match[2] } : null;
}

async function upsertSystemPage(
  repository: NotePagesRepositoryCore,
  userId: string,
  projectId: string,
  input: NewProjectNotePageInput & { systemKey: string },
  options: { updateExisting?: boolean } = {},
) {
  const pages = await repository.list(userId, projectId);
  const existing = pages.find((page) => page.systemKey === input.systemKey);

  if (existing) {
    if (options.updateExisting === false) {
      return existing;
    }

    return repository.update(userId, projectId, existing.id, input);
  }

  return repository.create(userId, projectId, input);
}

async function ensureProjectStructure(
  repository: NotePagesRepositoryCore,
  userId: string,
  projectId: string,
) {
  const description = await upsertSystemPage(
    repository,
    userId,
    projectId,
    {
      kind: "note",
      title: "Project Description",
      linkedEntityType: "project",
      linkedEntityId: projectId,
      systemKey: PROJECT_DESCRIPTION_KEY,
      markdown: "",
      content: "",
      sortOrder: 0,
    },
    { updateExisting: false },
  );
  const milestones = await upsertSystemPage(
    repository,
    userId,
    projectId,
    {
      kind: "section",
      title: "Milestones",
      linkedEntityType: "project",
      linkedEntityId: projectId,
      systemKey: PROJECT_MILESTONES_KEY,
      sortOrder: 1,
    },
    { updateExisting: false },
  );
  const generalNotes = await upsertSystemPage(
    repository,
    userId,
    projectId,
    {
      kind: "section",
      title: "General Notes",
      linkedEntityType: "project",
      linkedEntityId: projectId,
      systemKey: PROJECT_GENERAL_NOTES_KEY,
      sortOrder: 2,
    },
    { updateExisting: false },
  );

  return { description, milestones, generalNotes };
}

async function deleteSystemPageIfExists(
  repository: NotePagesRepositoryCore,
  userId: string,
  projectId: string,
  systemKey: string,
) {
  const pages = await repository.list(userId, projectId);
  const existing = pages.find((page) => page.systemKey === systemKey);

  if (!existing) {
    return null;
  }

  return repository.delete(userId, projectId, existing.id);
}

async function syncProjectDescription(
  repository: NotePagesRepositoryCore,
  userId: string,
  projectId: string,
  notes: string | undefined,
) {
  await ensureProjectStructure(repository, userId, projectId);
  const markdown = notes?.trim() ?? "";

  return upsertSystemPage(repository, userId, projectId, {
    kind: "note",
    title: "Project Description",
    linkedEntityType: "project",
    linkedEntityId: projectId,
    systemKey: PROJECT_DESCRIPTION_KEY,
    markdown,
    content: plainTextContent(markdown),
    sortOrder: 0,
  });
}

async function cleanupLegacyGeneratedNotes(
  repository: NotePagesRepositoryCore,
  userId: string,
  projectId: string,
  milestones: MilestoneRecord[],
) {
  const { milestones: milestonesSection } = await ensureProjectStructure(
    repository,
    userId,
    projectId,
  );
  const milestoneById = new Map(milestones.map((milestone) => [milestone.id, milestone]));
  const pages = await repository.list(userId, projectId);
  const legacyGeneratedSections = pages.filter((page) => {
    const parsed = parseMilestoneSystemKey(page.systemKey);

    return page.kind === "section" && parsed && (parsed.role === "section" || parsed.role === "tasks");
  });
  const legacySectionIds = new Set(legacyGeneratedSections.map((page) => page.id));

  for (const page of pages) {
    if (page.systemKey || !legacySectionIds.has(page.sectionId ?? "")) {
      continue;
    }

    await repository.update(userId, projectId, page.id, {
      sectionId: milestonesSection.id,
      parentSectionId: null,
    });
  }

  for (const page of pages) {
    if (page.systemKey || !legacySectionIds.has(page.parentSectionId ?? "")) {
      continue;
    }

    await repository.update(userId, projectId, page.id, {
      sectionId: null,
      parentSectionId: milestonesSection.id,
    });
  }

  for (const page of pages) {
    const parsed = parseMilestoneSystemKey(page.systemKey);

    if (!parsed || parsed.role !== "description") {
      continue;
    }

    const markdown = page.markdown.trim();
    const milestone = milestoneById.get(parsed.milestoneId);

    if (!markdown || !milestone) {
      continue;
    }

    await upsertSystemPage(repository, userId, projectId, {
      kind: "note",
      title: milestone.name,
      sectionId: milestonesSection.id,
      linkedEntityType: "milestone",
      linkedEntityId: milestone.id,
      systemKey: milestoneKey(milestone.id, "note"),
      markdown,
      content: plainTextContent(markdown),
    });
  }

  const latestPages = await repository.list(userId, projectId);
  const legacyPagesToDelete = latestPages.filter((page) => {
    const parsed = parseMilestoneSystemKey(page.systemKey);

    return (
      LEGACY_TASK_NOTE_KEY_PATTERN.test(page.systemKey ?? "") ||
      Boolean(parsed && ["details", "description", "section", "tasks"].includes(parsed.role))
    );
  });

  for (const page of legacyPagesToDelete.filter((page) => page.kind === "note")) {
    await repository.delete(userId, projectId, page.id);
  }

  for (const page of legacyPagesToDelete.filter((page) => page.kind === "section")) {
    await repository.delete(userId, projectId, page.id);
  }
}

async function syncMilestoneNotes(
  repository: NotePagesRepositoryCore,
  userId: string,
  milestone: MilestoneRecord,
  options: { updateExisting?: boolean } = {},
) {
  const { milestones } = await ensureProjectStructure(
    repository,
    userId,
    milestone.projectId,
  );
  const descriptionMarkdown = milestone.description.trim();
  const systemKey = milestoneKey(milestone.id, "note");

  if (!descriptionMarkdown) {
    await deleteSystemPageIfExists(repository, userId, milestone.projectId, systemKey);
    return null;
  }

  return upsertSystemPage(
    repository,
    userId,
    milestone.projectId,
    {
      kind: "note",
      title: milestone.name,
      sectionId: milestones.id,
      linkedEntityType: "milestone",
      linkedEntityId: milestone.id,
      systemKey,
      markdown: descriptionMarkdown,
      content: plainTextContent(descriptionMarkdown),
    },
    { updateExisting: options.updateExisting },
  );
}

async function syncTaskNote(
  repository: NotePagesRepositoryCore,
  userId: string,
  task: TaskRecord,
  milestone: MilestoneRecord | null,
  options: { createIfMissing?: boolean } = {},
) {
  if (!task.projectId) {
    return null;
  }

  const pages = await repository.list(userId, task.projectId);
  const existing = pages.find((page) => page.systemKey === explicitTaskKey(task.id));
  const taskMarkdown = task.notes.trim();

  if (!existing && !options.createIfMissing) {
    return null;
  }

  let sectionId: string | null = null;

  if (milestone) {
    const { milestones } = await ensureProjectStructure(repository, userId, task.projectId);
    sectionId = milestones.id;
  } else {
    const { generalNotes } = await ensureProjectStructure(repository, userId, task.projectId);
    sectionId = generalNotes.id;
  }

  return upsertSystemPage(repository, userId, task.projectId, {
    kind: "note",
    title: task.title,
    sectionId,
    linkedEntityType: "task",
    linkedEntityId: task.id,
    systemKey: explicitTaskKey(task.id),
    markdown: taskMarkdown,
    content: plainTextContent(taskMarkdown),
  });
}

async function deleteTaskNote(
  repository: NotePagesRepositoryCore,
  userId: string,
  task: Pick<TaskRecord, "id" | "projectId">,
) {
  if (!task.projectId) {
    return null;
  }

  const pages = await repository.list(userId, task.projectId);
  const existing = pages.find(
    (page) =>
      page.systemKey === explicitTaskKey(task.id) ||
      page.systemKey === legacyTaskKey(task.id),
  );

  if (!existing) {
    return null;
  }

  return repository.delete(userId, task.projectId, existing.id);
}

const selectedNotePagesRepository = isDatabaseConfigured()
  ? databaseNotePagesRepository
  : demoNotePagesRepository;

export const notePagesRepository = {
  ...selectedNotePagesRepository,
  ensureProjectStructure(userId: string, projectId: string) {
    return ensureProjectStructure(selectedNotePagesRepository, userId, projectId);
  },
  syncProjectDescription(userId: string, projectId: string, notes?: string) {
    return syncProjectDescription(
      selectedNotePagesRepository,
      userId,
      projectId,
      notes,
    );
  },
  syncMilestoneNotes(
    userId: string,
    milestone: MilestoneRecord,
    options: { updateExisting?: boolean } = {},
  ) {
    return syncMilestoneNotes(
      selectedNotePagesRepository,
      userId,
      milestone,
      options,
    );
  },
  syncTaskNote(
    userId: string,
    task: TaskRecord,
    milestone: MilestoneRecord | null = null,
    options: { createIfMissing?: boolean } = {},
  ) {
    return syncTaskNote(selectedNotePagesRepository, userId, task, milestone, options);
  },
  deleteTaskNote(userId: string, task: Pick<TaskRecord, "id" | "projectId">) {
    return deleteTaskNote(selectedNotePagesRepository, userId, task);
  },
  cleanupLegacyGeneratedNotes(
    userId: string,
    projectId: string,
    milestones: MilestoneRecord[],
  ) {
    return cleanupLegacyGeneratedNotes(
      selectedNotePagesRepository,
      userId,
      projectId,
      milestones,
    );
  },
};
