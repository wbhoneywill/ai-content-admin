/**
 * Operation engine types. An Operation maps validated arguments onto a
 * deterministic edit of a FileMap, returning the new FileMap plus a
 * human-readable summary and the blast radius (other items it touched).
 *
 * The LLM only ever selects an operation and fills its args; the apply logic
 * is plain, tested code. This is the core safety boundary.
 */
import type { z } from "zod";
import type { FileMap } from "../filemap.js";

export interface OperationResult {
  /** The mutated file map (a new object; input is not modified). */
  files: FileMap;
  /** Plain-English description of what changed, shown to the owner. */
  summary: string;
  /** Other items affected beyond the primary target (e.g. credit cleanup). */
  blastRadius: string[];
  /** True when the op requires an extra explicit confirmation (destructive). */
  requiresConfirmation?: boolean;
}

export interface Operation<A = unknown> {
  /** Stable name, used as the LLM tool name and in commit messages. */
  name: string;
  /** One-line description for the LLM tool schema and UI. */
  description: string;
  /** Zod schema for the operation's arguments. */
  args: z.ZodType<A>;
  /** Apply the operation to a copy of the files. Must not mutate the input. */
  apply(files: FileMap, args: A): OperationResult;
}

/** Thrown by an operation when it cannot proceed (e.g. target not found). */
export class OperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OperationError";
  }
}
