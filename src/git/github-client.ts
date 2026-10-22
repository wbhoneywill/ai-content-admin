/**
 * A narrow interface over the GitHub Git Data + Repos APIs — just the calls the
 * git service needs. A real implementation wraps fetch/Octokit; tests inject a
 * mock. Keeping this small makes the service fully unit-testable without any
 * network access.
 */

export interface RepoFile {
  path: string;
  content: string;
}

export interface GitHubClient {
  /** SHA the branch currently points at. */
  getBranchSha(branch: string): Promise<string>;
  /** Create a branch at a given SHA (no-op/overwrite semantics up to impl). */
  createBranch(branch: string, fromSha: string): Promise<void>;
  /** List all content files at a ref (path -> content), for the given prefix. */
  listFiles(ref: string, prefix: string): Promise<RepoFile[]>;
  /**
   * Create a commit on `branch` that makes the tree match `files` for the
   * given `prefix` (adds/updates/deletes as needed). Returns the new commit SHA.
   */
  commitFiles(params: {
    branch: string;
    message: string;
    prefix: string;
    files: RepoFile[];
    deletions: string[];
  }): Promise<string>;
  /** Merge `head` into `base`. Returns the merge commit SHA. */
  merge(base: string, head: string, message: string): Promise<string>;
  /** Point `branch` at `sha` (force update). */
  updateBranch(branch: string, sha: string): Promise<void>;
  /** Revert a commit on a branch (returns new SHA). */
  revertCommit(branch: string, sha: string): Promise<string>;
  /** Whether `ancestor` is an ancestor of `descendant` (for divergence check). */
  isAncestor(ancestor: string, descendant: string): Promise<boolean>;
}
