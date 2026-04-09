import path from 'node:path';

import type {
  AgentIntakeManifestV2,
  IntakePathBaseV2,
  IntakeDecisionV2,
  IntakeDocumentV2,
  IntakeProviderInputV2,
  RequestedOperation
} from './contracts.js';
import { readJsonFile } from '../infrastructure/json.js';
import { uniqueStrings } from '../infrastructure/fs.js';

function hasOwn(value: object | undefined, key: string): boolean {
  return Boolean(value) && Object.prototype.hasOwnProperty.call(value, key);
}

function resolveIntakePath(
  itemPath: string,
  pathBase: IntakePathBaseV2 | undefined,
  manifestDir: string,
  projectRoot: string | undefined
): string {
  const effectiveBase =
    pathBase === 'manifest' ? manifestDir : (projectRoot ?? manifestDir);
  return path.resolve(effectiveBase, itemPath);
}

function normalizeDocument(
  document: IntakeDocumentV2,
  manifestDir: string,
  projectRoot: string | undefined,
  index: number
): IntakeDocumentV2 {
  return {
    id: document.id || `doc-${index + 1}`,
    path: resolveIntakePath(document.path, document.pathBase, manifestDir, projectRoot),
    pathBase: document.pathBase,
    label: document.label,
    kind: document.kind,
    appliesTo: document.appliesTo
  };
}

function normalizeDecision(
  decision: IntakeDecisionV2,
  manifestDir: string,
  projectRoot: string | undefined,
  index: number
): IntakeDecisionV2 {
  return {
    id: decision.id || `decision-${index + 1}`,
    summary: decision.summary,
    appliesTo: decision.appliesTo,
    pathBase: decision.pathBase,
    sourcePaths: uniqueStrings(decision.sourcePaths).map(item =>
      resolveIntakePath(item, decision.pathBase, manifestDir, projectRoot)
    )
  };
}

function normalizeProviders(providers: IntakeProviderInputV2[] | undefined, baseDir: string): IntakeProviderInputV2[] {
  return (providers ?? []).map(provider => ({
    providerId: provider.providerId,
    materializationMode: provider.materializationMode,
    rootPath: provider.rootPath ? path.resolve(baseDir, provider.rootPath) : undefined,
    requestedSkills: hasOwn(provider, 'requestedSkills') ? uniqueStrings(provider.requestedSkills) : undefined,
    additionalAllowedSkills: hasOwn(provider, 'additionalAllowedSkills')
      ? uniqueStrings(provider.additionalAllowedSkills)
      : undefined,
    teamPackages: hasOwn(provider, 'teamPackages')
      ? (provider.teamPackages ?? []).map((item, index) => ({
          id: item.id || `${provider.providerId}-pkg-${index + 1}`,
          label: item.label,
          rootPath: path.resolve(baseDir, item.rootPath),
          priority: item.priority
        }))
      : undefined
  }));
}

export function normalizeIntakeV2(input: AgentIntakeManifestV2, baseDir: string): AgentIntakeManifestV2 {
  const projectPath = input.target?.projectPath ? path.resolve(baseDir, input.target.projectPath) : undefined;
  const normalizedProject = input.project
    ? {
        summary: hasOwn(input.project, 'summary') ? input.project.summary?.trim() || undefined : undefined,
        requestedProjectSkills: hasOwn(input.project, 'requestedProjectSkills')
          ? uniqueStrings(input.project.requestedProjectSkills)
          : undefined,
        projectSkillBlueprints: hasOwn(input.project, 'projectSkillBlueprints')
          ? (input.project.projectSkillBlueprints ?? []).map(item => ({
              ...item,
              pathBase: item.pathBase,
              guardrails: uniqueStrings(item.guardrails),
              relatedTeamSkills: uniqueStrings(item.relatedTeamSkills),
              sourceDocumentLabels: uniqueStrings(item.sourceDocumentLabels),
              sourcePaths: uniqueStrings(item.sourcePaths).map(sourcePath =>
                resolveIntakePath(sourcePath, item.pathBase, baseDir, projectPath)
              ),
              whenToUse: uniqueStrings(item.whenToUse),
              workflow: uniqueStrings(item.workflow)
            }))
          : undefined,
        extraAgents: hasOwn(input.project, 'extraAgents') ? uniqueStrings(input.project.extraAgents) : undefined
      }
    : undefined;

  return {
    schemaVersion: 2,
    target: {
      projectPath,
      requestedOperation: input.target?.requestedOperation,
      profile: input.target?.profile
    },
    providers: normalizeProviders(input.providers, baseDir),
    documents: (input.documents ?? []).map((document, index) => normalizeDocument(document, baseDir, projectPath, index)),
    decisions: (input.decisions ?? []).map((decision, index) =>
      normalizeDecision(decision, baseDir, projectPath, index)
    ),
    project: normalizedProject,
    notes: uniqueStrings(input.notes)
  };
}

export function loadAndNormalizeIntake(intakePath: string): AgentIntakeManifestV2 {
  const absolutePath = path.resolve(intakePath);
  const raw = readJsonFile<Record<string, unknown>>(absolutePath);
  const baseDir = path.dirname(absolutePath);

  if (raw.schemaVersion === 2) {
    return normalizeIntakeV2(raw as unknown as AgentIntakeManifestV2, baseDir);
  }
  if (raw.version === 1) {
    throw new Error(`Legacy intake manifest is no longer supported at ${absolutePath}. Use schemaVersion=2.`);
  }

  throw new Error(`Unsupported intake manifest schema at ${absolutePath}`);
}

export function resolveRequestedOperation(command: 'plan' | 'init' | 'update' | 'doctor', requestedOperation: RequestedOperation | undefined, hasExistingConfig: boolean, hasLegacyState: boolean): 'plan' | 'init' | 'update' | 'doctor' {
  if ((command !== 'init' && command !== 'update') || !requestedOperation) {
    return command;
  }

  if (requestedOperation === 'auto') {
    return hasExistingConfig || hasLegacyState ? 'update' : 'init';
  }

  if (requestedOperation === 'init' || requestedOperation === 'update' || requestedOperation === 'doctor') {
    return requestedOperation === 'doctor' ? command : requestedOperation;
  }

  return command;
}
