import { describe, it, expect, beforeEach } from "vitest";
import { createApi } from "../src/http/api.js";
import { PasswordAuth } from "../src/auth/auth.js";
import { Orchestrator } from "../src/orchestrator.js";
import { GitService } from "../src/git/git-service.js";
import { writeNowProfile } from "../src/profile.js";
import { MockGitHub } from "./mock-github.js";
import { MockLLM, simpleHideRule } from "./mock-llm.js";

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

function setup() {
  const gh = new MockGitHub(seed());
  const git = new GitService(gh);
  const orchestrator = new Orchestrator(
    writeNowProfile,
    new MockLLM(simpleHideRule as never),
    git,
  );
  const auth = new PasswordAuth({ password: "pw", secret: "k" });
  const handle = createApi({
    auth,
    orchestrator,
    git,
    profile: writeNowProfile,
    secureCookies: false,
  });
  return { handle, gh, auth };
}

function post(path: string, body?: unknown, cookie?: string): Request {
  return new Request(`https://admin.test${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("HTTP API", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  async function loginCookie(): Promise<string> {
    const res = await ctx.handle(post("/api/login", { password: "pw" }));
    const setCookie = res.headers.get("set-cookie")!;
    return setCookie.split(";")[0];
  }

  it("rejects unauthenticated requests", async () => {
    const res = await ctx.handle(post("/api/propose", { prompt: "hide x" }));
    expect(res.status).toBe(401);
  });

  it("rejects a bad password", async () => {
    const res = await ctx.handle(post("/api/login", { password: "wrong" }));
    expect(res.status).toBe(401);
  });

  it("logs in and issues a session cookie", async () => {
    const res = await ctx.handle(post("/api/login", { password: "pw" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("acadmin_session=");
  });

  it("propose → approve commits to preview, not main", async () => {
    const cookie = await loginCookie();
    const proposeRes = await ctx.handle(
      post("/api/propose", { prompt: "hide Esin Alpogan" }, cookie),
    );
    const proposal = (await proposeRes.json()) as {
      kind: string;
      id: string;
    };
    expect(proposal.kind).toBe("proposal");

    const approveRes = await ctx.handle(
      post("/api/approve", { id: proposal.id }, cookie),
    );
    expect(((await approveRes.json()) as { ok: boolean }).ok).toBe(true);

    expect(
      JSON.parse(
        ctx.gh.filesAt("preview").get("src/content/people/esin-alpogan.json")!,
      ).published,
    ).toBe(false);
    expect(
      JSON.parse(
        ctx.gh.filesAt("main").get("src/content/people/esin-alpogan.json")!,
      ).published,
    ).toBe(true);
  });

  it("publish merges preview into main", async () => {
    const cookie = await loginCookie();
    const proposal = (await (
      await ctx.handle(
        post("/api/propose", { prompt: "hide Esin Alpogan" }, cookie),
      )
    ).json()) as { id: string };
    await ctx.handle(post("/api/approve", { id: proposal.id }, cookie));

    const pub = await ctx.handle(post("/api/publish", undefined, cookie));
    expect(((await pub.json()) as { ok: boolean }).ok).toBe(true);
    expect(
      JSON.parse(
        ctx.gh.filesAt("main").get("src/content/people/esin-alpogan.json")!,
      ).published,
    ).toBe(false);
  });

  it("status reports publishability", async () => {
    const cookie = await loginCookie();
    const res = await ctx.handle(
      new Request("https://admin.test/api/status", {
        headers: { cookie },
      }),
    );
    const body = (await res.json()) as { preview: { canPublish: boolean } };
    expect(body.preview.canPublish).toBe(false); // nothing staged yet
  });
});
