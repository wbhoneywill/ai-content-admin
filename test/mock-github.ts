import type { GitHubClient, RepoFile } from "../src/git/github-client.js";

/**
 * An in-memory fake of the GitHub repo for tests: tracks branch SHAs, a simple
 * linear commit history per branch, and the file tree at each commit.
 */
export class MockGitHub implements GitHubClient {
  private branches = new Map<string, string>();
  private commits = new Map<
    string,
    { parent: string | null; files: Map<string, string> }
  >();
  private seq = 0;

  constructor(initialFiles: Record<string, string> = {}) {
    const sha = this.newSha();
    this.commits.set(sha, {
      parent: null,
      files: new Map(Object.entries(initialFiles)),
    });
    this.branches.set("main", sha);
    this.branches.set("preview", sha);
  }

  private newSha(): string {
    return `sha${++this.seq}`;
  }

  async getBranchSha(branch: string): Promise<string> {
    const sha = this.branches.get(branch);
    if (!sha) throw new Error(`no such branch: ${branch}`);
    return sha;
  }

  async createBranch(branch: string, fromSha: string): Promise<void> {
    this.branches.set(branch, fromSha);
  }

  async listFiles(ref: string, prefix: string): Promise<RepoFile[]> {
    const commit = this.commits.get(ref);
    if (!commit) throw new Error(`no such ref: ${ref}`);
    return [...commit.files.entries()]
      .filter(([p]) => p.startsWith(prefix))
      .map(([path, content]) => ({ path, content }));
  }

  async commitFiles(params: {
    branch: string;
    message: string;
    prefix: string;
    files: RepoFile[];
    deletions: string[];
  }): Promise<string> {
    const parent = this.branches.get(params.branch)!;
    const base = this.commits.get(parent)!;
    const files = new Map(base.files);
    for (const f of params.files) files.set(f.path, f.content);
    for (const d of params.deletions) files.delete(d);
    const sha = this.newSha();
    this.commits.set(sha, { parent, files });
    this.branches.set(params.branch, sha);
    return sha;
  }

  async merge(base: string, head: string, _message: string): Promise<string> {
    const headSha = this.branches.get(head)!;
    const headCommit = this.commits.get(headSha)!;
    const baseSha = this.branches.get(base)!;
    const sha = this.newSha();
    // Merge = take head's file tree, parent = base (fast-forward-like).
    this.commits.set(sha, {
      parent: baseSha,
      files: new Map(headCommit.files),
    });
    this.branches.set(base, sha);
    return sha;
  }

  async updateBranch(branch: string, sha: string): Promise<void> {
    this.branches.set(branch, sha);
  }

  async revertCommit(branch: string, sha: string): Promise<string> {
    const commit = this.commits.get(sha)!;
    const parent = commit.parent ? this.commits.get(commit.parent)! : null;
    const revSha = this.newSha();
    this.commits.set(revSha, {
      parent: sha,
      files: new Map(parent ? parent.files : new Map()),
    });
    this.branches.set(branch, revSha);
    return revSha;
  }

  async isAncestor(ancestor: string, descendant: string): Promise<boolean> {
    let cur: string | null = descendant;
    while (cur) {
      if (cur === ancestor) return true;
      cur = this.commits.get(cur)?.parent ?? null;
    }
    return false;
  }

  // Test helpers
  filesAt(branch: string): Map<string, string> {
    return this.commits.get(this.branches.get(branch)!)!.files;
  }
}
