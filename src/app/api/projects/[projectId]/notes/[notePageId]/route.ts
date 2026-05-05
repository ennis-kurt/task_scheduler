import { NextResponse } from "next/server";

import { handleRouteError, success } from "@/app/api/_helpers";
import { requireUserId } from "@/lib/auth";
import { notePagesRepository } from "@/lib/planner/note-pages";
import { updateProjectNotePageSchema } from "@/lib/planner/validators";

type RouteContext = {
  params: Promise<{
    projectId: string;
    notePageId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const userId = await requireUserId();
    const { projectId, notePageId } = await context.params;
    const body = await request.text();
    const input = updateProjectNotePageSchema.parse(body.trim() ? JSON.parse(body) : {});
    const note = await notePagesRepository.update(userId, projectId, notePageId, input);
    return success(note);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const userId = await requireUserId();
    const { projectId, notePageId } = await context.params;
    const result = await notePagesRepository.delete(userId, projectId, notePageId);

    if (!result.ok && result.reason === "LAST_PAGE") {
      return NextResponse.json({ error: "LAST_PAGE" }, { status: 409 });
    }

    return success(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
