/**
 * FileMap — an in-memory snapshot of the relevant repo files (path -> text).
 * Operations apply to a FileMap deterministically, producing a new FileMap plus
 * a change description. This keeps operations pure and unit-testable; the git
 * service is the only thing that touches the real repo, and it diffs the
 * before/after FileMaps to produce a commit.
 */
import type { Collection } from "./content-model.js";
import { COLLECTIONS, contentPath } from "./content-model.js";

export type FileMap = Map<string, string>;

/** A record of a single file-level change, for diffing and commit messages. */
export interface FileChange {
  path: string;
  kind: "add" | "update" | "delete";
}

export function readJson<T = unknown>(map: FileMap, path: string): T | null {
  const raw = map.get(path);
  if (raw == null) return null;
  return JSON.parse(raw) as T;
}

export function writeJson(map: FileMap, path: string, value: unknown): void {
  map.set(path, JSON.stringify(value, null, 2) + "\n");
}

export function cloneMap(map: FileMap): FileMap {
  return new Map(map);
}

/** Compute the set of changes between two FileMaps. */
export function diff(before: FileMap, after: FileMap): FileChange[] {
  const changes: FileChange[] = [];
  for (const [path, content] of after) {
    if (!before.has(path)) changes.push({ path, kind: "add" });
    else if (before.get(path) !== content)
      changes.push({ path, kind: "update" });
  }
  for (const path of before.keys()) {
    if (!after.has(path)) changes.push({ path, kind: "delete" });
  }
  return changes.sort((a, b) => a.path.localeCompare(b.path));
}

/** List the slugs present in a collection within the map. */
export function slugsIn(map: FileMap, collection: Collection): string[] {
  const prefix = `src/content/${collection}/`;
  const slugs: string[] = [];
  for (const path of map.keys()) {
    if (path.startsWith(prefix) && path.endsWith(".json")) {
      slugs.push(path.slice(prefix.length, -".json".length));
    }
  }
  return slugs.sort();
}

/** Find the collection + path for a slug, searching all collections. */
export function locate(
  map: FileMap,
  slug: string,
): { collection: Collection; path: string } | null {
  for (const collection of COLLECTIONS) {
    const path = contentPath(collection, slug);
    if (map.has(path)) return { collection, path };
  }
  return null;
}
