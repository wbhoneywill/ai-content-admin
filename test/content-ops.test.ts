import { describe, it, expect } from "vitest";
import {
  addPost,
  editBio,
  editPost,
  hidePost,
  removePerson,
  removePost,
  swapPhoto,
} from "../src/operations/content-ops.js";
import { readJson, type FileMap } from "../src/filemap.js";
import { playSchema } from "../src/content-model.js";
import { OperationError } from "../src/operations/types.js";
import { slugify, uniqueSlug } from "../src/slug.js";
import { fixtureFiles } from "./fixtures.js";

describe("slugify / uniqueSlug", () => {
  it("slugifies titles", () => {
    expect(slugify("My Grandmother Was a Climate Hero!")).toBe(
      "my-grandmother-was-a-climate-hero",
    );
    expect(slugify("Prost Mahlzeit – hoffe es hat gemündet")).toBe(
      "prost-mahlzeit-hoffe-es-hat-gemundet",
    );
  });
  it("de-duplicates", () => {
    expect(uniqueSlug("x", new Set(["x", "x-2"]))).toBe("x-3");
  });
});

describe("editBio", () => {
  it("sanitizes and replaces the person body", () => {
    const res = editBio.apply(fixtureFiles(), {
      slug: "esin-alpogan",
      text: "A new <script>evil</script> bio.",
    });
    const rec = readJson<{ body: string }>(
      res.files,
      "src/content/people/esin-alpogan.json",
    );
    expect(rec?.body).toContain("A new");
    expect(rec?.body).not.toContain("<script");
  });
  it("throws for unknown person", () => {
    expect(() =>
      editBio.apply(fixtureFiles(), { slug: "nobody", text: "x" }),
    ).toThrow(OperationError);
  });
});

describe("addPost", () => {
  it("creates a post with a generated unique slug", () => {
    const res = addPost.apply(fixtureFiles(), {
      title: "Background Noise", // collides with fixture slug
      body: "New content.",
    });
    const added = [...res.files.keys()].find((p) =>
      p.startsWith("src/content/posts/background-noise"),
    );
    // the existing one is background-noise.json; new one must differ
    expect(res.files.has("src/content/posts/background-noise-2.json")).toBe(
      true,
    );
    expect(added).toBeTruthy();
  });
});

describe("editPost", () => {
  it("updates title and body", () => {
    const res = editPost.apply(fixtureFiles(), {
      slug: "background-noise",
      title: "Background Noise (revised)",
      body: "Updated.",
    });
    const rec = readJson<{ title: string; body: string }>(
      res.files,
      "src/content/posts/background-noise.json",
    );
    expect(rec?.title).toBe("Background Noise (revised)");
    expect(rec?.body).toContain("Updated.");
  });
  it("throws when nothing provided", () => {
    expect(() =>
      editPost.apply(fixtureFiles(), { slug: "background-noise" }),
    ).toThrow(OperationError);
  });
});

describe("hidePost", () => {
  it("sets published:false", () => {
    const res = hidePost.apply(fixtureFiles(), { slug: "background-noise" });
    const rec = readJson<{ published: boolean }>(
      res.files,
      "src/content/posts/background-noise.json",
    );
    expect(rec?.published).toBe(false);
  });
});

describe("removePost", () => {
  it("requires confirmation first", () => {
    const res = removePost.apply(fixtureFiles(), {
      slug: "background-noise",
      confirm: false,
    });
    expect(res.requiresConfirmation).toBe(true);
    expect(res.files.has("src/content/posts/background-noise.json")).toBe(true);
  });
  it("deletes when confirmed", () => {
    const res = removePost.apply(fixtureFiles(), {
      slug: "background-noise",
      confirm: true,
    });
    expect(res.files.has("src/content/posts/background-noise.json")).toBe(
      false,
    );
  });
});

describe("removePerson", () => {
  it("requires confirmation and reports blast radius", () => {
    const res = removePerson.apply(fixtureFiles(), {
      slug: "esin-alpogan",
      confirm: false,
    });
    expect(res.requiresConfirmation).toBe(true);
    expect(res.blastRadius.join(" ")).toMatch(/Transmission/);
  });

  it("deletes and strips credits when confirmed", () => {
    const res: { files: FileMap } = removePerson.apply(fixtureFiles(), {
      slug: "esin-alpogan",
      confirm: true,
    });
    expect(res.files.has("src/content/people/esin-alpogan.json")).toBe(false);
    const play = playSchema.parse(
      readJson(res.files, "src/content/plays/transmission.json"),
    );
    expect(play.credits.some((c) => c.slug === "esin-alpogan")).toBe(false);
    // Secil's credit is untouched.
    expect(play.credits.some((c) => c.slug === "secil-honeywill")).toBe(true);
  });
});

describe("swapPhoto", () => {
  it("updates a person's headshot", () => {
    const res = swapPhoto.apply(fixtureFiles(), {
      slug: "esin-alpogan",
      collection: "people",
      imagePath: "/wp-content/uploads/2026/06/new.jpg",
    });
    const rec = readJson<{ headshot: string }>(
      res.files,
      "src/content/people/esin-alpogan.json",
    );
    expect(rec?.headshot).toBe("/wp-content/uploads/2026/06/new.jpg");
  });

  it("rejects a non-uploads path via schema", () => {
    const parsed = swapPhoto.args.safeParse({
      slug: "x",
      collection: "people",
      imagePath: "https://evil.com/x.jpg",
    });
    expect(parsed.success).toBe(false);
  });
});
