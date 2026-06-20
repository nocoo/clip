# CLAUDE.md — clip

Project-specific instructions for AI agents working in this repo. These
override defaults and **must be followed**.

---

## 项目定位(不可漂移)

clip 只解决两个问题:

1. **认证** — 在 `~/.clip/<alias>/credentials.json`(0600 权限)管理 API 凭据,
   支持 `header` / `browser-login` / `cf-access` 三种形态。
2. **API → CLI 生成** — 读 `clip.yaml`,产出一个 commander 驱动的、可读可改的
   TypeScript CLI 项目。

任何不属于这两件事的"新功能"——OpenAPI 输入、`--output json|table`、jq filter、
分页 framework、营销 web 站点深度功能——**默认拒绝**。如果用户明确要求,先在
对话里指出这会扩张项目范围、需要权衡再做。**生成的代码必须保持人类可读、可手改**,
任何使 `templates.ts` 输出变魔法化的 PR 直接拒。

## 6DQ Tier S 状态(必须维持)

本仓库按个人项目**六维质量体系**评估为 **Tier S**:

| 维度 | 工具 / 验证方式 | 触发 |
|------|---------------|------|
| L1 Unit | vitest + v8 coverage ≥95%(stmt/branch/func/line) | pre-commit |
| L2 API E2E | `bun test tests/e2e/` — 真 spawn demo-app + 真 spawn 生成的 CLI + 真 HTTP | pre-push, CI |
| L3 Browser/GUI | N/A(无 web UI 测试需求) | — |
| G1 Typecheck + Lint | `tsc --noEmit` strict + Biome strict `--error-on-warnings` | pre-commit |
| G2 Security | gitleaks + osv-scanner,**硬失败**(no \|\| true) | pre-push, CI |
| D1 测试资源隔离 | N/A(无远程存储);e2e 用临时 `CLIP_HOME` 和随机端口 demo-app,绝不触碰 `~/.clip` | 内嵌于 L2 |

**任何 PR 必须先过 `bun run quality:full`** —— 这一条命令跑完整六维。

## Harness 自动化规则(AI 代理必须遵守)

### 改动前

- **新功能/重构**: 先用 `EnterPlanMode` 或 `AskUserQuestion` 对齐方向,再动代码。
  绝不擅自扩张项目范围(见"项目定位")。
- **触碰 schema 字段(`packages/cli/src/schema/validator.ts`)前**, 必须先 grep
  bogo 等真实用户的 `clip.yaml` 是否用到该字段;有用户在用的字段不要悄悄删。

### 改动中

- 每完成**一个逻辑独立的变更**(一个 feature step / 一个 doc / 一个 bugfix),
  立刻 atomic commit。不要把多个无关变更攒在一起。这是用户的明确偏好。
- 改完代码立即跑 `bun run typecheck && bun run lint && bun run test:unit`。
  pre-commit 会兜底但**不要让它兜底**——本地先过完再 commit。
- 改动涉及生成的 CLI 行为(`packages/cli/src/codegen/`)时,必须同时跑 e2e:
  `bun run test:e2e`。否则证明不了生成的代码还能用。

### 改动后

- commit message 用 conventional commits 风格(`feat(scope):` / `fix(scope):` /
  `chore(scope):` / `docs(scope):` / `refactor(scope):` / `test(scope):`)。
- push 前会自动跑 pre-push(L2 + G2 硬失败)。不要 `--no-verify` 绕过。
- 任何 release 操作必须按 nmem 中"开发规范:版本号的维护"执行(查询
  `search-memory` 取最新版本)。

## 6DQ 维度对应的命令矩阵

| 想做的事 | 命令 | 期望 |
|---------|------|------|
| 跑 L1 单元测试 + 覆盖率 | `bun run test:unit` | 213+ tests, ≥95% 全维度 |
| 跑 L2 端到端证明 | `bun run test:e2e` | 15+ tests, 真 HTTP, 1-3 秒 |
| 跑 G1 静态分析 | `bun run lint && bun run typecheck` | 0 errors |
| 跑 G2 安全扫描 | `bun run lint:secrets && bun run lint:deps` | 0 leaks, 0 vulns |
| 跑全部六维 | `bun run quality:full` | 全过才可 PR |
| 启 demo-app 本地调试 | `cd packages/demo-app && bun run dev` | listening on :3100 |

## E2E 测试约定(L2)

`tests/e2e/` 下的测试用 `bun test`(原生 Bun runner)而非 vitest——
Bun runner 才能 `import { spawn } from "bun"`。

每个 e2e 测试文件:

1. `beforeAll` 起 demo-app on a 随机端口(`startDemoApp()`)
2. 写一份指向该 demo-app 的 `clip.yaml` 到 temp dir
3. `runGenerate()` 把 CLI 生成到 temp dir
4. `runGenerated()` 真 spawn 生成的 CLI,断言 stdout/stderr/exit code
5. `afterAll` 必须 `demo.stop()`(SIGKILL,避免泄漏)+ 清理 temp dir

不要 mock fetch、不要 stub child_process。这是"通过证明"原则——
我们就是要证明 `clip generate` 出来的代码真的能跑、真的 HTTP 通信正确。

## 不要做的事

- ❌ 不要重新引入 OpenAPI input adapter(`docs/features/07-openapi-input.md` 已被 `812ec38` 砍掉,见 commit message)
- ❌ 不要把 `oauth` 这个名字加回来(已重命名为 `browser-login`,因为它不是 RFC 6749)
- ❌ 不要给 `templates.ts` 输出的代码加抽象/魔法,保持人类可读
- ❌ 不要在 codegen 里读 `ParamDef.nullable` / `enum` / `array.items` 之外的字段(它们是元注释,bogo 在用作文档)
- ❌ 不要 `git commit --no-verify` 或 `git push --no-verify`
- ❌ 不要把 production credentials 写进 `~/.clip` 测试目录(e2e 全部用 `CLIP_HOME=<tmpdir>`)

## 项目结构速查

```
clip/
├── packages/
│   ├── cli/          # 核心:schema/codegen/auth/commands
│   ├── example-api/  # 原始 Hono Todo(integration 测试 fixture)
│   ├── demo-app/     # 复杂 Bookmarks API(L2 e2e fixture,browser-login + 9 endpoints)
│   └── web/          # Astro 文档站
├── tests/e2e/        # L2 真 spawn 进程证明测试(bun test runner)
├── scripts/
│   ├── hooks/        # pre-commit (L1+G1)、pre-push (L2+G2 硬失败)
│   └── run-e2e.ts    # L2 入口,被 pre-push 和 CI 调用
├── docs/             # 设计文档(architecture + features)
├── CHANGELOG.md
├── LICENSE           # MIT
└── README.md
```

## 与全局规则的关系

本文件覆盖项目专属规则。**全局规则**(`~/.claude/CLAUDE.md`)仍然适用:
- 称呼用户"哥",中文沟通、英文代码
- 动手前声明关键假设
- 多解读时列出选项,不默默选定
- 改完即 atomic commit
- 删除范围内确认无引用的死代码

冲突时本文件优先。
