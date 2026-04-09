import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from 'bun:test';

import {
  initProject,
  migrateProject,
  planProject,
  runDoctor,
  updateProject
} from '../src/index.js';
import type { AgentIntakeManifestV2, SeliConfigV2, SeliLockV2 } from '../src/domain/contracts.js';
import { loadAndNormalizeIntake } from '../src/domain/intake.js';

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function readConfig(projectRoot: string): SeliConfigV2 {
  return readJson<SeliConfigV2>(path.join(projectRoot, '.selirc'));
}

function readLock(projectRoot: string): SeliLockV2 {
  return readJson<SeliLockV2>(path.join(projectRoot, '.seli.lock'));
}

function writeText(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function createFakeSkillPackage(rootPath: string, skills: string[]): void {
  for (const skill of skills) {
    const skillPath = path.join(rootPath, 'skills', skill);
    fs.mkdirSync(skillPath, { recursive: true });
    fs.writeFileSync(path.join(skillPath, 'SKILL.md'), `# ${skill}\n`, 'utf8');
  }
}

function createFakeEccSource(rootPath: string): void {
  createFakeSkillPackage(rootPath, [
    'tdd-workflow',
    'verification-loop',
    'coding-standards',
    'backend-patterns',
    'security-review',
    'api-design',
    'documentation-lookup',
    'frontend-patterns',
    'python-patterns',
    'python-testing',
    'database-migrations',
    'design-system',
    'browser-qa',
    'deployment-patterns',
    'article-writing'
  ]);
}

function initGitRepo(rootPath: string): void {
  execFileSync('git', ['init'], {
    cwd: rootPath,
    encoding: 'utf8'
  });
}

function writeIntakeV2(rootPath: string, manifest: AgentIntakeManifestV2): string {
  const intakePath = path.join(rootPath, 'manifest.json');
  writeJson(intakePath, manifest);
  return intakePath;
}

function sectionBullets(content: string, title: string): string[] {
  const lines = content.split('\n');
  const header = `## ${title}`;
  const startIndex = lines.indexOf(header);
  if (startIndex < 0) {
    return [];
  }

  const bullets: string[] = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (line.startsWith('## ')) {
      break;
    }
    if (line.startsWith('- ')) {
      bullets.push(line);
    }
  }
  return bullets;
}

test('init writes only .selirc/.seli.lock and no compat outputs', () => {
  const eccRoot = makeTempDir('seli-ecc-');
  const projectRoot = makeTempDir('seli-project-');
  const intakeRoot = makeTempDir('seli-intake-');
  createFakeEccSource(eccRoot);

  const intakePath = writeIntakeV2(intakeRoot, {
    schemaVersion: 2,
    target: {
      projectPath: projectRoot,
      requestedOperation: 'auto',
      profile: 'default'
    },
    providers: [
      {
        providerId: 'ecc',
        rootPath: eccRoot,
        requestedSkills: ['api-design', 'database-migrations']
      }
    ],
    project: {
      requestedProjectSkills: ['solution-blueprint'],
      extraAgents: ['explorer']
    }
  });

  initProject({ projectRoot, intakePath });
  const config = readConfig(projectRoot);
  const lock = readLock(projectRoot);

  expect(config.version).toBe(2);
  expect(lock.version).toBe(2);
  expect(config.layers.team.providers[0]?.skills).toEqual(['api-design', 'database-migrations']);
  expect(config.layers.project.extraAgents).toEqual(['explorer']);
  expect(fs.existsSync(path.join(projectRoot, '.agents', 'plugins', 'marketplace.json'))).toBe(false);
  expect(fs.existsSync(path.join(projectRoot, 'plugins'))).toBe(false);

  const skillTeam = fs.readFileSync(path.join(projectRoot, '.agents', 'skill_team.md'), 'utf8');
  expect(skillTeam).toContain('## system_prompt');
  expect(skillTeam).toContain('本项目由 Seli 初始化，请参考本地技能包进行代码生成。');

  const agentsContract = fs.readFileSync(path.join(projectRoot, 'AGENTS.md'), 'utf8');
  expect(agentsContract).toContain('## Project Context');
  expect(agentsContract).toContain('## Response Principles');
  expect(agentsContract).toContain('## Layer Priority');
  expect(agentsContract).toContain('## Guardrails');
  expect(agentsContract).toContain(
    'Do not assume this repository is the seli source repository unless repository evidence confirms it.'
  );
  expect(agentsContract).not.toContain('## Agent First-Question Protocol');
  expect(agentsContract).not.toContain('1. `项目特点`');
  expect(agentsContract).not.toContain('## Update Workflow');
  expect(agentsContract).not.toContain('## Tech Stack Guidance');
  expect(agentsContract).not.toContain('## Git Management Guidance');
  expect(agentsContract).not.toContain('## Enabled Team Providers');
  expect(agentsContract).not.toContain('Team skill context:');
  expect(agentsContract).not.toContain(eccRoot);
  expect(agentsContract).not.toMatch(/\/Users\/|\/home\/|[A-Za-z]:\\/);

  const evolutionSkill = fs.readFileSync(path.join(projectRoot, '.codex', 'skills', 'team-skill-evolution', 'SKILL.md'), 'utf8');
  const syncSkill = fs.readFileSync(path.join(projectRoot, '.codex', 'skills', 'team-skill-sync', 'SKILL.md'), 'utf8');
  for (const skillDoc of [evolutionSkill, syncSkill]) {
    expect(skillDoc).toContain('$(npm prefix -g)/bin/seli');
    expect(skillDoc).toContain('~/.bun/bin/seli');
    expect(skillDoc).toContain('/opt/homebrew/bin/seli');
    expect(skillDoc).toContain('/usr/local/bin/seli');
    expect(skillDoc).toContain('%AppData%\\\\npm\\\\seli.cmd');
    expect(skillDoc).toContain('bun run src/cli.ts <plan|update|doctor> --project <target-abs-path> --scope team-skills');
    expect(skillDoc).toContain('npm install -g seli');
    expect(skillDoc).toContain('seli --help');
    expect(skillDoc).toContain('Do not assume seli is available in PATH.');
    expect(skillDoc).toContain('Always use an explicit --project <abs-path> argument when running seli commands.');
  }
});

test('AGENTS includes project-skill blueprint context', () => {
  const eccRoot = makeTempDir('seli-ecc-');
  const projectRoot = makeTempDir('seli-blueprint-project-');
  const intakeRoot = makeTempDir('seli-blueprint-intake-');
  createFakeEccSource(eccRoot);

  const intakePath = writeIntakeV2(intakeRoot, {
    schemaVersion: 2,
    target: { projectPath: projectRoot, requestedOperation: 'auto' },
    providers: [{ providerId: 'ecc', rootPath: eccRoot, requestedSkills: ['frontend-patterns'] }],
    project: {
      projectSkillBlueprints: [
        {
          id: 'india-mvp-funnel',
          description: 'Optimize onboarding and paywall conversion for India MVP.',
          whenToUse: ['When funnel drop-off or onboarding copy changes are requested.'],
          workflow: ['Read product docs and analytics notes before proposing funnel changes.'],
          sourceDocumentLabels: ['India MVP PRD'],
          relatedTeamSkills: ['frontend-patterns']
        }
      ]
    }
  });

  initProject({ projectRoot, intakePath });

  const agentsContract = fs.readFileSync(path.join(projectRoot, 'AGENTS.md'), 'utf8');
  expect(agentsContract).toContain('Optimize onboarding and paywall conversion for India MVP.');
  expect(agentsContract).toContain('When funnel drop-off or onboarding copy changes are requested.');
  expect(agentsContract).toContain('Read product docs and analytics notes before proposing funnel changes.');
  expect(agentsContract).toContain('Refer to project documents: India MVP PRD.');
  expect(agentsContract).not.toContain('Team skill context:');
  expect(agentsContract).not.toContain('## Agent First-Question Protocol');
});

test('AGENTS keeps concise bullet and length limits', () => {
  const eccRoot = makeTempDir('seli-ecc-');
  const projectRoot = makeTempDir('seli-compact-project-');
  const intakeRoot = makeTempDir('seli-compact-intake-');
  createFakeEccSource(eccRoot);

  const longLine =
    'This is a very long project guidance sentence meant to verify AGENTS truncation behavior keeps output concise even when upstream project blueprints include overly verbose descriptions and workflows that would otherwise flood the contract.';

  const intakePath = writeIntakeV2(intakeRoot, {
    schemaVersion: 2,
    target: { projectPath: projectRoot, requestedOperation: 'auto' },
    providers: [{ providerId: 'ecc', rootPath: eccRoot, requestedSkills: ['frontend-patterns', 'backend-patterns'] }],
    project: {
      projectSkillBlueprints: [
        {
          id: 'growth-funnel',
          description: longLine,
          whenToUse: [longLine, 'Handle conversion experiments.'],
          workflow: [longLine, 'Review latest product constraints first.'],
          sourceDocumentLabels: ['Growth Spec', 'KPI Tracker', 'Launch Checklist', 'Experiment Notes']
        },
        {
          id: 'payments-compliance',
          description: 'Keep payment copy and rules aligned with market constraints.',
          whenToUse: ['When checkout requirements change.']
        }
      ]
    }
  });

  initProject({ projectRoot, intakePath });

  const agentsContract = fs.readFileSync(path.join(projectRoot, 'AGENTS.md'), 'utf8');
  const contextBullets = sectionBullets(agentsContract, 'Project Context');
  const principlesBullets = sectionBullets(agentsContract, 'Response Principles');

  expect(contextBullets.length).toBeLessThanOrEqual(3);
  expect(principlesBullets.length).toBeLessThanOrEqual(4);
  for (const bullet of [...contextBullets, ...principlesBullets]) {
    expect(bullet.length).toBeLessThanOrEqual(145);
  }
  expect(agentsContract).not.toContain('Team skill context:');
  expect(agentsContract).not.toContain('## Tech Stack Guidance');
});

test('required project skill blueprints override defaults on init', () => {
  const eccRoot = makeTempDir('seli-ecc-');
  const projectRoot = makeTempDir('seli-required-blueprint-project-');
  const intakeRoot = makeTempDir('seli-required-blueprint-intake-');
  createFakeEccSource(eccRoot);

  const intakePath = writeIntakeV2(intakeRoot, {
    schemaVersion: 2,
    target: { projectPath: projectRoot, requestedOperation: 'auto' },
    providers: [{ providerId: 'ecc', rootPath: eccRoot }],
    project: {
      projectSkillBlueprints: [
        {
          id: 'repo-governance',
          description: 'Repository-specific governance for Glid launch operations.',
          whenToUse: ['When repository operating rules diverge from baseline defaults.'],
          workflow: ['Check release governance notes before changing shared project automation.'],
          guardrails: ['Do not bypass launch governance approvals recorded in project docs.']
        },
        {
          id: 'change-closeout',
          description: 'Closeout format tuned for Glid delivery reporting.',
          whenToUse: ['When summarizing changes for Glid delivery stakeholders.'],
          workflow: ['List user-visible impact before implementation details in closeout.'],
          guardrails: ['Always mention rollout risk if checkout logic changed.']
        }
      ]
    }
  });

  initProject({ projectRoot, intakePath });

  const config = readConfig(projectRoot);
  const repoGovernance = config.layers.project.skills.find(skill => skill.id === 'repo-governance');
  const changeCloseout = config.layers.project.skills.find(skill => skill.id === 'change-closeout');

  expect(repoGovernance?.managed).toBe(true);
  expect(repoGovernance?.description).toBe('Repository-specific governance for Glid launch operations.');
  expect(repoGovernance?.whenToUse).toEqual(['When repository operating rules diverge from baseline defaults.']);
  expect(repoGovernance?.workflow).toEqual(['Check release governance notes before changing shared project automation.']);
  expect(repoGovernance?.guardrails).toEqual(['Do not bypass launch governance approvals recorded in project docs.']);
  expect(changeCloseout?.description).toBe('Closeout format tuned for Glid delivery reporting.');
  expect(changeCloseout?.whenToUse).toEqual(['When summarizing changes for Glid delivery stakeholders.']);
  expect(changeCloseout?.workflow).toEqual(['List user-visible impact before implementation details in closeout.']);
  expect(changeCloseout?.guardrails).toEqual(['Always mention rollout risk if checkout logic changed.']);

  const repoGovernanceDoc = fs.readFileSync(
    path.join(projectRoot, '.codex', 'skills', 'repo-governance', 'SKILL.md'),
    'utf8'
  );
  const changeCloseoutDoc = fs.readFileSync(
    path.join(projectRoot, '.codex', 'skills', 'change-closeout', 'SKILL.md'),
    'utf8'
  );
  expect(repoGovernanceDoc).toContain('Repository-specific governance for Glid launch operations.');
  expect(repoGovernanceDoc).not.toContain('Generic repository governance and topology guardrails.');
  expect(changeCloseoutDoc).toContain('Closeout format tuned for Glid delivery reporting.');
  expect(changeCloseoutDoc).not.toContain('Generic repo-local closeout checklist and reporting template.');
});

test('intake project-relative paths default to target project root and support manifest override', () => {
  const eccRoot = makeTempDir('seli-ecc-');
  const projectRoot = makeTempDir('seli-project-path-base-');
  const intakeRoot = makeTempDir('seli-intake-path-base-');
  createFakeEccSource(eccRoot);

  writeText(path.join(projectRoot, 'docs', 'project.md'), '# project doc\n');
  writeText(path.join(intakeRoot, 'docs', 'manifest.md'), '# manifest doc\n');

  const intakePath = writeIntakeV2(path.join(intakeRoot, 'intake'), {
    schemaVersion: 2,
    target: { projectPath: projectRoot, requestedOperation: 'auto' },
    providers: [{ providerId: 'ecc', rootPath: eccRoot }],
    documents: [
      {
        id: 'project-doc',
        path: 'docs/project.md',
        label: 'Project Doc',
        kind: 'requirements',
        appliesTo: 'project'
      },
      {
        id: 'manifest-doc',
        path: 'docs/manifest.md',
        pathBase: 'manifest',
        label: 'Manifest Doc',
        kind: 'requirements',
        appliesTo: 'project'
      }
    ],
    decisions: [
      {
        id: 'decision-1',
        summary: 'Use project-root relative decisions by default.',
        appliesTo: 'project',
        sourcePaths: ['docs/project.md']
      },
      {
        id: 'decision-2',
        summary: 'Allow manifest-relative overrides.',
        appliesTo: 'project',
        pathBase: 'manifest',
        sourcePaths: ['docs/manifest.md']
      }
    ],
    project: {
      projectSkillBlueprints: [
        {
          id: 'repo-governance',
          description: 'Project-root path resolution test.',
          sourcePaths: ['docs/project.md']
        },
        {
          id: 'change-closeout',
          description: 'Manifest-relative blueprint path override test.',
          pathBase: 'manifest',
          sourcePaths: ['docs/manifest.md']
        }
      ]
    }
  });

  initProject({ projectRoot, intakePath });
  const config = readConfig(projectRoot);

  expect(config.layers.project.skills.find(skill => skill.id === 'repo-governance')?.sourcePaths).toEqual([
    path.join(projectRoot, 'docs', 'project.md')
  ]);
  expect(config.layers.project.skills.find(skill => skill.id === 'change-closeout')?.sourcePaths).toEqual([
    path.join(intakeRoot, 'intake', 'docs', 'manifest.md')
  ]);
});

test('intake project paths fall back to manifest directory when target project path is absent', () => {
  const intakeRoot = makeTempDir('seli-intake-fallback-');
  writeText(path.join(intakeRoot, 'docs', 'fallback.md'), '# fallback\n');

  const intake = loadAndNormalizeIntake(writeIntakeV2(path.join(intakeRoot, 'nested'), {
    schemaVersion: 2,
    documents: [
      {
        id: 'doc-1',
        path: 'docs/fallback.md',
        label: 'Fallback Doc',
        kind: 'requirements',
        appliesTo: 'project'
      }
    ],
    decisions: [
      {
        id: 'decision-1',
        summary: 'Fallback to manifest-relative resolution.',
        sourcePaths: ['docs/fallback.md']
      }
    ],
    project: {
      projectSkillBlueprints: [
        {
          id: 'repo-governance',
          description: 'Fallback path resolution',
          sourcePaths: ['docs/fallback.md']
        }
      ]
    }
  }));

  expect(intake.documents?.[0]?.path).toBe(path.join(intakeRoot, 'nested', 'docs', 'fallback.md'));
  expect(intake.decisions?.[0]?.sourcePaths).toEqual([path.join(intakeRoot, 'nested', 'docs', 'fallback.md')]);
  expect(intake.project?.projectSkillBlueprints?.[0]?.sourcePaths).toEqual([
    path.join(intakeRoot, 'nested', 'docs', 'fallback.md')
  ]);
});

test('AGENTS project context prefers explicit project summary and avoids directive fallback text', () => {
  const eccRoot = makeTempDir('seli-ecc-');
  const projectRoot = makeTempDir('seli-summary-project-');
  const intakeRoot = makeTempDir('seli-summary-intake-');
  createFakeEccSource(eccRoot);

  const intakePath = writeIntakeV2(intakeRoot, {
    schemaVersion: 2,
    target: { projectPath: projectRoot, requestedOperation: 'auto' },
    providers: [{ providerId: 'ecc', rootPath: eccRoot, requestedSkills: ['frontend-patterns'] }],
    project: {
      summary: 'Glid focuses on onboarding conversion and payment completion for its current launch market.',
      projectSkillBlueprints: [
        {
          id: 'launch-funnel',
          description: 'Optimize launch funnel metrics.',
          whenToUse: ['Use when onboarding copy or activation nudges change.'],
          workflow: ['Review analytics snapshots before proposing UX changes.']
        }
      ]
    }
  });

  initProject({ projectRoot, intakePath });

  const agentsContract = fs.readFileSync(path.join(projectRoot, 'AGENTS.md'), 'utf8');
  expect(agentsContract).toContain(
    'Glid focuses on onboarding conversion and payment completion for its current launch market.'
  );
  expect(agentsContract).not.toContain('Current delivery focus: Use when onboarding copy or activation nudges change.');
  expect(agentsContract).not.toContain('Current delivery focus: Review analytics snapshots before proposing UX changes.');
});

test('update rewrites legacy AGENTS first-question block', () => {
  const eccRoot = makeTempDir('seli-ecc-');
  const projectRoot = makeTempDir('seli-agents-migration-');
  const intakeRoot = makeTempDir('seli-migration-intake-');
  createFakeEccSource(eccRoot);

  const intakePath = writeIntakeV2(intakeRoot, {
    schemaVersion: 2,
    target: { projectPath: projectRoot, requestedOperation: 'auto' },
    providers: [{ providerId: 'ecc', rootPath: eccRoot }]
  });

  initProject({ projectRoot, intakePath });

  fs.writeFileSync(
    path.join(projectRoot, 'AGENTS.md'),
    `# Repository Collaboration Contract

## Agent First-Question Protocol

1. \`项目特点\`
`,
    'utf8'
  );

  updateProject({ projectRoot, intakePath, force: true });

  const agentsContract = fs.readFileSync(path.join(projectRoot, 'AGENTS.md'), 'utf8');
  expect(agentsContract).toContain('## Project Context');
  expect(agentsContract).toContain('## Response Principles');
  expect(agentsContract).not.toContain('## Tech Stack Guidance');
  expect(agentsContract).not.toContain('## Agent First-Question Protocol');
  expect(agentsContract).not.toContain('1. `项目特点`');
});

test('plan -> update remains idempotent', () => {
  const eccRoot = makeTempDir('seli-ecc-');
  const projectRoot = makeTempDir('seli-idempotent-');
  const intakeRoot = makeTempDir('seli-intake-');
  createFakeEccSource(eccRoot);

  const intakePath = writeIntakeV2(intakeRoot, {
    schemaVersion: 2,
    target: { projectPath: projectRoot, requestedOperation: 'auto' },
    providers: [{ providerId: 'ecc', rootPath: eccRoot }]
  });

  initProject({ projectRoot, intakePath });
  const followUpPlan = planProject({ projectRoot, intakePath });
  expect(followUpPlan.operations.length).toBe(0);
});

test('unsupported legacy state is rejected for init and migrate', () => {
  const projectRoot = makeTempDir('seli-legacy-');
  writeJson(path.join(projectRoot, '.ai-tool-init', 'config.json'), { version: 1 });

  expect(() => initProject({ projectRoot })).toThrow(/Unsupported legacy state/);
  expect(() => migrateProject({ projectRoot })).toThrow(/Legacy state is no longer supported/);
});

test('legacy intake schema version 1 is rejected', () => {
  const projectRoot = makeTempDir('seli-intake-legacy-project-');
  const intakePath = path.join(projectRoot, 'intake-v1.json');
  writeJson(intakePath, {
    version: 1,
    targetProjectPath: projectRoot
  });

  expect(() => planProject({ projectRoot, intakePath })).toThrow(/Legacy intake manifest is no longer supported/);
});

test('SELI_ECC_ROOT is honored and old env fallback is ignored', () => {
  const projectRoot = makeTempDir('seli-env-project-');
  const newRoot = makeTempDir('seli-env-new-');
  const oldRoot = makeTempDir('seli-env-old-');
  createFakeSkillPackage(newRoot, ['tdd-workflow']);
  createFakeSkillPackage(oldRoot, ['backend-patterns']);

  process.env.SELI_ECC_ROOT = newRoot;
  process.env.AI_TOOL_INIT_ECC_ROOT = oldRoot;
  try {
    initProject({ projectRoot });
  } finally {
    delete process.env.SELI_ECC_ROOT;
    delete process.env.AI_TOOL_INIT_ECC_ROOT;
  }

  const lock = readLock(projectRoot);
  expect(lock.resolved.providers[0]?.resolvedSourceRoot?.includes(path.resolve(newRoot))).toBe(true);
});

test('update normalizes .agents/skills and removes duplicate project-skill directories', () => {
  const eccRoot = makeTempDir('seli-ecc-');
  const projectRoot = makeTempDir('seli-dup-clean-');
  createFakeEccSource(eccRoot);

  initProject({
    projectRoot,
    providerRoots: { ecc: eccRoot }
  });

  const duplicateDir = path.join(projectRoot, '.agents', 'skills', 'repo-governance');
  fs.mkdirSync(duplicateDir, { recursive: true });
  fs.writeFileSync(path.join(duplicateDir, 'SKILL.md'), '# duplicate\n', 'utf8');

  const doctorBefore = runDoctor({ projectRoot, providerRoots: { ecc: eccRoot } });
  expect(doctorBefore.ok).toBe(false);
  expect(doctorBefore.errors.join('\n')).toContain('Duplicate skill IDs found in both .codex/skills and .agents/skills');

  updateProject({
    projectRoot,
    providerRoots: { ecc: eccRoot },
    force: true
  });

  expect(fs.existsSync(duplicateDir)).toBe(false);
  const doctorAfter = runDoctor({ projectRoot, providerRoots: { ecc: eccRoot } });
  expect(doctorAfter.ok).toBe(true);
});

test('team-skills scope updates only team skill symlinks and state files', () => {
  const eccRoot = makeTempDir('seli-ecc-');
  const projectRoot = makeTempDir('seli-team-scope-');
  const intakeRoot = makeTempDir('seli-team-scope-intake-');
  createFakeEccSource(eccRoot);

  const initialIntakePath = writeIntakeV2(intakeRoot, {
    schemaVersion: 2,
    target: { projectPath: projectRoot, requestedOperation: 'auto' },
    providers: [{ providerId: 'ecc', rootPath: eccRoot, requestedSkills: ['tdd-workflow'] }],
    project: {
      extraAgents: ['explorer', 'reviewer'],
      projectSkillBlueprints: [
        {
          id: 'western-launch-funnel',
          description: 'Protect launch funnel rules.',
          whenToUse: ['When launch funnel changes are requested.']
        }
      ]
    }
  });
  initProject({ projectRoot, intakePath: initialIntakePath });

  const agentsBefore = fs.readFileSync(path.join(projectRoot, 'AGENTS.md'), 'utf8');
  const claudeReadmeBefore = fs.readFileSync(path.join(projectRoot, '.claude', 'README.md'), 'utf8');
  const codexSkillBefore = fs.readFileSync(path.join(projectRoot, '.codex', 'skills', 'team-skill-evolution', 'SKILL.md'), 'utf8');
  const projectSkillBefore = fs.readFileSync(
    path.join(projectRoot, '.codex', 'skills', 'western-launch-funnel', 'SKILL.md'),
    'utf8'
  );
  const explorerBefore = fs.readFileSync(path.join(projectRoot, '.codex', 'agents', 'explorer.toml'), 'utf8');

  const updatedIntakePath = writeIntakeV2(intakeRoot, {
    schemaVersion: 2,
    target: { projectPath: projectRoot, requestedOperation: 'auto' },
    providers: [{ providerId: 'ecc', rootPath: eccRoot, requestedSkills: ['tdd-workflow', 'security-review'] }],
    project: {
      extraAgents: [],
      requestedProjectSkills: []
    }
  });

  const result = updateProject({
    projectRoot,
    intakePath: updatedIntakePath,
    scope: 'team-skills'
  });

  expect(result.plan.operations.map(operation => [operation.action, operation.path])).toEqual([
    ['write-file', '.selirc'],
    ['write-symlink', '.agents/skills/security-review'],
    ['write-file', '.seli.lock']
  ]);

  expect(fs.readFileSync(path.join(projectRoot, 'AGENTS.md'), 'utf8')).toBe(agentsBefore);
  expect(fs.readFileSync(path.join(projectRoot, '.claude', 'README.md'), 'utf8')).toBe(claudeReadmeBefore);
  expect(fs.readFileSync(path.join(projectRoot, '.codex', 'skills', 'team-skill-evolution', 'SKILL.md'), 'utf8')).toBe(codexSkillBefore);
  expect(fs.readFileSync(path.join(projectRoot, '.codex', 'skills', 'western-launch-funnel', 'SKILL.md'), 'utf8')).toBe(projectSkillBefore);
  expect(fs.readFileSync(path.join(projectRoot, '.codex', 'agents', 'explorer.toml'), 'utf8')).toBe(explorerBefore);
  expect(fs.lstatSync(path.join(projectRoot, '.agents', 'skills', 'security-review')).isSymbolicLink()).toBe(true);

  const config = readConfig(projectRoot);
  const lock = readLock(projectRoot);
  expect(config.layers.team.providers[0]?.skills).toEqual(['tdd-workflow', 'security-review']);
  expect(config.layers.project.extraAgents).toEqual(['explorer', 'reviewer']);
  expect(config.layers.project.skills.some(skill => skill.id === 'western-launch-funnel')).toBe(true);
  expect(lock.resolved.providers[0]?.skills).toEqual(expect.arrayContaining(['tdd-workflow', 'security-review']));
  expect(lock.managed.some(entry => entry.path === 'AGENTS.md')).toBe(true);
  expect(lock.managed.some(entry => entry.path === '.agents/skills/security-review')).toBe(true);
});

test('inspect config and plan explain rejected requested skills', () => {
  const eccRoot = makeTempDir('seli-ecc-');
  const projectRoot = makeTempDir('seli-rejected-skill-');
  const intakeRoot = makeTempDir('seli-rejected-skill-intake-');
  createFakeEccSource(eccRoot);

  initProject({
    projectRoot,
    providerRoots: { ecc: eccRoot }
  });

  const intakePath = writeIntakeV2(intakeRoot, {
    schemaVersion: 2,
    target: { projectPath: projectRoot, requestedOperation: 'auto' },
    providers: [{ providerId: 'ecc', rootPath: eccRoot, requestedSkills: ['design-system'] }]
  });

  const inspect = planProject({
    projectRoot,
    intakePath
  });
  expect(inspect.summary.selectionErrors).toEqual([
    'requestedSkills contains design-system, but provider ecc disallows it via allowedSkills'
  ]);

  const inspectConfig = execFileSync(
    process.execPath,
    [path.join(import.meta.dir, '..', 'src', 'cli.ts'), 'inspect', 'config', '--project', projectRoot, '--intake', intakePath, '--json'],
    {
      cwd: path.join(import.meta.dir, '..'),
      encoding: 'utf8'
    }
  );
  const parsed = JSON.parse(inspectConfig) as {
    resolvedProviders: Array<{
      rejectedSkills: Array<{ skillId: string; reason: string }>;
      requestedSkills: string[];
      selectedSkills: string[];
    }>;
  };
  expect(parsed.resolvedProviders[0]?.requestedSkills).toEqual(['design-system']);
  expect(parsed.resolvedProviders[0]?.selectedSkills).toEqual([]);
  expect(parsed.resolvedProviders[0]?.rejectedSkills).toEqual([
    { skillId: 'design-system', reason: 'disallowed_by_provider' }
  ]);

  expect(() =>
    updateProject({
      projectRoot,
      intakePath
    })
  ).toThrow(/provider ecc disallows it via allowedSkills/);

  const doctorResult = runDoctor({
    projectRoot,
    intakePath
  });
  expect(doctorResult.ok).toBe(false);
  expect(doctorResult.errors.join('\n')).toContain('requestedSkills contains design-system, but provider ecc disallows it via allowedSkills');
});

test('additionalAllowedSkills lets project opt into provider-blocked skills', () => {
  const eccRoot = makeTempDir('seli-ecc-');
  const projectRoot = makeTempDir('seli-additional-allowed-');
  const intakeRoot = makeTempDir('seli-additional-allowed-intake-');
  createFakeEccSource(eccRoot);

  initProject({
    projectRoot,
    providerRoots: { ecc: eccRoot }
  });

  const intakePath = writeIntakeV2(intakeRoot, {
    schemaVersion: 2,
    target: { projectPath: projectRoot, requestedOperation: 'auto' },
    providers: [
      {
        providerId: 'ecc',
        rootPath: eccRoot,
        requestedSkills: ['design-system', 'browser-qa'],
        additionalAllowedSkills: ['design-system', 'browser-qa']
      }
    ]
  });

  const result = updateProject({
    projectRoot,
    intakePath,
    scope: 'team-skills'
  });

  expect(result.plan.summary.selectionErrors).toEqual([]);
  const config = readConfig(projectRoot);
  expect(config.layers.team.providers[0]?.additionalAllowedSkills).toEqual(['design-system', 'browser-qa']);
  expect(config.layers.team.providers[0]?.skills).toEqual(['design-system', 'browser-qa']);
  expect(fs.lstatSync(path.join(projectRoot, '.agents', 'skills', 'design-system')).isSymbolicLink()).toBe(true);
  expect(fs.lstatSync(path.join(projectRoot, '.agents', 'skills', 'browser-qa')).isSymbolicLink()).toBe(true);
});

test('ecc default allowlist includes browser-qa and deployment-patterns', () => {
  const eccRoot = makeTempDir('seli-ecc-');
  const projectRoot = makeTempDir('seli-ecc-default-allowlist-');
  const intakeRoot = makeTempDir('seli-ecc-default-allowlist-intake-');
  createFakeEccSource(eccRoot);

  initProject({
    projectRoot,
    providerRoots: { ecc: eccRoot }
  });

  const intakePath = writeIntakeV2(intakeRoot, {
    schemaVersion: 2,
    target: { projectPath: projectRoot, requestedOperation: 'auto' },
    providers: [
      {
        providerId: 'ecc',
        rootPath: eccRoot,
        requestedSkills: ['browser-qa', 'deployment-patterns']
      }
    ]
  });

  const result = updateProject({
    projectRoot,
    intakePath,
    scope: 'team-skills'
  });

  expect(result.plan.summary.selectionErrors).toEqual([]);
  expect(readConfig(projectRoot).layers.team.providers[0]?.skills).toEqual(['browser-qa', 'deployment-patterns']);
  expect(fs.lstatSync(path.join(projectRoot, '.agents', 'skills', 'browser-qa')).isSymbolicLink()).toBe(true);
  expect(fs.lstatSync(path.join(projectRoot, '.agents', 'skills', 'deployment-patterns')).isSymbolicLink()).toBe(
    true
  );
});

test('missing requested skill reports missing_from_packages', () => {
  const eccRoot = makeTempDir('seli-ecc-');
  const projectRoot = makeTempDir('seli-missing-skill-');
  const intakeRoot = makeTempDir('seli-missing-skill-intake-');
  createFakeEccSource(eccRoot);

  initProject({
    projectRoot,
    providerRoots: { ecc: eccRoot }
  });

  const intakePath = writeIntakeV2(intakeRoot, {
    schemaVersion: 2,
    target: { projectPath: projectRoot, requestedOperation: 'auto' },
    providers: [
      {
        providerId: 'ecc',
        rootPath: eccRoot,
        requestedSkills: ['ghost-skill'],
        additionalAllowedSkills: ['ghost-skill']
      }
    ]
  });

  const plan = planProject({ projectRoot, intakePath });
  expect(plan.summary.selectionErrors).toEqual([
    'requestedSkills contains ghost-skill, but provider ecc could not find it in resolved packages'
  ]);
  expect(() => updateProject({ projectRoot, intakePath })).toThrow(/could not find it in resolved packages/);
});

test('full update preserves custom-block content and local-file overrides', () => {
  const eccRoot = makeTempDir('seli-ecc-');
  const projectRoot = makeTempDir('seli-customization-');
  createFakeEccSource(eccRoot);

  initProject({
    projectRoot,
    providerRoots: { ecc: eccRoot }
  });

  const config = readConfig(projectRoot);
  config.policies.managedCustomization = {
    'AGENTS.md': 'custom-block',
    '.codex/skills/change-closeout/SKILL.md': 'custom-block',
    '.codex/skills/team-skill-sync/SKILL.md': 'local-file'
  };
  writeJson(path.join(projectRoot, '.selirc'), config);

  writeText(
    path.join(projectRoot, 'AGENTS.md'),
    `${fs.readFileSync(path.join(projectRoot, 'AGENTS.md'), 'utf8')}\n\n<!-- seli:custom:start -->\nProject AGENTS note\n<!-- seli:custom:end -->\n`
  );
  writeText(
    path.join(projectRoot, '.codex', 'skills', 'change-closeout', 'SKILL.md'),
    `${fs.readFileSync(path.join(projectRoot, '.codex', 'skills', 'change-closeout', 'SKILL.md'), 'utf8')}\n\n<!-- seli:custom:start -->\nCustom closeout rule\n<!-- seli:custom:end -->\n`
  );
  writeText(
    path.join(projectRoot, '.codex', 'skills', 'team-skill-sync', 'SKILL.md'),
    '# local override\n'
  );

  const result = updateProject({
    projectRoot,
    providerRoots: { ecc: eccRoot },
    force: true
  });

  expect(result.plan.operations.some(operation => operation.path === '.codex/skills/team-skill-sync/SKILL.md')).toBe(false);
  expect(fs.readFileSync(path.join(projectRoot, 'AGENTS.md'), 'utf8')).toContain('Project AGENTS note');
  expect(fs.readFileSync(path.join(projectRoot, '.codex', 'skills', 'change-closeout', 'SKILL.md'), 'utf8')).toContain(
    'Custom closeout rule'
  );
  expect(fs.readFileSync(path.join(projectRoot, '.codex', 'skills', 'team-skill-sync', 'SKILL.md'), 'utf8')).toBe(
    '# local override\n'
  );

  const doctorResult = runDoctor({
    projectRoot,
    providerRoots: { ecc: eccRoot }
  });
  expect(doctorResult.ok).toBe(true);

  const lock = readLock(projectRoot);
  expect(lock.managed.some(entry => entry.path === '.codex/skills/team-skill-sync/SKILL.md')).toBe(false);
  expect(lock.managedSummary?.project).toContain('.codex/skills/change-closeout/SKILL.md');
  expect(lock.managedSummary?.system).toContain('AGENTS.md');
});

test('team-skills scope ignores non-team managed drift during update and doctor', () => {
  const eccRoot = makeTempDir('seli-ecc-');
  const projectRoot = makeTempDir('seli-team-drift-');
  const intakeRoot = makeTempDir('seli-team-drift-intake-');
  createFakeEccSource(eccRoot);

  const initialIntakePath = writeIntakeV2(intakeRoot, {
    schemaVersion: 2,
    target: { projectPath: projectRoot, requestedOperation: 'auto' },
    providers: [{ providerId: 'ecc', rootPath: eccRoot, requestedSkills: ['tdd-workflow'] }]
  });
  initProject({ projectRoot, intakePath: initialIntakePath });

  fs.writeFileSync(path.join(projectRoot, 'AGENTS.md'), '# drifted\n', 'utf8');
  fs.writeFileSync(path.join(projectRoot, '.claude', 'README.md'), '# drifted claude\n', 'utf8');
  fs.rmSync(path.join(projectRoot, '.claude', 'skills'));
  fs.symlinkSync('../broken-target', path.join(projectRoot, '.claude', 'skills'));

  const updatedIntakePath = writeIntakeV2(intakeRoot, {
    schemaVersion: 2,
    target: { projectPath: projectRoot, requestedOperation: 'auto' },
    providers: [{ providerId: 'ecc', rootPath: eccRoot, requestedSkills: ['tdd-workflow', 'security-review'] }]
  });

  expect(() =>
    updateProject({
      projectRoot,
      intakePath: updatedIntakePath
    })
  ).toThrow(/Managed file drift detected/);

  expect(() =>
    updateProject({
      projectRoot,
      intakePath: updatedIntakePath,
      scope: 'team-skills'
    })
  ).not.toThrow();

  const doctorResult = runDoctor({
    projectRoot,
    intakePath: updatedIntakePath,
    scope: 'team-skills'
  });
  expect(doctorResult.ok).toBe(true);

  const fullDoctor = runDoctor({
    projectRoot,
    intakePath: updatedIntakePath
  });
  expect(fullDoctor.ok).toBe(false);
  expect(fullDoctor.errors.join('\n')).toContain('Claude skill entrypoint mismatch');
});

test('team-skills scope doctor keeps team-layer checks', () => {
  const eccRoot = makeTempDir('seli-ecc-');
  const missingRoot = makeTempDir('seli-ecc-missing-');
  const projectRoot = makeTempDir('seli-team-doctor-');
  createFakeEccSource(eccRoot);

  initProject({
    projectRoot,
    providerRoots: { ecc: eccRoot }
  });

  const duplicateDir = path.join(projectRoot, '.agents', 'skills', 'repo-governance');
  fs.mkdirSync(duplicateDir, { recursive: true });
  fs.writeFileSync(path.join(duplicateDir, 'SKILL.md'), '# duplicate\n', 'utf8');

  const tddSkillLink = path.join(projectRoot, '.agents', 'skills', 'tdd-workflow');
  fs.rmSync(tddSkillLink);

  const providerRoot = path.join(missingRoot, 'deleted-root');
  const doctorResult = runDoctor({
    projectRoot,
    providerRoots: { ecc: providerRoot },
    scope: 'team-skills'
  });

  expect(doctorResult.ok).toBe(false);
  expect(doctorResult.errors.join('\n')).toContain('Managed path missing: .agents/skills/tdd-workflow');
  expect(doctorResult.errors.join('\n')).toContain('Provider source root missing for ecc');
  expect(doctorResult.errors.join('\n')).toContain('Duplicate skill IDs found in both .codex/skills and .agents/skills');
  expect(doctorResult.errors.join('\n')).not.toContain('Claude skill entrypoint mismatch');
});

test('doctor fails when managed full-scope paths are gitignored', () => {
  const eccRoot = makeTempDir('seli-ecc-');
  const projectRoot = makeTempDir('seli-doctor-gitignore-full-');
  createFakeEccSource(eccRoot);

  initProject({
    projectRoot,
    providerRoots: { ecc: eccRoot }
  });
  initGitRepo(projectRoot);
  writeText(path.join(projectRoot, '.gitignore'), 'AGENTS.md\n.codex/\n');

  const doctorResult = runDoctor({
    projectRoot,
    providerRoots: { ecc: eccRoot }
  });

  expect(doctorResult.ok).toBe(false);
  expect(doctorResult.errors.join('\n')).toContain('Managed path is ignored by Git: AGENTS.md');
  expect(doctorResult.errors.join('\n')).toContain('Managed path is ignored by Git: .codex/skills/repo-governance/SKILL.md');
});

test('doctor fails when managed team-scope paths are gitignored', () => {
  const eccRoot = makeTempDir('seli-ecc-');
  const projectRoot = makeTempDir('seli-doctor-gitignore-team-');
  createFakeEccSource(eccRoot);

  initProject({
    projectRoot,
    providerRoots: { ecc: eccRoot }
  });
  initGitRepo(projectRoot);
  writeText(path.join(projectRoot, '.gitignore'), '.agents/skills/\n');

  const doctorResult = runDoctor({
    projectRoot,
    providerRoots: { ecc: eccRoot },
    scope: 'team-skills'
  });

  expect(doctorResult.ok).toBe(false);
  expect(doctorResult.errors.join('\n')).toContain('Managed path is ignored by Git: .agents/skills/tdd-workflow');
  expect(doctorResult.errors.join('\n')).not.toContain('Managed path is ignored by Git: AGENTS.md');
});

test('doctor skips ignored-path check outside git worktrees', () => {
  const eccRoot = makeTempDir('seli-ecc-');
  const projectRoot = makeTempDir('seli-doctor-no-git-');
  createFakeEccSource(eccRoot);

  initProject({
    projectRoot,
    providerRoots: { ecc: eccRoot }
  });
  writeText(path.join(projectRoot, '.gitignore'), 'AGENTS.md\n.codex/\n');

  const doctorResult = runDoctor({
    projectRoot,
    providerRoots: { ecc: eccRoot }
  });

  expect(doctorResult.ok).toBe(true);
  expect(doctorResult.info.join('\n')).toContain('Skipped ignored-path validation because the target is not a Git worktree.');
});

test('team-skills scope requires onboarded project and cannot be used with init', () => {
  const projectRoot = makeTempDir('seli-team-scope-bootstrap-');
  const eccRoot = makeTempDir('seli-ecc-');
  createFakeEccSource(eccRoot);

  expect(() =>
    planProject({
      projectRoot,
      providerRoots: { ecc: eccRoot },
      scope: 'team-skills'
    })
  ).toThrow(/team-skills scope requires an existing seli-managed project/);

  expect(() =>
    initProject({
      projectRoot,
      providerRoots: { ecc: eccRoot },
      scope: 'team-skills'
    })
  ).toThrow(/init does not support --scope team-skills/);
});

test('CLI providers/plugins/inspect reflect active plugin set (without compat renderer)', () => {
  const repoRoot = path.join(import.meta.dir, '..');
  const cliPath = path.join(repoRoot, 'src', 'cli.ts');
  const eccRoot = makeTempDir('seli-ecc-');
  const projectRoot = makeTempDir('seli-cli-');
  createFakeEccSource(eccRoot);

  const providersJson = execFileSync(process.execPath, [cliPath, 'providers', 'list', '--json'], {
    cwd: repoRoot,
    encoding: 'utf8'
  });
  const providers = JSON.parse(providersJson) as { providers: string[] };
  expect(providers.providers).toContain('ecc');

  const pluginsJson = execFileSync(process.execPath, [cliPath, 'plugins', 'list', '--json'], {
    cwd: repoRoot,
    encoding: 'utf8'
  });
  const plugins = JSON.parse(pluginsJson) as { renderers: string[]; doctorChecks: string[] };
  expect(plugins.renderers).toEqual(expect.arrayContaining(['base', 'codex', 'claude']));
  expect(plugins.renderers).not.toContain('compat');
  expect(plugins.doctorChecks).toContain('duplicate-skills');

  const inspectJson = execFileSync(
    process.execPath,
    [cliPath, 'inspect', 'plan', '--project', projectRoot, '--provider-root', `ecc=${eccRoot}`, '--json'],
    {
      cwd: repoRoot,
      encoding: 'utf8'
    }
  );
  const inspect = JSON.parse(inspectJson) as {
    pluginResolutions: { providers: string[] };
    pipelineFingerprint: string;
  };
  expect(inspect.pluginResolutions.providers).toContain('ecc');
  expect(inspect.pipelineFingerprint.length).toBeGreaterThan(10);
});

test('CLI inspect plan supports --scope team-skills', () => {
  const repoRoot = path.join(import.meta.dir, '..');
  const cliPath = path.join(repoRoot, 'src', 'cli.ts');
  const eccRoot = makeTempDir('seli-ecc-');
  const projectRoot = makeTempDir('seli-cli-team-scope-');
  const intakeRoot = makeTempDir('seli-cli-team-scope-intake-');
  createFakeEccSource(eccRoot);

  const initialIntakePath = writeIntakeV2(intakeRoot, {
    schemaVersion: 2,
    target: { projectPath: projectRoot, requestedOperation: 'auto' },
    providers: [{ providerId: 'ecc', rootPath: eccRoot, requestedSkills: ['tdd-workflow'] }]
  });
  initProject({ projectRoot, intakePath: initialIntakePath });

  const updatedIntakePath = writeIntakeV2(intakeRoot, {
    schemaVersion: 2,
    target: { projectPath: projectRoot, requestedOperation: 'auto' },
    providers: [{ providerId: 'ecc', rootPath: eccRoot, requestedSkills: ['tdd-workflow', 'security-review'] }]
  });

  const inspectJson = execFileSync(
    process.execPath,
    [cliPath, 'inspect', 'plan', '--project', projectRoot, '--intake', updatedIntakePath, '--scope', 'team-skills', '--json'],
    {
      cwd: repoRoot,
      encoding: 'utf8'
    }
  );

  const inspect = JSON.parse(inspectJson) as {
    scope: string;
    operationPreview: Array<{ action: string; path: string }>;
  };
  expect(inspect.scope).toBe('team-skills');
  expect(inspect.operationPreview).toEqual([
    { action: 'write-file', path: '.selirc' },
    { action: 'write-symlink', path: '.agents/skills/security-review' },
    { action: 'write-file', path: '.seli.lock' }
  ]);
});

test('CLI explain mode prints Seli banner and init status lines', () => {
  const repoRoot = path.join(import.meta.dir, '..');
  const cliPath = path.join(repoRoot, 'src', 'cli.ts');
  const helpOut = execFileSync(process.execPath, [cliPath], {
    cwd: repoRoot,
    encoding: 'utf8'
  });
  expect(helpOut).toContain('Seli v1.0.0');
  expect(helpOut).toContain('seli init --project');

  const eccRoot = makeTempDir('seli-ecc-');
  const projectRoot = makeTempDir('seli-cli-init-');
  createFakeEccSource(eccRoot);
  const initOut = execFileSync(
    process.execPath,
    [cliPath, 'init', '--project', projectRoot, '--provider-root', `ecc=${eccRoot}`],
    {
      cwd: repoRoot,
      encoding: 'utf8'
    }
  );

  expect(initOut).toContain('[Seli] 🦭 Searching for local skills (Flink, Spark, StarRocks...)...');
  expect(initOut).toContain('[Seli] ✨ Sealing the configuration for your agent...');
  expect(initOut).toContain(
    '[Seli] ✅ Project initialized. Ask Claude or Codex: "这是什么项目？我需要提供什么才能帮我配置开发环境？"'
  );
});

test('CLI json mode remains pure json without banner or status lines', () => {
  const repoRoot = path.join(import.meta.dir, '..');
  const cliPath = path.join(repoRoot, 'src', 'cli.ts');
  const eccRoot = makeTempDir('seli-ecc-');
  const projectRoot = makeTempDir('seli-cli-json-');
  createFakeEccSource(eccRoot);

  const jsonOut = execFileSync(
    process.execPath,
    [cliPath, 'init', '--project', projectRoot, '--provider-root', `ecc=${eccRoot}`, '--json'],
    {
      cwd: repoRoot,
      encoding: 'utf8'
    }
  );
  expect(jsonOut.includes('Seli v')).toBe(false);
  expect(jsonOut.includes('[Seli]')).toBe(false);
  const parsed = JSON.parse(jsonOut) as { plan: { command: string } };
  expect(parsed.plan.command).toBe('init');
});
