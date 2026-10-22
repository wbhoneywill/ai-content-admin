import { describe, it, expect } from "vitest";
import { GitHubRestClient } from "../src/git/github-rest.js";

/** A tiny router mock for the GitHub REST endpoints the client calls. */
function mockFetch(routes: Record<string, (init?: RequestInit) => unknown>) {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const path = url.replace(
      /^https:\/\/api\.github\.com\/repos\/[^/]+\/[^/]+/,
      "",
    );
    calls.push({
      method: init?.method ?? "GET",
      path,
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    });
    // match by longest prefix
    const key = Object.keys(routes)
      .filter((k) => path.startsWith(k))
      .sort((a, b) => b.length - a.length)[0];
    if (!key) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(routes[key](init)), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("GitHubRestClient", () => {
  it("reads a branch SHA", async () => {
    const { fetchImpl } = mockFetch({
      "/git/ref/heads/preview": () => ({ object: { sha: "abc123" } }),
    });
    const gh = new GitHubRestClient({ token: "t", repo: "o/r", fetchImpl });
    expect(await gh.getBranchSha("preview")).toBe("abc123");
  });

  it("commits files as an atomic tree-commit and updates the branch", async () => {
    const { fetchImpl, calls } = mockFetch({
      "/git/ref/heads/preview": () => ({ object: { sha: "parent" } }),
      "/git/commits/parent": () => ({ tree: { sha: "basetree" } }),
      "/git/trees": () => ({ sha: "newtree" }),
      "/git/commits": () => ({ sha: "newcommit" }),
      "/git/refs/heads/preview": () => ({ ok: true }),
    });
    const gh = new GitHubRestClient({ token: "t", repo: "o/r", fetchImpl });
    const sha = await gh.commitFiles({
      branch: "preview",
      message: "test",
      prefix: "src/content/",
      files: [{ path: "src/content/people/x.json", content: "{}\n" }],
      deletions: ["src/content/people/old.json"],
    });
    expect(sha).toBe("newcommit");
    // the tree call should include base_tree and both an add and a delete
    const treeCall = calls.find((c) => c.path === "/git/trees")!;
    const body = treeCall.body as { base_tree: string; tree: unknown[] };
    expect(body.base_tree).toBe("basetree");
    expect(body.tree).toHaveLength(2);
    // branch update (PATCH) happened
    expect(
      calls.some(
        (c) => c.path === "/git/refs/heads/preview" && c.method === "PATCH",
      ),
    ).toBe(true);
  });

  it("isAncestor is true for an 'ahead' comparison", async () => {
    const { fetchImpl } = mockFetch({
      "/compare/": () => ({ status: "ahead" }),
    });
    const gh = new GitHubRestClient({ token: "t", repo: "o/r", fetchImpl });
    expect(await gh.isAncestor("main", "preview")).toBe(true);
  });

  it("throws a descriptive error on API failure", async () => {
    const failing = (async () =>
      new Response("boom", { status: 403 })) as unknown as typeof fetch;
    const gh = new GitHubRestClient({
      token: "t",
      repo: "o/r",
      fetchImpl: failing,
    });
    await expect(gh.getBranchSha("preview")).rejects.toThrow(/403/);
  });
});
