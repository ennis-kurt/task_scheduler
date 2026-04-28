"use client";

import {
  type ChangeEvent,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlignLeft,
  CalendarDays,
  CheckSquare,
  Code2,
  Heading1,
  Heading2,
  ImagePlus,
  List,
  MessageSquare,
  PanelRight,
  Quote,
  Save,
  Send,
  Sparkles,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
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

type NoteBlock = {
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

type ProjectNoteDocument = {
  title: string;
  status: "Draft" | "Shared" | "Final";
  blocks: NoteBlock[];
  comments: NoteComment[];
  updatedAt: string;
};

type ProjectNotesNotebookProps = {
  projectPlan: ProjectPlan;
};

const BLOCK_OPTIONS: Array<{ value: NoteBlockType; label: string }> = [
  { value: "paragraph", label: "Text" },
  { value: "heading1", label: "Heading 1" },
  { value: "heading2", label: "Heading 2" },
  { value: "bulleted", label: "Bullet list" },
  { value: "numbered", label: "Numbered list" },
  { value: "todo", label: "Checklist" },
  { value: "quote", label: "Quote" },
  { value: "callout", label: "Callout" },
  { value: "code", label: "Code" },
];

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createBlock(type: NoteBlockType = "paragraph", text = ""): NoteBlock {
  return {
    id: createId("note-block"),
    type,
    text,
    checked: false,
  };
}

function storageKeyForProject(projectId: string) {
  return `inflara:project-notes:${projectId}:v1`;
}

function defaultDocument(projectPlan: ProjectPlan): ProjectNoteDocument {
  const firstMilestone = projectPlan.plottedMilestones[0];
  const secondMilestone = projectPlan.plottedMilestones[1];

  return {
    title: `${projectPlan.project.name} Notes`,
    status: "Draft",
    updatedAt: new Date().toISOString(),
    comments: [
      {
        id: "comment-architecture",
        author: "Project Lead",
        initials: "PL",
        body: "Keep the key decisions close to the milestone plan so planning and context stay together.",
        createdAt: new Date().toISOString(),
      },
    ],
    blocks: [
      createBlock("heading1", `${projectPlan.project.name} Working Notes`),
      createBlock(
        "paragraph",
        "Capture decisions, research, risks, and handoff context for the current project.",
      ),
      createBlock("heading2", firstMilestone?.name ?? "Current Focus"),
      createBlock(
        "bulleted",
        firstMilestone?.description || "Clarify the next delivery checkpoint and open questions.",
      ),
      createBlock("todo", secondMilestone ? `Review ${secondMilestone.name}` : "Review open risks"),
      createBlock(
        "callout",
        `${projectPlan.totalTaskCount} tasks are connected to this project. ${projectPlan.completedTaskCount} are complete.`,
      ),
    ],
  };
}

function normalizeDocument(value: unknown, projectPlan: ProjectPlan): ProjectNoteDocument {
  if (!value || typeof value !== "object") {
    return defaultDocument(projectPlan);
  }

  const raw = value as Partial<ProjectNoteDocument>;
  const blocks = Array.isArray(raw.blocks)
    ? raw.blocks
        .filter((block): block is NoteBlock => {
          if (!block || typeof block !== "object") {
            return false;
          }
          const candidate = block as Partial<NoteBlock>;
          return typeof candidate.id === "string" && typeof candidate.text === "string";
        })
        .map((block) => ({
          ...block,
          type: BLOCK_OPTIONS.some((option) => option.value === block.type) || block.type === "image"
            ? block.type
            : "paragraph",
        }))
    : [];

  return {
    title:
      typeof raw.title === "string" && raw.title.trim()
        ? raw.title
        : `${projectPlan.project.name} Notes`,
    status: raw.status === "Shared" || raw.status === "Final" ? raw.status : "Draft",
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
    blocks: blocks.length ? blocks : defaultDocument(projectPlan).blocks,
    comments: Array.isArray(raw.comments)
      ? raw.comments.filter(
          (comment): comment is NoteComment =>
            Boolean(comment) &&
            typeof comment.id === "string" &&
            typeof comment.author === "string" &&
            typeof comment.body === "string",
        )
      : [],
  };
}

function loadDocumentFromStorage(projectPlan: ProjectPlan) {
  if (typeof window === "undefined") {
    return defaultDocument(projectPlan);
  }

  try {
    const saved = window.localStorage.getItem(storageKeyForProject(projectPlan.project.id));
    return normalizeDocument(saved ? JSON.parse(saved) : null, projectPlan);
  } catch {
    return defaultDocument(projectPlan);
  }
}

function parseMarkdownShortcut(text: string, currentType: NoteBlockType) {
  const rules: Array<[RegExp, NoteBlockType]> = [
    [/^#\s+(.+)/, "heading1"],
    [/^##\s+(.+)/, "heading2"],
    [/^[-*]\s+(.+)/, "bulleted"],
    [/^\d+\.\s+(.+)/, "numbered"],
    [/^\[\s?\]\s+(.+)/, "todo"],
    [/^>\s+(.+)/, "quote"],
    [/^!\s+(.+)/, "callout"],
    [/^```\s*(.*)/, "code"],
  ];

  for (const [pattern, type] of rules) {
    const match = pattern.exec(text);
    if (match) {
      return { type, text: match[1] ?? "" };
    }
  }

  return { type: currentType, text };
}

function nextBlockType(currentType: NoteBlockType) {
  if (currentType === "bulleted" || currentType === "numbered" || currentType === "todo") {
    return currentType;
  }

  return "paragraph";
}

function countWords(blocks: NoteBlock[]) {
  return blocks
    .filter((block) => block.type !== "image")
    .flatMap((block) => block.text.trim().split(/\s+/).filter(Boolean))
    .length;
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

function getBlockPlaceholder(type: NoteBlockType) {
  switch (type) {
    case "heading1":
      return "Heading";
    case "heading2":
      return "Section";
    case "bulleted":
      return "List item";
    case "numbered":
      return "Numbered item";
    case "todo":
      return "Checklist item";
    case "quote":
      return "Quote";
    case "callout":
      return "Note";
    case "code":
      return "Code";
    default:
      return "Write a note...";
  }
}

function BlockIcon({ type }: { type: NoteBlockType }) {
  if (type === "heading1") return <Heading1 className="h-4 w-4" />;
  if (type === "heading2") return <Heading2 className="h-4 w-4" />;
  if (type === "bulleted" || type === "numbered") return <List className="h-4 w-4" />;
  if (type === "todo") return <CheckSquare className="h-4 w-4" />;
  if (type === "quote") return <Quote className="h-4 w-4" />;
  if (type === "code") return <Code2 className="h-4 w-4" />;
  if (type === "image") return <ImagePlus className="h-4 w-4" />;
  if (type === "callout") return <Sparkles className="h-4 w-4" />;
  return <AlignLeft className="h-4 w-4" />;
}

function blockClassName(type: NoteBlockType) {
  switch (type) {
    case "heading1":
      return "min-h-11 text-3xl font-semibold leading-tight tracking-[-0.03em] text-[var(--foreground-strong)]";
    case "heading2":
      return "min-h-9 text-xl font-semibold leading-snug tracking-[-0.02em] text-[var(--foreground-strong)]";
    case "bulleted":
    case "numbered":
    case "todo":
      return "min-h-8 text-sm leading-7 text-[var(--foreground-strong)]";
    case "quote":
      return "min-h-10 border-l-2 border-[var(--accent)] pl-4 text-base leading-7 text-[var(--muted-foreground)]";
    case "callout":
      return "min-h-12 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 text-sm leading-6 text-[var(--foreground)]";
    case "code":
      return "min-h-14 rounded-xl border border-[var(--border)] bg-[color:rgba(15,23,42,0.06)] px-4 py-3 font-mono text-[13px] leading-6 text-[var(--foreground)] dark:bg-[color:rgba(255,255,255,0.06)]";
    default:
      return "min-h-8 text-base leading-8 text-[var(--foreground)]";
  }
}

export function ProjectNotesNotebook({ projectPlan }: ProjectNotesNotebookProps) {
  const storageKey = storageKeyForProject(projectPlan.project.id);
  const [documentState, setDocumentState] = useState<ProjectNoteDocument>(() =>
    loadDocumentFromStorage(projectPlan),
  );
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [showSidebar, setShowSidebar] = useState(() =>
    typeof window === "undefined" ? true : window.matchMedia("(min-width: 1280px)").matches,
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const blockRefs = useRef<Record<string, HTMLElement | null>>({});
  const pendingFocusRef = useRef<string | null>(null);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(documentState));
  }, [documentState, storageKey]);

  useEffect(() => {
    const pendingId = pendingFocusRef.current;
    if (!pendingId) {
      return;
    }

    window.requestAnimationFrame(() => {
      blockRefs.current[pendingId]?.focus();
      pendingFocusRef.current = null;
    });
  }, [documentState.blocks]);

  const activeBlock = documentState.blocks.find((block) => block.id === activeBlockId) ?? null;
  const outline = useMemo(
    () =>
      documentState.blocks.filter(
        (block) => (block.type === "heading1" || block.type === "heading2") && block.text.trim(),
      ),
    [documentState.blocks],
  );
  const wordCount = useMemo(() => countWords(documentState.blocks), [documentState.blocks]);

  const updateDocument = (updater: (current: ProjectNoteDocument) => ProjectNoteDocument) => {
    setDocumentState((current) => ({
      ...updater(current),
      updatedAt: new Date().toISOString(),
    }));
  };

  const updateBlock = (blockId: string, patch: Partial<NoteBlock>) => {
    updateDocument((current) => ({
      ...current,
      blocks: current.blocks.map((block) =>
        block.id === blockId ? { ...block, ...patch } : block,
      ),
    }));
  };

  const insertBlockAfter = (blockId: string, type: NoteBlockType = "paragraph") => {
    const nextBlock = createBlock(type);
    pendingFocusRef.current = nextBlock.id;
    updateDocument((current) => {
      const index = current.blocks.findIndex((block) => block.id === blockId);

      if (index < 0) {
        return { ...current, blocks: [...current.blocks, nextBlock] };
      }

      const blocks = [...current.blocks];
      blocks.splice(index + 1, 0, nextBlock);
      return { ...current, blocks };
    });
  };

  const deleteEmptyBlock = (blockId: string) => {
    if (documentState.blocks.length <= 1) {
      return;
    }

    const index = documentState.blocks.findIndex((block) => block.id === blockId);
    const previous = documentState.blocks[Math.max(index - 1, 0)];
    pendingFocusRef.current = previous?.id ?? null;

    updateDocument((current) => ({
      ...current,
      blocks: current.blocks.filter((block) => block.id !== blockId),
    }));
  };

  const setBlockType = (type: NoteBlockType) => {
    if (!activeBlock) {
      return;
    }

    updateBlock(activeBlock.id, { type });
  };

  const handleBlockInput = (block: NoteBlock, text: string) => {
    const normalized = parseMarkdownShortcut(text, block.type);
    updateBlock(block.id, normalized);
  };

  const handleBlockKeyDown = (event: KeyboardEvent<HTMLElement>, block: NoteBlock) => {
    if (event.key === "Enter" && !event.shiftKey && block.type !== "code") {
      event.preventDefault();
      insertBlockAfter(block.id, nextBlockType(block.type));
      return;
    }

    if (event.key === "Backspace" && !block.text.trim() && block.type !== "image") {
      event.preventDefault();
      deleteEmptyBlock(block.id);
    }
  };

  const handleImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const imageBlock: NoteBlock = {
        id: createId("note-image"),
        type: "image",
        text: file.name.replace(/\.[^.]+$/, ""),
        src: String(reader.result ?? ""),
        alt: file.name,
      };

      updateDocument((current) => ({
        ...current,
        blocks: activeBlockId
          ? current.blocks.flatMap((block) => (block.id === activeBlockId ? [block, imageBlock] : [block]))
          : [...current.blocks, imageBlock],
      }));
      setActiveBlockId(imageBlock.id);
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const addComment = () => {
    const body = commentDraft.trim();
    if (!body) {
      return;
    }

    updateDocument((current) => ({
      ...current,
      comments: [
        {
          id: createId("comment"),
          author: "You",
          initials: "YO",
          body,
          createdAt: new Date().toISOString(),
        },
        ...current.comments,
      ],
    }));
    setCommentDraft("");
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
                  value={activeBlock?.type === "image" || !activeBlock ? "paragraph" : activeBlock.type}
                  onChange={(event) => setBlockType(event.target.value as NoteBlockType)}
                  className="h-8 w-36 rounded-lg text-xs shadow-none"
                >
                  {BLOCK_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
                <ToolbarButton label="Text" onClick={() => setBlockType("paragraph")}>
                  <AlignLeft className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton label="Heading 1" onClick={() => setBlockType("heading1")}>
                  <Heading1 className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton label="Heading 2" onClick={() => setBlockType("heading2")}>
                  <Heading2 className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton label="List" onClick={() => setBlockType("bulleted")}>
                  <List className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton label="Checklist" onClick={() => setBlockType("todo")}>
                  <CheckSquare className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton label="Quote" onClick={() => setBlockType("quote")}>
                  <Quote className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton label="Code" onClick={() => setBlockType("code")}>
                  <Code2 className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton label="Attach image" onClick={() => fileInputRef.current?.click()}>
                  <ImagePlus className="h-4 w-4" />
                </ToolbarButton>
              </div>
              <div className="flex items-center gap-2">
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
                  value={documentState.title}
                  onChange={(event) =>
                    updateDocument((current) => ({ ...current, title: event.target.value }))
                  }
                  className="h-auto border-0 bg-transparent px-0 py-0 text-3xl font-semibold tracking-[-0.03em] text-[var(--foreground-strong)] shadow-none focus:ring-0"
                />
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[var(--muted-foreground)]">
                  <span className="flex items-center gap-1.5">
                    <CalendarDays className="h-4 w-4" />
                    {formatRelativeDate(documentState.updatedAt)}
                  </span>
                  <span className="rounded-md bg-[var(--surface-muted)] px-2 py-1 font-medium text-[var(--accent-strong)]">
                    {documentState.status}
                  </span>
                  <span>{wordCount} words</span>
                  <span>{documentState.blocks.length} blocks</span>
                </div>
              </div>

              <div className="grid gap-1 px-8 py-7">
                {documentState.blocks.map((block, index) => (
                  <NoteBlockEditor
                    key={block.id}
                    block={block}
                    index={index}
                    active={activeBlockId === block.id}
                    setRef={(node) => {
                      blockRefs.current[block.id] = node;
                    }}
                    onFocus={() => setActiveBlockId(block.id)}
                    onInput={(text) => handleBlockInput(block, text)}
                    onKeyDown={(event) => handleBlockKeyDown(event, block)}
                    onToggleChecked={() => updateBlock(block.id, { checked: !block.checked })}
                    onCaptionChange={(text) => updateBlock(block.id, { text })}
                    onInsertAfter={() => insertBlockAfter(block.id)}
                    onDelete={() => deleteEmptyBlock(block.id)}
                  />
                ))}
              </div>
            </article>
          </div>
        </main>

        {showSidebar ? (
          <aside className="fixed inset-y-0 right-0 z-[80] flex w-[320px] shrink-0 flex-col border-l border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-float)] xl:static xl:z-auto xl:shadow-none">
            <NotesSidebar
              outline={outline}
              comments={documentState.comments}
              commentDraft={commentDraft}
              setCommentDraft={setCommentDraft}
              onAddComment={addComment}
              onClose={() => setShowSidebar(false)}
              onJumpToBlock={(blockId) => blockRefs.current[blockId]?.scrollIntoView({ block: "center" })}
            />
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground-strong)]"
    >
      {children}
    </button>
  );
}

function NoteBlockEditor({
  block,
  index,
  active,
  setRef,
  onFocus,
  onInput,
  onKeyDown,
  onToggleChecked,
  onCaptionChange,
  onInsertAfter,
  onDelete,
}: {
  block: NoteBlock;
  index: number;
  active: boolean;
  setRef: (node: HTMLElement | null) => void;
  onFocus: () => void;
  onInput: (text: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  onToggleChecked: () => void;
  onCaptionChange: (text: string) => void;
  onInsertAfter: () => void;
  onDelete: () => void;
}) {
  if (block.type === "image") {
    return (
      <div
        data-testid={`project-note-block-${index}`}
        className={cn(
          "group relative rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3 transition",
          active && "ring-2 ring-[var(--accent-soft)]",
        )}
        onFocus={onFocus}
      >
        {block.src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={block.src}
            alt={block.alt ?? block.text}
            className="max-h-[420px] w-full rounded-lg object-cover"
          />
        ) : null}
        <Input
          value={block.text}
          onChange={(event) => onCaptionChange(event.target.value)}
          placeholder="Image caption"
          className="mt-2 h-8 rounded-lg bg-[var(--surface)] text-xs shadow-none"
        />
        <BlockActions onInsertAfter={onInsertAfter} onDelete={onDelete} />
      </div>
    );
  }

  return (
    <div
      data-testid={`project-note-block-${index}`}
      className={cn("group relative flex gap-3 rounded-lg px-2 py-1.5 transition", active && "bg-[var(--surface-muted)]")}
    >
      <div className="flex w-7 shrink-0 justify-center pt-1 text-[var(--muted-foreground)]">
        {block.type === "todo" ? (
          <button
            type="button"
            aria-label={block.checked ? "Mark unchecked" : "Mark checked"}
            onClick={onToggleChecked}
            className={cn(
              "mt-0.5 flex h-4 w-4 items-center justify-center rounded border transition",
              block.checked
                ? "border-[var(--foreground-strong)] bg-[var(--foreground-strong)] text-[var(--surface)]"
                : "border-[var(--border-strong)] bg-[var(--surface)]",
            )}
          >
            {block.checked ? <CheckSquare className="h-3 w-3" /> : null}
          </button>
        ) : block.type === "bulleted" ? (
          <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[var(--muted-foreground)]" />
        ) : block.type === "numbered" ? (
          <span className="text-xs font-medium text-[var(--muted-foreground)]">{index + 1}.</span>
        ) : (
          <BlockIcon type={block.type} />
        )}
      </div>
      <div
        ref={setRef}
        role="textbox"
        tabIndex={0}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={getBlockPlaceholder(block.type)}
        className={cn(
          "notes-editable min-w-0 flex-1 rounded-md outline-none empty:before:text-[var(--muted-foreground)] empty:before:content-[attr(data-placeholder)] focus-visible:ring-0",
          block.checked && "text-[var(--muted-foreground)] line-through",
          blockClassName(block.type),
        )}
        onFocus={onFocus}
        onInput={(event) => onInput(event.currentTarget.textContent ?? "")}
        onKeyDown={onKeyDown}
      >
        {block.text}
      </div>
      <BlockActions onInsertAfter={onInsertAfter} onDelete={onDelete} />
    </div>
  );
}

function BlockActions({
  onInsertAfter,
  onDelete,
}: {
  onInsertAfter: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="absolute -right-2 top-1 hidden items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5 shadow-[var(--shadow-soft)] group-hover:flex">
      <button
        type="button"
        aria-label="Insert block"
        className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted-foreground)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground-strong)]"
        onClick={onInsertAfter}
      >
        +
      </button>
      <button
        type="button"
        aria-label="Delete block"
        className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted-foreground)] hover:bg-[color:rgba(225,29,72,0.08)] hover:text-[var(--danger)]"
        onClick={onDelete}
      >
        x
      </button>
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
  onJumpToBlock,
}: {
  outline: NoteBlock[];
  comments: NoteComment[];
  commentDraft: string;
  setCommentDraft: (value: string) => void;
  onAddComment: () => void;
  onClose: () => void;
  onJumpToBlock: (blockId: string) => void;
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
            outline.map((block) => (
              <button
                key={block.id}
                type="button"
                className={cn(
                  "truncate rounded-lg px-2 py-1.5 text-left text-xs text-[var(--muted-foreground)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground-strong)]",
                  block.type === "heading2" && "pl-5",
                )}
                onClick={() => onJumpToBlock(block.id)}
              >
                {block.text}
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
        <div className="mt-4 flex items-center gap-2 border-t border-[var(--border)] pt-4">
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
            className="h-9 rounded-lg text-xs shadow-none"
          />
          <Button
            type="button"
            size="icon"
            variant="outline"
            aria-label="Send comment"
            onClick={onAddComment}
            className="h-9 w-9 rounded-lg"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </>
  );
}
