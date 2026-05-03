import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function success(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function handleRouteError(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", details: error.flatten() },
      { status: 400 },
    );
  }

  if (error instanceof Error && error.message === "UNAUTHORIZED") {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  if (error instanceof Error && error.message === "NOT_FOUND") {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  if (
    error instanceof Error &&
    ["PROJECT_SCOPE_REQUIRED", "INVALID_PROJECT_SCOPE"].includes(error.message)
  ) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  console.error(error);
  return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
}
