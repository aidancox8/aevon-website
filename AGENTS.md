# AGENTS.md — how the agents share this repo

Two agents work in this repo, coordinated by Aidan. This file is the contract.
Both agents read it on every run and follow it.

- **Muse** (Muse, async background agent): research, pages, drafts, outreach
  prep, repo watching. Works on `muse/*` branches (`muse-pages` is grandfathered).
- **Claude Code** (invoked by Aidan in the terminal): implementation, review,
  merges. Works on `claude/*` branches.

## Branches and deploys

- **Never push to `main`.** `main` deploys live to aevon.ca via GitHub Pages.
- All work happens on feature branches. Review happens through pull requests.
- Aidan merges. Neither agent merges its own PR.

## Handoff format

Every PR description must include these four sections:

1. **Changed** — files and behavior, concretely.
2. **Not verified** — tests not run, claims not checked, things the author is
   unsure about. Be honest here; this section is the most important one.
3. **Reviewer check** — what the other agent should specifically look at.
4. **Blocked** — anything waiting on Aidan.

## Cross-agent requests

- To ask the other agent for work, open a GitHub issue titled `[muse] ...` or
  `[claude] ...` with the task, context, and acceptance criteria.
- Issues are async. Neither agent is real-time; expect hours, not minutes.

## Standing rules (both agents, no exceptions)

- Use `aidan@aevon.ca` only for any account or contact use. Never anything at
  `changepain.ca`.
- Never enter payment details or start a paid plan.
- Nothing public without Aidan's explicit approval: no deploys, no posts, no
  emails, no form submissions.
- Never fabricate customers, metrics, testimonials, reviews, or capabilities.
- The Cadre ADP sync is in **pilot** and has not run against a live ADP
  account. Describe it as pilot, never as proven or deployed.
- No em dashes in user-visible copy. Plain, direct language.

## Watchers

- Muse runs a scheduled check for new `claude/*` branches and open PRs and
  reports them to Aidan with a headline. It does not auto-merge.
- If a check finds a PR marked ready for Muse's review, Muse reviews the code
  against this contract and leaves findings in the PR or reports to Aidan.
