# Git workflow

- **`main` is the only long-lived branch.** All work lands there; no release branches.
- CI (`.github/workflows/ci.yml`) runs on every push and PR to `main`. Branch protection requires the `CI` check — admin pushes bypass it, and GitHub then prints an informational "Bypassed rule violations" notice while CI runs post-push.
- Run the full [verification workflow](local-workflow.md#verification-order-mandatory) locally before pushing.
- **Atomic commits**: one logical change per commit. Mixed "refactor + feature + deps" commits are hard to revert.
- Do not force-push `main` or rewrite published history.
- `git add -A` is allowed but review `git status` first — generated files (`public/sw.js`, `.next/`) and local scratch files are easy to sweep in.
- Commit messages follow the existing style: `type(scope): summary` — e.g. `fix(pwa): build with webpack so next-pwa generates the service worker`, `chore(deps): Node 26.13.1 (security release)`, `refactor(app-header): move the action button blue into a CSS token`.

## Before opening a PR

1. `npm run format` if you touched formatting.
2. lint → format:check → test → knip → build.
3. Check that `AGENTS.md` and `docs/agents/*` still match reality if you changed commands, routes, pins or deployment steps.
