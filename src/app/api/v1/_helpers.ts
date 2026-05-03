import { NextResponse } from "next/server";
import { ZodError } from "zod";

import {
  ApiTokenAuthError,
  authenticateApiTokenRequest,
} from "@/lib/api-tokens";

export async function requireApiUserId(request: Request) {
  return (await authenticateApiTokenRequest(request)).userId;
}

export async function requireApiAuth(request: Request) {
  return authenticateApiTokenRequest(request);
}

export function apiSuccess(data: unknown, status = 200) {
  return NextResponse.json({ data }, { status });
}

export function handleApiError(error: unknown) {
  if (error instanceof ApiTokenAuthError) {
    const status = error.code === "FORBIDDEN_PROJECT" ? 403 : 401;
    return NextResponse.json(
      {
        error: {
          code: status === 403 ? "FORBIDDEN" : "UNAUTHORIZED",
          message: error.message,
        },
      },
      { status },
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "The request body is invalid.",
          details: error.flatten(),
        },
      },
      { status: 400 },
    );
  }

  if (error instanceof Error && error.message === "NOT_FOUND") {
    return NextResponse.json(
      {
        error: {
          code: "NOT_FOUND",
          message: "The requested resource was not found.",
        },
      },
      { status: 404 },
    );
  }

  console.error(error);
  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "An internal server error occurred.",
      },
    },
    { status: 500 },
  );
}
