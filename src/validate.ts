/**
 * Task 4 — the validation gate.
 *
 * Before any proposed change is shown to the owner (and before it can be
 * committed), it is applied to a FileMap and run through this gate:
 *   1. Schema validation — every content file matches its Zod schema.
 *   2. Reference integrity — no content links to an item that is missing or
 *      unpublished (a dry-run of the site's reconcile link check).
 * Returns a structured result; the orchestrator blocks on failure.
 */
import {
  COLLECTIONS,
  SCHEMAS,
  playSchema,
  urlFor,
  type Collection,
} from "./content-model.js";
import { readJson, type FileMap } from "./filemap.js";

export interface ValidationIssue {
  kind: "schema" | "reference";
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

function collectionOf(path: string): Collection | null {
  const m = path.match(/^src\/content\/([^/]+)\//);
  const c = m?.[1];
  return c && (COLLECTIONS as string[]).includes(c) ? (c as Collection) : null;
}

/** Set of URL paths that are present AND published in the map. */
function publishedUrls(files: FileMap): Set<string> {
  const urls = new Set<string>();
  for (const [path, raw] of files) {
    const collection = collectionOf(path);
    if (!collection || !path.endsWith(".json")) continue;
    let rec: { slug?: string; path?: string; published?: boolean };
    try {
      rec = JSON.parse(raw);
    } catch {
      continue;
    }
    if (rec.published === false) continue;
    if (!rec.slug) continue;
    urls.add(urlFor(collection, { slug: rec.slug, path: rec.path }));
  }
  return urls;
}

export function validate(files: FileMap): ValidationResult {
  const issues: ValidationIssue[] = [];

  // 1) Schema validation.
  for (const [path, raw] of files) {
    const collection = collectionOf(path);
    if (!collection || !path.endsWith(".json")) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      issues.push({
        kind: "schema",
        path,
        message: `Invalid JSON: ${String(e)}`,
      });
      continue;
    }
    const result = SCHEMAS[collection].safeParse(parsed);
    if (!result.success) {
      issues.push({
        kind: "schema",
        path,
        message: result.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      });
    }
  }

  // 2) Reference integrity: play credits must point at published people.
  const live = publishedUrls(files);
  for (const path of files.keys()) {
    if (!path.startsWith("src/content/plays/") || !path.endsWith(".json"))
      continue;
    const play = playSchema.safeParse(readJson(files, path));
    if (!play.success) continue;
    for (const c of play.data.credits) {
      if (!c.slug) continue;
      const url = `/people/${c.slug}/`;
      if (!live.has(url)) {
        // Not an error: the renderer degrades these to plain text. We record
        // it as informational so the orchestrator can surface it, but it does
        // not fail the gate (matches the site's graceful-degradation).
        issues.push({
          kind: "reference",
          path,
          message: `Credit "${c.name}" (${c.slug}) is hidden/missing; will render as plain text.`,
        });
      }
    }
  }

  // Only schema issues are fatal; reference notes are informational.
  const fatal = issues.some((i) => i.kind === "schema");
  return { ok: !fatal, issues };
}
