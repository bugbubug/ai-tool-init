import path from 'node:path';

import type {
  AgentIntakeManifestV2,
  InstallScope,
  ProjectSkillBlueprintV2,
  ProjectSkillConfigV2,
  ResolvedProviderV2,
  SeliConfigV2,
  SkillDecisionRequestedBy,
  SkillRejectionReason
} from './contracts.js';
import { REQUIRED_PROJECT_SKILLS, normalizeConfigV2 } from './defaults.js';
import type { PolicyRegistry } from '../registry/policy-registry.js';
import type { ProviderRegistry } from '../registry/provider-registry.js';
import { deepClone } from '../infrastructure/json.js';
import { uniqueStrings } from '../infrastructure/fs.js';

function hasOwn(value: object | undefined, key: string): boolean {
  return Boolean(value) && Object.prototype.hasOwnProperty.call(value, key);
}

function createManagedProjectSkill(skillId: string, existingSkill?: ProjectSkillConfigV2): ProjectSkillConfigV2 {
  return {
    id: skillId,
    description: existingSkill?.description ?? `Agent-managed project skill ${skillId}.`,
    managed: true
  };
}

function createGenericBlueprint(
  skillId: string,
  existingSkill: ProjectSkillConfigV2 | undefined,
  relatedTeamSkills: string[],
  intake: AgentIntakeManifestV2
): ProjectSkillBlueprintV2 {
  const documents = intake.documents ?? [];
  const sourcePaths = documents.map(document => document.path);
  const sourceDocumentLabels = documents.map(document => document.label);
  const projectDecisions = (intake.decisions ?? [])
    .filter(decision => !decision.appliesTo || decision.appliesTo === 'project')
    .map(decision => decision.summary);

  return {
    id: skillId,
    description: existingSkill?.description ?? `Project-specific guidance for ${skillId}.`,
    whenToUse:
      projectDecisions.length > 0
        ? projectDecisions.slice(0, 3)
        : ['Use this skill when repository-specific delivery rules must override the team layer.'],
    workflow:
      projectDecisions.length > 0
        ? projectDecisions
        : ['Review the current repository truth before implementing changes.'],
    guardrails: [
      'Prefer repository-specific guidance over team defaults when they conflict.',
      'Keep repository truth in AGENTS.md and .selirc.'
    ],
    relatedTeamSkills,
    sourcePaths,
    sourceDocumentLabels
  };
}

function resolveBlueprints(
  intake: AgentIntakeManifestV2 | null,
  existingSkills: ProjectSkillConfigV2[],
  relatedTeamSkills: string[]
): ProjectSkillBlueprintV2[] | null {
  if (!intake || !intake.project) {
    return null;
  }

  if (intake.project.projectSkillBlueprints !== undefined) {
    if (intake.project.projectSkillBlueprints.length === 0) {
      return [];
    }
    return intake.project.projectSkillBlueprints.map(blueprint => ({
      ...blueprint,
      guardrails: uniqueStrings(blueprint.guardrails),
      relatedTeamSkills: uniqueStrings(blueprint.relatedTeamSkills ?? relatedTeamSkills),
      sourceDocumentLabels: uniqueStrings(blueprint.sourceDocumentLabels),
      sourcePaths: uniqueStrings(blueprint.sourcePaths),
      whenToUse: uniqueStrings(blueprint.whenToUse),
      workflow: uniqueStrings(blueprint.workflow)
    }));
  }

  if (intake.project.requestedProjectSkills !== undefined) {
    if (intake.project.requestedProjectSkills.length === 0) {
      return [];
    }

    const existingSkillMap = new Map(existingSkills.map(skill => [skill.id, skill]));
    return intake.project.requestedProjectSkills.map(skillId =>
      createGenericBlueprint(skillId, existingSkillMap.get(skillId), relatedTeamSkills, intake)
    );
  }

  return null;
}

function applyBlueprints(config: SeliConfigV2, blueprints: ProjectSkillBlueprintV2[]): void {
  const existingSkillMap = new Map(config.layers.project.skills.map(skill => [skill.id, skill]));
  const unmanagedSkills = config.layers.project.skills.filter(skill => skill.managed === false);
  const blueprintMap = new Map(blueprints.map(blueprint => [blueprint.id, blueprint]));
  const reservedIds = new Set<string>([...REQUIRED_PROJECT_SKILLS.map(skill => skill.id), ...blueprintMap.keys()]);

  const toManagedSkill = (skillId: string, blueprint?: ProjectSkillBlueprintV2): ProjectSkillConfigV2 => {
    const existingSkill = existingSkillMap.get(skillId);
    if (!blueprint) {
      return {
        ...createManagedProjectSkill(skillId, existingSkill),
        guardrails: uniqueStrings(existingSkill?.guardrails),
        relatedTeamSkills: uniqueStrings(existingSkill?.relatedTeamSkills),
        sourceDocumentLabels: uniqueStrings(existingSkill?.sourceDocumentLabels),
        sourcePaths: uniqueStrings(existingSkill?.sourcePaths),
        whenToUse: uniqueStrings(existingSkill?.whenToUse),
        workflow: uniqueStrings(existingSkill?.workflow)
      };
    }

    return {
      ...createManagedProjectSkill(skillId, existingSkill),
      description: blueprint.description,
      guardrails: uniqueStrings(blueprint.guardrails),
      relatedTeamSkills: uniqueStrings(blueprint.relatedTeamSkills),
      sourceDocumentLabels: uniqueStrings(blueprint.sourceDocumentLabels),
      sourcePaths: uniqueStrings(blueprint.sourcePaths),
      whenToUse: uniqueStrings(blueprint.whenToUse),
      workflow: uniqueStrings(blueprint.workflow)
    };
  };

  const requiredSkills = REQUIRED_PROJECT_SKILLS.map(skill => toManagedSkill(skill.id, blueprintMap.get(skill.id)));

  if (blueprints.length === 0) {
    config.layers.project.skills = [...requiredSkills, ...unmanagedSkills.filter(skill => !reservedIds.has(skill.id))];
    return;
  }

  const managedSkills = Array.from(blueprintMap.values())
    .filter(blueprint => !REQUIRED_PROJECT_SKILLS.some(skill => skill.id === blueprint.id))
    .map(blueprint => toManagedSkill(blueprint.id, blueprint));

  config.layers.project.skills = [
    ...requiredSkills,
    ...managedSkills,
    ...unmanagedSkills.filter(skill => !reservedIds.has(skill.id))
  ];
}

function normalizeProviderPackages(
  providerId: string,
  materializationMode: string,
  rootPath: string,
  label: string,
  priority = 0
): SeliConfigV2['layers']['team']['providers'][number]['packages'][number] {
  const normalizedRoot = path.resolve(rootPath);
  return {
    id: `${providerId}-${priority}-${path.basename(normalizedRoot)}`,
    label,
    rootPath: normalizedRoot,
    priority,
    materializationMode
  };
}

function resolveExplicitRequestSource(
  provider: SeliConfigV2['layers']['team']['providers'][number],
  intakeProvider: NonNullable<AgentIntakeManifestV2['providers']>[number] | undefined,
  hasPersistedConfig: boolean
): { requestedSkillIds: string[]; requestedBy: SkillDecisionRequestedBy | null } {
  if (intakeProvider?.requestedSkills !== undefined) {
    return {
      requestedSkillIds: uniqueStrings(intakeProvider.requestedSkills),
      requestedBy: 'intake'
    };
  }

  if (!hasPersistedConfig) {
    return {
      requestedSkillIds: [],
      requestedBy: null
    };
  }

  return {
    requestedSkillIds: uniqueStrings(provider.skills),
    requestedBy: 'config'
  };
}

function rejectionMessage(providerId: string, skillId: string, reason: SkillRejectionReason): string {
  if (reason === 'disallowed_by_provider') {
    return `requestedSkills contains ${skillId}, but provider ${providerId} disallows it via allowedSkills`;
  }
  if (reason === 'missing_from_packages') {
    return `requestedSkills contains ${skillId}, but provider ${providerId} could not find it in resolved packages`;
  }
  return `requestedSkills contains ${skillId}, but provider ${providerId} filtered it out via team-skill policy`;
}

function applyProviderSelection(
  provider: SeliConfigV2['layers']['team']['providers'][number],
  resolved: ResolvedProviderV2,
  intake: AgentIntakeManifestV2 | null,
  policyRegistry: PolicyRegistry,
  hasPersistedConfig: boolean
): { provider: SeliConfigV2['layers']['team']['providers'][number]; resolved: ResolvedProviderV2; selectionErrors: string[] } {
  const intakeProvider = intake?.providers?.find(item => item.providerId === provider.id);
  const { requestedSkillIds, requestedBy } = resolveExplicitRequestSource(provider, intakeProvider, hasPersistedConfig);
  const requestedSet = new Set(requestedSkillIds);
  const allowedSet = new Set(resolved.allowedSkillIds);
  const discoveredSet = new Set(resolved.discoveredSkillIds);
  const availableSet = new Set(resolved.availableSkillIds);

  const selectionPolicies = policyRegistry.getByKind('team-skill-selection').filter(item => item.selectTeamSkills);
  let policySelected: string[] = [];
  if (requestedSkillIds.length === 0) {
    let next = provider.skills.length === 0 ? [] : provider.skills;
    for (const policy of selectionPolicies) {
      next = policy.selectTeamSkills!({
        providerId: provider.id,
        fallbackSkills: next,
        intake,
        resolvedProvider: resolved
      });
    }
    policySelected = uniqueStrings(next).filter(skillId => availableSet.has(skillId));
  }

  const selectedSkillIds = requestedSkillIds.length > 0 ? requestedSkillIds.filter(skillId => availableSet.has(skillId)) : policySelected;
  const selectedSet = new Set(selectedSkillIds);

  const rejectedSkillIds =
    requestedSkillIds.length > 0
      ? requestedSkillIds
          .filter(skillId => !selectedSet.has(skillId))
          .map(skillId => {
            let reason: SkillRejectionReason = 'filtered_by_policy';
            if (!allowedSet.has(skillId)) {
              reason = 'disallowed_by_provider';
            } else if (!discoveredSet.has(skillId)) {
              reason = 'missing_from_packages';
            }
            return {
              skillId,
              reason,
              requestedBy: requestedBy ?? 'config'
            };
          })
      : [];

  const decisionSkillIds = uniqueStrings([
    ...requestedSkillIds,
    ...resolved.availableSkillIds,
    ...resolved.discoveredSkillIds,
    ...resolved.allowedSkillIds
  ]);

  const skillDecisions = decisionSkillIds
    .map(skillId => {
      if (selectedSet.has(skillId)) {
        return {
          skillId,
          requestedBy: requestedSet.has(skillId) ? (requestedBy ?? 'config') : 'policy',
          status: 'selected' as const
        };
      }

      const rejected = rejectedSkillIds.find(item => item.skillId === skillId);
      if (rejected) {
        return {
          skillId,
          requestedBy: rejected.requestedBy,
          status: 'rejected' as const,
          reason: rejected.reason
        };
      }

      if (availableSet.has(skillId)) {
        return {
          skillId,
          requestedBy: 'policy' as const,
          status: 'available' as const
        };
      }

      return null;
    })
    .filter((decision): decision is NonNullable<typeof decision> => decision !== null);

  provider.skills = uniqueStrings(selectedSkillIds);
  resolved.requestedSkillIds = requestedSkillIds;
  resolved.rejectedSkillIds = rejectedSkillIds;
  resolved.skillDecisions = skillDecisions;
  resolved.selectedSkills = resolved.availableSkillIds
    .filter(skillId => selectedSet.has(skillId))
    .map(skillId => {
      for (const pkg of resolved.packages) {
        const found = pkg.skills.find(skill => skill.skillId === skillId);
        if (found) {
          return found;
        }
      }
      return null;
    })
    .filter(Boolean) as ResolvedProviderV2['selectedSkills'];

  return {
    provider,
    resolved,
    selectionErrors: rejectedSkillIds.map(item => rejectionMessage(provider.id, item.skillId, item.reason))
  };
}

export function applyIntakeAndPolicy(
  baseConfig: SeliConfigV2,
  intake: AgentIntakeManifestV2 | null,
  providerRoots: Record<string, string>,
  providerRegistry: ProviderRegistry,
  policyRegistry: PolicyRegistry,
  scope: InstallScope = 'full',
  hasPersistedConfig = false
): { config: SeliConfigV2; resolvedProviders: ResolvedProviderV2[]; selectionErrors: string[] } {
  const config = deepClone(baseConfig);

  if (intake?.target?.profile) {
    config.profile = intake.target.profile;
  }

  const selectionErrors: string[] = [];

  config.layers.team.providers = config.layers.team.providers.map(provider => {
    const intakeProvider = intake?.providers?.find(item => item.providerId === provider.id);
    const providerRootOverride = providerRoots[provider.id] || intakeProvider?.rootPath;

    const nextProvider = {
      ...provider,
      materializationMode: intakeProvider?.materializationMode || provider.materializationMode,
      skills: [...provider.skills],
      packages: [...provider.packages],
      additionalAllowedSkills: uniqueStrings(provider.additionalAllowedSkills ?? [])
    };

    if (intakeProvider?.additionalAllowedSkills !== undefined) {
      nextProvider.additionalAllowedSkills = uniqueStrings(intakeProvider.additionalAllowedSkills);
    }

    if (intakeProvider?.teamPackages !== undefined) {
      nextProvider.packages = (intakeProvider.teamPackages ?? []).map((pkg, index) => ({
        id: pkg.id || `${provider.id}-pkg-${index + 1}`,
        label: pkg.label,
        rootPath: path.resolve(pkg.rootPath),
        priority: pkg.priority ?? index,
        materializationMode: intakeProvider.materializationMode || provider.materializationMode
      }));
      nextProvider.sourceRoot = nextProvider.packages[0]?.rootPath;
    } else if (providerRootOverride) {
      nextProvider.packages = [
        normalizeProviderPackages(
          provider.id,
          nextProvider.materializationMode,
          providerRootOverride,
          path.basename(providerRootOverride),
          0
        )
      ];
      nextProvider.sourceRoot = path.resolve(providerRootOverride);
    } else if (nextProvider.packages.length === 0 && nextProvider.sourceRoot) {
      nextProvider.packages = [
        normalizeProviderPackages(
          provider.id,
          nextProvider.materializationMode,
          nextProvider.sourceRoot,
          path.basename(nextProvider.sourceRoot),
          0
        )
      ];
    }

    return nextProvider;
  });

  const resolvedProviders = config.layers.team.providers.map(provider => {
    const plugin = providerRegistry.get(provider.id);
    const resolved = plugin.resolveProvider({
      projectRoot: process.cwd(),
      providerConfig: provider
    });

    const selected = applyProviderSelection(provider, resolved, intake, policyRegistry, hasPersistedConfig);
    selectionErrors.push(...selected.selectionErrors);
    return selected.resolved;
  });

  if (scope === 'full') {
    const selectedTeamSkills = resolvedProviders.flatMap(provider => provider.selectedSkills.map(skill => skill.skillId));
    const blueprints = resolveBlueprints(intake, config.layers.project.skills, selectedTeamSkills);
    if (blueprints) {
      applyBlueprints(config, blueprints);
    }

    if (hasOwn(intake?.project, 'summary')) {
      config.layers.project.summary = intake?.project?.summary?.trim() || undefined;
    }

    if (hasOwn(intake?.project, 'extraAgents')) {
      config.layers.project.extraAgents = uniqueStrings(intake?.project?.extraAgents);
    }
  }

  return {
    config: normalizeConfigV2(config),
    resolvedProviders,
    selectionErrors
  };
}
