import {
  assertApiTokenAccountAccess,
  assertApiTokenProjectAccess,
  canAccessProject,
  type ApiTokenAuthContext,
} from "@/lib/api-tokens";
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

type RemoteAccess = ApiTokenAuthContext;

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

function filterProjectsForAccess(access: RemoteAccess, projects: ProjectRecord[]) {
  return projects.filter((project) => canAccessProject(access, project.id));
}

function filterMilestonesForAccess(access: RemoteAccess, milestones: MilestoneRecord[]) {
  return milestones.filter((milestone) => canAccessProject(access, milestone.projectId));
}

function filterTasksForAccess(access: RemoteAccess, tasks: TaskRecord[]) {
  return tasks.filter((task) => canAccessProject(access, task.projectId));
}

function resolveTaskProjectId(
  workspace: WorkspaceSnapshot,
  input: Pick<NewTaskInput | UpdateTaskInput, "projectId" | "milestoneId">,
  currentTask?: TaskRecord,
) {
  const nextMilestoneId =
    input.milestoneId === undefined ? currentTask?.milestoneId : input.milestoneId;
  const milestone = nextMilestoneId
    ? workspace.milestones.find((candidate) => candidate.id === nextMilestoneId)
    : null;

  if (milestone) {
    return milestone.projectId;
  }

  return input.projectId === undefined ? currentTask?.projectId : input.projectId;
}

function assertDependencyTaskAccess(
  access: RemoteAccess,
  workspace: WorkspaceSnapshot,
  dependencyIds?: string[],
) {
  if (!dependencyIds) {
    return;
  }

  for (const dependencyId of dependencyIds) {
    const dependencyTask = findTask(workspace, dependencyId);
    assertApiTokenProjectAccess(access, dependencyTask.projectId);
  }
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
    dependencyIds: workspace.taskDependencies
      .filter((dependency) => dependency.taskId === task.id)
      .map((dependency) => dependency.dependsOnTaskId),
  };
}

export async function getRemoteWorkspace(access: RemoteAccess) {
  const workspace = await plannerRepository.getWorkspace(access.userId);
  const projects = filterProjectsForAccess(access, workspace.projects);
  const milestones = filterMilestonesForAccess(access, workspace.milestones);
  const tasks = filterTasksForAccess(access, workspace.tasks);
  return {
    user: workspace.user,
    settings: workspace.settings,
    areas: workspace.areas,
    projects: projects.map((project) => serializeProject(workspace, project)),
    milestones: milestones.map((milestone) => serializeMilestone(workspace, milestone)),
    tasks: tasks.map((task) => serializeTask(workspace, task)),
  };
}

export async function listRemoteProjects(access: RemoteAccess) {
  const workspace = await plannerRepository.getWorkspace(access.userId);
  return filterProjectsForAccess(access, workspace.projects).map((project) =>
    serializeProject(workspace, project),
  );
}

export async function getRemoteProject(access: RemoteAccess, projectId: string) {
  assertApiTokenProjectAccess(access, projectId);
  const workspace = await plannerRepository.getWorkspace(access.userId);
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

export async function createRemoteProject(access: RemoteAccess, input: NewTaxonomyInput) {
  assertApiTokenAccountAccess(access);
  const project = await plannerRepository.createProject(access.userId, input);
  await notePagesRepository.syncProjectDescription(access.userId, project.id, input.notes);
  const workspace = await plannerRepository.getWorkspace(access.userId);
  return serializeProject(workspace, project);
}

export async function updateRemoteProject(
  access: RemoteAccess,
  projectId: string,
  input: UpdateProjectInput,
) {
  assertApiTokenProjectAccess(access, projectId);
  const project = await plannerRepository.updateProject(access.userId, projectId, input);
  const workspace = await plannerRepository.getWorkspace(access.userId);
  return serializeProject(workspace, project);
}

export async function listRemoteMilestones(access: RemoteAccess, projectId: string) {
  assertApiTokenProjectAccess(access, projectId);
  const workspace = await plannerRepository.getWorkspace(access.userId);
  findProject(workspace, projectId);
  return workspace.milestones
    .filter((milestone) => milestone.projectId === projectId)
    .map((milestone) => serializeMilestone(workspace, milestone));
}

export async function createRemoteMilestone(
  access: RemoteAccess,
  input: NewMilestoneInput,
) {
  assertApiTokenProjectAccess(access, input.projectId);
  const milestone = await plannerRepository.createMilestone(access.userId, input);
  await notePagesRepository.syncMilestoneNotes(access.userId, milestone);
  const workspace = await plannerRepository.getWorkspace(access.userId);
  return serializeMilestone(workspace, milestone);
}

export async function updateRemoteMilestone(
  access: RemoteAccess,
  milestoneId: string,
  input: UpdateMilestoneInput,
) {
  const workspaceBeforeUpdate = await plannerRepository.getWorkspace(access.userId);
  const existingMilestone = findMilestone(workspaceBeforeUpdate, milestoneId);
  assertApiTokenProjectAccess(access, input.projectId ?? existingMilestone.projectId);
  const milestone = await plannerRepository.updateMilestone(access.userId, milestoneId, input);
  await notePagesRepository.syncMilestoneNotes(access.userId, milestone);
  const workspace = await plannerRepository.getWorkspace(access.userId);
  return serializeMilestone(workspace, milestone);
}

export async function listRemoteTasks(access: RemoteAccess, filters: TaskFilters = {}) {
  if (filters.projectId) {
    assertApiTokenProjectAccess(access, filters.projectId);
  }

  const workspace = await plannerRepository.getWorkspace(access.userId);
  return filterTasksForAccess(access, workspace.tasks)
    .filter((task) =>
      filters.projectId ? task.projectId === filters.projectId : true,
    )
    .filter((task) =>
      filters.milestoneId ? task.milestoneId === filters.milestoneId : true,
    )
    .filter((task) => (filters.status ? task.status === filters.status : true))
    .map((task) => serializeTask(workspace, task));
}

export async function createRemoteTask(access: RemoteAccess, input: NewTaskInput) {
  const workspaceBeforeCreate = await plannerRepository.getWorkspace(access.userId);
  assertApiTokenProjectAccess(access, resolveTaskProjectId(workspaceBeforeCreate, input));
  assertDependencyTaskAccess(access, workspaceBeforeCreate, input.dependencyIds);
  const task = await plannerRepository.createTask(access.userId, input);
  const workspace = await plannerRepository.getWorkspace(access.userId);
  const milestone = task.milestoneId
    ? workspace.milestones.find((candidate) => candidate.id === task.milestoneId) ?? null
    : null;

  if (input.addToProjectNotes) {
    await notePagesRepository.syncTaskNote(access.userId, task, milestone, {
      createIfMissing: true,
    });
  }

  return serializeTask(workspace, task);
}

export async function updateRemoteTask(
  access: RemoteAccess,
  taskId: string,
  input: UpdateTaskInput,
) {
  const previousWorkspace = await plannerRepository.getWorkspace(access.userId);
  const previousTask = previousWorkspace.tasks.find(
    (candidate) => candidate.id === taskId,
  );
  if (!previousTask) {
    throw new Error("NOT_FOUND");
  }

  assertApiTokenProjectAccess(access, previousTask.projectId);
  assertApiTokenProjectAccess(
    access,
    resolveTaskProjectId(previousWorkspace, input, previousTask),
  );
  assertDependencyTaskAccess(access, previousWorkspace, input.dependencyIds);

  const task = await plannerRepository.updateTask(access.userId, taskId, input);
  const workspace = await plannerRepository.getWorkspace(access.userId);
  const milestone = task.milestoneId
    ? workspace.milestones.find((candidate) => candidate.id === task.milestoneId) ?? null
    : null;

  if (previousTask?.projectId && previousTask.projectId !== task.projectId) {
    await notePagesRepository.deleteTaskNote(access.userId, previousTask);
  }

  await notePagesRepository.syncTaskNote(access.userId, task, milestone);
  return serializeTask(workspace, task);
}

export async function listRemoteNextTasks(access: RemoteAccess, limit = 10) {
  const workspace = await plannerRepository.getWorkspace(access.userId);
  return filterTasksForAccess(access, workspace.tasks)
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

export async function readRemoteProjectResource(access: RemoteAccess, projectId: string) {
  assertApiTokenProjectAccess(access, projectId);
  const workspace = await plannerRepository.getWorkspace(access.userId);
  findProject(workspace, projectId);
  return getRemoteProject(access, projectId);
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
