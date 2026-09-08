// Fetch helpers and the one error type the UI knows about. Shared by api.ts and
// the dev mock so neither has to import the other.
import type { ZodType } from "zod";
import { ErrorResponseSchema } from "./schema";
import type { ErrorCode } from "../types";

/** Every failure the UI can show, in the shape of the frozen error contract. */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly detail: string;
  readonly ids?: string[];
  readonly status?: number;

  constructor(code: ErrorCode, detail: string, options: { ids?: string[]; status?: number } = {}) {
    super(detail);
    this.name = "ApiError";
    this.code = code;
    this.detail = detail;
    this.ids = options.ids;
    this.status = options.status;
  }
}

/** What the client shows when even the error body is not the contract shape. */
export const UNEXPECTED = "Unexpected response from the server.";

/** Turn any non-2xx response into an ApiError, never a raw fetch failure. */
export async function errorFrom(response: Response): Promise<ApiError> {
  let body: unknown;
  try {
    body = JSON.parse(await response.text());
  } catch {
    return new ApiError("internal", UNEXPECTED, { status: response.status });
  }
  const parsed = ErrorResponseSchema.safeParse(body);
  if (!parsed.success) return new ApiError("internal", UNEXPECTED, { status: response.status });
  return new ApiError(parsed.data.error, parsed.data.detail, {
    ids: parsed.data.ids,
    status: response.status,
  });
}

/** GET a JSON document and parse it, or throw an ApiError. */
export async function getJson<T>(url: string, schema: ZodType<T>): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw await errorFrom(response);
  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    throw new ApiError("internal", `${url} is not in the shape this app expects.`);
  }
  return parsed.data;
}

/** Same, but a missing or unreadable document is null rather than an error. */
export async function getOptionalJson<T>(url: string, schema: ZodType<T>): Promise<T | null> {
  try {
    return await getJson(url, schema);
  } catch {
    return null;
  }
}
