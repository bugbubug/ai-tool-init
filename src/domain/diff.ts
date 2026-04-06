import path from 'node:path';

import type { DesiredEntry, InstallPlanOperation, ManagedEntryV2, SeliConfigV2 } from './contracts.js';
import { extractCustomBlockContent, getManagedCustomizationMode, injectCustomBlockContent, normalizeManagedFileContent } from './managed-customization.js';
import { readSymlinkIfExists, readTextIfExists } from '../infrastructure/fs.js';

export function createOperations(
  projectRoot: string,
  desiredEntries: DesiredEntry[],
  previousManagedEntries: ManagedEntryV2[] = [],
  forcedDeletePaths: string[] = [],
  config?: Pick<SeliConfigV2, 'policies'>
): InstallPlanOperation[] {
  const operations: InstallPlanOperation[] = [];
  const desiredManagedEntries = desiredEntries.filter(entry => entry.managed);
  const desiredManagedPaths = new Set(desiredManagedEntries.map(entry => entry.path));
  const seenDeletePaths = new Set<string>();

  const pushDelete = (pathRelative: string, previous: ManagedEntryV2) => {
    if (seenDeletePaths.has(pathRelative)) {
      return;
    }
    seenDeletePaths.add(pathRelative);
    operations.push({
      action: 'delete',
      path: pathRelative,
      absolutePath: path.join(projectRoot, pathRelative),
      previous
    });
  };

  for (const previousEntry of previousManagedEntries) {
    if (!desiredManagedPaths.has(previousEntry.path)) {
      pushDelete(previousEntry.path, previousEntry);
    }
  }

  for (const relativePath of forcedDeletePaths) {
    const previous =
      previousManagedEntries.find(entry => entry.path === relativePath) ??
      ({
        path: relativePath,
        layer: 'team',
        owner: 'team-normalization',
        type: 'file',
        sha256: ''
      } as const);
    pushDelete(relativePath, previous);
  }

  for (const entry of desiredEntries) {
    const absolutePath = path.join(projectRoot, entry.path);
    if (entry.type === 'file') {
      const currentContent = readTextIfExists(absolutePath);
      const mode = config ? getManagedCustomizationMode(config, entry.path) : null;
      const normalizedCurrent =
        currentContent && config ? normalizeManagedFileContent(config, entry.path, currentContent) : currentContent;
      const normalizedExpected = config ? normalizeManagedFileContent(config, entry.path, entry.content) : entry.content;
      const writeContent =
        mode === 'custom-block'
          ? injectCustomBlockContent(entry.content, extractCustomBlockContent(currentContent))
          : entry.content;

      if (normalizedCurrent !== normalizedExpected) {
        operations.push({
          action: 'write-file',
          path: entry.path,
          absolutePath,
          entry: {
            ...entry,
            content: writeContent
          }
        });
      }
      continue;
    }

    const currentTarget = readSymlinkIfExists(absolutePath);
    if (currentTarget !== entry.target) {
      operations.push({
        action: 'write-symlink',
        path: entry.path,
        absolutePath,
        entry
      });
    }
  }

  return operations;
}
