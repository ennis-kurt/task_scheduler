"use client";

import {
  type ChangeEvent,
  type ClipboardEvent as ReactClipboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Color from "@tiptap/extension-color";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { TextStyle } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import { Markdown } from "@tiptap/markdown";
import {
  EditorContent,
  type Editor,
  type JSONContent,
  useEditor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CheckSquare,
  ClipboardCopy,
  Code2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  GripVertical,
  Heading1,
  Heading2,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTree,
  MessageSquare,
  MessageSquareQuote,
  Minus,
  NotebookPen,
  Palette,
  PanelRight,
  Plus,
  Quote,
  Save,
  Search,
  Send,
  SlidersHorizontal,
  Strikethrough,
  Text,
  Trash2,
  Underline as UnderlineIcon,
  Users,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type {
  ProjectNoteKind,
  ProjectNoteLinkedEntityType,
  ProjectNotePageRecord,
  ProjectPlan,
} from "@/lib/planner/types";
import { cn } from "@/lib/utils";

type NoteBlockType =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "bulleted"
  | "numbered"
  | "todo"
  | "quote"
  | "callout"
  | "code"
  | "image";

type LegacyNoteBlock = {
  id: string;
  type: NoteBlockType;
  text: string;
  checked?: boolean;
  src?: string;
  alt?: string;
};

type NoteComment = {
  id: string;
  author: string;
  initials: string;
  body: string;
  createdAt: string;
};

type LegacyProjectNoteDocument = {
  title: string;
  status: "Draft" | "Shared" | "Final";
  blocks: LegacyNoteBlock[];
  comments: NoteComment[];
  updatedAt: string;
};

type ProjectNoteDocumentV2 = {
  version: 2;
  title: string;
  status: "Draft" | "Shared" | "Final";
  content: JSONContent;
  markdown: string;
  comments: NoteComment[];
  updatedAt: string;
};

type ProjectNotePage = {
  id: string;
  kind: ProjectNoteKind;
  sectionId: string | null;
  parentSectionId: string | null;
  linkedEntityType: ProjectNoteLinkedEntityType;
  linkedEntityId: string | null;
  systemKey: string | null;
  title: string;
  status: ProjectNoteDocumentV2["status"];
  content: JSONContent | string;
  contentType: "json" | "markdown";
  markdown: string;
  comments: NoteComment[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

type ProjectNotesCollectionV3 = {
  version: 3;
  activePageId: string;
  pages: ProjectNotePage[];
  updatedAt: string;
};

type NoteMeta = Pick<ProjectNoteDocumentV2, "title" | "status" | "comments" | "updatedAt">;

type LoadedNoteDocument = NoteMeta & {
  source: "default" | "v1" | "v2";
  content: JSONContent | string;
  contentType: "json" | "markdown";
};

type LoadedNoteCollection = {
  source: "default" | "v1" | "v2" | "v3";
  activePageId: string;
  pages: ProjectNotePage[];
};

type NoteHeading = {
  index: number;
  level: 1 | 2;
  text: string;
};

type NotesPanel = "folders" | "tools" | "outline" | "comments" | "collaboration";
type SaveState = "loading" | "saving" | "saved" | "offline";

type SlashMenuState = {
  query: string;
  from: number;
  to: number;
  top: number;
  left: number;
};

type ProjectNotesNotebookProps = {
  projectPlan: ProjectPlan;
};

type WritingTool = {
  id: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  onRun: () => void;
  active?: boolean;
  disabled?: boolean;
  color?: string;
};

type WritingToolGroup = {
  title: string;
  tools: WritingTool[];
};

type BlockStyle = "paragraph" | "heading1" | "heading2";

const NOTE_STATUSES: ProjectNoteDocumentV2["status"][] = ["Draft", "Shared", "Final"];
const LOCAL_NOTE_PAGE_PREFIX = "local-note-page";
const MAX_EMBEDDED_IMAGE_BYTES = 1_500_000;
const NOTES_SIDEBAR_WIDTH_STORAGE_KEY = "inflara:project-notes-sidebar-width";
const DEFAULT_NOTES_SIDEBAR_WIDTH = 296;
const MIN_NOTES_SIDEBAR_WIDTH = 236;
const MAX_NOTES_SIDEBAR_WIDTH = 460;

const NOTE_TEXT_COLORS = {
  red: "#e11d48",
  orange: "#ea580c",
  blue: "#2563eb",
  green: "#059669",
  purple: "#7c3aed",
} as const;

type SlashCommandId =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "bold"
  | "italic"
  | "colorDefault"
  | "colorRed"
  | "colorOrange"
  | "colorBlue"
  | "colorGreen"
  | "colorPurple"
  | "bulletList"
  | "orderedList"
  | "taskList"
  | "quote"
  | "callout"
  | "codeBlock"
  | "divider"
  | "image";

type SlashCommand = {
  id: SlashCommandId;
  label: string;
  hint: string;
  icon: LucideIcon;
  keywords: string;
  color?: string;
};

const editorExtensions = [
  StarterKit.configure({
    link: false,
    underline: false,
  }),
  TextStyle,
  Color.configure({
    types: ["textStyle"],
  }),
  Underline,
  Link.configure({
    autolink: true,
    defaultProtocol: "https",
    openOnClick: false,
    enableClickSelection: true,
    HTMLAttributes: {
      rel: "noopener noreferrer",
      target: "_blank",
    },
  }),
  Image.configure({
    allowBase64: true,
    inline: false,
    HTMLAttributes: {
      class: "project-note-image",
    },
  }),
  TaskList,
  TaskItem.configure({
    nested: true,
  }),
  Placeholder.configure({
    placeholder: ({ node }) => {
      if (node.type.name === "heading") {
        return "Heading";
      }

      return "Write notes, paste images, or type / for commands...";
    },
  }),
  Markdown.configure({
    indentation: {
      style: "space",
      size: 2,
    },
  }),
];

const slashCommands: SlashCommand[] = [
  {
    id: "paragraph",
    label: "Text",
    hint: "Plain paragraph",
    icon: Text,
    keywords: "text paragraph body",
  },
  {
    id: "heading1",
    label: "Heading 1",
    hint: "Large section title",
    icon: Heading1,
    keywords: "h1 title heading",
  },
  {
    id: "heading2",
    label: "Heading 2",
    hint: "Subsection title",
    icon: Heading2,
    keywords: "h2 subtitle heading",
  },
  {
    id: "bold",
    label: "Bold text",
    hint: "Continue typing in bold",
    icon: Bold,
    keywords: "bold strong heavy emphasis",
  },
  {
    id: "italic",
    label: "Italic text",
    hint: "Continue typing in italic",
    icon: Italic,
    keywords: "italic emphasis slant",
  },
  {
    id: "colorDefault",
    label: "Default color",
    hint: "Remove text color",
    icon: Palette,
    keywords: "default color reset clear",
  },
  {
    id: "colorRed",
    label: "Red text",
    hint: "Continue typing in red",
    icon: Palette,
    keywords: "red color rose danger priority",
    color: NOTE_TEXT_COLORS.red,
  },
  {
    id: "colorOrange",
    label: "Orange text",
    hint: "Continue typing in orange",
    icon: Palette,
    keywords: "orange color amber warning",
    color: NOTE_TEXT_COLORS.orange,
  },
  {
    id: "colorBlue",
    label: "Blue text",
    hint: "Continue typing in blue",
    icon: Palette,
    keywords: "blue color accent link",
    color: NOTE_TEXT_COLORS.blue,
  },
  {
    id: "colorGreen",
    label: "Green text",
    hint: "Continue typing in green",
    icon: Palette,
    keywords: "green color success",
    color: NOTE_TEXT_COLORS.green,
  },
  {
    id: "colorPurple",
    label: "Purple text",
    hint: "Continue typing in purple",
    icon: Palette,
    keywords: "purple color violet",
    color: NOTE_TEXT_COLORS.purple,
  },
  {
    id: "bulletList",
    label: "Bullet list",
    hint: "Simple bullets",
    icon: List,
    keywords: "bullet unordered list",
  },
  {
    id: "orderedList",
    label: "Numbered list",
    hint: "Ordered steps",
    icon: ListOrdered,
    keywords: "number ordered list",
  },
  {
    id: "taskList",
    label: "Checklist",
    hint: "Action items",
    icon: CheckSquare,
    keywords: "todo task checklist",
  },
  {
    id: "quote",
    label: "Quote",
    hint: "Quoted context",
    icon: Quote,
    keywords: "quote blockquote",
  },
  {
    id: "callout",
    label: "Callout",
    hint: "Highlighted note",
    icon: MessageSquareQuote,
    keywords: "callout note alert",
  },
  {
    id: "codeBlock",
    label: "Code block",
    hint: "Technical snippet",
    icon: Code2,
    keywords: "code snippet pre",
  },
  {
    id: "divider",
    label: "Divider",
    hint: "Horizontal rule",
    icon: Minus,
    keywords: "divider rule line",
  },
  {
    id: "image",
    label: "Image",
    hint: "Attach a picture",
    icon: ImagePlus,
    keywords: "image photo attachment picture",
  },
];

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function storageKeyForProject(projectId: string, version: 1 | 2 | 3) {
  return `inflara:project-notes:${projectId}:v${version}`;
}

function migrationKeyForProject(projectId: string) {
  return `inflara:project-notes:${projectId}:cloud-migrated:v1`;
}

function isCloudNotePageId(notePageId: string) {
  return notePageId.startsWith("note_") || notePageId.startsWith("section_");
}

function getNoteSaveLabel(state: SaveState) {
  switch (state) {
    case "loading":
      return "Loading...";
    case "saving":
      return "Saving...";
    case "offline":
      return "Offline/local draft";
    default:
      return "Saved";
  }
}

function noteApiPath(projectId: string, notePageId?: string) {
  const base = `/api/projects/${encodeURIComponent(projectId)}/notes`;
  return notePageId ? `${base}/${encodeURIComponent(notePageId)}` : base;
}

function notePageToPayload(page: ProjectNotePage) {
  return {
    kind: page.kind,
    sectionId: page.kind === "note" ? page.sectionId : null,
    parentSectionId: page.kind === "section" ? page.parentSectionId : null,
    linkedEntityType: page.linkedEntityType,
    linkedEntityId: page.linkedEntityId,
    systemKey: page.systemKey,
    title: page.title || "Untitled page",
    status: page.status,
    content: page.content,
    markdown: page.markdown,
    comments: page.comments,
    sortOrder: page.sortOrder,
  };
}

function dataUrlByteSize(src: string) {
  const commaIndex = src.indexOf(",");
  const payload = commaIndex >= 0 ? src.slice(commaIndex + 1) : src;

  return Math.ceil((payload.length * 3) / 4);
}

function hasOversizedEmbeddedImage(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some(hasOversizedEmbeddedImage);
  }

  const record = value as Record<string, unknown>;
  const attrs = record.attrs;

  if (record.type === "image" && attrs && typeof attrs === "object") {
    const src = (attrs as Record<string, unknown>).src;

    if (
      typeof src === "string" &&
      src.startsWith("data:image/") &&
      dataUrlByteSize(src) > MAX_EMBEDDED_IMAGE_BYTES
    ) {
      return true;
    }
  }

  return Object.values(record).some(hasOversizedEmbeddedImage);
}

function defaultMarkdown(projectPlan: ProjectPlan) {
  const firstMilestone = projectPlan.plottedMilestones[0];
  const secondMilestone = projectPlan.plottedMilestones[1];

  return [
    `# ${escapeMarkdown(projectPlan.project.name)} Working Notes`,
    "",
    "Capture decisions, research, risks, and handoff context for the current project.",
    "",
    `## ${escapeMarkdown(firstMilestone?.name ?? "Current Focus")}`,
    "",
    `- ${escapeMarkdown(
      firstMilestone?.description || "Clarify the next delivery checkpoint and open questions.",
    )}`,
    `- [ ] ${escapeMarkdown(secondMilestone ? `Review ${secondMilestone.name}` : "Review open risks")}`,
    "",
    "> Note: Keep the key decisions close to the project plan so planning and context stay together.",
  ].join("\n");
}

function defaultComments(): NoteComment[] {
  return [
    {
      id: "comment-architecture",
      author: "Project Lead",
      initials: "PL",
      body: "Keep the key decisions close to the milestone plan so planning and context stay together.",
      createdAt: new Date().toISOString(),
    },
  ];
}

function defaultLoadedDocument(projectPlan: ProjectPlan): LoadedNoteDocument {
  const now = new Date().toISOString();

  return {
    source: "default",
    title: `${projectPlan.project.name} Notes`,
    status: "Draft",
    comments: defaultComments(),
    updatedAt: now,
    content: defaultMarkdown(projectPlan),
    contentType: "markdown",
  };
}

function normalizeStatus(value: unknown): ProjectNoteDocumentV2["status"] {
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

function normalizeComments(value: unknown): NoteComment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (comment): comment is NoteComment =>
      Boolean(comment) &&
      typeof comment === "object" &&
      typeof (comment as Partial<NoteComment>).id === "string" &&
      typeof (comment as Partial<NoteComment>).author === "string" &&
      typeof (comment as Partial<NoteComment>).body === "string" &&
      typeof (comment as Partial<NoteComment>).createdAt === "string",
  );
}

function isJSONContent(value: unknown): value is JSONContent {
  return Boolean(value) && typeof value === "object" && typeof (value as JSONContent).type === "string";
}

function loadDocumentFromStorage(projectPlan: ProjectPlan): LoadedNoteDocument {
  if (typeof window === "undefined") {
    return defaultLoadedDocument(projectPlan);
  }

  const v2Key = storageKeyForProject(projectPlan.project.id, 2);
  const v1Key = storageKeyForProject(projectPlan.project.id, 1);

  try {
    const savedV2 = window.localStorage.getItem(v2Key);

    if (savedV2) {
      const raw = JSON.parse(savedV2) as Partial<ProjectNoteDocumentV2>;
      const markdown = typeof raw.markdown === "string" ? raw.markdown : defaultMarkdown(projectPlan);
      const content = isJSONContent(raw.content) ? raw.content : markdown;

      return {
        source: "v2",
        title:
          typeof raw.title === "string" && raw.title.trim()
            ? raw.title
            : `${projectPlan.project.name} Notes`,
        status: normalizeStatus(raw.status),
        comments: normalizeComments(raw.comments),
        updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
        content,
        contentType: isJSONContent(content) ? "json" : "markdown",
      };
    }

    const savedV1 = window.localStorage.getItem(v1Key);

    if (savedV1) {
      const raw = normalizeLegacyDocument(JSON.parse(savedV1), projectPlan);

      return {
        source: "v1",
        title: raw.title,
        status: raw.status,
        comments: raw.comments,
        updatedAt: raw.updatedAt,
        content: legacyBlocksToMarkdown(raw.blocks),
        contentType: "markdown",
      };
    }
  } catch {
    return defaultLoadedDocument(projectPlan);
  }

  return defaultLoadedDocument(projectPlan);
}

function pageFromLoadedDocument(
  loaded: LoadedNoteDocument,
  projectPlan: ProjectPlan,
): ProjectNotePage {
  const now = new Date().toISOString();
  const markdown = typeof loaded.content === "string" ? loaded.content : "";

  return {
    id: createId(`note-page-${projectPlan.project.id}`),
    kind: "note",
    sectionId: null,
    parentSectionId: null,
    linkedEntityType: "manual",
    linkedEntityId: null,
    systemKey: null,
    title: loaded.title,
    status: loaded.status,
    content: loaded.content,
    contentType: loaded.contentType,
    markdown,
    comments: loaded.comments,
    sortOrder: 0,
    createdAt: loaded.updatedAt || now,
    updatedAt: loaded.updatedAt || now,
  };
}

function normalizeNotePage(value: unknown, fallback: ProjectNotePage): ProjectNotePage | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as Partial<ProjectNotePage>;
  const id = typeof raw.id === "string" && raw.id ? raw.id : createId("note-page");
  const title = typeof raw.title === "string" && raw.title.trim() ? raw.title : fallback.title;
  const content = isJSONContent(raw.content) || typeof raw.content === "string" ? raw.content : fallback.content;
  const contentType = isJSONContent(content) ? "json" : "markdown";
  const updatedAt = typeof raw.updatedAt === "string" ? raw.updatedAt : fallback.updatedAt;

  return {
    id,
    kind: normalizeKind(raw.kind),
    sectionId: nullableString(raw.sectionId),
    parentSectionId: nullableString(raw.parentSectionId),
    linkedEntityType: normalizeLinkedEntityType(raw.linkedEntityType),
    linkedEntityId: nullableString(raw.linkedEntityId),
    systemKey: nullableString(raw.systemKey),
    title,
    status: normalizeStatus(raw.status),
    content,
    contentType,
    markdown: typeof raw.markdown === "string" ? raw.markdown : fallback.markdown,
    comments: normalizeComments(raw.comments),
    sortOrder: typeof raw.sortOrder === "number" ? raw.sortOrder : fallback.sortOrder,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : fallback.createdAt,
    updatedAt,
  };
}

function loadCollectionFromStorage(projectPlan: ProjectPlan): LoadedNoteCollection {
  const fallback = pageFromLoadedDocument(defaultLoadedDocument(projectPlan), projectPlan);

  if (typeof window === "undefined") {
    return {
      source: "default",
      activePageId: fallback.id,
      pages: [fallback],
    };
  }

  const v3Key = storageKeyForProject(projectPlan.project.id, 3);

  try {
    const savedV3 = window.localStorage.getItem(v3Key);

    if (savedV3) {
      const raw = JSON.parse(savedV3) as Partial<ProjectNotesCollectionV3>;
      const pages = Array.isArray(raw.pages)
        ? raw.pages
            .map((page, index) =>
              normalizeNotePage(page, { ...fallback, sortOrder: index }),
            )
            .filter((page): page is ProjectNotePage => Boolean(page))
            .sort((a, b) => a.sortOrder - b.sortOrder)
        : [];

      if (pages.length) {
        const activePage = resolveActiveNotePage(
          pages,
          typeof raw.activePageId === "string" ? raw.activePageId : "",
        );

        return {
          source: "v3",
          activePageId: activePage?.id ?? pages[0].id,
          pages,
        };
      }
    }
  } catch {
    // Fall through to v2/v1 migration.
  }

  const legacy = loadDocumentFromStorage(projectPlan);
  const legacyPage = pageFromLoadedDocument(legacy, projectPlan);

  return {
    source: legacy.source,
    activePageId: legacyPage.id,
    pages: [legacyPage],
  };
}

function writeCollectionBackup(
  storageKey: string,
  legacyStorageKey: string,
  activePageId: string,
  pages: ProjectNotePage[],
) {
  if (typeof window === "undefined") {
    return;
  }

  const updatedAt = new Date().toISOString();
  const sortedPages = [...pages].sort((a, b) => a.sortOrder - b.sortOrder);
  const activePage = resolveActiveNotePage(sortedPages, activePageId);

  window.localStorage.setItem(
    storageKey,
    JSON.stringify({
      version: 3,
      activePageId,
      pages: sortedPages,
      updatedAt,
    } satisfies ProjectNotesCollectionV3),
  );

  if (!activePage) {
    return;
  }

  window.localStorage.setItem(
    legacyStorageKey,
    JSON.stringify({
      version: 2,
      title: activePage.title,
      status: activePage.status,
      content: isJSONContent(activePage.content)
        ? activePage.content
        : { type: "doc", content: [{ type: "paragraph" }] },
      markdown: activePage.markdown,
      comments: activePage.comments,
      updatedAt: activePage.updatedAt,
    } satisfies ProjectNoteDocumentV2),
  );
}

function firstEditableNote(pages: ProjectNotePage[]) {
  return pages.find((page) => page.kind === "note") ?? pages[0];
}

function resolveActiveNotePage(pages: ProjectNotePage[], activePageId: string) {
  return (
    pages.find((page) => page.id === activePageId && page.kind === "note") ??
    firstEditableNote(pages)
  );
}

async function readNotePagesFromApi(projectId: string) {
  const response = await fetch(noteApiPath(projectId), { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`NOTES_LIST_FAILED_${response.status}`);
  }

  return (await response.json()) as ProjectNotePageRecord[];
}

async function createNotePageInApi(projectId: string, page: ProjectNotePage) {
  const response = await fetch(noteApiPath(projectId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(notePageToPayload(page)),
  });

  if (!response.ok) {
    throw new Error(`NOTES_CREATE_FAILED_${response.status}`);
  }

  return (await response.json()) as ProjectNotePageRecord;
}

async function updateNotePageInApi(projectId: string, page: ProjectNotePage) {
  const response = await fetch(noteApiPath(projectId, page.id), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(notePageToPayload(page)),
  });

  if (!response.ok) {
    throw new Error(`NOTES_UPDATE_FAILED_${response.status}`);
  }

  return (await response.json()) as ProjectNotePageRecord;
}

async function deleteNotePageFromApi(projectId: string, notePageId: string) {
  const response = await fetch(noteApiPath(projectId, notePageId), {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(`NOTES_DELETE_FAILED_${response.status}`);
  }
}

function normalizeLegacyDocument(value: unknown, projectPlan: ProjectPlan): LegacyProjectNoteDocument {
  if (!value || typeof value !== "object") {
    const fallback = defaultLoadedDocument(projectPlan);

    return {
      title: fallback.title,
      status: fallback.status,
      blocks: [],
      comments: fallback.comments,
      updatedAt: fallback.updatedAt,
    };
  }

  const raw = value as Partial<LegacyProjectNoteDocument>;
  const blocks = Array.isArray(raw.blocks)
    ? raw.blocks.filter(
        (block): block is LegacyNoteBlock =>
          Boolean(block) &&
          typeof block === "object" &&
          typeof (block as Partial<LegacyNoteBlock>).id === "string" &&
          typeof (block as Partial<LegacyNoteBlock>).text === "string",
      )
    : [];

  return {
    title:
      typeof raw.title === "string" && raw.title.trim()
        ? raw.title
        : `${projectPlan.project.name} Notes`,
    status: normalizeStatus(raw.status),
    blocks,
    comments: normalizeComments(raw.comments),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}

function legacyBlocksToMarkdown(blocks: LegacyNoteBlock[]) {
  if (!blocks.length) {
    return "";
  }

  return blocks
    .map((block) => {
      const text = block.text.trimEnd();

      switch (block.type) {
        case "heading1":
          return `# ${escapeMarkdown(text)}`;
        case "heading2":
          return `## ${escapeMarkdown(text)}`;
        case "bulleted":
          return text
            .split("\n")
            .map((line) => `- ${escapeMarkdown(line)}`)
            .join("\n");
        case "numbered":
          return text
            .split("\n")
            .map((line, index) => `${index + 1}. ${escapeMarkdown(line)}`)
            .join("\n");
        case "todo":
          return `- [${block.checked ? "x" : " "}] ${escapeMarkdown(text)}`;
        case "quote":
          return text
            .split("\n")
            .map((line) => `> ${escapeMarkdown(line)}`)
            .join("\n");
        case "callout":
          return text
            .split("\n")
            .map((line, index) => `> ${index === 0 ? "Note: " : ""}${escapeMarkdown(line)}`)
            .join("\n");
        case "code":
          return ["```", text, "```"].join("\n");
        case "image":
          return block.src ? `![${escapeMarkdown(block.alt ?? block.text)}](${block.src})` : "";
        default:
          return text;
      }
    })
    .filter(Boolean)
    .join("\n\n");
}

function escapeMarkdown(value: string) {
  return value.replace(/[\\`*_{}[\]()#+.!|-]/g, "\\$&");
}

function countWordsFromText(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function textFromNode(node: JSONContent): string {
  if (typeof node.text === "string") {
    return node.text;
  }

  return (node.content ?? []).map(textFromNode).join("");
}

function plainMarkdownCandidateFromJson(node: JSONContent): string | null {
  if (node.type === "doc") {
    const blocks = node.content ?? [];
    const lines = blocks.map(plainMarkdownCandidateFromJson);

    return lines.every((line): line is string => line !== null) ? lines.join("\n\n") : null;
  }

  if (node.type === "paragraph") {
    const inline = node.content ?? [];
    const parts = inline.map(plainMarkdownCandidateFromJson);

    return parts.every((part): part is string => part !== null) ? parts.join("") : "";
  }

  if (node.type === "text") {
    return node.text ?? "";
  }

  if (node.type === "hardBreak") {
    return "\n";
  }

  return null;
}

function collectHeadings(content: JSONContent[] | undefined, headings: NoteHeading[] = []) {
  for (const node of content ?? []) {
    if (node.type === "heading") {
      const level = node.attrs?.level === 1 ? 1 : 2;
      const text = textFromNode(node).trim();

      if (text) {
        headings.push({ index: headings.length, level, text });
      }
    }

    collectHeadings(node.content, headings);
  }

  return headings;
}

function looksLikeMarkdownDocument(value: string) {
  const text = value.trim();

  if (!text) {
    return false;
  }

  return [
    /^#{1,6}\s+\S/m,
    /^\s*[-+*]\s+\S/m,
    /^\s*\d+\.\s+\S/m,
    /^\s*[-+*]\s+\[[ xX]\]\s+\S/m,
    /^>\s+\S/m,
    /^```[\s\S]*```/m,
    /^---+$/m,
    /^\|.+\|$/m,
    /!\[[^\]]*]\([^)]+\)/,
    /\[[^\]]+]\([^)]+\)/,
  ].some((pattern) => pattern.test(text));
}

function formatRelativeDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Just now";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function getCurrentBlockStyle(editor: Editor | null): BlockStyle {
  if (!editor) {
    return "paragraph";
  }

  if (editor.isActive("heading", { level: 1 })) {
    return "heading1";
  }

  if (editor.isActive("heading", { level: 2 })) {
    return "heading2";
  }

  return "paragraph";
}

function clampNotesSidebarWidth(width: number) {
  return Math.min(
    MAX_NOTES_SIDEBAR_WIDTH,
    Math.max(MIN_NOTES_SIDEBAR_WIDTH, Math.round(width)),
  );
}

function getSlashMenuState(editor: Editor, shell: HTMLElement | null): SlashMenuState | null {
  const { selection } = editor.state;

  if (!selection.empty) {
    return null;
  }

  const textBefore = selection.$from.parent.textBetween(0, selection.$from.parentOffset, "\n", "\0");
  const match = /\/([\w-]*)$/.exec(textBefore);

  if (!match) {
    return null;
  }

  try {
    const coords = editor.view.coordsAtPos(selection.$from.pos);
    const shellRect = shell?.getBoundingClientRect();
    const query = match[1] ?? "";
    const from = selection.$from.pos - query.length - 1;

    return {
      query,
      from,
      to: selection.$from.pos,
      top: shellRect ? coords.bottom - shellRect.top + 8 : coords.bottom + 8,
      left: shellRect ? Math.max(16, Math.min(coords.left - shellRect.left, shellRect.width - 260)) : coords.left,
    };
  } catch {
    return null;
  }
}

function readImageFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function ProjectNotesNotebook({ projectPlan }: ProjectNotesNotebookProps) {
  const projectId = projectPlan.project.id;
  const loadedCollection = useMemo(
    () => loadCollectionFromStorage(projectPlan),
    [projectPlan],
  );
  const storageKey = storageKeyForProject(projectId, 3);
  const legacyStorageKey = storageKeyForProject(projectId, 2);
  const cloudMigrationKey = migrationKeyForProject(projectId);
  const [pages, setPages] = useState<ProjectNotePage[]>(loadedCollection.pages);
  const [activePageId, setActivePageId] = useState(loadedCollection.activePageId);
  const notePages = useMemo(() => pages.filter((page) => page.kind === "note"), [pages]);
  const pagesRef = useRef(pages);
  const activePageIdRef = useRef(activePageId);
  const activePage =
    notePages.find((page) => page.id === activePageId) ??
    notePages[0] ??
    pageFromLoadedDocument(defaultLoadedDocument(projectPlan), projectPlan);
  const [noteMeta, setNoteMeta] = useState<NoteMeta>({
    title: activePage.title,
    status: activePage.status,
    comments: activePage.comments,
    updatedAt: activePage.updatedAt,
  });
  const noteMetaRef = useRef(noteMeta);
  const [commentDraft, setCommentDraft] = useState("");
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => new Set());
  const [showSidebar, setShowSidebar] = useState(() =>
    typeof window === "undefined" ? true : window.matchMedia("(min-width: 1280px)").matches,
  );
  const [notesSidebarWidth, setNotesSidebarWidth] = useState(() => {
    if (typeof window === "undefined") {
      return DEFAULT_NOTES_SIDEBAR_WIDTH;
    }

    const storedWidth = Number(window.localStorage.getItem(NOTES_SIDEBAR_WIDTH_STORAGE_KEY));
    return Number.isFinite(storedWidth)
      ? clampNotesSidebarWidth(storedWidth)
      : DEFAULT_NOTES_SIDEBAR_WIDTH;
  });
  const [isResizingNotesSidebar, setIsResizingNotesSidebar] = useState(false);
  const [activeNotesPanel, setActiveNotesPanel] = useState<NotesPanel>("folders");
  const [wordCount, setWordCount] = useState(0);
  const [headings, setHeadings] = useState<NoteHeading[]>([]);
  const [lastSavedAt, setLastSavedAt] = useState(activePage.updatedAt);
  const [saveState, setSaveState] = useState<SaveState>("loading");
  const [slashMenu, setSlashMenu] = useState<SlashMenuState | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const editorShellRef = useRef<HTMLDivElement | null>(null);
  const persistTimerRef = useRef<number | null>(null);
  const cloudLoadTokenRef = useRef(0);
  const saveTokenRef = useRef(0);
  const localDirtyDuringCloudLoadRef = useRef(false);

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  useEffect(() => {
    activePageIdRef.current = activePageId;
  }, [activePageId]);

  useEffect(() => {
    noteMetaRef.current = noteMeta;
  }, [noteMeta]);

  useEffect(() => {
    if (!isResizingNotesSidebar || typeof window === "undefined") {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const nextWidth = clampNotesSidebarWidth(window.innerWidth - event.clientX);
      setNotesSidebarWidth(nextWidth);
    };
    const handlePointerUp = () => {
      setIsResizingNotesSidebar(false);
    };
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isResizingNotesSidebar]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(NOTES_SIDEBAR_WIDTH_STORAGE_KEY, String(notesSidebarWidth));
  }, [notesSidebarWidth]);

  useEffect(() => {
    setExpandedSections((current) => {
      const next = new Set(current);

      for (const page of pages) {
        if (page.kind === "section" && page.linkedEntityType !== "manual") {
          next.add(page.id);
        }
      }

      return next;
    });
  }, [pages]);

  const editor = useEditor(
    {
      extensions: editorExtensions,
      content: activePage.content,
      contentType: activePage.contentType,
      immediatelyRender: false,
      shouldRerenderOnTransaction: true,
      editorProps: {
        attributes: {
          class: "project-note-prosemirror",
          "data-testid": "project-note-rich-surface",
          "aria-label": "Project notes editor",
        },
      },
    },
    [storageKey],
  );

  useEffect(() => {
    const nextPages = loadedCollection.pages;
    const nextActivePage =
      resolveActiveNotePage(nextPages, loadedCollection.activePageId) ?? nextPages[0];
    const nextActivePageId = nextActivePage.id;

    pagesRef.current = nextPages;
    activePageIdRef.current = nextActivePageId;
    setPages(nextPages);
    setActivePageId(nextActivePageId);
    const nextMeta = {
      title: nextActivePage.title,
      status: nextActivePage.status,
      comments: nextActivePage.comments,
      updatedAt: nextActivePage.updatedAt,
    };
    noteMetaRef.current = nextMeta;
    setNoteMeta(nextMeta);
    setLastSavedAt(nextActivePage.updatedAt);
    setSaveState("loading");
    setCommentDraft("");
    localDirtyDuringCloudLoadRef.current = false;

    if (editor) {
      editor.commands.setContent(nextActivePage.content, {
        emitUpdate: false,
        contentType: nextActivePage.contentType,
      });
    }
  }, [editor, loadedCollection]);

  const commitRemotePage = useCallback(
    (previousPageId: string, remotePage: ProjectNotePageRecord) => {
      const fallback =
        pagesRef.current.find((page) => page.id === previousPageId) ??
        pagesRef.current[0] ??
        pageFromLoadedDocument(defaultLoadedDocument(projectPlan), projectPlan);
      const normalizedPage = normalizeNotePage(remotePage, fallback);

      if (!normalizedPage) {
        return;
      }

      const currentPage = pagesRef.current.find((page) => page.id === previousPageId);
      const committedPage = currentPage
        ? {
            ...normalizedPage,
            kind: currentPage.kind,
            sectionId: currentPage.kind === "note" ? currentPage.sectionId : null,
            parentSectionId:
              currentPage.kind === "section" ? currentPage.parentSectionId : null,
            linkedEntityType: currentPage.linkedEntityType,
            linkedEntityId: currentPage.linkedEntityId,
            systemKey: currentPage.systemKey,
            title: currentPage.title,
            status: currentPage.status,
            content: currentPage.content,
            contentType: currentPage.contentType,
            markdown: currentPage.markdown,
            comments: currentPage.comments,
            sortOrder: currentPage.sortOrder,
          }
        : normalizedPage;
      const hasExistingPage = pagesRef.current.some((page) => page.id === previousPageId);
      const nextPages = hasExistingPage
        ? pagesRef.current.map((page) => {
            if (page.id === previousPageId) {
              return committedPage;
            }

            return {
              ...page,
              sectionId: page.sectionId === previousPageId ? committedPage.id : page.sectionId,
              parentSectionId:
                page.parentSectionId === previousPageId ? committedPage.id : page.parentSectionId,
            };
          })
        : [...pagesRef.current, committedPage];
      const nextActivePageId =
        activePageIdRef.current === previousPageId ? committedPage.id : activePageIdRef.current;

      pagesRef.current = nextPages;
      activePageIdRef.current = nextActivePageId;
      setPages(nextPages);
      setActivePageId(nextActivePageId);
      setExpandedSections((current) => {
        if (!current.has(previousPageId)) {
          return current;
        }

        const next = new Set(current);
        next.delete(previousPageId);
        next.add(committedPage.id);
        return next;
      });

      if (nextActivePageId === committedPage.id) {
        const nextMeta = {
          title: committedPage.title,
          status: committedPage.status,
          comments: committedPage.comments,
          updatedAt: committedPage.updatedAt,
        };
        noteMetaRef.current = nextMeta;
        setNoteMeta(nextMeta);
        setLastSavedAt(normalizedPage.updatedAt);
      }

      writeCollectionBackup(storageKey, legacyStorageKey, nextActivePageId, nextPages);
    },
    [legacyStorageKey, projectPlan, storageKey],
  );

  const syncPageToCloud = useCallback(
    async (page: ProjectNotePage) => {
      if (hasOversizedEmbeddedImage(page.content)) {
        throw new Error("EMBEDDED_IMAGE_TOO_LARGE");
      }

      const remotePage = isCloudNotePageId(page.id)
        ? await updateNotePageInApi(projectId, page)
        : await createNotePageInApi(projectId, page);

      commitRemotePage(page.id, remotePage);
      return remotePage;
    },
    [commitRemotePage, projectId],
  );

  const persistDocument = useCallback(
    (editorInstance: Editor | null, metaSnapshot: NoteMeta = noteMetaRef.current) => {
      if (!editorInstance || typeof window === "undefined") {
        return;
      }

      localDirtyDuringCloudLoadRef.current = true;
      const updatedAt = new Date().toISOString();
      const currentPageId = activePageIdRef.current;
      const nextPages = pagesRef.current.map((page) =>
        page.id === currentPageId
          ? {
              ...page,
              ...metaSnapshot,
              updatedAt,
              content: editorInstance.getJSON(),
              contentType: "json" as const,
              markdown: editorInstance.getMarkdown(),
            }
          : page,
      );
      const activeSavedPage = nextPages.find((page) => page.id === currentPageId);

      pagesRef.current = nextPages;
      setPages(nextPages);
      writeCollectionBackup(storageKey, legacyStorageKey, currentPageId, nextPages);
      setLastSavedAt(updatedAt);
      setNoteMeta((current) => ({ ...current, updatedAt }));

      if (!activeSavedPage) {
        return;
      }

      if (hasOversizedEmbeddedImage(activeSavedPage.content)) {
        setSaveState("offline");
        toast.error("Images over 1.5 MB cannot be synced yet");
        return;
      }

      const saveToken = ++saveTokenRef.current;
      setSaveState("saving");
      void syncPageToCloud(activeSavedPage)
        .then(() => {
          if (saveTokenRef.current === saveToken) {
            localDirtyDuringCloudLoadRef.current = false;
            setSaveState("saved");
          }
        })
        .catch(() => {
          if (saveTokenRef.current === saveToken) {
            setSaveState("offline");
          }
        });
    },
    [legacyStorageKey, storageKey, syncPageToCloud],
  );

  const schedulePersist = useCallback(
    (metaSnapshot: NoteMeta = noteMetaRef.current) => {
      if (typeof window === "undefined") {
        return;
      }

      if (persistTimerRef.current) {
        window.clearTimeout(persistTimerRef.current);
      }

      persistTimerRef.current = window.setTimeout(() => {
        persistDocument(editor, metaSnapshot);
      }, 350);
    },
    [editor, persistDocument],
  );

  const refreshEditorState = useCallback((editorInstance: Editor) => {
    const json = editorInstance.getJSON();
    setWordCount(countWordsFromText(editorInstance.getText()));
    setHeadings(collectHeadings(json.content));
    setSlashMenu(getSlashMenuState(editorInstance, editorShellRef.current));
  }, []);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const handleUpdate = () => {
      refreshEditorState(editor);
      schedulePersist();
    };
    const handleSelectionUpdate = () => {
      refreshEditorState(editor);
    };

    editor.on("update", handleUpdate);
    editor.on("selectionUpdate", handleSelectionUpdate);
    editor.on("focus", handleSelectionUpdate);
    editor.on("blur", () => setSlashMenu(null));
    refreshEditorState(editor);

    return () => {
      editor.off("update", handleUpdate);
      editor.off("selectionUpdate", handleSelectionUpdate);
      editor.off("focus", handleSelectionUpdate);
      if (persistTimerRef.current) {
        window.clearTimeout(persistTimerRef.current);
      }
    };
  }, [editor, persistDocument, refreshEditorState, schedulePersist]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const markdownCandidate = plainMarkdownCandidateFromJson(editor.getJSON());

    if (!markdownCandidate || !looksLikeMarkdownDocument(markdownCandidate)) {
      return;
    }

    editor.commands.setContent(markdownCandidate, {
      contentType: "markdown",
      emitUpdate: false,
    });
    refreshEditorState(editor);
    persistDocument(editor);
  }, [activePageId, activePage?.updatedAt, editor, persistDocument, refreshEditorState]);

  useEffect(() => {
    if (!editor || typeof window === "undefined") {
      return;
    }

    const activeEditor = editor;
    const loadToken = ++cloudLoadTokenRef.current;
    let cancelled = false;

    const applyRemotePages = (remotePages: ProjectNotePageRecord[]) => {
      const fallback = pageFromLoadedDocument(defaultLoadedDocument(projectPlan), projectPlan);
      const normalizedPages = remotePages
        .map((page, index) =>
          normalizeNotePage(page, { ...fallback, sortOrder: index }),
        )
        .filter((page): page is ProjectNotePage => Boolean(page))
        .sort((a, b) => a.sortOrder - b.sortOrder);

      if (!normalizedPages.length) {
        return false;
      }

      const currentActivePageId = activePageIdRef.current;
      const nextActivePage =
        resolveActiveNotePage(normalizedPages, currentActivePageId) ?? normalizedPages[0];
      const nextMeta = {
        title: nextActivePage.title,
        status: nextActivePage.status,
        comments: nextActivePage.comments,
        updatedAt: nextActivePage.updatedAt,
      };

      pagesRef.current = normalizedPages;
      activePageIdRef.current = nextActivePage.id;
      noteMetaRef.current = nextMeta;
      setPages(normalizedPages);
      setActivePageId(nextActivePage.id);
      setNoteMeta(nextMeta);
      setLastSavedAt(nextActivePage.updatedAt);
      setCommentDraft("");
      editor.commands.setContent(nextActivePage.content, {
        emitUpdate: false,
        contentType: nextActivePage.contentType,
      });
      refreshEditorState(editor);
      writeCollectionBackup(storageKey, legacyStorageKey, nextActivePage.id, normalizedPages);
      localDirtyDuringCloudLoadRef.current = false;
      return true;
    };

    async function loadCloudPages() {
      setSaveState("loading");

      try {
        const remotePages = await readNotePagesFromApi(projectId);

        if (cancelled || cloudLoadTokenRef.current !== loadToken) {
          return;
        }

        if (remotePages.length && localDirtyDuringCloudLoadRef.current) {
          const fallback = pageFromLoadedDocument(defaultLoadedDocument(projectPlan), projectPlan);
          const normalizedRemotePages = remotePages
            .map((page, index) =>
              normalizeNotePage(page, { ...fallback, sortOrder: index }),
            )
            .filter((page): page is ProjectNotePage => Boolean(page))
            .sort((a, b) => a.sortOrder - b.sortOrder);
          const currentPages = pagesRef.current.length
            ? pagesRef.current
            : loadCollectionFromStorage(projectPlan).pages;
          const currentActivePageId = activePageIdRef.current;
          const currentActiveIndex = currentPages.findIndex((page) => page.id === currentActivePageId);
          const activeIndex = currentActiveIndex >= 0 ? currentActiveIndex : 0;
          const reconciledPages = [
            ...currentPages.map((page, index) => {
              const remotePage = normalizedRemotePages[index];

              return remotePage
                ? {
                    ...page,
                    id: remotePage.id,
                    sortOrder: index,
                    createdAt: remotePage.createdAt,
                  }
                : { ...page, sortOrder: index };
            }),
            ...normalizedRemotePages.slice(currentPages.length),
          ].map((page, index) => ({ ...page, sortOrder: index }));
          const nextActivePage =
            resolveActiveNotePage(reconciledPages, currentActivePageId) ??
            reconciledPages[activeIndex] ??
            normalizedRemotePages.find((page) => page.kind === "note");

          if (nextActivePage) {
            const activePageWithLatestEditor = {
              ...nextActivePage,
              ...noteMetaRef.current,
              content: activeEditor.getJSON(),
              contentType: "json" as const,
              markdown: activeEditor.getMarkdown(),
              updatedAt: new Date().toISOString(),
            };
            const nextPages = reconciledPages.map((page) =>
              page.id === nextActivePage.id ? activePageWithLatestEditor : page,
            );
            const nextMeta = {
              title: activePageWithLatestEditor.title,
              status: activePageWithLatestEditor.status,
              comments: activePageWithLatestEditor.comments,
              updatedAt: activePageWithLatestEditor.updatedAt,
            };

            pagesRef.current = nextPages;
            activePageIdRef.current = activePageWithLatestEditor.id;
            noteMetaRef.current = nextMeta;
            setPages(nextPages);
            setActivePageId(activePageWithLatestEditor.id);
            setNoteMeta(nextMeta);
            setLastSavedAt(activePageWithLatestEditor.updatedAt);
            writeCollectionBackup(storageKey, legacyStorageKey, activePageWithLatestEditor.id, nextPages);
            localDirtyDuringCloudLoadRef.current = false;
            setSaveState("saving");
            void syncPageToCloud(activePageWithLatestEditor)
              .then(() => setSaveState("saved"))
              .catch(() => setSaveState("offline"));
            return;
          }
        }

        if (remotePages.length) {
          applyRemotePages(remotePages);
          setSaveState("saved");
          return;
        }

        const localCollection = localDirtyDuringCloudLoadRef.current
          ? {
              activePageId: activePageIdRef.current,
              pages: pagesRef.current.length ? pagesRef.current : loadCollectionFromStorage(projectPlan).pages,
            }
          : loadCollectionFromStorage(projectPlan);
        const pagesToUpload = localCollection.pages.map((page) =>
          page.id === localCollection.activePageId
            ? {
                ...page,
                ...noteMetaRef.current,
                content: activeEditor.getJSON(),
                contentType: "json" as const,
                markdown: activeEditor.getMarkdown(),
                updatedAt: new Date().toISOString(),
              }
            : page,
        );
        const uploadedPages: ProjectNotePageRecord[] = [];

        for (const page of pagesToUpload) {
          uploadedPages.push(await createNotePageInApi(projectId, page));
        }

        if (cancelled || cloudLoadTokenRef.current !== loadToken) {
          return;
        }

        const fallback = pageFromLoadedDocument(defaultLoadedDocument(projectPlan), projectPlan);
        const normalizedUploadedPages = uploadedPages
          .map((page, index) =>
            normalizeNotePage(page, { ...fallback, sortOrder: index }),
          )
          .filter((page): page is ProjectNotePage => Boolean(page))
          .sort((a, b) => a.sortOrder - b.sortOrder);
        const currentPages = pagesRef.current.length ? pagesRef.current : pagesToUpload;
        const currentActivePageId = activePageIdRef.current;
        const currentActiveIndex = currentPages.findIndex((page) => page.id === currentActivePageId);
        const activeIndex = currentActiveIndex >= 0 ? currentActiveIndex : 0;
        const reconciledPages = [
          ...currentPages.map((page, index) => {
            const remotePage = normalizedUploadedPages[index];

            return remotePage
              ? {
                  ...page,
                  id: remotePage.id,
                  sortOrder: index,
                  createdAt: remotePage.createdAt,
                }
              : { ...page, sortOrder: index };
          }),
          ...normalizedUploadedPages.slice(currentPages.length),
        ].map((page, index) => ({ ...page, sortOrder: index }));
        const nextActivePage =
          resolveActiveNotePage(reconciledPages, currentActivePageId) ??
          reconciledPages[activeIndex];

        if (nextActivePage) {
          const activePageWithLatestEditor = {
            ...nextActivePage,
            ...noteMetaRef.current,
            content: activeEditor.getJSON(),
            contentType: "json" as const,
            markdown: activeEditor.getMarkdown(),
            updatedAt: new Date().toISOString(),
          };
          const nextPages = reconciledPages.map((page) =>
            page.id === nextActivePage.id ? activePageWithLatestEditor : page,
          );
          const nextMeta = {
            title: activePageWithLatestEditor.title,
            status: activePageWithLatestEditor.status,
            comments: activePageWithLatestEditor.comments,
            updatedAt: activePageWithLatestEditor.updatedAt,
          };

          pagesRef.current = nextPages;
          activePageIdRef.current = activePageWithLatestEditor.id;
          noteMetaRef.current = nextMeta;
          setPages(nextPages);
          setActivePageId(activePageWithLatestEditor.id);
          setNoteMeta(nextMeta);
          setLastSavedAt(activePageWithLatestEditor.updatedAt);
          writeCollectionBackup(storageKey, legacyStorageKey, activePageWithLatestEditor.id, nextPages);
          window.localStorage.setItem(cloudMigrationKey, new Date().toISOString());
          localDirtyDuringCloudLoadRef.current = false;
          setSaveState("saving");
          void syncPageToCloud(activePageWithLatestEditor)
            .then(() => setSaveState("saved"))
            .catch(() => setSaveState("offline"));
          return;
        }

        setSaveState("saved");
      } catch {
        if (!cancelled && cloudLoadTokenRef.current === loadToken) {
          setSaveState("offline");
        }
      }
    }

    void loadCloudPages();

    return () => {
      cancelled = true;
    };
  }, [
    cloudMigrationKey,
    editor,
    legacyStorageKey,
    projectId,
    projectPlan,
    refreshEditorState,
    storageKey,
    syncPageToCloud,
  ]);

  useEffect(() => {
    setSlashIndex(0);
  }, [slashMenu?.query]);

  const filteredSlashCommands = useMemo(() => {
    if (!slashMenu?.query) {
      return slashCommands;
    }

    const query = slashMenu.query.toLowerCase();
    return slashCommands.filter(
      (command) =>
        command.label.toLowerCase().includes(query) || command.keywords.toLowerCase().includes(query),
    );
  }, [slashMenu]);

  const saveMeta = (nextMeta: NoteMeta) => {
    localDirtyDuringCloudLoadRef.current = true;
    noteMetaRef.current = nextMeta;
    setNoteMeta(nextMeta);
    const nextPages = pagesRef.current.map((page) =>
      page.id === activePageIdRef.current
        ? {
            ...page,
            title: nextMeta.title,
            status: nextMeta.status,
            comments: nextMeta.comments,
            updatedAt: nextMeta.updatedAt,
          }
        : page,
    );
    pagesRef.current = nextPages;
    setPages(nextPages);
    schedulePersist(nextMeta);
  };

  const handleTitleChange = (title: string) => {
    saveMeta({ ...noteMetaRef.current, title });
  };

  const handleStatusChange = (status: ProjectNoteDocumentV2["status"]) => {
    saveMeta({ ...noteMetaRef.current, status });
  };

  const selectNotePage = (pageId: string) => {
    if (!editor || pageId === activePageIdRef.current) {
      return;
    }

    if (persistTimerRef.current) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }

    persistDocument(editor);
    const page = pagesRef.current.find(
      (candidate) => candidate.id === pageId && candidate.kind === "note",
    );

    if (!page) {
      return;
    }

    activePageIdRef.current = page.id;
    setActivePageId(page.id);
    const nextMeta = {
      title: page.title,
      status: page.status,
      comments: page.comments,
      updatedAt: page.updatedAt,
    };
    noteMetaRef.current = nextMeta;
    setNoteMeta(nextMeta);
    setLastSavedAt(page.updatedAt);
    setCommentDraft("");
    editor.commands.setContent(page.content, {
      emitUpdate: false,
      contentType: page.contentType,
    });
    refreshEditorState(editor);
  };

  const createNotePage = (sectionId: string | null = null) => {
    localDirtyDuringCloudLoadRef.current = true;
    const now = new Date().toISOString();
    const nextPage: ProjectNotePage = {
      id: createId(LOCAL_NOTE_PAGE_PREFIX),
      kind: "note",
      sectionId,
      parentSectionId: null,
      linkedEntityType: "manual",
      linkedEntityId: null,
      systemKey: null,
      title: "Untitled page",
      status: "Draft",
      content: "# Untitled page\n\n",
      contentType: "markdown",
      markdown: "# Untitled page\n\n",
      comments: [],
      sortOrder: pagesRef.current.length,
      createdAt: now,
      updatedAt: now,
    };

    if (editor) {
      persistDocument(editor);
    }

    const nextPages = [...pagesRef.current, nextPage];

    pagesRef.current = nextPages;
    activePageIdRef.current = nextPage.id;
    setPages(nextPages);
    setActivePageId(nextPage.id);
    const nextMeta = {
      title: nextPage.title,
      status: nextPage.status,
      comments: nextPage.comments,
      updatedAt: nextPage.updatedAt,
    };
    noteMetaRef.current = nextMeta;
    setNoteMeta(nextMeta);
    setLastSavedAt(now);
    setCommentDraft("");
    writeCollectionBackup(storageKey, legacyStorageKey, nextPage.id, nextPages);
    editor?.commands.setContent(nextPage.content, {
      emitUpdate: false,
      contentType: nextPage.contentType,
    });
    editor?.commands.focus("end");
    setSaveState("saving");
    void createNotePageInApi(projectId, nextPage)
      .then((remotePage) => {
        commitRemotePage(nextPage.id, remotePage);
        if (editor) {
          persistDocument(editor);
        }
        localDirtyDuringCloudLoadRef.current = false;
        setSaveState("saved");
      })
      .catch(() => setSaveState("offline"));
  };

  const createSection = (parentSectionId: string | null = null) => {
    const title = window.prompt(
      parentSectionId ? "Subsection name" : "Section name",
      parentSectionId ? "New subsection" : "New section",
    );

    if (!title?.trim()) {
      return;
    }

    localDirtyDuringCloudLoadRef.current = true;
    const now = new Date().toISOString();
    const nextSection: ProjectNotePage = {
      id: createId("local-note-section"),
      kind: "section",
      sectionId: null,
      parentSectionId,
      linkedEntityType: "manual",
      linkedEntityId: null,
      systemKey: null,
      title: title.trim(),
      status: "Draft",
      content: "",
      contentType: "markdown",
      markdown: "",
      comments: [],
      sortOrder: pagesRef.current.length,
      createdAt: now,
      updatedAt: now,
    };
    const nextPages = [...pagesRef.current, nextSection];

    pagesRef.current = nextPages;
    setPages(nextPages);
    setExpandedSections((current) => {
      const next = new Set(current);
      next.add(nextSection.id);
      if (parentSectionId) {
        next.add(parentSectionId);
      }
      return next;
    });
    writeCollectionBackup(storageKey, legacyStorageKey, activePageIdRef.current, nextPages);
    setSaveState("saving");
    void createNotePageInApi(projectId, nextSection)
      .then((remotePage) => {
        commitRemotePage(nextSection.id, remotePage);
        localDirtyDuringCloudLoadRef.current = false;
        setSaveState("saved");
      })
      .catch(() => setSaveState("offline"));
  };

  const updatePageOrganization = (pageId: string, patch: Partial<ProjectNotePage>) => {
    const page = pagesRef.current.find((candidate) => candidate.id === pageId);

    if (!page) {
      return;
    }

    localDirtyDuringCloudLoadRef.current = true;
    const updatedAt = new Date().toISOString();
    const nextPage = {
      ...page,
      ...patch,
      updatedAt,
    };
    const nextPages = pagesRef.current.map((candidate) =>
      candidate.id === pageId ? nextPage : candidate,
    );

    pagesRef.current = nextPages;
    setPages(nextPages);
    writeCollectionBackup(storageKey, legacyStorageKey, activePageIdRef.current, nextPages);
    setSaveState("saving");
    void syncPageToCloud(nextPage)
      .then(() => {
        setSaveState("saved");
      })
      .catch(() => setSaveState("offline"));
  };

  const deleteNotePage = (pageId: string) => {
    const noteCount = pagesRef.current.filter((page) => page.kind === "note").length;

    if (noteCount <= 1) {
      toast.error("Keep at least one note page in this project");
      return;
    }

    const page = pagesRef.current.find((candidate) => candidate.id === pageId);
    if (!page || page.kind !== "note" || page.systemKey) {
      return;
    }

    if (!window.confirm(`Delete "${page.title || "Untitled page"}"?`)) {
      return;
    }

    const finishDelete = () => {
      localDirtyDuringCloudLoadRef.current = true;
      const nextPages = pagesRef.current
        .filter((candidate) => candidate.id !== pageId)
        .map((candidate, index) => ({ ...candidate, sortOrder: index }));
      const nextActivePage =
        pageId === activePageIdRef.current
          ? resolveActiveNotePage(nextPages, "")
          : resolveActiveNotePage(nextPages, activePageIdRef.current);

      if (!nextActivePage) {
        return;
      }

      pagesRef.current = nextPages;
      activePageIdRef.current = nextActivePage.id;
      setPages(nextPages);
      setActivePageId(nextActivePage.id);
      const nextMeta = {
        title: nextActivePage.title,
        status: nextActivePage.status,
        comments: nextActivePage.comments,
        updatedAt: nextActivePage.updatedAt,
      };
      noteMetaRef.current = nextMeta;
      setNoteMeta(nextMeta);
      setLastSavedAt(nextActivePage.updatedAt);
      setCommentDraft("");
      writeCollectionBackup(storageKey, legacyStorageKey, nextActivePage.id, nextPages);
      editor?.commands.setContent(nextActivePage.content, {
        emitUpdate: false,
        contentType: nextActivePage.contentType,
      });
    };

    if (!isCloudNotePageId(pageId)) {
      finishDelete();
      return;
    }

    setSaveState("saving");
    void deleteNotePageFromApi(projectId, pageId)
      .then(() => {
        finishDelete();
        setSaveState("saved");
      })
      .catch(() => {
        setSaveState("offline");
        toast.error("Could not delete the note page while offline");
      });
  };

  const setBlockStyle = (style: BlockStyle) => {
    if (!editor) {
      return;
    }

    const chain = editor.chain().focus();

    if (style === "heading1") {
      chain.setHeading({ level: 1 }).run();
      return;
    }

    if (style === "heading2") {
      chain.setHeading({ level: 2 }).run();
      return;
    }

    chain.setParagraph().run();
  };

  const setLink = () => {
    if (!editor) {
      return;
    }

    const previousUrl = String(editor.getAttributes("link").href ?? "");
    const url = window.prompt("Paste a link", previousUrl || "https://");

    if (url === null) {
      return;
    }

    if (!url.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  };

  const insertImageFile = async (file: File) => {
    if (!editor || !file.type.startsWith("image/")) {
      return;
    }

    if (file.size > MAX_EMBEDDED_IMAGE_BYTES) {
      toast.error("Images over 1.5 MB cannot be synced yet");
      return;
    }

    try {
      const src = await readImageFile(file);
      editor.chain().focus().setImage({ src, alt: file.name, title: file.name }).run();
      persistDocument(editor);
    } catch {
      toast.error("Could not attach image");
    }
  };

  const handleImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      void insertImageFile(file);
    }
    event.target.value = "";
  };

  const handleEditorPaste = (event: ReactClipboardEvent<HTMLDivElement>) => {
    const imageFile = Array.from(event.clipboardData.files).find((file) => file.type.startsWith("image/"));

    if (imageFile) {
      event.preventDefault();
      void insertImageFile(imageFile);
      return;
    }

    const text = event.clipboardData.getData("text/plain");

    if (!editor || !looksLikeMarkdownDocument(text)) {
      return;
    }

    event.preventDefault();
    editor.chain().focus().insertContent(text, { contentType: "markdown" }).run();
  };

  const runSlashCommand = (commandId: SlashCommand["id"]) => {
    if (!editor || !slashMenu) {
      return;
    }

    const chain = editor.chain().focus().deleteRange({ from: slashMenu.from, to: slashMenu.to });

    switch (commandId) {
      case "paragraph":
        chain.setParagraph().run();
        break;
      case "heading1":
        chain.setHeading({ level: 1 }).run();
        break;
      case "heading2":
        chain.setHeading({ level: 2 }).run();
        break;
      case "bold":
        chain.toggleBold().run();
        break;
      case "italic":
        chain.toggleItalic().run();
        break;
      case "colorDefault":
        chain.unsetColor().removeEmptyTextStyle().run();
        break;
      case "colorRed":
        chain.setColor(NOTE_TEXT_COLORS.red).run();
        break;
      case "colorOrange":
        chain.setColor(NOTE_TEXT_COLORS.orange).run();
        break;
      case "colorBlue":
        chain.setColor(NOTE_TEXT_COLORS.blue).run();
        break;
      case "colorGreen":
        chain.setColor(NOTE_TEXT_COLORS.green).run();
        break;
      case "colorPurple":
        chain.setColor(NOTE_TEXT_COLORS.purple).run();
        break;
      case "bulletList":
        chain.toggleBulletList().run();
        break;
      case "orderedList":
        chain.toggleOrderedList().run();
        break;
      case "taskList":
        chain.toggleTaskList().run();
        break;
      case "quote":
        chain.toggleBlockquote().run();
        break;
      case "callout":
        chain
          .insertContent({
            type: "blockquote",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Note: " }],
              },
            ],
          })
          .run();
        break;
      case "codeBlock":
        chain.toggleCodeBlock().run();
        break;
      case "divider":
        chain.setHorizontalRule().run();
        break;
      case "image":
        chain.run();
        fileInputRef.current?.click();
        break;
    }

    setSlashMenu(null);
  };

  const handleEditorKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!slashMenu || !filteredSlashCommands.length) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSlashIndex((current) => (current + 1) % filteredSlashCommands.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSlashIndex((current) => (current - 1 + filteredSlashCommands.length) % filteredSlashCommands.length);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      runSlashCommand(filteredSlashCommands[slashIndex]?.id ?? filteredSlashCommands[0].id);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setSlashMenu(null);
    }
  };

  const addComment = () => {
    const body = commentDraft.trim();
    if (!body) {
      return;
    }

    const nextMeta = {
      ...noteMetaRef.current,
      comments: [
        {
          id: createId("comment"),
          author: "You",
          initials: "YO",
          body,
          createdAt: new Date().toISOString(),
        },
        ...noteMetaRef.current.comments,
      ],
    };

    saveMeta(nextMeta);
    setCommentDraft("");
  };

  const copyMarkdown = async () => {
    if (!editor) {
      return;
    }

    try {
      await navigator.clipboard.writeText(editor.getMarkdown());
      toast.success("Markdown copied");
    } catch {
      toast.error("Could not copy Markdown");
    }
  };

  const jumpToHeading = (headingIndex: number) => {
    if (!editor) {
      return;
    }

    const headingsInDocument = editor.view.dom.querySelectorAll("h1, h2");
    headingsInDocument[headingIndex]?.scrollIntoView({ block: "center" });
  };

  const currentBlockStyle = getCurrentBlockStyle(editor);
  const currentTextColor =
    typeof editor?.getAttributes("textStyle").color === "string"
      ? String(editor.getAttributes("textStyle").color)
      : null;
  const writingToolGroups: WritingToolGroup[] = [
    {
      title: "Structure",
      tools: [
        {
          id: "text",
          label: "Text",
          hint: "Set the current block to body text",
          icon: Text,
          active: currentBlockStyle === "paragraph",
          disabled: !editor,
          onRun: () => setBlockStyle("paragraph"),
        },
        {
          id: "heading1",
          label: "Heading 1",
          hint: "Promote the current block",
          icon: Heading1,
          active: currentBlockStyle === "heading1",
          disabled: !editor,
          onRun: () => setBlockStyle("heading1"),
        },
        {
          id: "heading2",
          label: "Heading 2",
          hint: "Create a subsection heading",
          icon: Heading2,
          active: currentBlockStyle === "heading2",
          disabled: !editor,
          onRun: () => setBlockStyle("heading2"),
        },
        {
          id: "divider",
          label: "Divider",
          hint: "Separate sections with a rule",
          icon: Minus,
          disabled: !editor,
          onRun: () => editor?.chain().focus().setHorizontalRule().run(),
        },
      ],
    },
    {
      title: "Format",
      tools: [
        {
          id: "bold",
          label: "Bold",
          hint: "Toggle bold text",
          icon: Bold,
          active: editor?.isActive("bold") ?? false,
          disabled: !editor,
          onRun: () => editor?.chain().focus().toggleBold().run(),
        },
        {
          id: "italic",
          label: "Italic",
          hint: "Toggle italic text",
          icon: Italic,
          active: editor?.isActive("italic") ?? false,
          disabled: !editor,
          onRun: () => editor?.chain().focus().toggleItalic().run(),
        },
        {
          id: "underline",
          label: "Underline",
          hint: "Toggle underline",
          icon: UnderlineIcon,
          active: editor?.isActive("underline") ?? false,
          disabled: !editor,
          onRun: () => editor?.chain().focus().toggleUnderline().run(),
        },
        {
          id: "strike",
          label: "Strikethrough",
          hint: "Toggle strikethrough",
          icon: Strikethrough,
          active: editor?.isActive("strike") ?? false,
          disabled: !editor,
          onRun: () => editor?.chain().focus().toggleStrike().run(),
        },
        {
          id: "inlineCode",
          label: "Inline code",
          hint: "Toggle inline code",
          icon: Code2,
          active: editor?.isActive("code") ?? false,
          disabled: !editor,
          onRun: () => editor?.chain().focus().toggleCode().run(),
        },
      ],
    },
    {
      title: "Lists",
      tools: [
        {
          id: "bulletList",
          label: "Bullets",
          hint: "Toggle a bullet list",
          icon: List,
          active: editor?.isActive("bulletList") ?? false,
          disabled: !editor,
          onRun: () => editor?.chain().focus().toggleBulletList().run(),
        },
        {
          id: "orderedList",
          label: "Numbering",
          hint: "Toggle a numbered list",
          icon: ListOrdered,
          active: editor?.isActive("orderedList") ?? false,
          disabled: !editor,
          onRun: () => editor?.chain().focus().toggleOrderedList().run(),
        },
        {
          id: "taskList",
          label: "Checklist",
          hint: "Track action items",
          icon: CheckSquare,
          active: editor?.isActive("taskList") ?? false,
          disabled: !editor,
          onRun: () => editor?.chain().focus().toggleTaskList().run(),
        },
        {
          id: "quote",
          label: "Quote",
          hint: "Call out supporting context",
          icon: Quote,
          active: editor?.isActive("blockquote") ?? false,
          disabled: !editor,
          onRun: () => editor?.chain().focus().toggleBlockquote().run(),
        },
        {
          id: "callout",
          label: "Callout",
          hint: "Insert a highlighted note",
          icon: MessageSquareQuote,
          disabled: !editor,
          onRun: () =>
            editor
              ?.chain()
              .focus()
              .insertContent({
                type: "blockquote",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Note: " }],
                  },
                ],
              })
              .run(),
        },
      ],
    },
    {
      title: "Insert",
      tools: [
        {
          id: "link",
          label: "Link",
          hint: "Add or edit a link",
          icon: Link2,
          active: editor?.isActive("link") ?? false,
          disabled: !editor,
          onRun: setLink,
        },
        {
          id: "image",
          label: "Image",
          hint: "Attach an image to this note",
          icon: ImagePlus,
          disabled: !editor,
          onRun: () => fileInputRef.current?.click(),
        },
        {
          id: "code",
          label: "Code block",
          hint: "Format a technical snippet",
          icon: Code2,
          active: editor?.isActive("codeBlock") ?? false,
          disabled: !editor,
          onRun: () => editor?.chain().focus().toggleCodeBlock().run(),
        },
        {
          id: "copyMarkdown",
          label: "Copy Markdown",
          hint: "Copy the current note as Markdown",
          icon: ClipboardCopy,
          disabled: !editor,
          onRun: () => {
            void copyMarkdown();
          },
        },
      ],
    },
    {
      title: "Color",
      tools: [
        {
          id: "colorDefault",
          label: "Default color",
          hint: "Remove text color",
          icon: Palette,
          active: Boolean(editor) && !currentTextColor,
          disabled: !editor,
          onRun: () => editor?.chain().focus().unsetColor().removeEmptyTextStyle().run(),
        },
        {
          id: "colorRed",
          label: "Red",
          hint: "Continue typing in red",
          icon: Palette,
          color: NOTE_TEXT_COLORS.red,
          active: currentTextColor === NOTE_TEXT_COLORS.red,
          disabled: !editor,
          onRun: () => editor?.chain().focus().setColor(NOTE_TEXT_COLORS.red).run(),
        },
        {
          id: "colorOrange",
          label: "Orange",
          hint: "Continue typing in orange",
          icon: Palette,
          color: NOTE_TEXT_COLORS.orange,
          active: currentTextColor === NOTE_TEXT_COLORS.orange,
          disabled: !editor,
          onRun: () => editor?.chain().focus().setColor(NOTE_TEXT_COLORS.orange).run(),
        },
        {
          id: "colorBlue",
          label: "Blue",
          hint: "Continue typing in blue",
          icon: Palette,
          color: NOTE_TEXT_COLORS.blue,
          active: currentTextColor === NOTE_TEXT_COLORS.blue,
          disabled: !editor,
          onRun: () => editor?.chain().focus().setColor(NOTE_TEXT_COLORS.blue).run(),
        },
        {
          id: "colorGreen",
          label: "Green",
          hint: "Continue typing in green",
          icon: Palette,
          color: NOTE_TEXT_COLORS.green,
          active: currentTextColor === NOTE_TEXT_COLORS.green,
          disabled: !editor,
          onRun: () => editor?.chain().focus().setColor(NOTE_TEXT_COLORS.green).run(),
        },
        {
          id: "colorPurple",
          label: "Purple",
          hint: "Continue typing in purple",
          icon: Palette,
          color: NOTE_TEXT_COLORS.purple,
          active: currentTextColor === NOTE_TEXT_COLORS.purple,
          disabled: !editor,
          onRun: () => editor?.chain().focus().setColor(NOTE_TEXT_COLORS.purple).run(),
        },
      ],
    },
  ];

  return (
    <div
      data-testid="project-notes"
      className="flex min-h-0 flex-1 flex-col bg-[var(--background)]"
    >
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <main className="min-w-0 flex-1 overflow-y-auto px-3 pb-8 pt-4 sm:px-6 sm:py-6" style={{ scrollbarWidth: "thin" }}>
          <div className="mx-auto max-w-6xl">
            <div className="mb-3 flex items-center gap-2 lg:hidden">
              <Select
                aria-label="Select note page"
                value={activePageId}
                onChange={(event) => selectNotePage(event.target.value)}
                className="h-9 min-w-0 flex-1 rounded-lg text-sm"
              >
                {notePages.map((page) => (
                  <option key={page.id} value={page.id}>
                    {page.title || "Untitled page"}
                  </option>
                ))}
              </Select>
              <button
                type="button"
                aria-label="Create note page"
                onClick={() => createNotePage(null)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)]"
              >
                <Plus className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Toggle notes sidebar"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground-strong)]"
                onClick={() => setShowSidebar((current) => !current)}
              >
                <PanelRight className="h-4 w-4" />
              </button>
            </div>
            <input
              ref={fileInputRef}
              data-testid="project-note-image-input"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />

            <article className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-soft)]">
              <div className="border-b border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-5 sm:px-8 sm:py-7">
                <Input
                  data-testid="project-note-title"
                  value={noteMeta.title}
                  onChange={(event) => handleTitleChange(event.target.value)}
                  className="h-auto border-0 bg-transparent px-0 py-0 text-2xl font-semibold tracking-[-0.03em] text-[var(--foreground-strong)] shadow-none focus:ring-0 sm:text-3xl"
                />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--muted-foreground)]">
                  <div className="flex min-w-0 flex-wrap items-center gap-3">
                    <span className="flex items-center gap-1.5">
                      <CalendarDays className="h-4 w-4" />
                      {formatRelativeDate(lastSavedAt)}
                    </span>
                    <Select
                      aria-label="Note status"
                      value={noteMeta.status}
                      onChange={(event) => handleStatusChange(event.target.value as ProjectNoteDocumentV2["status"])}
                      className="h-7 w-24 rounded-md bg-[var(--surface-muted)] px-2 py-0 text-xs font-medium text-[var(--accent-strong)] shadow-none"
                    >
                      {NOTE_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </Select>
                    <span>{wordCount} words</span>
                    <span>Type / for commands</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 text-[11px] font-medium text-[var(--muted-foreground)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground-strong)]"
                      onClick={copyMarkdown}
                    >
                      <ClipboardCopy className="h-3.5 w-3.5" />
                      Copy Markdown
                    </button>
                    <span className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 text-[11px] font-medium text-[var(--muted-foreground)]">
                      <Save className="h-3.5 w-3.5" />
                      {getNoteSaveLabel(saveState)}
                    </span>
                  </div>
                </div>
              </div>

              <div
                ref={editorShellRef}
                data-notes-editor-shell="true"
                data-testid="project-note-editor"
                className="project-notes-editor relative px-4 py-5 sm:px-8 sm:py-7"
                onKeyDown={handleEditorKeyDown}
                onPaste={handleEditorPaste}
              >
                {editor ? (
                  <>
                    <EditorContent editor={editor} />
                    {slashMenu ? (
                      <SlashCommandMenu
                        commands={filteredSlashCommands}
                        selectedIndex={slashIndex}
                        menu={slashMenu}
                        onRun={runSlashCommand}
                      />
                    ) : null}
                  </>
                ) : (
                  <div className="min-h-[420px] animate-pulse rounded-xl bg-[var(--surface-muted)]" />
                )}
              </div>
            </article>
          </div>
        </main>

        <aside
          className={cn(
            "fixed inset-y-0 right-0 z-[80] min-h-0 shrink-0 border-l border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-float)] lg:relative lg:inset-auto lg:z-auto lg:shadow-none",
            showSidebar
              ? "flex w-[min(84vw,var(--notes-sidebar-width))] lg:w-[var(--notes-sidebar-width)]"
              : "hidden w-12 lg:flex",
          )}
          style={
            showSidebar
              ? ({ "--notes-sidebar-width": `${notesSidebarWidth}px` } as React.CSSProperties)
              : undefined
          }
        >
          {showSidebar ? (
            <button
              type="button"
              data-testid="project-notes-sidebar-resize-handle"
              aria-label="Resize notes sidebar"
              title="Resize notes sidebar"
              onPointerDown={(event) => {
                if (event.button !== 0) {
                  return;
                }

                event.preventDefault();
                setIsResizingNotesSidebar(true);
              }}
              className={cn(
                "absolute inset-y-0 left-0 z-20 hidden w-2 -translate-x-1/2 cursor-col-resize items-center justify-center text-[var(--muted-foreground)] transition hover:text-[var(--foreground-strong)] lg:flex",
                isResizingNotesSidebar && "text-[var(--accent-strong)]",
              )}
            >
              <GripVertical className="h-5 w-3 rounded-full bg-[var(--surface)]" />
            </button>
          ) : null}
          <NotesPanelRail
            activePanel={activeNotesPanel}
            expanded={showSidebar}
            onSelect={(panel) => {
              setActiveNotesPanel(panel);
              setShowSidebar(true);
            }}
            onToggle={() => setShowSidebar((current) => !current)}
          />
          {showSidebar ? (
            <NotesSidebar
              activePanel={activeNotesPanel}
              pages={pages}
              activePageId={activePageId}
              expandedSections={expandedSections}
              outline={headings}
              comments={noteMeta.comments}
              commentDraft={commentDraft}
              writingToolGroups={writingToolGroups}
              onToggleSection={(sectionId) =>
                setExpandedSections((current) => {
                  const next = new Set(current);
                  if (next.has(sectionId)) {
                    next.delete(sectionId);
                  } else {
                    next.add(sectionId);
                  }
                  return next;
                })
              }
              onSelectNote={selectNotePage}
              onCreateNote={createNotePage}
              onCreateSection={createSection}
              onDeleteNote={deleteNotePage}
              onMoveNote={(noteId, sectionId) => updatePageOrganization(noteId, { sectionId })}
              setCommentDraft={setCommentDraft}
              onAddComment={addComment}
              onClose={() => setShowSidebar(false)}
              onJumpToHeading={jumpToHeading}
            />
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function NotesNavigationTree({
  pages,
  activePageId,
  expandedSections,
  searchQuery = "",
  onToggleSection,
  onSelectNote,
  onCreateNote,
  onCreateSection,
  onDeleteNote,
  onMoveNote,
}: {
  pages: ProjectNotePage[];
  activePageId: string;
  expandedSections: Set<string>;
  searchQuery?: string;
  onToggleSection: (sectionId: string) => void;
  onSelectNote: (pageId: string) => void;
  onCreateNote: (sectionId: string | null) => void;
  onCreateSection: (parentSectionId: string | null) => void;
  onDeleteNote: (pageId: string) => void;
  onMoveNote: (pageId: string, sectionId: string | null) => void;
}) {
  const sortedPages = useMemo(
    () => [...pages].sort((a, b) => a.sortOrder - b.sortOrder),
    [pages],
  );
  const notes = sortedPages.filter((page) => page.kind === "note");
  const sections = sortedPages.filter((page) => page.kind === "section");
  const sectionsByParent = new Map<string | null, ProjectNotePage[]>();
  const notesBySection = new Map<string | null, ProjectNotePage[]>();

  for (const section of sections) {
    const parentId = section.parentSectionId ?? null;
    sectionsByParent.set(parentId, [...(sectionsByParent.get(parentId) ?? []), section]);
  }

  for (const note of notes) {
    const sectionId = note.sectionId ?? null;
    notesBySection.set(sectionId, [...(notesBySection.get(sectionId) ?? []), note]);
  }

  const projectDescriptionNotes = (notesBySection.get(null) ?? []).filter(
    (note) => note.systemKey === "project:description",
  );
  const uncategorizedNotes = (notesBySection.get(null) ?? []).filter(
    (note) => note.systemKey !== "project:description",
  );
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const matchesPage = (page: ProjectNotePage) =>
    !normalizedQuery || (page.title || "Untitled page").toLowerCase().includes(normalizedQuery);
  const sectionHasMatch = (section: ProjectNotePage): boolean => {
    if (matchesPage(section)) {
      return true;
    }

    const sectionNotes = notesBySection.get(section.id) ?? [];
    const childSections = sectionsByParent.get(section.id) ?? [];
    return sectionNotes.some(matchesPage) || childSections.some(sectionHasMatch);
  };
  const filteredProjectDescriptionNotes = projectDescriptionNotes.filter(matchesPage);
  const filteredUncategorizedNotes = uncategorizedNotes.filter(matchesPage);
  const rootSections = (sectionsByParent.get(null) ?? []).filter(sectionHasMatch);
  const hasVisibleItems =
    filteredProjectDescriptionNotes.length ||
    rootSections.length ||
    filteredUncategorizedNotes.length;

  const handleDrop = (
    event: React.DragEvent<HTMLDivElement>,
    sectionId: string | null,
  ) => {
    event.preventDefault();
    const noteId = event.dataTransfer.getData("application/x-inflara-note-page");
    const note = notes.find((candidate) => candidate.id === noteId);

    if (note && note.sectionId !== sectionId) {
      onMoveNote(note.id, sectionId);
    }
  };

  const renderNote = (note: ProjectNotePage, depth = 0) => (
    <div
      key={note.id}
      data-note-kind="note"
      data-note-title={note.title || "Untitled page"}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("application/x-inflara-note-page", note.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      className={cn(
        "group flex min-h-8 items-center gap-2 py-1 pr-1 transition",
        note.id === activePageId
          ? "bg-[var(--surface-muted)] text-[var(--foreground-strong)]"
          : "text-[var(--foreground)] hover:bg-[var(--surface-muted)]",
      )}
      style={{ paddingLeft: `${6 + depth * 18}px` }}
    >
      <button
        type="button"
        onClick={() => onSelectNote(note.id)}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <FileText className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
        <span className="truncate text-sm font-medium">
          {note.title || "Untitled page"}
        </span>
      </button>
      <button
        type="button"
        aria-label={`Delete ${note.title || "Untitled page"}`}
        onClick={() => onDeleteNote(note.id)}
        disabled={notes.length <= 1 || Boolean(note.systemKey)}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--muted-foreground)] opacity-0 transition hover:text-[var(--danger)] disabled:cursor-not-allowed disabled:opacity-0 group-hover:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );

  const renderSection = (section: ProjectNotePage, depth = 0): React.ReactNode => {
    const isSearchExpanded = Boolean(normalizedQuery);
    const isExpanded = isSearchExpanded || expandedSections.has(section.id);
    const childSections = sectionsByParent.get(section.id) ?? [];
    const sectionNotes = notesBySection.get(section.id) ?? [];
    const sectionMatchesSelf = matchesPage(section);
    const visibleSectionNotes =
      normalizedQuery && !sectionMatchesSelf ? sectionNotes.filter(matchesPage) : sectionNotes;
    const visibleChildSections =
      normalizedQuery && !sectionMatchesSelf
        ? childSections.filter(sectionHasMatch)
        : childSections;

    return (
      <div key={section.id} className="space-y-0.5">
        <div
          data-note-kind="section"
          data-note-title={section.title}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => handleDrop(event, section.id)}
          className="group flex min-h-8 items-center gap-1 py-1 pr-1 text-[var(--foreground)] transition hover:bg-[var(--surface-muted)]"
          style={{ paddingLeft: `${2 + depth * 18}px` }}
        >
          <button
            type="button"
            aria-label={isExpanded ? `Collapse ${section.title}` : `Expand ${section.title}`}
            onClick={() => onToggleSection(section.id)}
            className="flex h-6 w-6 shrink-0 items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--foreground-strong)]"
          >
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => onToggleSection(section.id)}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            {isExpanded ? (
              <FolderOpen className="h-5 w-5 shrink-0 text-[color:#93c5fd]" />
            ) : (
              <Folder className="h-5 w-5 shrink-0 text-[color:#93c5fd]" />
            )}
            <span className="truncate text-sm font-semibold">{section.title}</span>
          </button>
          <button
            type="button"
            aria-label={`Create note in ${section.title}`}
            title="Create note"
            onClick={() => {
              if (!isExpanded) {
                onToggleSection(section.id);
              }
              onCreateNote(section.id);
            }}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md opacity-0 transition hover:text-[var(--foreground-strong)] group-hover:opacity-100"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label={`Create subsection in ${section.title}`}
            title="Create subsection"
            onClick={() => {
              if (!isExpanded) {
                onToggleSection(section.id);
              }
              onCreateSection(section.id);
            }}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md opacity-0 transition hover:text-[var(--foreground-strong)] group-hover:opacity-100"
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </button>
        </div>
        {isExpanded ? (
          <div
            className={cn(
              "space-y-0.5",
              depth === 0 && "ml-6 border-l border-[var(--border-strong)] pl-1.5",
            )}
          >
            {visibleSectionNotes.map((note) => renderNote(note, depth + 1))}
            {visibleChildSections.map((child) => renderSection(child, depth + 1))}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div
      className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1"
      style={{ scrollbarWidth: "thin" }}
    >
      {hasVisibleItems ? (
        <>
          {filteredProjectDescriptionNotes.map((note) => renderNote(note))}
          {rootSections.map((section) => renderSection(section))}
          {(!normalizedQuery || filteredUncategorizedNotes.length) ? (
            <div
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => handleDrop(event, null)}
              className="mt-2 p-1"
            >
              <div className="flex min-h-8 items-center gap-2 px-1 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                <Folder className="h-4 w-4 text-[color:#93c5fd]" />
                Uncategorized
              </div>
              <div className="space-y-0.5">
                {filteredUncategorizedNotes.length ? (
                  filteredUncategorizedNotes.map((note) => renderNote(note, 1))
                ) : (
                  <p className="px-2 py-1.5 text-xs text-[var(--muted-foreground)]">
                    No uncategorized notes.
                  </p>
                )}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <p className="rounded-lg border border-dashed border-[var(--border)] px-3 py-2 text-xs leading-5 text-[var(--muted-foreground)]">
          No notes match that search.
        </p>
      )}
    </div>
  );
}

function SlashCommandMenu({
  commands,
  selectedIndex,
  menu,
  onRun,
}: {
  commands: ReadonlyArray<SlashCommand>;
  selectedIndex: number;
  menu: SlashMenuState;
  onRun: (commandId: SlashCommand["id"]) => void;
}) {
  if (!commands.length) {
    return null;
  }

  return (
    <div
      data-testid="notes-slash-menu"
      className="absolute z-20 w-64 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-1.5 shadow-[var(--shadow-float)]"
      style={{ top: menu.top, left: menu.left }}
    >
      {commands.map((command, index) => {
        const Icon = command.icon;

        return (
          <button
            key={command.id}
            type="button"
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition",
              index === selectedIndex
                ? "bg-[var(--surface-muted)] text-[var(--foreground-strong)]"
                : "text-[var(--muted-foreground)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground-strong)]",
            )}
            onMouseDown={(event) => {
              event.preventDefault();
              onRun(command.id);
            }}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)]">
              {command.color ? (
                <span
                  aria-hidden="true"
                  className="h-4 w-4 rounded-full border border-black/10 shadow-sm dark:border-white/20"
                  style={{ backgroundColor: command.color }}
                />
              ) : (
                <Icon className="h-4 w-4" />
              )}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{command.label}</span>
              <span className="block truncate text-xs opacity-75">{command.hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function NotesPanelRail({
  activePanel,
  expanded,
  onSelect,
  onToggle,
}: {
  activePanel: NotesPanel;
  expanded: boolean;
  onSelect: (panel: NotesPanel) => void;
  onToggle: () => void;
}) {
  const items: Array<{
    id: NotesPanel;
    label: string;
    icon: LucideIcon;
  }> = [
    { id: "folders", label: "Show folder structure", icon: FolderOpen },
    { id: "tools", label: "Show writing tools", icon: NotebookPen },
    { id: "outline", label: "Show outline", icon: ListTree },
    { id: "comments", label: "Show comments", icon: MessageSquare },
    { id: "collaboration", label: "Show collaboration", icon: Users },
  ];

  return (
    <div className="flex w-12 shrink-0 flex-col items-center gap-2 border-r border-[var(--border)] bg-[var(--surface-muted)]/80 px-1.5 py-3">
      <button
        type="button"
        aria-label={expanded ? "Collapse notes sidebar" : "Expand notes sidebar"}
        title={expanded ? "Collapse sidebar" : "Expand sidebar"}
        onClick={onToggle}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground-strong)]"
      >
        <PanelRight className={cn("h-4 w-4 transition-transform", !expanded && "rotate-180")} />
      </button>
      <span className="h-px w-7 bg-[var(--border)]" />
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = activePanel === item.id && expanded;

        return (
          <button
            key={item.id}
            type="button"
            aria-label={item.label}
            title={item.label.replace("Show ", "")}
            onClick={() => onSelect(item.id)}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg transition",
              isActive
                ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                : "text-[var(--muted-foreground)] hover:bg-[var(--surface)] hover:text-[var(--foreground-strong)]",
            )}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}

function WritingToolButton({ tool }: { tool: WritingTool }) {
  const Icon = tool.icon;
  const tooltipId = `project-note-writing-tool-tooltip-${tool.id}`;

  return (
    <button
      type="button"
      data-testid={`project-note-writing-tool-${tool.id}`}
      aria-label={`${tool.label}: ${tool.hint}`}
      aria-describedby={tooltipId}
      title={`${tool.label}: ${tool.hint}`}
      disabled={tool.disabled}
      onClick={tool.onRun}
      className={cn(
        "group/tool relative flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--muted-foreground)] shadow-[var(--shadow-soft)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface)] hover:text-[var(--foreground-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-45",
        tool.active && "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-strong)]",
      )}
    >
      <Icon className="h-4 w-4" style={tool.color ? { color: tool.color } : undefined} />
      {tool.color ? (
        <span
          aria-hidden="true"
          className="absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full border border-[var(--surface)]"
          style={{ backgroundColor: tool.color }}
        />
      ) : null}
      <span
        id={tooltipId}
        data-testid={tooltipId}
        role="tooltip"
        className="invisible absolute left-1/2 top-full z-30 mt-2 w-max max-w-48 -translate-x-1/2 rounded-md border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1.5 text-left opacity-0 shadow-[var(--shadow-float)] transition group-hover/tool:visible group-hover/tool:opacity-100 group-focus-visible/tool:visible group-focus-visible/tool:opacity-100"
      >
        <span className="block whitespace-nowrap text-[11px] font-semibold leading-4 text-[var(--foreground-strong)]">
          {tool.label}
        </span>
        <span className="block max-w-44 whitespace-normal text-[10px] leading-4 text-[var(--muted-foreground)]">
          {tool.hint}
        </span>
      </span>
    </button>
  );
}

function NotesSidebar({
  activePanel,
  pages,
  activePageId,
  expandedSections,
  outline,
  comments,
  commentDraft,
  writingToolGroups,
  onToggleSection,
  onSelectNote,
  onCreateNote,
  onCreateSection,
  onDeleteNote,
  onMoveNote,
  setCommentDraft,
  onAddComment,
  onClose,
  onJumpToHeading,
}: {
  activePanel: NotesPanel;
  pages: ProjectNotePage[];
  activePageId: string;
  expandedSections: Set<string>;
  outline: NoteHeading[];
  comments: NoteComment[];
  commentDraft: string;
  writingToolGroups: WritingToolGroup[];
  onToggleSection: (sectionId: string) => void;
  onSelectNote: (pageId: string) => void;
  onCreateNote: (sectionId: string | null) => void;
  onCreateSection: (parentSectionId: string | null) => void;
  onDeleteNote: (pageId: string) => void;
  onMoveNote: (pageId: string, sectionId: string | null) => void;
  setCommentDraft: (value: string) => void;
  onAddComment: () => void;
  onClose: () => void;
  onJumpToHeading: (headingIndex: number) => void;
}) {
  const [folderSearch, setFolderSearch] = useState("");
  const title =
    activePanel === "folders"
      ? "Folder Structure"
      : activePanel === "tools"
      ? "Writing tools"
      : activePanel === "collaboration"
      ? "Collaboration"
      : activePanel === "outline"
        ? "Outline"
        : "Comments";
  const HeaderIcon =
    activePanel === "folders"
      ? FolderOpen
    : activePanel === "tools"
      ? NotebookPen
      : activePanel === "collaboration"
      ? Users
      : activePanel === "outline"
        ? ListTree
        : MessageSquare;

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <HeaderIcon className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
          <h2 className="truncate text-sm font-semibold text-[var(--foreground-strong)]">
            {title}
          </h2>
        </div>
        <button
          type="button"
          aria-label="Collapse notes sidebar"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground-strong)]"
        >
          <PanelRight className="h-4 w-4" />
        </button>
      </div>

      {activePanel === "folders" ? (
        <div
          data-testid="project-note-folder-structure"
          className="flex min-h-0 flex-1 flex-col px-3 py-3"
        >
          <div className="mb-3 grid gap-2">
            <div className="flex items-center gap-1.5">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted-foreground)]" />
                <Input
                  data-testid="project-note-folder-search"
                  value={folderSearch}
                  onChange={(event) => setFolderSearch(event.target.value)}
                  placeholder="Type to search"
                  className="h-9 rounded-md border-[var(--border-strong)] bg-[var(--surface)] pl-8 pr-2 text-sm shadow-none"
                />
              </div>
              <button
                type="button"
                aria-label="Clear folder search"
                title="Clear search"
                disabled={!folderSearch}
                onClick={() => setFolderSearch("")}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground-strong)] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <SlidersHorizontal className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Create section"
                title="Create section"
                onClick={() => onCreateSection(null)}
                className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-[11px] font-medium text-[var(--muted-foreground)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground-strong)]"
              >
                <FolderPlus className="h-3.5 w-3.5" />
                Section
              </button>
              <button
                type="button"
                aria-label="Create note page"
                title="Create note"
                onClick={() => onCreateNote(null)}
                className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-[11px] font-medium text-[var(--muted-foreground)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground-strong)]"
              >
                <Plus className="h-3.5 w-3.5" />
                Note
              </button>
            </div>
          </div>
          <NotesNavigationTree
            pages={pages}
            activePageId={activePageId}
            expandedSections={expandedSections}
            searchQuery={folderSearch}
            onToggleSection={onToggleSection}
            onSelectNote={onSelectNote}
            onCreateNote={onCreateNote}
            onCreateSection={onCreateSection}
            onDeleteNote={onDeleteNote}
            onMoveNote={onMoveNote}
          />
        </div>
      ) : null}

      {activePanel === "tools" ? (
        <div
          data-testid="project-note-writing-tools"
          className="min-h-0 flex-1 overflow-y-auto px-3 py-3"
          style={{ scrollbarWidth: "thin" }}
        >
          <div className="grid gap-3">
            {writingToolGroups.map((group) => (
              <section
                key={group.title}
                className="grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)]/55 px-2.5 py-2.5"
              >
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  {group.title}
                </p>
                <div className="grid grid-cols-5 gap-1.5">
                  {group.tools.map((tool) => (
                    <WritingToolButton key={tool.id} tool={tool} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      ) : null}

      {activePanel === "collaboration" ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4" style={{ scrollbarWidth: "thin" }}>
          <p className="text-[11px] font-semibold uppercase text-[var(--muted-foreground)]">
            Active now
          </p>
          <div className="mt-3 flex items-center">
            {[
              ["JD", "bg-[color:#dbeafe] text-[color:#1d4ed8]"],
              ["AL", "bg-[color:#dcfce7] text-[color:#15803d]"],
              ["+2", "bg-[var(--surface-muted)] text-[var(--foreground-strong)]"],
            ].map(([label, className], index) => (
              <span
                key={label}
                className={cn(
                  "-ml-2 flex h-9 w-9 items-center justify-center rounded-full border-2 border-[var(--surface)] text-xs font-semibold first:ml-0",
                  className,
                )}
                style={{ zIndex: 3 - index }}
              >
                {label}
              </span>
            ))}
          </div>
          <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3">
            <p className="text-xs font-semibold text-[var(--foreground-strong)]">Project collaborators</p>
            <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">
              People shown here can review notes and comments for this project.
            </p>
          </div>
        </div>
      ) : null}

      {activePanel === "outline" ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4" style={{ scrollbarWidth: "thin" }}>
          <div className="grid gap-1">
            {outline.length ? (
              outline.map((heading) => (
                <button
                  key={`${heading.index}-${heading.text}`}
                  type="button"
                  className={cn(
                    "truncate rounded-lg px-2 py-1.5 text-left text-xs text-[var(--muted-foreground)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground-strong)]",
                    heading.level === 2 && "pl-5",
                  )}
                  onClick={() => onJumpToHeading(heading.index)}
                >
                  {heading.text}
                </button>
              ))
            ) : (
              <p className="text-xs leading-5 text-[var(--muted-foreground)]">
                A document outline will appear when you add headings.
              </p>
            )}
          </div>
        </div>
      ) : null}

      {activePanel === "comments" ? (
        <div className="flex min-h-0 flex-1 flex-col px-4 py-4">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1" style={{ scrollbarWidth: "thin" }}>
            {comments.length ? (
              comments.map((comment) => (
                <article
                  key={comment.id}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--foreground-strong)] text-[10px] font-semibold text-[var(--surface)]">
                        {comment.initials}
                      </span>
                      <p className="truncate text-xs font-semibold text-[var(--foreground-strong)]">
                        {comment.author}
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] text-[var(--muted-foreground)]">
                      {formatRelativeDate(comment.createdAt)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">
                    {comment.body}
                  </p>
                </article>
              ))
            ) : (
              <p className="rounded-xl border border-dashed border-[var(--border)] p-3 text-xs leading-5 text-[var(--muted-foreground)]">
                No comments yet.
              </p>
            )}
          </div>
          <div className="mt-4 shrink-0 border-t border-[var(--border)] pt-4">
            <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2">
              <Input
                data-testid="project-note-comment-input"
                value={commentDraft}
                onChange={(event) => setCommentDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onAddComment();
                  }
                }}
                placeholder="Add a comment..."
                className="h-8 border-0 bg-transparent px-0 text-xs shadow-none focus:ring-0"
              />
              <button
                type="button"
                aria-label="Send comment"
                onClick={onAddComment}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--accent-strong)] transition hover:bg-[var(--accent-soft)]"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
