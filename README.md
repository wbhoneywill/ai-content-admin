# WriteNow Berlin — AI Content Admin

A conversational admin for the [WriteNow Berlin static site](https://github.com/wbhoneywill/writenowberlin).
A non-developer describes a change in plain language; an AI agent maps it to one
of a fixed set of typed content operations, proposes it with a plain-English
summary, and — after approval — commits to a `preview` branch (staging). The
owner publishes when ready, merging to `main` (production).

Spec: see `.kiro/specs/ai-content-admin/` in the content repo.

## Status — Milestone 2 (admin core) complete

This repo currently contains the **core engine** (no UI or live LLM yet):

- **Content model** (`src/content-model.ts`) — the Zod schemas, mirrored from
  the content repo, for validating and editing the JSON content files.
- **FileMap** (`src/filemap.ts`) — an in-memory path→content snapshot that
  operations mutate; the git service diffs it to produce commits.
- **Operations** (`src/operations/`) — the fixed, typed edit set:
  `hidePerson`, `unhide`, `editBio`, `addPost`, `editPost`, `hidePost`,
  `removePost`, `removePerson` (with credit cleanup), `swapPhoto`. The LLM may
  only ever select one of these and fill its arguments.
- **Validation gate** (`src/validate.ts`) — Zod schema checks + reference
  integrity (dangling credits) over a proposed FileMap.
- **Input sanitizer** (`src/sanitize-input.ts`) — cleans owner-entered text to a
  safe HTML subset.
- **Git service** (`src/git/`) — reads the content tree and commits/merges via a
  `GitHubClient` interface (real impl TBD; tests use an in-memory mock):
  `loadWorkingTree`, `commit` (to preview), `publish` (merge→main, align
  preview), `undoLast`, `checkDivergence`.

41 unit tests cover all of the above with no network access.

## Design guarantees

- The agent cannot write arbitrary files — only registered operations modify the
  repo.
- Nothing commits without owner approval (enforced by the orchestrator, M3).
- Destructive ops (`removePost`, `removePerson`) require an explicit `confirm`
  and report their blast radius; "remove" defaults to the reversible *hide*.
- Every proposed change is schema-validated before it can be committed.

## Develop

```sh
npm install
npm test
npm run typecheck
npm run lint
```

## Next (per the spec)

- **M3**: LLM adapter (prompt → operation, provider-agnostic) + propose/approve
  orchestration API.
- **M4**: auth, admin UI, preview/publish environment wiring, end-to-end.
