# Parallel frontend and backend work

Two Claude Code subagents, two git worktrees, one frozen wire contract.

| Agent | Definition | Worktree | Branch | Owns |
|---|---|---|---|---|
| backend | `.claude/agents/backend.md` | `../attack-chain-reanalysis-backend` | `001-backend` | `api/**`, `scripts/analyze.py`, `requirements.txt`, `vercel.json`, `.env.example`, `data/scenarios/*/analysis.json` |
| frontend | `.claude/agents/frontend.md` | `../attack-chain-reanalysis-frontend` | `001-frontend` | `src/**`, `tests/**`, `package.json`, `vite.config.ts`, `index.html`, `tsconfig*.json`, `scripts/copy_scenarios.mjs` |

The contract is the "Wire contract (frozen)" section of
`specs/001-attack-chain-reanalysis/plan.md` plus the examples in
`specs/001-attack-chain-reanalysis/contract/`. Neither agent edits it. To change it: edit the
plan section, then the examples, then both test suites, then code, on `main`, and rebase both
branches.

## Run

Open one Claude Code session per worktree and address the matching agent:

```bash
cd ../attack-chain-reanalysis-backend && claude
```

then `@backend work through T004 to T012 in order`, and in a second terminal

```bash
cd ../attack-chain-reanalysis-frontend && claude
```

then `@frontend work through T003 to T027 in order`.

Each agent reads its own definition, which lists the files it owns, the files it must not
touch, and its tasks. The file sets are disjoint, so the two branches merge without conflicts.

## Merge

1. On `main`: `git merge 001-backend`, then `git merge 001-frontend`.
2. Run both suites: `npx vitest run` and `pytest api/tests`. `tests/cached-analysis.test.ts`
   stops being skipped once `analysis.json` from the backend branch is present.
3. Integration items that belong to neither agent: `README.md` for the new stack and
   `.github/workflows/ci.yml` per tests.md.
4. Local end-to-end: `uvicorn api.index:app --port 8000` and `npm run dev` without
   `VITE_MOCK_API`.
