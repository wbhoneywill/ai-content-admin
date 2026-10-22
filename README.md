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

## Status — Milestones 2–4 complete (feature-complete v1)

A working admin: engine + intelligence + auth + HTTP API + UI. See
[`OPERATING.md`](./OPERATING.md) for configuration, deploy, and the editing
flow.

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

**Product layer (M4):**

- **Auth** (`src/auth/`) — pluggable adapter; v1 is a single-password sign-in
  with an HMAC-signed, httpOnly, expiring session cookie.
- **HTTP API** (`src/http/`) — framework-agnostic over Web Request/Response
  (Vercel/Node/any): login, logout, status, propose, approve, reject, publish,
  undo. Every editing route requires a session.
- **GitHub REST client** (`src/git/github-rest.js`) — the real GitHubClient over
  the Git Data API (atomic tree-commits, merge, revert, ancestry check).
- **Admin UI** (`public/`) — dependency-free SPA: login, chat prompt, proposal
  panel (summary + blast radius + Approve/Discard), Publish/Undo, status.
- **Server + app wiring** (`src/server.ts`, `src/app.ts`, `src/config.ts`) —
  serves the UI + API; env-validated config; provider/profile selection.

75 unit + integration tests, including an end-to-end login→propose→approve→
publish→undo flow, all with GitHub and the LLM mocked (no network).

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

## Next

v1 is feature-complete. Possible follow-ups: image upload UI for `swapPhoto`,
more operations (new profiles/collections), richer diff preview, a second site
profile to prove the seam, and hardening (rate limiting, GitHub App auth).
