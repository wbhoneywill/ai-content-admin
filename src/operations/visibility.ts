/**
 * Visibility operations: hide/unhide content items by toggling `published`.
 * These are the safest, fully reversible edits and the default for "remove".
 */
import { z } from "zod";
import {
  cloneMap,
  locate,
  readJson,
  writeJson,
  type FileMap,
} from "../filemap.js";
import {
  COLLECTIONS,
  contentPath,
  playSchema,
  type Collection,
} from "../content-model.js";
import {
  OperationError,
  type Operation,
  type OperationResult,
} from "./types.js";

/** Collections of the plays that credit a given person slug. */
function playsCrediting(files: FileMap, personSlug: string): string[] {
  const out: string[] = [];
  for (const path of files.keys()) {
    if (!path.startsWith("src/content/plays/") || !path.endsWith(".json"))
      continue;
    const play = playSchema.safeParse(readJson(files, path));
    if (!play.success) continue;
    if (play.data.credits.some((c) => c.slug === personSlug)) {
      out.push(play.data.title);
    }
  }
  return out.sort();
}

function setPublished(
  files: FileMap,
  collection: Collection,
  slug: string,
  value: boolean,
): FileMap {
  const path = contentPath(collection, slug);
  const rec = readJson<Record<string, unknown>>(files, path);
  if (!rec)
    throw new OperationError(`No ${collection} item with slug "${slug}".`);
  const next = cloneMap(files);
  writeJson(next, path, { ...rec, published: value });
  return next;
}

export const hidePerson: Operation<{ slug: string }> = {
  name: "hidePerson",
  description:
    "Hide a person's profile from the site (reversible). Use for 'remove' or 'take down' requests about a person.",
  args: z.object({ slug: z.string() }),
  apply(files, { slug }): OperationResult {
    const path = contentPath("people", slug);
    if (!files.has(path))
      throw new OperationError(`No person with slug "${slug}".`);
    const next = setPublished(files, "people", slug, false);
    const credited = playsCrediting(files, slug);
    return {
      files: next,
      summary: `Hide the profile for "${slug}". It will no longer appear on the site, but nothing is deleted — it can be unhidden anytime.`,
      blastRadius: credited.map(
        (t) =>
          `Play "${t}" credits this person; their name will show without a link.`,
      ),
    };
  },
};

export const unhide: Operation<{ slug: string; collection?: Collection }> = {
  name: "unhide",
  description: "Make a previously hidden item visible again.",
  args: z.object({
    slug: z.string(),
    collection: z.enum(COLLECTIONS as [Collection, ...Collection[]]).optional(),
  }),
  apply(files, { slug, collection }): OperationResult {
    let coll = collection;
    if (!coll) {
      const found = locate(files, slug);
      if (!found) throw new OperationError(`No item with slug "${slug}".`);
      coll = found.collection;
    }
    const next = setPublished(files, coll, slug, true);
    return {
      files: next,
      summary: `Unhide "${slug}" (${coll}). It will appear on the site again.`,
      blastRadius: [],
    };
  },
};
