import type {
  SeliConfigV2,
  DesiredEntry,
  ProjectSkillConfigV2,
  ResolvedProviderV2
} from '../domain/contracts.js';
import { readTemplate } from '../infrastructure/catalog.js';
import { renderTemplate } from '../infrastructure/json.js';

function bulletList(values: readonly string[]): string {
  if (values.length === 0) {
    return '- (none)';
  }
  return values.join('\n');
}

function normalizeLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function renderProjectSummary(config: SeliConfigV2): string {
  const projectSummary = normalizeLine(config.layers.project.summary ?? '');
  return projectSummary || 'No project summary configured. Add `project.summary` in intake to describe this repository.';
}

export function createFileEntry(pathRelativeToProject: string, content: string, metadata: Omit<Extract<DesiredEntry, { type: 'file' }>, 'content' | 'path' | 'type'>): Extract<DesiredEntry, { type: 'file' }> {
  return {
    type: 'file',
    path: pathRelativeToProject,
    content,
    ...metadata
  };
}

export function createSymlinkEntry(pathRelativeToProject: string, target: string, metadata: Omit<Extract<DesiredEntry, { type: 'symlink' }>, 'path' | 'target' | 'type'>): Extract<DesiredEntry, { type: 'symlink' }> {
  return {
    type: 'symlink',
    path: pathRelativeToProject,
    target,
    ...metadata
  };
}

export function renderAgentsContractV2(config: SeliConfigV2, _resolvedProviders: ResolvedProviderV2[]): string {
  return renderTemplate(readTemplate('system', 'AGENTS.md.tpl'), {
    projectSummary: renderProjectSummary(config)
  });
}

export function renderProjectSkillV2(skill: ProjectSkillConfigV2): string {
  const whenToUse = bulletList(
    skill.whenToUse && skill.whenToUse.length > 0
      ? skill.whenToUse.map(item => `- ${item}`)
      : ['- Use this skill when repository-specific requirements or uploaded project documents apply.']
  );
  const workflow = bulletList(
    skill.workflow && skill.workflow.length > 0
      ? skill.workflow.map(item => `- ${item}`)
      : [
          '- Review the repository contract and source material before making changes.',
          '- Apply project-specific rules before falling back to the team layer.'
        ]
  );
  const sourceMaterialValues: string[] = [];
  if (skill.sourceDocumentLabels && skill.sourceDocumentLabels.length > 0) {
    sourceMaterialValues.push(...skill.sourceDocumentLabels.map(label => `- Document: ${label}`));
  }
  if (skill.sourcePaths && skill.sourcePaths.length > 0) {
    sourceMaterialValues.push(...skill.sourcePaths.map(sourcePath => `- Path: ${sourcePath}`));
  }
  const relatedTeamSkills = bulletList(
    skill.relatedTeamSkills && skill.relatedTeamSkills.length > 0
      ? skill.relatedTeamSkills.map(item => `- \`${item}\``)
      : ['- (none)']
  );
  const projectGuardrails = bulletList(
    skill.guardrails && skill.guardrails.length > 0 ? skill.guardrails.map(item => `- ${item}`) : ['- (none)']
  );

  return renderTemplate(readTemplate('project', 'skill', 'SKILL.md.tpl'), {
    projectGuardrails,
    relatedTeamSkills,
    skillDescription: skill.description,
    skillId: skill.id,
    sourceMaterial: bulletList(sourceMaterialValues),
    whenToUse,
    workflow
  });
}

export function renderSkillTeamContextV2(resolvedProviders: ResolvedProviderV2[]): string {
  const packageLines = resolvedProviders.flatMap(provider =>
    provider.packages.map(pkg => `- \`${provider.id}/${pkg.label}\` -> \`${pkg.resolvedRoot}\``)
  );
  const skillLines = resolvedProviders.flatMap(provider =>
    provider.packages.flatMap(pkg =>
      pkg.skills.map(skill => `- \`${skill.skillId}\` (\`${provider.id}/${pkg.label}\`): ${skill.summary}`)
    )
  );

  return [
    '# Skill Team Context',
    '',
    '## system_prompt',
    '',
    '本项目由 Seli 初始化，请参考本地技能包进行代码生成。',
    '',
    '## Team Packages',
    '',
    packageLines.length > 0 ? packageLines.join('\n') : '- (none)',
    '',
    '## Scanned Skills',
    '',
    skillLines.length > 0 ? skillLines.join('\n') : '- (none)',
    ''
  ].join('\n');
}
