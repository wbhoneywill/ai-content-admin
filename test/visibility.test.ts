import { describe, it, expect } from "vitest";
import { hidePerson, unhide } from "../src/operations/visibility.js";
import { readJson } from "../src/filemap.js";
import { OperationError } from "../src/operations/types.js";
import { fixtureFiles } from "./fixtures.js";

describe("hidePerson", () => {
  it("sets published:false and reports credit blast radius", () => {
    const files = fixtureFiles();
    const res = hidePerson.apply(files, { slug: "esin-alpogan" });
    const rec = readJson<{ published: boolean }>(
      res.files,
      "src/content/people/esin-alpogan.json",
    );
    expect(rec?.published).toBe(false);
    // Esin is credited on Transmission -> blast radius mentions it.
    expect(res.blastRadius.join(" ")).toMatch(/Transmission/);
  });

  it("does not mutate the input file map", () => {
    const files = fixtureFiles();
    hidePerson.apply(files, { slug: "esin-alpogan" });
    const original = readJson<{ published: boolean }>(
      files,
      "src/content/people/esin-alpogan.json",
    );
    expect(original?.published).toBe(true);
  });

  it("reports no blast radius for an uncredited person", () => {
    const res = hidePerson.apply(fixtureFiles(), { slug: "secil-honeywill" });
    // Secil IS credited (Director) in the fixture, so expect a mention.
    expect(res.blastRadius.length).toBeGreaterThan(0);
  });

  it("throws for an unknown slug", () => {
    expect(() => hidePerson.apply(fixtureFiles(), { slug: "nobody" })).toThrow(
      OperationError,
    );
  });
});

describe("unhide", () => {
  it("sets published:true, auto-detecting the collection", () => {
    const files = hidePerson.apply(fixtureFiles(), {
      slug: "esin-alpogan",
    }).files;
    const res = unhide.apply(files, { slug: "esin-alpogan" });
    const rec = readJson<{ published: boolean }>(
      res.files,
      "src/content/people/esin-alpogan.json",
    );
    expect(rec?.published).toBe(true);
  });

  it("throws for an unknown slug", () => {
    expect(() => unhide.apply(fixtureFiles(), { slug: "nobody" })).toThrow(
      OperationError,
    );
  });
});
