import type { DesiredEntry, InstallScope, ManagedEntryV2 } from './contracts.js';

type ScopedEntry = Pick<DesiredEntry, 'path'> | Pick<ManagedEntryV2, 'path'>;

export function normalizeInstallScope(scope: InstallScope | undefined): InstallScope {
  return scope ?? 'full';
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
