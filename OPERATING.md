# Operating the AI Content Admin

How to configure, run, deploy, and use the admin. The admin edits a content
repo's `preview` branch and publishes by merging to `main`; the static site's
host (Vercel) deploys `preview` → staging and `main` → production.

## Prerequisites (one-time)

1. **A `preview` branch on the content repo** (already created for WriteNow):

   ```sh
   git branch preview main && git push -u origin preview
   ```

   Vercel auto-deploys non-production branches to a preview URL, so `preview`
   gets a staging deploy with no extra config.

2. **A GitHub token** scoped to the content repo with `contents` write (a
   fine-grained PAT or a GitHub App installation token). This is the only
   credential that can change the repo.

## Configuration (env vars)

| Var                 | Required     | Notes                                              |
| ------------------- | ------------ | -------------------------------------------------- |
| `AUTH_PASSWORD`     | yes          | The admin sign-in password (single owner).         |
| `AUTH_SECRET`       | yes          | ≥16 chars; signs the session cookie.               |
| `GITHUB_TOKEN`      | yes          | Scoped token for the content repo.                 |
| `LLM_PROVIDER`      | no           | `anthropic` (default) or `mock`.                   |
| `ANTHROPIC_API_KEY` | if anthropic | Model API key.                                     |
| `ANTHROPIC_MODEL`   | no           | Override the default model.                        |
| `PORT`              | no           | Local server port (default 8787).                  |
| `SECURE_COOKIES`    | no           | `true` (default). Set `false` only for local http. |

Secrets live server-side only. Nothing is exposed to the browser.

## Run locally

```sh
npm install
AUTH_PASSWORD=dev AUTH_SECRET=dev-secret-0123456789 \
GITHUB_TOKEN=... ANTHROPIC_API_KEY=... SECURE_COOKIES=false \
npm start                      # http://localhost:8787
# or `npm run dev` for watch mode
```

Use `LLM_PROVIDER=mock` to boot without an LLM key (every request declines) —
handy for checking auth/UI/serving.

## Deploy (subdomain, isolated from the public site)

The admin is a **separate deployment** served at `admin.<site-domain>` — never
a path on the public static site (that would reintroduce a server surface on
the site we hardened).

On Vercel (or any serverless host):

1. New project from this repo.
2. Set the env vars above as project secrets.
3. Add the domain `admin.writenow.berlin`; point DNS (CNAME) at the host.
4. The app serves the UI and `/api/*` from the same deployment.

The admin sends `X-Robots-Tag: noindex` and the UI carries a `noindex` meta tag,
so it never shows up in search. For extra hardening it can be paused/undeployed
when not in use.

## The editing flow

1. Sign in at `admin.writenow.berlin`.
2. Type a request ("hide the profile for X", "add a blog post titled …").
3. Review the proposed change (summary + blast radius). **Approve** to stage it
   to `preview`, or **Discard**.
4. Review the staging deploy (preview URL). Stage more changes if needed.
5. **Publish** — merges `preview` into `main`; the production site redeploys.
6. **Undo** reverts the last staged change on `preview`.

Every change is a git commit, so the full history is an audit log and any change
can be reverted.

## End-to-end check (recommended before go-live)

Against a throwaway test repo (so production is untouched):

1. Point `GITHUB_TOKEN`/profile at the test repo; ensure it has `main` +
   `preview`.
2. Sign in, run "hide the profile for <someone>", Approve.
3. Confirm the `preview` branch got a commit setting `published:false` and the
   preview deploy no longer shows that person.
4. Publish; confirm `main` now reflects it and `preview` is realigned to `main`.
5. Run Undo on a fresh staged change; confirm the revert commit.
