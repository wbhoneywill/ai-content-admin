import { describe, it, expect } from "vitest";
import { Orchestrator } from "../src/orchestrator.js";
import { GitService } from "../src/git/git-service.js";
import { writeNowProfile } from "../src/profile.js";
import { MockGitHub } from "./mock-github.js";
import { MockLLM, simpleHideRule } from "./mock-llm.js";
import type { Interpretation } from "../src/llm/adapter.js";

function seed(): Record<string, string> {
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
    "src/content/people/secil-honeywill.json": j({
      title: "Secil Honeywill",
      slug: "secil-honeywill",
      date: null,
      headshot: null,
      role: null,
      published: true,
      body: "<p>Founder.</p>",
    }),
  };
}

function makeOrchestrator(
  rule: (p: string, c: never) => Interpretation = simpleHideRule as never,
) {
  const gh = new MockGitHub(seed());
  const git = new GitService(gh);
  const llm = new MockLLM(rule as never);
  return { orch: new Orchestrator(writeNowProfile, llm, git), gh };
}

describe("Orchestrator.propose", () => {
  it("proposes a hidePerson from a natural prompt without committing", async () => {
    const { orch, gh } = makeOrchestrator();
    const res = await orch.propose("please hide Esin Alpogan");
    expect(res.kind).toBe("proposal");
    if (res.kind !== "proposal") return;
    expect(res.operation).toBe("hidePerson");
    expect(res.summary).toMatch(/esin-alpogan/);
    // Nothing committed yet: preview still shows published:true.
    const rec = JSON.parse(
      gh.filesAt("preview").get("src/content/people/esin-alpogan.json")!,
    );
    expect(rec.published).toBe(true);
  });

  it("asks for clarification on an ambiguous request", async () => {
    const rule = (): Interpretation => ({
      kind: "clarify",
      question: "Which one?",
      candidates: ["A", "B"],
    });
    const { orch } = makeOrchestrator(rule);
    const res = await orch.propose("remove the writer");
    expect(res.kind).toBe("clarify");
  });

  it("declines an unsupported request", async () => {
    const { orch } = makeOrchestrator();
    const res = await orch.propose("change the site font to Comic Sans");
    expect(res.kind).toBe("decline");
  });

  it("errors on invalid operation arguments", async () => {
    const rule = (): Interpretation => ({
      kind: "operation",
      operation: "hidePerson",
      args: {}, // missing slug
    });
    const { orch } = makeOrchestrator(rule);
    const res = await orch.propose("hide someone");
    expect(res.kind).toBe("error");
  });

  it("errors when the target does not exist", async () => {
    const rule = (): Interpretation => ({
      kind: "operation",
      operation: "hidePerson",
      args: { slug: "ghost" },
    });
    const { orch } = makeOrchestrator(rule);
    const res = await orch.propose("hide ghost");
    expect(res.kind).toBe("error");
  });
});

describe("Orchestrator.approve / reject", () => {
  it("commits to preview only after approval", async () => {
    const { orch, gh } = makeOrchestrator();
    const res = await orch.propose("hide Esin Alpogan");
    if (res.kind !== "proposal") throw new Error("expected proposal");

    const { committed } = await orch.approve(res.id);
    expect(committed).toBe(true);
    const rec = JSON.parse(
      gh.filesAt("preview").get("src/content/people/esin-alpogan.json")!,
    );
    expect(rec.published).toBe(false);
    // main untouched (no publish).
    const main = JSON.parse(
      gh.filesAt("main").get("src/content/people/esin-alpogan.json")!,
    );
    expect(main.published).toBe(true);
  });

  it("reject discards the pending proposal", async () => {
    const { orch } = makeOrchestrator();
    const res = await orch.propose("hide Esin Alpogan");
    if (res.kind !== "proposal") throw new Error("expected proposal");
    orch.reject(res.id);
    expect(orch.hasPending(res.id)).toBe(false);
    await expect(orch.approve(res.id)).rejects.toThrow();
  });
});
