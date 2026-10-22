import { describe, it, expect } from "vitest";
import { createApi } from "../src/http/api.js";
import { PasswordAuth } from "../src/auth/auth.js";
import { Orchestrator } from "../src/orchestrator.js";
import { GitService } from "../src/git/git-service.js";
import { writeNowProfile } from "../src/profile.js";
import { MockGitHub } from "./mock-github.js";
import { MockLLM, simpleHideRule } from "./mock-llm.js";

/**
 * End-to-end: the full admin stack (API -> orchestrator -> git service ->
 * GitHub) driven over HTTP Requests, with GitHub and the LLM mocked. Mirrors
 * the operator's "hide a person -> stage -> publish -> undo" flow.
 */
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
  };
}

describe("end-to-end editing flow", () => {
  it("hide -> stage to preview -> publish -> undo", async () => {
    const gh = new MockGitHub(seed());
    const git = new GitService(gh);
    const orchestrator = new Orchestrator(
      writeNowProfile,
      new MockLLM(simpleHideRule as never),
      git,
    );
    const auth = new PasswordAuth({ password: "pw", secret: "k-0123456789" });
    const handle = createApi({
      auth,
      orchestrator,
      git,
      profile: writeNowProfile,
      secureCookies: false,
    });

    const post = (p: string, body?: unknown, cookie?: string) =>
      handle(
        new Request(`https://admin.test${p}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(cookie ? { cookie } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        }),
      );

    // 1. login
    const loginRes = await post("/api/login", { password: "pw" });
    const cookie = loginRes.headers.get("set-cookie")!.split(";")[0];

    // 2. propose
    const proposal = (await (
      await post("/api/propose", { prompt: "hide Esin Alpogan" }, cookie)
    ).json()) as { kind: string; id: string; summary: string };
    expect(proposal.kind).toBe("proposal");

    // 3. approve -> staged on preview, main untouched
    await post("/api/approve", { id: proposal.id }, cookie);
    expect(
      JSON.parse(
        gh.filesAt("preview").get("src/content/people/esin-alpogan.json")!,
      ).published,
    ).toBe(false);
    expect(
      JSON.parse(
        gh.filesAt("main").get("src/content/people/esin-alpogan.json")!,
      ).published,
    ).toBe(true);

    // 4. publish -> main reflects it, preview aligned
    const pub = (await (await post("/api/publish", {}, cookie)).json()) as {
      ok: boolean;
    };
    expect(pub.ok).toBe(true);
    expect(
      JSON.parse(
        gh.filesAt("main").get("src/content/people/esin-alpogan.json")!,
      ).published,
    ).toBe(false);
    expect(await gh.getBranchSha("preview")).toBe(
      await gh.getBranchSha("main"),
    );

    // 5. stage another change, then undo it
    const p2 = (await (
      await post("/api/propose", { prompt: "hide Esin Alpogan" }, cookie)
    ).json()) as { kind: string; id: string };
    // already hidden now, but hidePerson is idempotent; approve creates a commit
    if (p2.kind === "proposal") {
      await post("/api/approve", { id: p2.id }, cookie);
    }
    const before = await gh.getBranchSha("preview");
    await post("/api/undo", {}, cookie);
    expect(await gh.getBranchSha("preview")).not.toBe(before);
  });
});
