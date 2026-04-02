# Architecture Overview

Seli is a Bun + TypeScript CLI for generating and maintaining AI-collaboration repository baselines.

## Core flow

- `plan`: resolve config + provider packages + rendered desired entries + operations preview
- `init` / `update`: execute plan and write managed outputs
- `doctor`: validate managed state, provider package drift, and entrypoint consistency
- `inspect`: preview resolved plan/config for debugging

## Plugin model

Runtime registries are assembled in `src/registry/create-default-registries.ts`:

- Provider plugins: resolve skill packages (current built-in: `ecc`)
- Renderer plugins: emit managed files/symlinks (`base`, `codex`, `claude`)
- Policy plugins: team skill selection + managed drift policy
- Doctor plugins: post-plan verification checks

## State and determinism

- `.seli.lock` stores pipeline fingerprint, resolved providers/packages, and managed entry fingerprints.
- Drift checks guard managed files/symlinks unless `--force` is used.
