import { readTemplate } from './catalog.js';
import type { SeliConfig, ProjectSkillConfig, ResolvedSeliConfig } from './types.js';
import { renderTemplate } from './utils.js';

function bulletList(values: readonly string[]): string {
  if (values.length === 0) {
    return '- (none)';
  }
  return values.join('\n');
}

function normalizeLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function renderProjectSummary(config: SeliConfig): string {
  const projectSummary = normalizeLine((config.layers.project as { summary?: string | undefined }).summary ?? '');
  return projectSummary || 'No project summary configured. Add `project.summary` in intake to describe this repository.';
}

export function renderAgentsContract(config: SeliConfig, _resolvedConfig: ResolvedSeliConfig): string {
  return renderTemplate(readTemplate('system', 'AGENTS.md.tpl'), {
    projectSummary: renderProjectSummary(config)
  });
}

export function renderProjectSkill(skill: ProjectSkillConfig): string {
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

export function renderSkillTeamContext(resolvedConfig: ResolvedSeliConfig): string {
  const packageLines = resolvedConfig.layers.team.providers.flatMap(provider =>
    provider.packages.map(pkg => `- \`${provider.id}/${pkg.label}\` -> \`${pkg.resolvedRoot}\``)
  );
  const skillLines = resolvedConfig.layers.team.providers.flatMap(provider =>
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

export function renderCompatPluginManifest(pluginId: string): string {
  return renderTemplate(readTemplate('compat', 'plugin.json.tpl'), { pluginId });
}

export function renderCompatPluginReadme(pluginId: string): string {
  return renderTemplate(readTemplate('compat', 'plugin-readme.md.tpl'), { pluginId });
}

export function renderCompatMarketplace(pluginId: string): string {
  return renderTemplate(readTemplate('compat', 'marketplace.json.tpl'), { pluginId });
}
