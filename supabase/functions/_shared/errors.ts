import { corsHeaders } from "./cors.ts";

export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION_ERROR"
  | "INTERNAL_ERROR";

export interface ApiError {
  code: ErrorCode;
  message: string;
}

const statusCodes: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION_ERROR: 422,
  INTERNAL_ERROR: 500,
};

export function errorResponse(code: ErrorCode, message: string): Response {
  const error: ApiError = { code, message };
  return new Response(JSON.stringify({ error }), {
    status: statusCodes[code],
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

export function unauthorizedError(message = "Missing or invalid JWT"): Response {
  return errorResponse("UNAUTHORIZED", message);
}

export function forbiddenError(message = "Insufficient permissions"): Response {
  return errorResponse("FORBIDDEN", message);
}

export function notFoundError(message = "Resource not found"): Response {
  return errorResponse("NOT_FOUND", message);
}

export function conflictError(message = "Resource already exists"): Response {
  return errorResponse("CONFLICT", message);
}

export function validationError(message: string): Response {
  return errorResponse("VALIDATION_ERROR", message);
}

export function internalError(message = "An unexpected error occurred"): Response {
  return errorResponse("INTERNAL_ERROR", message);
}
