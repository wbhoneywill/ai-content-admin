/**
 * Real GitHubClient implementation over the GitHub REST API (Git Data API)
 * using fetch — no SDK. Commits are atomic tree-commits; no local clone.
 *
 * Scope needed by the token: contents write on the one content repo.
 */
import type { GitHubClient, RepoFile } from "./github-client.js";

export interface GitHubRestOptions {
  token: string;
  /** "owner/name" */
  repo: string;
  apiBase?: string;
  fetchImpl?: typeof fetch;
}

export class GitHubRestClient implements GitHubClient {
  private base: string;
  private fetchImpl: typeof fetch;

  constructor(private opts: GitHubRestOptions) {
    this.base = `${opts.apiBase ?? "https://api.github.com"}/repos/${opts.repo}`;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async gh<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.fetchImpl(`${this.base}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.opts.token}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
        "user-agent": "ai-content-admin",
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `GitHub ${init?.method ?? "GET"} ${path} ${res.status}: ${text.slice(0, 200)}`,
      );
    }
    return (await res.json()) as T;
  }

  async getBranchSha(branch: string): Promise<string> {
    const ref = await this.gh<{ object: { sha: string } }>(
      `/git/ref/heads/${encodeURIComponent(branch)}`,
    );
    return ref.object.sha;
  }

  async createBranch(branch: string, fromSha: string): Promise<void> {
    await this.gh(`/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: fromSha }),
    });
  }

  async listFiles(ref: string, prefix: string): Promise<RepoFile[]> {
    // One tree call returns every path+SHA; then fetch blobs in parallel
    // batches (fetching ~150 blobs sequentially is slow enough to hit the
    // function timeout -> 504).
    const tree = await this.gh<{
      tree: Array<{ path: string; type: string; sha: string }>;
    }>(`/git/trees/${ref}?recursive=1`);
    const blobs = tree.tree.filter(
      (t) => t.type === "blob" && t.path.startsWith(prefix),
    );

    const fetchBlob = async (b: { path: string; sha: string }) => {
      const blob = await this.gh<{ content: string; encoding: string }>(
        `/git/blobs/${b.sha}`,
      );
      const content =
        blob.encoding === "base64"
          ? Buffer.from(blob.content, "base64").toString("utf8")
          : blob.content;
      return { path: b.path, content };
    };

    const CONCURRENCY = 16;
    const files: RepoFile[] = [];
    for (let i = 0; i < blobs.length; i += CONCURRENCY) {
      const batch = blobs.slice(i, i + CONCURRENCY);
      files.push(...(await Promise.all(batch.map(fetchBlob))));
    }
    return files;
  }

  async commitFiles(params: {
    branch: string;
    message: string;
    prefix: string;
    files: RepoFile[];
    deletions: string[];
  }): Promise<string> {
    const parentSha = await this.getBranchSha(params.branch);
    const parentCommit = await this.gh<{ tree: { sha: string } }>(
      `/git/commits/${parentSha}`,
    );

    const treeItems: Array<Record<string, unknown>> = [];
    for (const f of params.files) {
      treeItems.push({
        path: f.path,
        mode: "100644",
        type: "blob",
        content: f.content,
      });
    }
    for (const d of params.deletions) {
      // Setting sha:null deletes the path in the new tree.
      treeItems.push({ path: d, mode: "100644", type: "blob", sha: null });
    }

    const newTree = await this.gh<{ sha: string }>(`/git/trees`, {
      method: "POST",
      body: JSON.stringify({
        base_tree: parentCommit.tree.sha,
        tree: treeItems,
      }),
    });

    const commit = await this.gh<{ sha: string }>(`/git/commits`, {
      method: "POST",
      body: JSON.stringify({
        message: params.message,
        tree: newTree.sha,
        parents: [parentSha],
      }),
    });

    await this.updateBranch(params.branch, commit.sha);
    return commit.sha;
  }

  async merge(base: string, head: string, message: string): Promise<string> {
    const res = await this.gh<{ sha: string }>(`/merges`, {
      method: "POST",
      body: JSON.stringify({ base, head, commit_message: message }),
    });
    return res.sha;
  }

  async updateBranch(branch: string, sha: string): Promise<void> {
    await this.gh(`/git/refs/heads/${encodeURIComponent(branch)}`, {
      method: "PATCH",
      body: JSON.stringify({ sha, force: true }),
    });
  }

  async revertCommit(branch: string, sha: string): Promise<string> {
    // Reconstruct the parent's tree as a new commit (simple revert of a single
    // commit on top of the branch).
    const commit = await this.gh<{ parents: { sha: string }[] }>(
      `/git/commits/${sha}`,
    );
    const parentSha = commit.parents[0]?.sha;
    if (!parentSha) throw new Error("Cannot revert a root commit.");
    const parent = await this.gh<{ tree: { sha: string } }>(
      `/git/commits/${parentSha}`,
    );
    const head = await this.getBranchSha(branch);
    const revert = await this.gh<{ sha: string }>(`/git/commits`, {
      method: "POST",
      body: JSON.stringify({
        message: `Revert ${sha.slice(0, 7)}`,
        tree: parent.tree.sha,
        parents: [head],
      }),
    });
    await this.updateBranch(branch, revert.sha);
    return revert.sha;
  }

  async isAncestor(ancestor: string, descendant: string): Promise<boolean> {
    const cmp = await this.gh<{ status: string }>(
      `/compare/${ancestor}...${descendant}`,
    );
    // "ahead" or "identical" => ancestor is reachable from descendant.
    return cmp.status === "ahead" || cmp.status === "identical";
  }
}
