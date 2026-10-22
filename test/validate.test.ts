import { describe, it, expect } from "vitest";
import { validate } from "../src/validate.js";
import { hidePerson } from "../src/operations/visibility.js";
import { fixtureFiles } from "./fixtures.js";

describe("validate", () => {
  it("passes a clean fixture", () => {
    const res = validate(fixtureFiles());
    expect(res.ok).toBe(true);
    expect(res.issues.filter((i) => i.kind === "schema")).toHaveLength(0);
  });

  it("fails on a schema violation (missing required field)", () => {
    const files = fixtureFiles();
    files.set(
      "src/content/posts/broken.json",
      JSON.stringify({ title: "x" }) + "\n", // missing slug/date/body...
    );
    const res = validate(files);
    expect(res.ok).toBe(false);
    expect(res.issues.some((i) => i.kind === "schema")).toBe(true);
  });

  it("fails on invalid JSON", () => {
    const files = fixtureFiles();
    files.set("src/content/posts/bad.json", "{not json");
    const res = validate(files);
    expect(res.ok).toBe(false);
  });

  it("notes a hidden-person credit as a non-fatal reference issue", () => {
    const hidden = hidePerson.apply(fixtureFiles(), {
      slug: "esin-alpogan",
    }).files;
    const res = validate(hidden);
    expect(res.ok).toBe(true); // reference notes are informational
    expect(
      res.issues.some(
        (i) => i.kind === "reference" && /esin-alpogan/.test(i.message),
      ),
    ).toBe(true);
  });
});
