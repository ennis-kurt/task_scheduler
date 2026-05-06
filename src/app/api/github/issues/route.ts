import { NextResponse } from "next/server";
import { z } from "zod";

import { handleRouteError, success } from "@/app/api/_helpers";
import { requireUserId } from "@/lib/auth";
import {
  createGitHubIssue,
  GitHubIssueError,
} from "@/lib/github-issues";

const githubIssueTaskSchema = z.object({
  title: z.string().min(1).max(256),
  notes: z.string().nullable().optional(),
  priority: z.string().nullable().optional(),
  estimatedMinutes: z.number().int().positive().nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
});

const githubIssueSchema = z.object({
  repoUrl: z.string().min(1).max(300),
  task: githubIssueTaskSchema,
});

export async function POST(request: Request) {
  try {
    await requireUserId();
    const input = githubIssueSchema.parse(await request.json());
    const issue = await createGitHubIssue(input.repoUrl, input.task);

    return success({ issue }, 201);
  } catch (error) {
    if (error instanceof GitHubIssueError) {
      return NextResponse.json(
        {
          error: error.code,
          message: error.message,
        },
        { status: error.status },
      );
    }

    return handleRouteError(error);
  }
}
