import { spawnSync } from 'node:child_process';

import type { DoctorCheckPlugin } from './interfaces.js';

function isGitWorktree(projectRoot: string): boolean {
  const result = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], {
    cwd: projectRoot,
    encoding: 'utf8'
  });
  return result.status === 0 && result.stdout.trim() === 'true';
}

function findIgnoredPaths(projectRoot: string, paths: string[]): string[] {
  if (paths.length === 0) {
    return [];
  }

  const result = spawnSync('git', ['check-ignore', '--stdin'], {
    cwd: projectRoot,
    encoding: 'utf8',
    input: `${paths.join('\n')}\n`
  });

  if (result.status === 0) {
    return result.stdout
      .split('\n')
      .map(item => item.trim())
      .filter(Boolean);
  }

  if (result.status === 1) {
    return [];
  }

  throw new Error(result.stderr.trim() || 'git check-ignore failed');
}

export const ignoredManagedPathsDoctorPlugin: DoctorCheckPlugin = {
  id: 'ignored-managed-paths',
  check(context) {
    if (!isGitWorktree(context.plan.projectRoot)) {
      context.info.push('Skipped ignored-path validation because the target is not a Git worktree.');
      return;
    }

    const candidatePaths = Array.from(
      new Set(
        [
          ...context.plan.managedEntries.map(entry => entry.path),
          '.selirc',
          '.seli.lock'
        ].sort()
      )
    );

    try {
      const ignoredPaths = findIgnoredPaths(context.plan.projectRoot, candidatePaths);
      for (const ignoredPath of ignoredPaths) {
        context.errors.push(`Managed path is ignored by Git: ${ignoredPath}`);
      }
    } catch (error) {
      context.warnings.push(`Ignored-path validation failed: ${(error as Error).message}`);
    }
  }
};
