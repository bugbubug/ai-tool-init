# Configuration Reference

Seli uses a v2 state contract at the project root:

- `.selirc`: human-editable configuration manifest
- `.seli.lock`: generated lock and managed-entry snapshot

## Provider root resolution

Provider source resolution follows this order:

1. CLI override: `--provider-root <provider>=<abs-path>` (example: `--provider-root ecc=/abs/path`)
2. Intake override: `providers[].rootPath` or `providers[].teamPackages[]`
3. Persisted `.selirc` provider source/packages
4. Provider environment variable (for built-in `ecc`: `SELI_ECC_ROOT`)
5. Catalog default candidates

## Intake schema

Use `schemaVersion: 2` manifests. Legacy `version: 1` manifests are rejected.

Project-local path fields use project-aware resolution:

- `documents[].path`
- `decisions[].sourcePaths`
- `project.projectSkillBlueprints[].sourcePaths`

Default behavior:

- If `target.projectPath` is set, these paths resolve relative to the target project root.
- If `target.projectPath` is missing, they fall back to the manifest directory.
- Set `pathBase: "manifest"` on an individual entry to force manifest-relative resolution.

Provider roots remain manifest-relative:

- `providers[].rootPath`
- `providers[].teamPackages[].rootPath`

`project.summary` is optional and feeds the generated `AGENTS.md` project context.

Template location:

- `intake/manifest.template.json`
