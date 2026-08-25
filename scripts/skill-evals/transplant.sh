#!/bin/zsh
# transplant.sh — the SaaS-generalization gate (the #1 roadmap experiment).
# Runs the correctness harness against a PRODUCTLESS tree (the `clean` branch) to prove the
# substrate is domain-agnostic. The harness is portable by design (relative MAIN_REPO +
# ROOT_OVERRIDE), so this is just: worktree the clean branch + run a probe cycle there.
#
# PREREQUISITE (the only blocker today): the `clean` branch must exist. It does NOT yet —
# create it first with the /clean-branch skill (rebase from dev, strip ALL domain code).
set -euo pipefail
REPO=/Users/work/Desktop/Projetos/pessoal/template-fullstack
cd "$REPO"
git rev-parse --verify clean >/dev/null 2>&1 || { echo "ABORT: 'clean' branch does not exist — create it via /clean-branch first."; exit 1; }
TREE=.claude/worktrees/transplant-clean
git worktree add "$TREE" clean 2>/dev/null || true
cd "$TREE"
echo "[transplant] harness self-tests on the clean tree:"; bun test scripts/skill-evals scripts/detectors
echo "[transplant] detector suite on the clean tree:"; bun run detect
echo "[transplant] one greenfield probe cycle (a probe whose canon survives domain-stripping):"
AGENT_MODEL=sonnet bun scripts/skill-evals/run.ts --agent synthetic-react-primitive-variant --stamp transplant-clean --stamp-per-task --window-retry 2>&1 | tail -20
echo "[transplant] DONE — if the probe builds + grades, the harness is substrate-general."
