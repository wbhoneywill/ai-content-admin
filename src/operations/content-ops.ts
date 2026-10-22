/**
 * Content operations: edit bios, manage posts, remove people, swap photos.
 * All owner-entered text is sanitized; destructive deletes require a confirm
 * flag and report their blast radius.
 */
import { z } from "zod";
import {
  cloneMap,
  readJson,
  slugsIn,
  writeJson,
  type FileMap,
} from "../filemap.js";
import { contentPath, playSchema, type Collection } from "../content-model.js";
import { sanitizeInput } from "../sanitize-input.js";
import { slugify, uniqueSlug } from "../slug.js";
import {
  OperationError,
  type Operation,
  type OperationResult,
} from "./types.js";

function requireRecord(
  files: FileMap,
  collection: Collection,
  slug: string,
): Record<string, unknown> {
  const rec = readJson<Record<string, unknown>>(
    files,
    contentPath(collection, slug),
  );
  if (!rec)
    throw new OperationError(`No ${collection} item with slug "${slug}".`);
  return rec;
}

export const editBio: Operation<{ slug: string; text: string }> = {
  name: "editBio",
  description: "Replace a person's biography with new text.",
  args: z.object({ slug: z.string(), text: z.string().min(1) }),
  apply(files, { slug, text }): OperationResult {
    const rec = requireRecord(files, "people", slug);
    const next = cloneMap(files);
    writeJson(next, contentPath("people", slug), {
      ...rec,
      body: sanitizeInput(text),
    });
    return {
      files: next,
      summary: `Update the biography for "${slug}".`,
      blastRadius: [],
    };
  },
};

export const addPost: Operation<{
  title: string;
  body: string;
  date?: string;
}> = {
  name: "addPost",
  description: "Add a new blog post with a title and body (optional date).",
  args: z.object({
    title: z.string().min(1),
    body: z.string().min(1),
    date: z.string().optional(),
  }),
  apply(files, { title, body, date }): OperationResult {
    const existing = new Set(slugsIn(files, "posts"));
    const slug = uniqueSlug(slugify(title), existing);
    const iso = date ? new Date(date).toISOString() : new Date().toISOString();
    const next = cloneMap(files);
    writeJson(next, contentPath("posts", slug), {
      title,
      slug,
      date: iso,
      featuredImage: null,
      published: true,
      body: sanitizeInput(body),
    });
    return {
      files: next,
      summary: `Add a new blog post "${title}" at /${slug}/ (dated ${iso.slice(0, 10)}).`,
      blastRadius: [],
    };
  },
};

export const editPost: Operation<{
  slug: string;
  title?: string;
  body?: string;
}> = {
  name: "editPost",
  description: "Edit an existing blog post's title and/or body.",
  args: z.object({
    slug: z.string(),
    title: z.string().optional(),
    body: z.string().optional(),
  }),
  apply(files, { slug, title, body }): OperationResult {
    const rec = requireRecord(files, "posts", slug);
    if (title == null && body == null)
      throw new OperationError("Nothing to change: provide a title or body.");
    const next = cloneMap(files);
    writeJson(next, contentPath("posts", slug), {
      ...rec,
      ...(title != null ? { title } : {}),
      ...(body != null ? { body: sanitizeInput(body) } : {}),
    });
    return {
      files: next,
      summary: `Update the post "${slug}"${title ? ` (new title: "${title}")` : ""}.`,
      blastRadius: [],
    };
  },
};

export const hidePost: Operation<{ slug: string }> = {
  name: "hidePost",
  description: "Hide a blog post from the site (reversible).",
  args: z.object({ slug: z.string() }),
  apply(files, { slug }): OperationResult {
    const rec = requireRecord(files, "posts", slug);
    const next = cloneMap(files);
    writeJson(next, contentPath("posts", slug), { ...rec, published: false });
    return {
      files: next,
      summary: `Hide the post "${slug}". Reversible — nothing is deleted.`,
      blastRadius: [],
    };
  },
};

export const removePost: Operation<{ slug: string; confirm: boolean }> = {
  name: "removePost",
  description:
    "Permanently delete a blog post. Requires confirm:true. Prefer hidePost unless deletion is intended.",
  args: z.object({ slug: z.string(), confirm: z.boolean() }),
  apply(files, { slug, confirm }): OperationResult {
    const path = contentPath("posts", slug);
    if (!files.has(path))
      throw new OperationError(`No post with slug "${slug}".`);
    if (!confirm) {
      return {
        files,
        summary: `Permanently delete the post "${slug}"? This cannot be undone except via git history.`,
        blastRadius: [],
        requiresConfirmation: true,
      };
    }
    const next = cloneMap(files);
    next.delete(path);
    return {
      files: next,
      summary: `Permanently deleted the post "${slug}".`,
      blastRadius: [],
    };
  },
};

export const removePerson: Operation<{ slug: string; confirm: boolean }> = {
  name: "removePerson",
  description:
    "Permanently delete a person and strip their play credits. Requires confirm:true. Prefer hidePerson unless deletion is intended.",
  args: z.object({ slug: z.string(), confirm: z.boolean() }),
  apply(files, { slug, confirm }): OperationResult {
    const path = contentPath("people", slug);
    if (!files.has(path))
      throw new OperationError(`No person with slug "${slug}".`);

    // Find plays crediting this person (blast radius).
    const affected: string[] = [];
    for (const p of files.keys()) {
      if (!p.startsWith("src/content/plays/") || !p.endsWith(".json")) continue;
      const play = playSchema.safeParse(readJson(files, p));
      if (play.success && play.data.credits.some((c) => c.slug === slug)) {
        affected.push(play.data.title);
      }
    }

    if (!confirm) {
      return {
        files,
        summary: `Permanently delete "${slug}" and remove their credits from ${affected.length} play(s)? This cannot be undone except via git history.`,
        blastRadius: affected.map((t) => `Play "${t}" credit removed.`),
        requiresConfirmation: true,
      };
    }

    const next = cloneMap(files);
    next.delete(path);
    // Strip their credits from every play.
    for (const p of next.keys()) {
      if (!p.startsWith("src/content/plays/") || !p.endsWith(".json")) continue;
      const play = playSchema.safeParse(readJson(next, p));
      if (!play.success) continue;
      const kept = play.data.credits.filter((c) => c.slug !== slug);
      if (kept.length !== play.data.credits.length) {
        writeJson(next, p, { ...play.data, credits: kept });
      }
    }
    return {
      files: next,
      summary: `Permanently deleted "${slug}" and removed credits from ${affected.length} play(s).`,
      blastRadius: affected.map((t) => `Play "${t}" credit removed.`),
    };
  },
};

export const swapPhoto: Operation<{
  slug: string;
  collection: "people" | "articles" | "posts";
  imagePath: string;
}> = {
  name: "swapPhoto",
  description:
    "Change a person's headshot or a post/article's image. imagePath is the site path of an already-uploaded image (e.g. /wp-content/uploads/2026/06/x.jpg).",
  args: z.object({
    slug: z.string(),
    collection: z.enum(["people", "articles", "posts"]),
    imagePath: z
      .string()
      .regex(/^\/wp-content\/uploads\//, "must be an uploads path"),
  }),
  apply(files, { slug, collection, imagePath }): OperationResult {
    const rec = requireRecord(files, collection, slug);
    const field = collection === "people" ? "headshot" : "featuredImage";
    const next = cloneMap(files);
    writeJson(next, contentPath(collection, slug), {
      ...rec,
      [field]: imagePath,
    });
    return {
      files: next,
      summary: `Set the ${collection === "people" ? "headshot" : "image"} for "${slug}" to ${imagePath}.`,
      blastRadius: [],
    };
  },
};
