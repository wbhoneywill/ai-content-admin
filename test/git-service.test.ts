import { describe, it, expect } from "vitest";
import { GitService } from "../src/git/git-service.js";
import { hidePerson } from "../src/operations/visibility.js";
import { MockGitHub } from "./mock-github.js";

function seedRepo(): Record<string, string> {
  const j = (o: unknown) => JSON.stringify(o, null, 2) + "\n";
  return {
    "src/content/people/esin-alpogan.json": j({
      title: "Esin Alpogan",
      slug: "esin-alpogan",
      date: null,
      headshot: null,
      role: null,
      published: true,
      body: "<p>Bio.</p>",
    }),
    "README.md": "# not content\n",
  };
}

describe("GitService", () => {
  it("loads only the content working tree", async () => {
    const gh = new MockGitHub(seedRepo());
    const svc = new GitService(gh);
    const tree = await svc.loadWorkingTree();
    expect(tree.has("src/content/people/esin-alpogan.json")).toBe(true);
    expect(tree.has("README.md")).toBe(false);
  });

  it("commits an operation delta to preview", async () => {
    const gh = new MockGitHub(seedRepo());
    const svc = new GitService(gh);
    const before = await svc.loadWorkingTree();
    const after = hidePerson.apply(before, { slug: "esin-alpogan" }).files;
    const sha = await svc.commit(before, after, "Hide Esin");
    expect(sha).toBeTruthy();
    const onPreview = gh.filesAt("preview");
    expect(
      JSON.parse(onPreview.get("src/content/people/esin-alpogan.json")!)
        .published,
    ).toBe(false);
    // main is untouched until publish.
    expect(
      JSON.parse(
        gh.filesAt("main").get("src/content/people/esin-alpogan.json")!,
      ).published,
    ).toBe(true);
  });

  it("returns null when there is nothing to commit", async () => {
    const gh = new MockGitHub(seedRepo());
    const svc = new GitService(gh);
    const tree = await svc.loadWorkingTree();
    expect(await svc.commit(tree, tree, "noop")).toBeNull();
  });

  it("publish merges preview into main and aligns preview", async () => {
    const gh = new MockGitHub(seedRepo());
    const svc = new GitService(gh);
    const before = await svc.loadWorkingTree();
    const after = hidePerson.apply(before, { slug: "esin-alpogan" }).files;
    await svc.commit(before, after, "Hide Esin");

    await svc.publish();
    // main now reflects the change.
    expect(
      JSON.parse(
        gh.filesAt("main").get("src/content/people/esin-alpogan.json")!,
      ).published,
    ).toBe(false);
    // preview and main are aligned.
    expect(await gh.getBranchSha("preview")).toBe(
      await gh.getBranchSha("main"),
    );
  });

  it("checkDivergence reports fast-forwardable after a commit", async () => {
    const gh = new MockGitHub(seedRepo());
    const svc = new GitService(gh);
    const before = await svc.loadWorkingTree();
    const after = hidePerson.apply(before, { slug: "esin-alpogan" }).files;
    await svc.commit(before, after, "Hide Esin");
    const d = await svc.checkDivergence();
    expect(d.canFastForward).toBe(true);
  });

  it("undoLast reverts the most recent preview commit", async () => {
    const gh = new MockGitHub(seedRepo());
    const svc = new GitService(gh);
    const before = await svc.loadWorkingTree();
    const after = hidePerson.apply(before, { slug: "esin-alpogan" }).files;
    await svc.commit(before, after, "Hide Esin");
    await svc.undoLast();
    // reverted back to published:true
    expect(
      JSON.parse(
        gh.filesAt("preview").get("src/content/people/esin-alpogan.json")!,
      ).published,
    ).toBe(true);
  });
});
