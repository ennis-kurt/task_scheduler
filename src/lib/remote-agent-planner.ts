import { notePagesRepository } from "@/lib/planner/note-pages";
import { plannerRepository } from "@/lib/planner/repository";
import type {
  MilestoneRecord,
  NewMilestoneInput,
  NewTaskInput,
  NewTaxonomyInput,
  ProjectRecord,
  TaskRecord,
  TaskStatus,
  UpdateMilestoneInput,
  UpdateProjectInput,
  UpdateTaskInput,
  WorkspaceSnapshot,
} from "@/lib/planner/types";

type TaskFilters = {
  projectId?: string | null;
  milestoneId?: string | null;
  status?: TaskStatus | null;
};

function priorityRank(priority: TaskRecord["priority"]) {
  return { critical: 0, high: 1, medium: 2, low: 3 }[priority];
}

function findProject(workspace: WorkspaceSnapshot, projectId: string) {
  const project = workspace.projects.find((candidate) => candidate.id === projectId);

  if (!project) {
    throw new Error("NOT_FOUND");
  }

  return project;
}

function findMilestone(workspace: WorkspaceSnapshot, milestoneId: string) {
  const milestone = workspace.milestones.find((candidate) => candidate.id === milestoneId);

  if (!milestone) {
    throw new Error("NOT_FOUND");
  }

  return milestone;
}

function findTask(workspace: WorkspaceSnapshot, taskId: string) {
  const task = workspace.tasks.find((candidate) => candidate.id === taskId);

  if (!task) {
    throw new Error("NOT_FOUND");
  }

  return task;
}

export function serializeProject(workspace: WorkspaceSnapshot, project: ProjectRecord) {
  const milestones = workspace.milestones.filter(
    (milestone) => milestone.projectId === project.id,
  );
  const tasks = workspace.tasks.filter((task) => task.projectId === project.id);

  return {
    ...project,
    milestoneCount: milestones.length,
    taskCount: tasks.length,
    openTaskCount: tasks.filter((task) => task.status !== "done").length,
  };
}

export function serializeMilestone(
  workspace: WorkspaceSnapshot,
  milestone: MilestoneRecord,
) {
  const tasks = workspace.tasks.filter((task) => task.milestoneId === milestone.id);

  return {
    ...milestone,
    taskCount: tasks.length,
    openTaskCount: tasks.filter((task) => task.status !== "done").length,
  };
}

export function serializeTask(workspace: WorkspaceSnapshot, task: TaskRecord) {
  return {
    ...task,
    project: task.projectId
      ? workspace.projects.find((project) => project.id === task.projectId) ?? null
      : null,
    milestone: task.milestoneId
      ? workspace.milestones.find((milestone) => milestone.id === task.milestoneId) ?? null
      : null,
    area: task.areaId
      ? workspace.areas.find((area) => area.id === task.areaId) ?? null
      : null,
    checklist: workspace.checklistItems
      .filter((item) => item.taskId === task.id)
      .sort((left, right) => left.sortOrder - right.sortOrder),
    tagIds: workspace.taskTags
      .filter((tag) => tag.taskId === task.id)
      .map((tag) => tag.tagId),
  };
}

export async function getRemoteWorkspace(userId: string) {
  const workspace = await plannerRepository.getWorkspace(userId);
  return {
    user: workspace.user,
    settings: workspace.settings,
    areas: workspace.areas,
    projects: workspace.projects.map((project) => serializeProject(workspace, project)),
    milestones: workspace.milestones.map((milestone) =>
      serializeMilestone(workspace, milestone),
    ),
    tasks: workspace.tasks.map((task) => serializeTask(workspace, task)),
  };
}

export async function listRemoteProjects(userId: string) {
  const workspace = await plannerRepository.getWorkspace(userId);
  return workspace.projects.map((project) => serializeProject(workspace, project));
}

export async function getRemoteProject(userId: string, projectId: string) {
  const workspace = await plannerRepository.getWorkspace(userId);
  const project = findProject(workspace, projectId);

  return {
    project: serializeProject(workspace, project),
    milestones: workspace.milestones
      .filter((milestone) => milestone.projectId === projectId)
      .map((milestone) => serializeMilestone(workspace, milestone)),
    tasks: workspace.tasks
      .filter((task) => task.projectId === projectId)
      .map((task) => serializeTask(workspace, task)),
  };
}

export async function createRemoteProject(userId: string, input: NewTaxonomyInput) {
  const project = await plannerRepository.createProject(userId, input);
  await notePagesRepository.syncProjectDescription(userId, project.id, input.notes);
  const workspace = await plannerRepository.getWorkspace(userId);
  return serializeProject(workspace, project);
}

export async function updateRemoteProject(
  userId: string,
  projectId: string,
  input: UpdateProjectInput,
) {
  const project = await plannerRepository.updateProject(userId, projectId, input);
  const workspace = await plannerRepository.getWorkspace(userId);
  return serializeProject(workspace, project);
}

export async function listRemoteMilestones(userId: string, projectId: string) {
  const workspace = await plannerRepository.getWorkspace(userId);
  findProject(workspace, projectId);
  return workspace.milestones
    .filter((milestone) => milestone.projectId === projectId)
    .map((milestone) => serializeMilestone(workspace, milestone));
}

export async function createRemoteMilestone(
  userId: string,
  input: NewMilestoneInput,
) {
  const milestone = await plannerRepository.createMilestone(userId, input);
  await notePagesRepository.syncMilestoneNotes(userId, milestone);
  const workspace = await plannerRepository.getWorkspace(userId);
  return serializeMilestone(workspace, milestone);
}

export async function updateRemoteMilestone(
  userId: string,
  milestoneId: string,
  input: UpdateMilestoneInput,
) {
  const milestone = await plannerRepository.updateMilestone(userId, milestoneId, input);
  await notePagesRepository.syncMilestoneNotes(userId, milestone);
  const workspace = await plannerRepository.getWorkspace(userId);
  return serializeMilestone(workspace, milestone);
}

export async function listRemoteTasks(userId: string, filters: TaskFilters = {}) {
  const workspace = await plannerRepository.getWorkspace(userId);
  return workspace.tasks
    .filter((task) =>
      filters.projectId ? task.projectId === filters.projectId : true,
    )
    .filter((task) =>
      filters.milestoneId ? task.milestoneId === filters.milestoneId : true,
    )
    .filter((task) => (filters.status ? task.status === filters.status : true))
    .map((task) => serializeTask(workspace, task));
}

export async function createRemoteTask(userId: string, input: NewTaskInput) {
  const task = await plannerRepository.createTask(userId, input);
  const workspace = await plannerRepository.getWorkspace(userId);
  const milestone = task.milestoneId
    ? workspace.milestones.find((candidate) => candidate.id === task.milestoneId) ?? null
    : null;

  if (input.addToProjectNotes) {
    await notePagesRepository.syncTaskNote(userId, task, milestone, {
      createIfMissing: true,
    });
  }

  return serializeTask(workspace, task);
}

export async function updateRemoteTask(
  userId: string,
  taskId: string,
  input: UpdateTaskInput,
) {
  const previousWorkspace = await plannerRepository.getWorkspace(userId);
  const previousTask = previousWorkspace.tasks.find(
    (candidate) => candidate.id === taskId,
  );
  const task = await plannerRepository.updateTask(userId, taskId, input);
  const workspace = await plannerRepository.getWorkspace(userId);
  const milestone = task.milestoneId
    ? workspace.milestones.find((candidate) => candidate.id === task.milestoneId) ?? null
    : null;

  if (previousTask?.projectId && previousTask.projectId !== task.projectId) {
    await notePagesRepository.deleteTaskNote(userId, previousTask);
  }

  await notePagesRepository.syncTaskNote(userId, task, milestone);
  return serializeTask(workspace, task);
}

export async function listRemoteNextTasks(userId: string, limit = 10) {
  const workspace = await plannerRepository.getWorkspace(userId);
  return workspace.tasks
    .filter((task) => task.status !== "done")
    .sort((left, right) => {
      if (left.dueAt && right.dueAt && left.dueAt !== right.dueAt) {
        return left.dueAt.localeCompare(right.dueAt);
      }

      if (left.dueAt && !right.dueAt) return -1;
      if (!left.dueAt && right.dueAt) return 1;

      return priorityRank(left.priority) - priorityRank(right.priority);
    })
    .slice(0, Math.min(Math.max(limit, 1), 50))
    .map((task) => serializeTask(workspace, task));
}

export async function readRemoteProjectResource(userId: string, projectId: string) {
  const workspace = await plannerRepository.getWorkspace(userId);
  findProject(workspace, projectId);
  return getRemoteProject(userId, projectId);
}

export function assertRemoteMilestoneBelongsToProject(
  workspace: WorkspaceSnapshot,
  projectId: string,
  milestoneId: string,
) {
  const milestone = findMilestone(workspace, milestoneId);

  if (milestone.projectId !== projectId) {
    throw new Error("NOT_FOUND");
  }
}

export function assertRemoteTaskExists(workspace: WorkspaceSnapshot, taskId: string) {
  return findTask(workspace, taskId);
}
