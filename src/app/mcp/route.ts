import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";

import {
  authenticateApiToken,
  ApiTokenAuthError,
  type ApiTokenAuthContext,
} from "@/lib/api-tokens";
import {
  createRemoteMilestone,
  createRemoteProject,
  createRemoteTask,
  getRemoteProject,
  getRemoteWorkspace,
  listRemoteMilestones,
  listRemoteNextTasks,
  listRemoteProjects,
  listRemoteTasks,
  readRemoteProjectResource,
  updateRemoteMilestone,
  updateRemoteProject,
  updateRemoteTask,
} from "@/lib/remote-agent-planner";
import {
  milestoneSchema,
  taskSchema,
  updateMilestoneSchema,
  updateProjectSchema,
  updateTaskSchema,
  taxonomySchema,
} from "@/lib/planner/validators";
import { TASK_STATUSES, type TaskStatus } from "@/lib/planner/types";

const taskStatusSchema = z.enum(TASK_STATUSES);

function toolResult(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function authFromAuthInfo(authInfo: AuthInfo | undefined): ApiTokenAuthContext {
  const userId =
    typeof authInfo?.extra?.userId === "string"
      ? authInfo.extra.userId
      : authInfo?.clientId;

  if (!authInfo || !userId) {
    throw new Error("UNAUTHORIZED");
  }

  return {
    token: authInfo.token,
    tokenId:
      typeof authInfo.extra?.tokenId === "string" ? authInfo.extra.tokenId : "",
    tokenPrefix:
      typeof authInfo.extra?.tokenPrefix === "string"
        ? authInfo.extra.tokenPrefix
        : "",
    userId,
    scopeType:
      authInfo.extra?.scopeType === "selected_projects"
        ? "selected_projects"
        : "all_projects",
    projectIds: Array.isArray(authInfo.extra?.projectIds)
      ? authInfo.extra.projectIds.filter(
          (projectId): projectId is string => typeof projectId === "string",
        )
      : [],
    scopes: authInfo.scopes,
  };
}

function projectIdFromVariable(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

const handler = createMcpHandler(
  (server) => {
    server.registerResource(
      "inflara_workspace",
      "inflara://workspace",
      {
        title: "Inflara workspace",
        description: "Current user's Inflara workspace with projects, milestones, and tasks.",
        mimeType: "application/json",
      },
      async (_uri, extra) =>
        ({
          contents: [
            {
              uri: "inflara://workspace",
              mimeType: "application/json",
              text: JSON.stringify(
                await getRemoteWorkspace(authFromAuthInfo(extra.authInfo)),
                null,
                2,
              ),
            },
          ],
        }),
    );

    server.registerResource(
      "inflara_project",
      new ResourceTemplate("inflara://projects/{projectId}", {
        list: async (extra) => {
          const projects = await listRemoteProjects(authFromAuthInfo(extra.authInfo));
          return {
            resources: projects.map((project) => ({
              uri: `inflara://projects/${project.id}`,
              name: project.name,
              title: project.name,
              description: `Inflara project ${project.name}`,
              mimeType: "application/json",
            })),
          };
        },
      }),
      {
        title: "Inflara project",
        description: "A single Inflara project with milestones and tasks.",
        mimeType: "application/json",
      },
      async (uri, variables, extra) => {
        const projectId = projectIdFromVariable(variables.projectId);

        if (!projectId) {
          throw new Error("NOT_FOUND");
        }

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(
                await readRemoteProjectResource(
                  authFromAuthInfo(extra.authInfo),
                  projectId,
                ),
                null,
                2,
              ),
            },
          ],
        };
      },
    );

    server.registerTool(
      "inflara_list_projects",
      {
        title: "List Inflara projects",
        description: "List projects in the connected Inflara account.",
        inputSchema: {},
      },
      async (_args, extra) =>
        toolResult({
          projects: await listRemoteProjects(authFromAuthInfo(extra.authInfo)),
        }),
    );

    server.registerTool(
      "inflara_get_project",
      {
        title: "Get Inflara project",
        description: "Get one project with its milestones and tasks.",
        inputSchema: {
          projectId: z.string(),
        },
      },
      async ({ projectId }, extra) =>
        toolResult(await getRemoteProject(authFromAuthInfo(extra.authInfo), projectId)),
    );

    server.registerTool(
      "inflara_create_project",
      {
        title: "Create Inflara project",
        description: "Create a project in Inflara.",
        inputSchema: {
          name: z.string().min(1).max(120),
          notes: z.string().max(5000).optional(),
          color: z.string().optional(),
          areaId: z.string().nullable().optional(),
          deadlineAt: z.string().datetime().nullable().optional(),
          status: z.enum(["active", "completed", "archived"]).optional(),
        },
      },
      async (args, extra) =>
        toolResult({
          project: await createRemoteProject(
            authFromAuthInfo(extra.authInfo),
            taxonomySchema.parse(args),
          ),
        }),
    );

    server.registerTool(
      "inflara_update_project",
      {
        title: "Update Inflara project",
        description: "Update a project in Inflara. This tool cannot delete projects.",
        inputSchema: {
          projectId: z.string(),
          name: z.string().min(1).max(120).optional(),
          notes: z.string().max(5000).optional(),
          color: z.string().optional(),
          areaId: z.string().nullable().optional(),
          deadlineAt: z.string().datetime().nullable().optional(),
          status: z.enum(["active", "completed", "archived"]).optional(),
        },
      },
      async ({ projectId, ...input }, extra) =>
        toolResult({
          project: await updateRemoteProject(
            authFromAuthInfo(extra.authInfo),
            projectId,
            updateProjectSchema.parse(input),
          ),
        }),
    );

    server.registerTool(
      "inflara_list_milestones",
      {
        title: "List Inflara milestones",
        description: "List milestones for a project.",
        inputSchema: {
          projectId: z.string(),
        },
      },
      async ({ projectId }, extra) =>
        toolResult({
          milestones: await listRemoteMilestones(
            authFromAuthInfo(extra.authInfo),
            projectId,
          ),
        }),
    );

    server.registerTool(
      "inflara_create_milestone",
      {
        title: "Create Inflara milestone",
        description: "Create a milestone and sync its description into project notes.",
        inputSchema: {
          projectId: z.string(),
          name: z.string().min(1).max(120),
          description: z.string().max(5000).optional(),
          startDate: z.string().datetime(),
          deadline: z.string().datetime(),
        },
      },
      async (args, extra) =>
        toolResult({
          milestone: await createRemoteMilestone(
            authFromAuthInfo(extra.authInfo),
            milestoneSchema.parse(args),
          ),
        }),
    );

    server.registerTool(
      "inflara_update_milestone",
      {
        title: "Update Inflara milestone",
        description: "Update a milestone and sync its description into project notes.",
        inputSchema: {
          milestoneId: z.string(),
          projectId: z.string().optional(),
          name: z.string().min(1).max(120).optional(),
          description: z.string().max(5000).optional(),
          startDate: z.string().datetime().optional(),
          deadline: z.string().datetime().optional(),
        },
      },
      async ({ milestoneId, ...input }, extra) =>
        toolResult({
          milestone: await updateRemoteMilestone(
            authFromAuthInfo(extra.authInfo),
            milestoneId,
            updateMilestoneSchema.parse(input),
          ),
        }),
    );

    server.registerTool(
      "inflara_list_tasks",
      {
        title: "List Inflara tasks",
        description: "List tasks, optionally filtered by project, milestone, or status.",
        inputSchema: {
          projectId: z.string().nullable().optional(),
          milestoneId: z.string().nullable().optional(),
          status: taskStatusSchema.nullable().optional(),
        },
      },
      async (args, extra) =>
        toolResult({
          tasks: await listRemoteTasks(authFromAuthInfo(extra.authInfo), {
            projectId: args.projectId,
            milestoneId: args.milestoneId,
            status: args.status as TaskStatus | null | undefined,
          }),
        }),
    );

    server.registerTool(
      "inflara_create_task",
      {
        title: "Create Inflara task",
        description: "Create a task in Inflara. Task notes stay on the task unless addToProjectNotes is true.",
        inputSchema: {
          title: z.string().min(1).max(120),
          notes: z.string().max(5000).optional(),
          priority: z.enum(["low", "medium", "high", "critical"]).optional(),
          estimatedMinutes: z.number().int().min(15).max(720).optional(),
          dueAt: z.string().datetime().nullable().optional(),
          preferredTimeBand: z.enum(["anytime", "morning", "afternoon", "evening"]).optional(),
          preferredWindowStart: z.string().nullable().optional(),
          preferredWindowEnd: z.string().nullable().optional(),
          areaId: z.string().nullable().optional(),
          projectId: z.string().nullable().optional(),
          milestoneId: z.string().nullable().optional(),
          startsAt: z.string().datetime().nullable().optional(),
          endsAt: z.string().datetime().nullable().optional(),
          availability: z.enum(["ready", "later"]).optional(),
          addToProjectNotes: z.boolean().optional(),
        },
      },
      async (args, extra) =>
        toolResult({
          task: await createRemoteTask(
            authFromAuthInfo(extra.authInfo),
            taskSchema.parse(args),
          ),
        }),
    );

    server.registerTool(
      "inflara_update_task",
      {
        title: "Update Inflara task",
        description: "Update a task in Inflara. This tool cannot delete tasks.",
        inputSchema: {
          taskId: z.string(),
          title: z.string().min(1).max(120).optional(),
          notes: z.string().max(5000).optional(),
          priority: z.enum(["low", "medium", "high", "critical"]).optional(),
          estimatedMinutes: z.number().int().min(15).max(720).optional(),
          dueAt: z.string().datetime().nullable().optional(),
          preferredTimeBand: z.enum(["anytime", "morning", "afternoon", "evening"]).optional(),
          preferredWindowStart: z.string().nullable().optional(),
          preferredWindowEnd: z.string().nullable().optional(),
          areaId: z.string().nullable().optional(),
          projectId: z.string().nullable().optional(),
          milestoneId: z.string().nullable().optional(),
          startsAt: z.string().datetime().nullable().optional(),
          endsAt: z.string().datetime().nullable().optional(),
          status: taskStatusSchema.optional(),
          availability: z.enum(["ready", "later"]).optional(),
          completedAt: z.string().datetime().nullable().optional(),
        },
      },
      async ({ taskId, ...input }, extra) =>
        toolResult({
          task: await updateRemoteTask(
            authFromAuthInfo(extra.authInfo),
            taskId,
            updateTaskSchema.parse(input),
          ),
        }),
    );

    server.registerTool(
      "inflara_next_tasks",
      {
        title: "List next Inflara tasks",
        description: "List the next open tasks by due date and priority.",
        inputSchema: {
          limit: z.number().int().min(1).max(50).optional(),
        },
      },
      async ({ limit }, extra) =>
        toolResult({
          tasks: await listRemoteNextTasks(authFromAuthInfo(extra.authInfo), limit),
        }),
    );
  },
  {
    serverInfo: {
      name: "inflara",
      version: "0.1.0",
    },
  },
  {
    basePath: "",
    disableSse: true,
    maxDuration: 60,
  },
);

const authenticatedHandler = withMcpAuth(
  handler,
  async (_request, bearerToken) => {
    try {
      const auth = await authenticateApiToken(bearerToken ?? null);
      return {
        token: auth.token,
        clientId: auth.userId,
        scopes: auth.scopes,
        extra: {
          tokenId: auth.tokenId,
          userId: auth.userId,
          tokenPrefix: auth.tokenPrefix,
          scopeType: auth.scopeType,
          projectIds: auth.projectIds,
        },
      };
    } catch (error) {
      if (error instanceof ApiTokenAuthError) {
        return undefined;
      }

      throw error;
    }
  },
  {
    required: true,
    requiredScopes: ["planner:read"],
  },
);

export {
  authenticatedHandler as DELETE,
  authenticatedHandler as GET,
  authenticatedHandler as POST,
};
