<p align="center"><img src="logo.png" width="128" height="128" alt="clip" /></p>

<h1 align="center">clip</h1>

<p align="center"><strong>把 API schema 变成可用的 CLI 工具</strong><br>读取 clip.yaml · 生成 commander CLI · 统一管理 API 凭据</p>

<p align="center">
  <img src="https://img.shields.io/badge/runtime-Bun-000000" alt="Bun" />
  <img src="https://img.shields.io/badge/language-TypeScript%205-3178c6" alt="TypeScript" />
  <img src="https://img.shields.io/badge/tests-184%20passing-2ea44f" alt="tests" />
  <img src="https://img.shields.io/badge/coverage-99%25-2ea44f" alt="coverage" />
</p>

---

## 这是什么

clip 解决两个具体问题:

1. **认证** — 在 `~/.clip/<alias>/credentials.json`(0600 权限)安全存储 API 凭据,支持 `header` API key、`browser-login` 浏览器登录、`cf-access` 服务令牌三种鉴权形式
2. **API → CLI** — 读取 `clip.yaml`,生成一个 commander 驱动的 TypeScript CLI 项目,每个 endpoint 是一个可独立编辑的命令文件

定义一次 schema,得到一个会自动注入鉴权头的命令行客户端;凭据存储与生成的 CLI 解耦,凭据轮换不需要重生成代码。

```
clip.yaml ──► clip generate ──► .clip-output/<alias>/
                                  └─ commander CLI (TypeScript)
                                       │
                                       └─► reads ~/.clip/<alias>/credentials.json
                                            (managed by `clip auth …`)
```

## 功能

### CLI 命令

- **`clip generate [path]`** — 读取 `clip.yaml`(或指定路径),生成 CLI 项目到 `.clip-output/<alias>/`
- **`clip install [path]`** — 生成后通过 `bun link` 把 CLI 全局可用
- **`clip auth set <alias>`** — 保存 header 或 cf-access 凭据,带交互式遮罩输入
- **`clip auth login <alias>`** — 走浏览器登录流程拿 token,适用于 `browser-login` 类型 schema
- **`clip auth show <alias>`** — 显示遮罩后的凭据
- **`clip auth remove <alias>`** — 删除凭据
- **`clip test <alias>`** — 对生成的 CLI 跑实时 API 测试

### 三种鉴权形态

| 类型 | 用途 | 凭据来源 |
|------|------|---------|
| `header` | 单 header API key(如 `X-API-Key`) | `clip auth set` 交互输入 |
| `browser-login` | 用户在浏览器登录后回调 loopback 拿 token | `clip auth login` 自动打开浏览器 |
| `cf-access` | Cloudflare Access service token,双 header | `clip auth set --client-id ... --client-secret ...` |

### Schema 驱动的代码生成

`clip.yaml` 声明 endpoint 后,生成的代码包括:

- `src/index.ts` — commander 入口,每个 endpoint 一个 sub-command
- `src/commands/<name>.ts` — 单个 endpoint 的实现(可读、可手改)
- `src/client.ts` — 注入鉴权头的 fetch 封装
- `src/config.ts` — 从 `~/.clip/<alias>/credentials.json` 解析鉴权
- `package.json` + `tsconfig.json` — 完整可独立运行的 bun 项目

## 安装

```bash
# 当前只支持源码安装(尚未发布到 npm)
git clone https://github.com/nocoo/clip.git
cd clip
bun install
bun link packages/cli
```

## 快速开始

```bash
# 1. 在项目根目录写一份 clip.yaml(见 docs/features/01-schema-definition.md)
cat > clip.yaml <<'EOF'
name: "Todo API"
alias: todo
version: "1.0.0"
baseUrl: "http://localhost:3000"
auth:
  type: header
  headerName: "X-API-Key"
endpoints:
  - name: list
    method: GET
    path: /todos
    description: "List all todos"
EOF

# 2. 生成 CLI
clip generate

# 3. 保存凭据
clip auth set todo

# 4. 全局安装生成的 CLI
clip install

# 5. 使用
todo list
```

## 项目结构

```
clip/
├── packages/
│   ├── cli/           # 核心:schema 解析、codegen、auth 存储、test 生成
│   ├── example-api/   # Hono Todo API,用于 dogfooding 和集成测试
│   └── web/           # Astro 文档站
├── docs/
│   ├── architecture/  # 架构设计
│   └── features/      # 各模块详细设计
├── scripts/hooks/     # Git pre-commit / pre-push 钩子
└── logo.png
```

## 技术栈

| 层 | 技术 |
|----|------|
| Runtime | [Bun](https://bun.sh) |
| Language | [TypeScript 5](https://www.typescriptlang.org) strict mode |
| Schema | [Zod](https://zod.dev) + [yaml](https://eemeli.org/yaml/) |
| Generated CLI | [commander](https://github.com/tj/commander.js) |
| Browser-login flow | [@nocoo/cli-base](https://github.com/nocoo/cli-base) |
| Example API | [Hono](https://hono.dev) |
| Docs Site | [Astro](https://astro.build) |
| Lint / Format | [Biome](https://biomejs.dev) |
| Testing | [Vitest](https://vitest.dev) + Bun test |

## 开发

```bash
bun install          # 安装依赖
bun run lint         # Biome 静态检查
bun run typecheck    # tsc --noEmit
bun run test:unit    # Vitest 单元测试 + 覆盖率
bun run lint:secrets # gitleaks 扫描
bun run lint:deps    # osv-scanner 依赖漏洞扫描
```

| 命令 | 说明 |
|------|------|
| `bun run lint` | Biome 检查 + 格式化校验 |
| `bun run typecheck` | TypeScript 全项目类型检查 |
| `bun run test:unit` | Vitest 跑所有单元测试,生成 v8 覆盖率 |

## 测试

| 层 | 内容 | 触发时机 |
|----|------|---------|
| Unit | `packages/cli/tests/unit/` — schema / codegen / auth / commands | `bun run test:unit` |
| Pre-commit hook | `lint` + `typecheck` + `test:unit` | 每次 `git commit` |
| Pre-push hook | `gitleaks` + `osv-scanner` | 每次 `git push` |

## 安全

- 凭据目录 `~/.clip/<alias>/` 创建时强制 `0700`,credentials.json `0600`
- 通过 `CLIP_HOME` 环境变量可重定向凭据存储位置
- `clip auth set --key <value>` 会留在 shell history,推荐省略 `--key` 使用交互式遮罩输入
- pre-push 跑 gitleaks 防止凭据泄漏入仓
- pre-push 跑 osv-scanner 扫描 bun.lock 依赖漏洞

## 文档

| 文档 | 说明 |
|------|------|
| [docs/architecture/](./docs/architecture/README.md) | 系统总览与数据流 |
| [docs/features/01-schema-definition.md](./docs/features/01-schema-definition.md) | `clip.yaml` 字段规范与 Zod schema |
| [docs/features/02-cli-codegen.md](./docs/features/02-cli-codegen.md) | 代码生成管线 |
| [docs/features/03-auth-storage.md](./docs/features/03-auth-storage.md) | 凭据存储与 `clip auth` 命令族 |
| [docs/features/04-test-generation.md](./docs/features/04-test-generation.md) | 测试套件自动生成 |
| [docs/features/05-example-api.md](./docs/features/05-example-api.md) | Hono Todo 集成测试 fixture |
| [docs/features/06-marketing-website.md](./docs/features/06-marketing-website.md) | Astro 文档站 |

## License

[MIT](LICENSE) © 2026 Zheng Li
