import { NextResponse } from "next/server";

import { handleRouteError, success } from "@/app/api/_helpers";
import { requireUserId } from "@/lib/auth";
import { notePagesRepository } from "@/lib/planner/note-pages";
import { plannerRepository } from "@/lib/planner/repository";
import { projectNotePageSchema } from "@/lib/planner/validators";

type RouteContext = {
  params: Promise<{
    projectId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const userId = await requireUserId();
    const { projectId } = await context.params;
    await notePagesRepository.ensureProjectStructure(userId, projectId);
    const workspace = await plannerRepository.getWorkspace(userId);
    const milestones = workspace.milestones.filter(
      (milestone) => milestone.projectId === projectId,
    );

    for (const milestone of milestones) {
      await notePagesRepository.syncMilestoneNotes(userId, milestone, {
        updateExisting: false,
      });
    }
    await notePagesRepository.cleanupLegacyGeneratedNotes(userId, projectId, milestones);

    const notes = await notePagesRepository.list(userId, projectId);
    return success(notes);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const userId = await requireUserId();
    const { projectId } = await context.params;
    const input = projectNotePageSchema.parse(await request.json());
    const note = await notePagesRepository.create(userId, projectId, input);
    return success(note, 201);
  } catch (error) {
    if (error instanceof Error && error.message === "LAST_PAGE") {
      return NextResponse.json({ error: "LAST_PAGE" }, { status: 409 });
    }

    return handleRouteError(error);
  }
}
