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
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
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
  CheckSquare,
  ClipboardCopy,
  Code2,
  Heading1,
  Heading2,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  MessageSquare,
  PanelRight,
  Quote,
  Save,
  Send,
  Sparkles,
  Strikethrough,
  Text,
  Underline as UnderlineIcon,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { ProjectPlan } from "@/lib/planner/types";
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

type NoteMeta = Pick<ProjectNoteDocumentV2, "title" | "status" | "comments" | "updatedAt">;

type LoadedNoteDocument = NoteMeta & {
  source: "default" | "v1" | "v2";
  content: JSONContent | string;
  contentType: "json" | "markdown";
};

type NoteHeading = {
  index: number;
  level: 1 | 2;
  text: string;
};

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

type BlockStyle = "paragraph" | "heading1" | "heading2";

const NOTE_STATUSES: ProjectNoteDocumentV2["status"][] = ["Draft", "Shared", "Final"];

const editorExtensions = [
  StarterKit.configure({
    link: false,
    underline: false,
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

const slashCommands = [
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
    icon: Sparkles,
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
    icon: PanelRight,
    keywords: "divider rule line",
  },
  {
    id: "image",
    label: "Image",
    hint: "Attach a picture",
    icon: ImagePlus,
    keywords: "image photo attachment picture",
  },
] as const;

type SlashCommand = (typeof slashCommands)[number];

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function storageKeyForProject(projectId: string, version: 1 | 2) {
  return `inflara:project-notes:${projectId}:v${version}`;
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
  const loadedDocument = useMemo(() => loadDocumentFromStorage(projectPlan), [projectPlan]);
  const storageKey = storageKeyForProject(projectPlan.project.id, 2);
  const [noteMeta, setNoteMeta] = useState<NoteMeta>({
    title: loadedDocument.title,
    status: loadedDocument.status,
    comments: loadedDocument.comments,
    updatedAt: loadedDocument.updatedAt,
  });
  const noteMetaRef = useRef(noteMeta);
  const [commentDraft, setCommentDraft] = useState("");
  const [showSidebar, setShowSidebar] = useState(() =>
    typeof window === "undefined" ? true : window.matchMedia("(min-width: 1280px)").matches,
  );
  const [wordCount, setWordCount] = useState(0);
  const [headings, setHeadings] = useState<NoteHeading[]>([]);
  const [lastSavedAt, setLastSavedAt] = useState(loadedDocument.updatedAt);
  const [slashMenu, setSlashMenu] = useState<SlashMenuState | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const editorShellRef = useRef<HTMLDivElement | null>(null);
  const persistTimerRef = useRef<number | null>(null);
  const didPersistMigrationRef = useRef(loadedDocument.source === "v2");

  useEffect(() => {
    noteMetaRef.current = noteMeta;
  }, [noteMeta]);

  const editor = useEditor(
    {
      extensions: editorExtensions,
      content: loadedDocument.content,
      contentType: loadedDocument.contentType,
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

  const persistDocument = useCallback(
    (editorInstance: Editor | null, metaSnapshot: NoteMeta = noteMetaRef.current) => {
      if (!editorInstance || typeof window === "undefined") {
        return;
      }

      const updatedAt = new Date().toISOString();
      const saved: ProjectNoteDocumentV2 = {
        version: 2,
        ...metaSnapshot,
        updatedAt,
        content: editorInstance.getJSON(),
        markdown: editorInstance.getMarkdown(),
      };

      window.localStorage.setItem(storageKey, JSON.stringify(saved));
      setLastSavedAt(updatedAt);
      setNoteMeta((current) => ({ ...current, updatedAt }));
    },
    [storageKey],
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

    if (!didPersistMigrationRef.current) {
      persistDocument(editor);
      didPersistMigrationRef.current = true;
    }

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
    noteMetaRef.current = nextMeta;
    setNoteMeta(nextMeta);
    schedulePersist(nextMeta);
  };

  const handleTitleChange = (title: string) => {
    saveMeta({ ...noteMetaRef.current, title });
  };

  const handleStatusChange = (status: ProjectNoteDocumentV2["status"]) => {
    saveMeta({ ...noteMetaRef.current, status });
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

    if (!imageFile) {
      return;
    }

    event.preventDefault();
    void insertImageFile(imageFile);
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

  return (
    <div
      data-testid="project-notes"
      className="flex min-h-0 flex-1 flex-col bg-[var(--background)]"
    >
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <main className="min-w-0 flex-1 overflow-y-auto px-6 py-6" style={{ scrollbarWidth: "thin" }}>
          <div className="mx-auto max-w-5xl">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 shadow-[var(--shadow-soft)]">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Select
                  aria-label="Block style"
                  value={getCurrentBlockStyle(editor)}
                  onChange={(event) => setBlockStyle(event.target.value as BlockStyle)}
                  className="h-8 w-36 rounded-lg text-xs shadow-none"
                >
                  <option value="paragraph">Text</option>
                  <option value="heading1">Heading 1</option>
                  <option value="heading2">Heading 2</option>
                </Select>
                <ToolbarButton label="Bold" active={editor?.isActive("bold")} onClick={() => editor?.chain().focus().toggleBold().run()}>
                  <Bold className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton label="Italic" active={editor?.isActive("italic")} onClick={() => editor?.chain().focus().toggleItalic().run()}>
                  <Italic className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton label="Underline" active={editor?.isActive("underline")} onClick={() => editor?.chain().focus().toggleUnderline().run()}>
                  <UnderlineIcon className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton label="Strikethrough" active={editor?.isActive("strike")} onClick={() => editor?.chain().focus().toggleStrike().run()}>
                  <Strikethrough className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarDivider />
                <ToolbarButton label="Bullet list" active={editor?.isActive("bulletList")} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
                  <List className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton label="Numbered list" active={editor?.isActive("orderedList")} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
                  <ListOrdered className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton label="Checklist" active={editor?.isActive("taskList")} onClick={() => editor?.chain().focus().toggleTaskList().run()}>
                  <CheckSquare className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton label="Quote" active={editor?.isActive("blockquote")} onClick={() => editor?.chain().focus().toggleBlockquote().run()}>
                  <Quote className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton label="Inline code" active={editor?.isActive("code")} onClick={() => editor?.chain().focus().toggleCode().run()}>
                  <Code2 className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarDivider />
                <ToolbarButton label="Link" active={editor?.isActive("link")} onClick={setLink}>
                  <Link2 className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton label="Attach image" onClick={() => fileInputRef.current?.click()}>
                  <ImagePlus className="h-4 w-4" />
                </ToolbarButton>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="hidden h-8 items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 text-[11px] font-medium text-[var(--muted-foreground)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground-strong)] sm:flex"
                  onClick={copyMarkdown}
                >
                  <ClipboardCopy className="h-3.5 w-3.5" />
                  Copy Markdown
                </button>
                <span className="hidden items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] font-medium text-[var(--muted-foreground)] sm:flex">
                  <Save className="h-3.5 w-3.5" />
                  Saved
                </span>
                <button
                  type="button"
                  aria-label="Toggle notes sidebar"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground-strong)] xl:hidden"
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
            </div>

            <article className="rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-soft)]">
              <div className="border-b border-[var(--border)] px-8 py-7">
                <Input
                  data-testid="project-note-title"
                  value={noteMeta.title}
                  onChange={(event) => handleTitleChange(event.target.value)}
                  className="h-auto border-0 bg-transparent px-0 py-0 text-3xl font-semibold tracking-[-0.03em] text-[var(--foreground-strong)] shadow-none focus:ring-0"
                />
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[var(--muted-foreground)]">
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
              </div>

              <div
                ref={editorShellRef}
                data-notes-editor-shell="true"
                data-testid="project-note-editor"
                className="project-notes-editor relative px-8 py-7"
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

        {showSidebar ? (
          <aside className="fixed inset-y-0 right-0 z-[80] flex w-[320px] shrink-0 flex-col border-l border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-float)] xl:static xl:z-auto xl:shadow-none">
            <NotesSidebar
              outline={headings}
              comments={noteMeta.comments}
              commentDraft={commentDraft}
              setCommentDraft={setCommentDraft}
              onAddComment={addComment}
              onClose={() => setShowSidebar(false)}
              onJumpToHeading={jumpToHeading}
            />
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function ToolbarButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground-strong)]",
        active && "bg-[var(--surface-muted)] text-[var(--foreground-strong)]",
      )}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <span className="mx-1 h-5 w-px bg-[var(--border)]" />;
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
              <Icon className="h-4 w-4" />
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

function NotesSidebar({
  outline,
  comments,
  commentDraft,
  setCommentDraft,
  onAddComment,
  onClose,
  onJumpToHeading,
}: {
  outline: NoteHeading[];
  comments: NoteComment[];
  commentDraft: string;
  setCommentDraft: (value: string) => void;
  onAddComment: () => void;
  onClose: () => void;
  onJumpToHeading: (headingIndex: number) => void;
}) {
  return (
    <>
      <div className="border-b border-[var(--border)] p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[var(--foreground-strong)]">Collaboration</h2>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-[var(--muted-foreground)]" />
            <button
              type="button"
              aria-label="Close notes sidebar"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground-strong)] xl:hidden"
            >
              x
            </button>
          </div>
        </div>
        <p className="mt-5 text-[11px] font-semibold uppercase text-[var(--muted-foreground)]">
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
      </div>

      <div className="border-b border-[var(--border)] p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[var(--foreground-strong)]">Outline</h2>
          <PanelRight className="h-4 w-4 text-[var(--muted-foreground)]" />
        </div>
        <div className="mt-3 grid gap-1">
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
            <p className="text-xs leading-5 text-[var(--muted-foreground)]">No sections yet.</p>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[var(--foreground-strong)]">Comments</h2>
          <MessageSquare className="h-4 w-4 text-[var(--muted-foreground)]" />
        </div>
        <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1" style={{ scrollbarWidth: "thin" }}>
          {comments.map((comment) => (
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
          ))}
        </div>
        <div className="mt-4 border-t border-[var(--border)] pt-4">
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
    </>
  );
}
