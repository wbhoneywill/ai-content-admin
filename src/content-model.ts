/**
 * The content model, mirrored from the WriteNow Berlin content repo
 * (src/content.config.ts). The admin validates and edits the raw JSON files,
 * so it needs the same Zod shapes — but it cannot import Astro's
 * `astro:content`, hence this standalone copy.
 *
 * KEEP IN SYNC with the content repo's schemas. A drift test (schema version)
 * guards against silent divergence.
 */
import { z } from "zod";

/** Bump when the shape changes; mirror in the content repo if it diverges. */
export const SCHEMA_VERSION = 1;

const html = z.string();
const isoDate = z.string().datetime().nullable();
const published = z.boolean().default(true);

export const creditSchema = z.object({
  role: z.string(),
  name: z.string(),
  slug: z.string().optional(),
});

export const pageSchema = z.object({
  title: z.string(),
  slug: z.string(),
  path: z.string(),
  date: isoDate,
  featuredImage: z.string().nullable(),
  published,
  body: html,
});

export const personSchema = z.object({
  title: z.string(),
  slug: z.string(),
  date: isoDate,
  headshot: z.string().nullable(),
  role: z.string().nullable(),
  published,
  body: html,
});

export const playSchema = z.object({
  title: z.string(),
  slug: z.string(),
  date: isoDate,
  poster: z.string().nullable(),
  youtube: z.string().nullable(),
  bgColour: z.string().nullable(),
  credits: z.array(creditSchema),
  published,
  body: html,
});

export const articleSchema = z.object({
  title: z.string(),
  slug: z.string(),
  date: isoDate,
  featuredImage: z.string().nullable(),
  published,
  body: html,
});

export const postSchema = z.object({
  title: z.string(),
  slug: z.string(),
  date: isoDate,
  featuredImage: z.string().nullable(),
  published,
  body: html,
});

export type Collection = "pages" | "people" | "plays" | "articles" | "posts";

export const SCHEMAS: Record<Collection, z.ZodTypeAny> = {
  pages: pageSchema,
  people: personSchema,
  plays: playSchema,
  articles: articleSchema,
  posts: postSchema,
};

export const COLLECTIONS: Collection[] = [
  "pages",
  "people",
  "plays",
  "articles",
  "posts",
];

export type Page = z.infer<typeof pageSchema>;
export type Person = z.infer<typeof personSchema>;
export type Play = z.infer<typeof playSchema>;
export type Article = z.infer<typeof articleSchema>;
export type Post = z.infer<typeof postSchema>;
export type Credit = z.infer<typeof creditSchema>;

/** Repo path for a content item. */
export function contentPath(collection: Collection, slug: string): string {
  return `src/content/${collection}/${slug}.json`;
}

/** Site URL path an item renders at. */
export function urlFor(
  collection: Collection,
  rec: { slug: string; path?: string },
): string {
  if (collection === "pages") return rec.path ?? `/${rec.slug}/`;
  if (collection === "people") return `/people/${rec.slug}/`;
  if (collection === "plays") return `/plays/${rec.slug}/`;
  if (collection === "articles") return `/article/${rec.slug}/`;
  return `/${rec.slug}/`; // posts
}
