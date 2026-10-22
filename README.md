# AI Content Admin

A conversational admin for git-backed static sites. A non-developer describes a
change in plain language; an AI agent maps it to one of a fixed set of typed
content operations, proposes it with a plain-English summary, and — after
approval — commits to a `preview` branch (staging). The owner publishes when
ready, merging to `main` (production).

The architecture is **site-agnostic**: the operation engine, validation gate,
and git service are generic. Each site plugs in a **profile** — its content
model (schemas) and the operation set it exposes. The first profile is the
[WriteNow Berlin static site](https://github.com/wbhoneywill/writenowberlin);
the WriteNow-specific pieces are being factored behind that profile seam so a
second site is configuration, not a rewrite.

Spec: see `.kiro/specs/ai-content-admin/` in the WriteNow content repo.

## Status — Milestones 2–3 complete

This repo contains the **core engine + intelligence layer** (no UI yet):

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

**Intelligence layer (M3):**

- **Profile** (`src/profile.ts`) — the site-agnostic seam. A profile supplies
  the content repo, domains, and exposed operations. WriteNow is the first
  profile; adding a site is a new profile, not an engine change.
- **LLM adapter** (`src/llm/`) — `interpret(prompt, context) → operation |
clarify | decline`, provider-agnostic. Includes an Anthropic implementation
  using tool-calling constrained to the operation set (tools built from the
  operations' Zod schemas). Providers are swappable; tests use a mock.
- **Orchestrator** (`src/orchestrator.ts`) — the propose → approve flow: load
  working tree → interpret → validate args → apply → validation gate → hold a
  pending proposal (summary + blast radius). Commits to `preview` only on
  explicit approve; reject discards. Nothing reaches the repo without approval.

54 unit tests cover all of the above with no network access (GitHub and the LLM
are both mocked).

## Design guarantees

- The agent cannot write arbitrary files — only registered operations modify the
  repo.
- Nothing commits without owner approval (enforced by the orchestrator, M3).
- Destructive ops (`removePost`, `removePerson`) require an explicit `confirm`
  and report their blast radius; "remove" defaults to the reversible _hide_.
- Every proposed change is schema-validated before it can be committed.

## Develop

```sh
npm install
npm test
npm run typecheck
npm run lint
```

## Next (per the spec)

- **M4**: HTTP API (propose/approve/publish endpoints), auth adapter, admin UI,
  preview/publish environment wiring (`admin.<domain>` subdomain), end-to-end.
