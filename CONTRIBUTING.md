# Contributing

Thanks for contributing to Seli.

## Before You Start

- Use Bun `>=1.3.11`.
- Read [AGENTS.md](AGENTS.md) for repository collaboration constraints.
- Keep changes scoped. Do not mix unrelated fixes in one PR.

## Development Setup

```bash
bun install
bun run typecheck
bun test
bun run src/cli.ts help
```

## Reporting Issues

- Use GitHub Issues and choose the appropriate template.
- Include environment details, reproduction steps, expected behavior, and actual behavior.
- If the issue is security-related, do not open a public issue. Follow [SECURITY.md](SECURITY.md).

## Pull Requests

1. Fork and create a focused branch.
2. Keep commits clear and reviewable.
3. Update docs/tests when behavior or user-facing output changes.
4. Run required checks locally:

```bash
bun run typecheck && bun test
```

5. Open a PR with:
- Problem statement
- Scope of change
- Validation evidence (commands + key outputs)
- Risks and compatibility notes (if any)

## Coding and Documentation Standards

- TypeScript strict mode is the baseline.
- Avoid business-logic refactors in release-hardening or documentation-only PRs.
- Prefer explicit, maintainable code over clever abstractions.
- Keep user-facing docs accurate to current implementation; do not document features that do not exist.

## License

By contributing, you agree that your contributions are licensed under the Apache License 2.0.
