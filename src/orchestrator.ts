/**
 * Orchestrator — turns a prompt into a reviewed, committable proposal.
 *
 * Flow (propose → approve, Requirement 2):
 *   propose(prompt):
 *     1. load working tree from preview
 *     2. LLM: prompt -> interpretation (operation | clarify | decline)
 *     3. validate the chosen operation's args
 *     4. apply the operation to a FileMap copy
 *     5. run the validation gate
 *     6. return a Proposal (summary, blast radius, pending id) — NOTHING is
 *        committed yet
 *   approve(pendingId):
 *     7. commit the held FileMap delta to the preview branch
 *
 * The orchestrator holds pending proposals in memory keyed by id; the caller
 * (API) correlates approve with the right proposal.
 */
import { randomUUID } from "node:crypto";
import type { FileMap } from "./filemap.js";
import { validate, type ValidationResult } from "./validate.js";
import type { GitService } from "./git/git-service.js";
import type { SiteProfile } from "./profile.js";
import type {
  InterpretContext,
  LLMAdapter,
  SlugIndexEntry,
} from "./llm/adapter.js";
import { OperationError } from "./operations/types.js";

export type ProposeResult =
  | {
      kind: "proposal";
      id: string;
      operation: string;
      summary: string;
      blastRadius: string[];
      requiresConfirmation: boolean;
      validation: ValidationResult;
    }
  | { kind: "clarify"; question: string; candidates?: string[] }
  | { kind: "decline"; reason: string }
  | { kind: "error"; message: string };

interface Pending {
  before: FileMap;
  after: FileMap;
  operation: string;
  summary: string;
}

export class Orchestrator {
  private pending = new Map<string, Pending>();

  constructor(
    private profile: SiteProfile,
    private llm: LLMAdapter,
    private git: GitService,
  ) {}

  private buildContext(files: FileMap): InterpretContext {
    const index: SlugIndexEntry[] = [];
    for (const [path, raw] of files) {
      const m = path.match(/^src\/content\/([^/]+)\/(.+)\.json$/);
      if (!m) continue;
      try {
        const rec = JSON.parse(raw);
        index.push({
          collection: m[1],
          slug: rec.slug ?? m[2],
          title: rec.title ?? m[2],
          published: rec.published !== false,
        });
      } catch {
        /* skip unparseable */
      }
    }
    const operations = [...this.profile.operations.values()].map((op) => ({
      name: op.name,
      description: op.description,
    }));
    return { index, operations };
  }

  async propose(prompt: string): Promise<ProposeResult> {
    const before = await this.git.loadWorkingTree();
    const context = this.buildContext(before);

    const interp = await this.llm.interpret(prompt, context);
    if (interp.kind === "clarify")
      return {
        kind: "clarify",
        question: interp.question,
        candidates: interp.candidates,
      };
    if (interp.kind === "decline")
      return { kind: "decline", reason: interp.reason };

    const op = this.profile.operations.get(interp.operation);
    if (!op) {
      return {
        kind: "decline",
        reason: `Unknown operation "${interp.operation}".`,
      };
    }

    // Validate the operation's arguments against its schema.
    const argsParse = op.args.safeParse(interp.args);
    if (!argsParse.success) {
      return {
        kind: "error",
        message: `Invalid arguments for ${op.name}: ${argsParse.error.issues
          .map((i) => `${i.path.join(".")} ${i.message}`)
          .join("; ")}`,
      };
    }

    // Apply + validate.
    let result;
    try {
      result = op.apply(before, argsParse.data as never);
    } catch (e) {
      if (e instanceof OperationError)
        return { kind: "error", message: e.message };
      throw e;
    }

    const validation = validate(result.files);
    if (!validation.ok) {
      return {
        kind: "error",
        message:
          "This change would break the site: " +
          validation.issues
            .filter((i) => i.kind === "schema")
            .map((i) => i.message)
            .join("; "),
      };
    }

    const id = randomUUID();
    this.pending.set(id, {
      before,
      after: result.files,
      operation: op.name,
      summary: result.summary,
    });

    return {
      kind: "proposal",
      id,
      operation: op.name,
      summary: result.summary,
      blastRadius: result.blastRadius,
      requiresConfirmation: result.requiresConfirmation ?? false,
      validation,
    };
  }

  /** Commit a previously proposed change to the preview branch. */
  async approve(
    id: string,
  ): Promise<{ committed: boolean; sha: string | null }> {
    const p = this.pending.get(id);
    if (!p) throw new Error("No pending proposal with that id (expired?).");
    const sha = await this.git.commit(
      p.before,
      p.after,
      `${p.operation}: ${p.summary}`,
    );
    this.pending.delete(id);
    return { committed: sha !== null, sha };
  }

  /** Discard a pending proposal without committing. */
  reject(id: string): void {
    this.pending.delete(id);
  }

  hasPending(id: string): boolean {
    return this.pending.has(id);
  }
}
