import { describe, it, expect } from "vitest";
import {
  cloneMap,
  diff,
  locate,
  readJson,
  slugsIn,
  writeJson,
} from "../src/filemap.js";
import { fixtureFiles } from "./fixtures.js";

describe("filemap", () => {
  it("reads and writes JSON records", () => {
    const m = fixtureFiles();
    const rec = readJson<{ title: string }>(
      m,
      "src/content/people/esin-alpogan.json",
    );
    expect(rec?.title).toBe("Esin Alpogan");
    writeJson(m, "src/content/people/esin-alpogan.json", {
      ...rec,
      title: "Changed",
    });
    expect(
      readJson<{ title: string }>(m, "src/content/people/esin-alpogan.json")
        ?.title,
    ).toBe("Changed");
  });

  it("clones without aliasing", () => {
    const a = fixtureFiles();
    const b = cloneMap(a);
    b.delete("src/content/posts/background-noise.json");
    expect(a.has("src/content/posts/background-noise.json")).toBe(true);
  });

  it("diffs add / update / delete", () => {
    const before = fixtureFiles();
    const after = cloneMap(before);
    after.set("src/content/posts/new.json", "{}\n");
    after.set("src/content/people/esin-alpogan.json", '{"changed":true}\n');
    after.delete("src/content/posts/background-noise.json");
    const changes = diff(before, after);
    expect(changes).toContainEqual({
      path: "src/content/posts/new.json",
      kind: "add",
    });
    expect(changes).toContainEqual({
      path: "src/content/people/esin-alpogan.json",
      kind: "update",
    });
    expect(changes).toContainEqual({
      path: "src/content/posts/background-noise.json",
      kind: "delete",
    });
  });

  it("lists slugs in a collection", () => {
    expect(slugsIn(fixtureFiles(), "people")).toEqual([
      "esin-alpogan",
      "secil-honeywill",
    ]);
  });

  it("locates a slug across collections", () => {
    expect(locate(fixtureFiles(), "transmission")).toEqual({
      collection: "plays",
      path: "src/content/plays/transmission.json",
    });
    expect(locate(fixtureFiles(), "does-not-exist")).toBeNull();
  });
});
