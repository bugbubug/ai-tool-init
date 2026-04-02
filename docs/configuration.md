# Configuration Reference

Seli uses a v2 state contract at the project root:

- `.selirc`: human-editable configuration manifest
- `.seli.lock`: generated lock and managed-entry snapshot

## Provider root resolution

For `ecc`, source resolution follows this order:

1. CLI override: `--provider-root ecc=/abs/path`
2. Intake override: `providers[].rootPath` or `providers[].teamPackages[]`
3. Persisted `.selirc` provider source/packages
4. Environment variable: `SELI_ECC_ROOT`
5. Catalog default candidates

## Intake schema

Use `schemaVersion: 2` manifests. Legacy `version: 1` manifests are rejected.

Template location:

- `intake/manifest.template.json`
