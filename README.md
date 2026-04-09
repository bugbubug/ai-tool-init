# Seli

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
![Bun](https://img.shields.io/badge/Bun-%3E%3D1.3.11-black?logo=bun)
![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?logo=typescript&logoColor=white)
![Tests](https://img.shields.io/badge/tests-bun%20test-brightgreen)

Seli 是一个 Bun + TypeScript 的 AI 协作仓库初始化与治理 CLI，用于生成可维护的 Codex/Claude 项目协作基线。

---

## 项目简介 / Overview

Seli 面向“已有仓库或新仓库的 AI 协作治理”场景，提供 `plan/init/update/doctor/inspect` 等命令，围绕 `.selirc`（可编辑配置）和 `.seli.lock`（生成锁文件）建立可追踪、可重复的项目协作状态。

它不负责业务功能开发，而是负责把仓库整理成可被 AI 工具稳定消费的结构化协作环境。

## 核心特性 / Features

- 插件化架构：Provider / Renderer / Policy / Doctor 四类插件注册机制。
- 可预览再执行：`plan` 先生成操作计划，`init/update` 再落地。
- 状态确定性：通过 `.seli.lock` 记录 pipeline 指纹、provider 包快照与 managed 条目。
- 漂移检测：默认在执行前校验 managed 文件/软链接漂移，降低误覆盖风险。
- 双平台基线：可生成 Codex 与 Claude 的仓库内协作入口与技能映射。
- 兼容本地团队技能包：支持 `--provider-root <provider>=<abs-path>` 覆盖来源（当前内置 provider 为 `ecc`，环境变量为 `SELI_ECC_ROOT`）。

## 适用场景 / Use Cases

- 需要为团队统一 AI 协作仓库基线的工程项目。
- 希望将外部技能包挂载进仓库并保持可追踪更新。
- 需要在公开仓库中保持明确、可审计的协作配置。

## 技术栈 / Tech Stack

- Runtime: Bun (>= 1.3.11)
- Language: TypeScript (strict)
- Test: Bun test
- Packaging: npm CLI package (`seli`)

## 项目结构 / Project Structure

```text
.
├── src/                      # CLI 与核心实现
│   ├── application/          # 命令执行、计划、流水线
│   ├── domain/               # 合同类型、默认值、合并逻辑
│   ├── plugins/              # provider/renderer/policy/doctor 插件
│   ├── registry/             # 插件注册表
│   └── entrypoints/          # CLI 参数与入口
├── catalog/                  # profile/provider/policy 元数据
├── templates/                # 生成文件模板
├── intake/                   # intake 模板与文档目录
├── docs/                     # 发布与维护文档
└── tests/                    # 端到端风格 CLI/API 测试
```

## 快速开始 / Quick Start

1. 全局安装 CLI

```bash
npm install -g seli
```

2. 初始化目标项目（推荐显式传入 provider root）

```bash
seli init \
  --project /absolute/path/to/your-project \
  --provider-root <provider>=<abs-path>
```

示例（当前内置 provider `ecc`）：

```bash
seli init \
  --project /absolute/path/to/your-project \
  --provider-root ecc=/absolute/path/to/everything-claude-code
```

3. 先预览变更，再执行更新

```bash
seli plan --project /absolute/path/to/your-project
seli update --project /absolute/path/to/your-project
```

仅同步 team skills 时使用受限范围：

```bash
seli plan --project /absolute/path/to/your-project --scope team-skills
seli update --project /absolute/path/to/your-project --scope team-skills
seli doctor --project /absolute/path/to/your-project --scope team-skills
```

## 安装与运行 / Installation and Run

### 作为使用者

```bash
npm install -g seli
seli help
```

### 作为贡献者（本仓库）

```bash
bun install
bun run typecheck
bun test
bun run src/cli.ts help
```

## 配置说明 / Configuration

Seli 的状态合同：

- `.selirc`：人类可编辑配置
- `.seli.lock`：生成状态锁（指纹、已解析 provider 包、managed 条目）

provider root 解析优先级（高到低）：

1. `--provider-root <provider>=<abs-path>`（例如 `--provider-root ecc=/abs/path`）
2. intake `providers[].rootPath` / `providers[].teamPackages[]`
3. 已持久化 `.selirc`
4. provider 对应环境变量（例如 `ecc` 对应 `SELI_ECC_ROOT`）
5. catalog 默认候选路径

scope 说明：

- `full`：默认完整治理，会刷新全部托管基线文件与 team skill 挂载。
- `team-skills`：仅刷新 `.agents/skills/<skillId>` 软链接，以及 `.selirc` / `.seli.lock`。
- `team-skills` 只适用于已接入过 seli 且同时存在 `.selirc` 和 `.seli.lock` 的仓库。

intake 仅支持 v2（示例见 `intake/manifest.template.json`）：

```json
{
  "schemaVersion": 2,
  "target": {
    "projectPath": "/absolute/path/to/target-project",
    "requestedOperation": "auto",
    "profile": "default"
  }
}
```

intake 路径解析规则：

- `providers[].rootPath` / `providers[].teamPackages[].rootPath` 继续相对 intake 文件目录解析。
- `documents[].path`、`decisions[].sourcePaths`、`project.projectSkillBlueprints[].sourcePaths` 在存在 `target.projectPath` 时默认相对项目根目录解析。
- 如果 `target.projectPath` 缺失，上述项目内路径会回退为相对 intake 文件目录解析。
- 如需强制相对 intake 文件目录解析，可在对应条目上设置 `"pathBase": "manifest"`。

`project.summary` 会进入生成的 `AGENTS.md` 的 `Project Context`，适合写简短项目背景；不要把操作步骤写进这里。

## 开发说明 / Development

常用命令：

```bash
bun run typecheck
bun test
bun run src/cli.ts help
```

建议在提交前至少执行：

```bash
bun run typecheck && bun test
```

## 部署说明 / Deployment

本项目定位为 CLI 工具，部署语义主要指“发布与分发”：

- npm 包发布：`npm publish --access public`
- GitHub Release：基于 tag 发布版本说明

完整清单见 [`docs/github-publish.md`](docs/github-publish.md)。

## 常见问题 / FAQ

### 为什么 intake 的 `version: 1` 不可用？

当前实现仅支持 `schemaVersion: 2`。如果使用 v1，命令会直接报错并提示迁移。

### `init` 和 `update` 的区别？

- `init`：面向首次接入或引导初始化。
- `update`：面向已有状态的增量刷新。

两者都会先经由计划阶段计算操作，再落地文件变更。

### 如何只新增或同步 team skills，而不改 AGENTS/Claude 基线？

使用 `team-skills` scope：

```bash
seli update --project /abs/path --scope team-skills
```

如需校验同一范围：

```bash
seli doctor --project /abs/path --scope team-skills
```

### 如何指定 ECC 技能包路径？

优先使用命令行：

```bash
seli init --project /abs/path --provider-root ecc=/abs/path/to/ecc
```

或通过环境变量：

```bash
export SELI_ECC_ROOT=/abs/path/to/everything-claude-code
```

## Roadmap

- 增加更多 provider 适配器与策略能力
- 增强配置与运行可观察性文档
- 持续完善公开仓库协作与发布流程

## Contributing

欢迎通过 Issue / PR 参与贡献。请先阅读 [`CONTRIBUTING.md`](CONTRIBUTING.md)。

## License

本项目基于 [Apache License 2.0](LICENSE) 发布，允许商业使用。

---

## English

### Overview

Seli is a Bun + TypeScript CLI that bootstraps and governs AI-collaboration repository baselines for Codex and Claude.

It focuses on repository collaboration state management, not business feature implementation. The core contract is `.selirc` (human-editable) + `.seli.lock` (generated lock state).

### Features

- Plugin-based runtime: Provider, Renderer, Policy, and Doctor registries
- Plan-first workflow: preview with `plan`, then apply via `init`/`update`
- Deterministic state with pipeline fingerprint and managed-entry snapshots
- Managed drift checks before apply (unless forced)
- Repository-local Codex/Claude collaboration entrypoints
- Local team package integration via `--provider-root <provider>=<abs-path>` (for built-in `ecc`, env var is `SELI_ECC_ROOT`)

### Use Cases

- Standardizing AI-collaboration baseline across repositories
- Mounting and maintaining local team skill packages in a traceable way
- Keeping open-source collaboration contracts auditable and explicit

### Tech Stack

- Bun (>= 1.3.11)
- TypeScript strict mode
- Bun test
- npm-distributed CLI package (`seli`)

### Project Structure

See the structure section above (`项目结构 / Project Structure`).

### Quick Start

```bash
npm install -g seli
seli init --project /absolute/path/to/your-project --provider-root <provider>=<abs-path>
```

Example with the current built-in provider:

```bash
seli init --project /absolute/path/to/your-project --provider-root ecc=/absolute/path/to/everything-claude-code
```

### Installation and Run

```bash
bun install
bun run typecheck
bun test
bun run src/cli.ts help
```

### Configuration

- State files: `.selirc`, `.seli.lock`
- Intake schema: `schemaVersion: 2` only
- Provider root precedence: CLI override (`--provider-root <provider>=<abs-path>`) > intake > persisted config > provider env var (for `ecc`: `SELI_ECC_ROOT`) > catalog candidates

### Development

```bash
bun run typecheck && bun test
```

### Deployment

For this project, deployment means release/distribution:

- Publish to npm
- Create GitHub Release from tag

Reference: [`docs/github-publish.md`](docs/github-publish.md).

### FAQ

- v1 intake manifests are unsupported; use v2 schema.
- `init` is for onboarding; `update` is for ongoing refresh.
- Prefer explicit provider root override for reproducible runs.

### Roadmap

- Additional provider adapters
- Better operational/configuration documentation
- Ongoing release-process hardening

### Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

### License

Licensed under the [Apache License 2.0](LICENSE). Commercial use is allowed.
