/**
 * Task 6 — git service.
 *
 * Orchestrates the content repo through the GitHubClient:
 *  - loadWorkingTree: read the content files into a FileMap.
 *  - commit: write a FileMap delta to the `preview` branch.
 *  - publish: merge `preview` -> `main`, then reset `preview` to `main`.
 *  - undoLast: revert the most recent commit on `preview`.
 *  - checkDivergence: confirm `preview` descends from `main` before publishing.
 *
 * All repo mutation goes through here; operations never touch the repo.
 */
import { diff, type FileMap } from "../filemap.js";
import type { GitHubClient, RepoFile } from "./github-client.js";

const CONTENT_PREFIX = "src/content/";

export interface GitServiceOptions {
  previewBranch?: string;
  mainBranch?: string;
}

export class GitService {
  private preview: string;
  private main: string;

  constructor(
    private gh: GitHubClient,
    opts: GitServiceOptions = {},
  ) {
    this.preview = opts.previewBranch ?? "preview";
    this.main = opts.mainBranch ?? "main";
  }

  /** Read the current content files from `preview` into a FileMap. */
  async loadWorkingTree(): Promise<FileMap> {
    const sha = await this.gh.getBranchSha(this.preview);
    const files = await this.gh.listFiles(sha, CONTENT_PREFIX);
    return new Map(files.map((f) => [f.path, f.content]));
  }

  /**
   * Commit the difference between `before` and `after` FileMaps to `preview`.
   * Returns the new commit SHA, or null if there was nothing to commit.
   */
  async commit(
    before: FileMap,
    after: FileMap,
    message: string,
  ): Promise<string | null> {
    const changes = diff(before, after);
    if (changes.length === 0) return null;

    const files: RepoFile[] = [];
    const deletions: string[] = [];
    for (const c of changes) {
      if (c.kind === "delete") deletions.push(c.path);
      else files.push({ path: c.path, content: after.get(c.path)! });
    }

    return this.gh.commitFiles({
      branch: this.preview,
      message,
      prefix: CONTENT_PREFIX,
      files,
      deletions,
    });
  }

  /** True if `preview` is a clean descendant of `main` (safe to publish). */
  async checkDivergence(): Promise<{
    canFastForward: boolean;
    mainSha: string;
    previewSha: string;
  }> {
    const [mainSha, previewSha] = await Promise.all([
      this.gh.getBranchSha(this.main),
      this.gh.getBranchSha(this.preview),
    ]);
    const canFastForward = await this.gh.isAncestor(mainSha, previewSha);
    return { canFastForward, mainSha, previewSha };
  }

  /**
   * Publish: merge `preview` into `main`, then reset `preview` to match `main`
   * so the two stay aligned. Returns the production (main) SHA after publish.
   */
  async publish(message = "Publish content changes"): Promise<string> {
    const { canFastForward, previewSha } = await this.checkDivergence();
    if (!canFastForward) {
      throw new Error(
        "preview has diverged from main; resolve before publishing.",
      );
    }
    const mergeSha = await this.gh.merge(this.main, this.preview, message);
    // Align preview with main (now identical content).
    await this.gh.updateBranch(this.preview, mergeSha);
    void previewSha;
    return mergeSha;
  }

  /** Revert the most recent commit on `preview`. */
  async undoLast(): Promise<string> {
    const sha = await this.gh.getBranchSha(this.preview);
    return this.gh.revertCommit(this.preview, sha);
  }

  /** Ensure the `preview` branch exists, creating it from `main` if not. */
  async ensurePreviewBranch(): Promise<void> {
    try {
      await this.gh.getBranchSha(this.preview);
    } catch {
      const mainSha = await this.gh.getBranchSha(this.main);
      await this.gh.createBranch(this.preview, mainSha);
    }
  }
}
