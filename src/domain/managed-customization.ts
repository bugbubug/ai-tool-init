import type { DesiredEntry, ManagedCustomizationMode, SeliConfigV2 } from './contracts.js';

export const SELI_CUSTOM_START = '<!-- seli:custom:start -->';
export const SELI_CUSTOM_END = '<!-- seli:custom:end -->';

function customBlockPattern(): RegExp {
  return new RegExp(`${SELI_CUSTOM_START}[\\s\\S]*?${SELI_CUSTOM_END}`, 'm');
}

function customBlockPatternGlobal(): RegExp {
  return new RegExp(`${SELI_CUSTOM_START}[\\s\\S]*?${SELI_CUSTOM_END}`, 'g');
}

function findCustomBlocks(content: string): string[] {
  return Array.from(content.matchAll(customBlockPatternGlobal()), match => match[0]);
}

export function getManagedCustomizationMode(
  config: Pick<SeliConfigV2, 'policies'>,
  path: string
): ManagedCustomizationMode | null {
  return config.policies.managedCustomization?.[path] ?? null;
}

export function isLocalFileCustomization(config: Pick<SeliConfigV2, 'policies'>, path: string): boolean {
  return getManagedCustomizationMode(config, path) === 'local-file';
}

export function ensureCustomBlockTemplate(content: string): string {
  if (content.includes(SELI_CUSTOM_START) && content.includes(SELI_CUSTOM_END)) {
    return content;
  }
  return `${content.trimEnd()}\n\n${SELI_CUSTOM_START}\n${SELI_CUSTOM_END}\n`;
}

export function extractCustomBlockContent(content: string | null): string {
  if (!content) {
    return '';
  }

  const blocks = findCustomBlocks(content);
  if (blocks.length === 0) {
    return '';
  }

  const blockContents = blocks.map(block =>
    block.slice(SELI_CUSTOM_START.length, block.length - SELI_CUSTOM_END.length).replace(/^\n/, '').replace(/\n$/, '')
  );
  return blockContents.findLast(item => item.trim().length > 0) ?? blockContents.at(-1) ?? '';
}

export function injectCustomBlockContent(template: string, customContent: string): string {
  const ensuredTemplate = ensureCustomBlockTemplate(template);
  return ensuredTemplate.replace(
    customBlockPattern(),
    `${SELI_CUSTOM_START}\n${customContent ? `${customContent}\n` : ''}${SELI_CUSTOM_END}`
  );
}

export function normalizeManagedFileContent(
  config: Pick<SeliConfigV2, 'policies'>,
  path: string,
  content: string
): string {
  if (getManagedCustomizationMode(config, path) !== 'custom-block') {
    return content;
  }

  const ensured = ensureCustomBlockTemplate(content);
  const placeholder = `${SELI_CUSTOM_START}\n${SELI_CUSTOM_END}`;
  let usedPlaceholder = false;

  return ensured
    .replace(customBlockPatternGlobal(), () => {
      if (usedPlaceholder) {
        return '';
      }
      usedPlaceholder = true;
      return placeholder;
    })
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()
    .concat('\n');
}

export function prepareDesiredEntryForCustomization(
  config: Pick<SeliConfigV2, 'policies'>,
  entry: DesiredEntry
): DesiredEntry | null {
  if (entry.type !== 'file') {
    return entry;
  }

  const mode = getManagedCustomizationMode(config, entry.path);
  if (mode === 'local-file') {
    return null;
  }
  if (mode === 'custom-block') {
    return {
      ...entry,
      content: ensureCustomBlockTemplate(entry.content)
    };
  }
  return entry;
}
