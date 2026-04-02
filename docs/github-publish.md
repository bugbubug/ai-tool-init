# Seli GitHub & npm Publish Checklist

This project intentionally does not include GitHub Actions workflows by default.
Use this checklist for manual release and publish.

## 1) Repository Rename (GitHub)

- Rename repository slug to `seli` on GitHub.
- Update local remote:

```bash
git remote set-url origin git@github.com:<owner>/seli.git
```

- Verify:

```bash
git remote -v
```

## 2) Package Metadata

- `package.json` should contain:
  - `"name": "seli"`
  - `"version": "<release-version>"`
  - `"bin": { "seli": "./src/cli.ts" }`
  - `"license": "Apache-2.0"`

- Ensure README install/start commands match:
  - `npm install -g seli`
  - `seli init`

## 3) License and Notice Consistency

- Verify these files are present and consistent:
  - `LICENSE` (Apache License 2.0)
  - `NOTICE`
  - `README.md` license section
  - `package.json` license field

- Quick checks:

```bash
rg -n "Apache-2.0" README.md LICENSE NOTICE package.json
rg -n "UNLICENSED" README.md LICENSE NOTICE package.json || true
```

## 4) Preflight Checks

```bash
bun install
bun run typecheck
bun test
```

## 5) Security and Sanitization Check

- Confirm no secrets, private keys, or machine-local sensitive paths are tracked.
- Confirm local intake/runtime files are still ignored by `.gitignore`.

```bash
rg -n --hidden --glob '!.git/*' --glob '!node_modules/*' '(AKIA|ASIA|ghp_|github_pat_|PRIVATE KEY|BEGIN RSA|PASSWORD|TOKEN|SECRET|sk-[A-Za-z0-9])'
rg -n '/Users/|C:\\|/home/' AGENTS.md README.md docs intake src
```

## 6) Publish to npm

- Login if needed:

```bash
npm login
```

- Publish:

```bash
npm publish --access public
```

## 7) Git Tag + Release

```bash
git tag v<release-version>
git push origin v<release-version>
```

- Create GitHub Release from the tag and include key changes:
  - `.selirc` / `.seli.lock` contract
  - plugin-based provider/renderer/policy/doctor architecture
  - CLI command updates and docs changes

## 8) Post-Release Validation

- Install from npm in a clean environment:

```bash
npm install -g seli
seli --help
```

- Smoke-run `seli init` against a temp project and verify outputs:
  - `.selirc`
  - `.seli.lock`
  - `.agents/skill_team.md`
