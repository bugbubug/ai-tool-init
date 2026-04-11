import type { DesiredEntry, InstallCommand, InstallScope, ManagedEntryV2 } from './contracts.js';

type ScopedEntry = Pick<DesiredEntry, 'path'> | Pick<ManagedEntryV2, 'path'>;

export function resolveInstallScope(
  command: InstallCommand,
  scope: InstallScope | undefined,
  hasExistingConfig: boolean,
  hasExistingLock: boolean
): InstallScope {
  if (scope) {
    return scope;
  }

  if (command === 'init') {
    return 'full';
  }

  return hasExistingConfig && hasExistingLock ? 'team-skills' : 'full';
}

export function isTeamSkillPath(path: string): boolean {
  return path.startsWith('.agents/skills/') && path !== '.agents/skills/README.md';
}

export function isEntryInScope(entry: ScopedEntry, scope: InstallScope): boolean {
  if (scope === 'full') {
    return true;
  }
  return isTeamSkillPath(entry.path);
}

export function filterEntriesByScope<T extends ScopedEntry>(entries: T[], scope: InstallScope): T[] {
  return entries.filter(entry => isEntryInScope(entry, scope));
}
