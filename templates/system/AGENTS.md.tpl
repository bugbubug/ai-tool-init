# Repository Collaboration Contract

This repository is managed by `seli`.
Future changes should prefer rerunning `seli update` instead of hand-editing generated baseline files.

## Project Summary

{{projectSummary}}

## Guardrails

- Keep this repository managed through `seli`; use `seli update --scope full` only when refreshing full collaboration baselines.
- Keep repository truth in `AGENTS.md`, `.selirc`, and `.seli.lock`.
- Use repository files, configs, and local skills as the source of truth.
- Do not treat `~/.codex` or `~/.claude` as repository truth.
