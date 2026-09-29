# Codex Working Rules

These rules are mandatory for all Codex tasks in this repository.

## Scope

1. Implement **only** the explicitly requested task.
2. Do not expand scope.
3. Do not implement future features.
4. Do not redesign unrelated UI.
5. Do not refactor unrelated code.
6. Do not change architecture without explicit approval.

## Before coding

Before making changes:

1. Read:
   - `README.md`
   - `MVP.md`
   - `ARCHITECTURE.md`
   - `CODEX_RULES.md`
2. State which files you intend to modify.
3. State whether any new dependency is required.
4. If the task conflicts with current architecture or scope, stop and report the conflict.

## Dependencies

- Do not add packages unless the requested task requires them.
- Prefer the existing stack.
- Do not replace libraries merely because another approach is cleaner or more familiar.

## Changes

- Touch only files required for the current task.
- Preserve working behavior outside the requested change.
- Do not perform opportunistic cleanup.
- Do not rename files, components, routes, or variables unrelated to the task.

## Problems discovered during work

If you discover an unrelated bug, improvement, or architectural concern:

- do not fix it;
- report it separately in the task summary.

## Validation

After completing the requested change, run all applicable checks:

- lint
- typecheck
- tests, if present
- production build

Report the result of each check.

## Completion report

At the end of every task, provide:

1. files changed;
2. exactly what changed;
3. dependencies added, if any;
4. validation results;
5. unrelated issues noticed but not changed.

Then **stop**.

Do not continue with the next logical feature without explicit approval.

## Git workflow

Each approved task should result in a small, reviewable commit.

Commit messages should describe the single task performed.

Avoid combining multiple features or unrelated fixes into one commit.
