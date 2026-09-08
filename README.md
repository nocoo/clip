<p align="center">
  <img src="logo.png" width="128" height="128" alt="clip logo" />
</p>
<h1 align="center">clip</h1>
<p align="center">用 clip.yaml 生成可编辑的 TypeScript CLI，并按工具名称管理 API 凭据。</p>
<p align="center"><a href="docs/README.en.md">English</a></p>

## 这是什么

clip 面向需要给 HTTP API 配套命令行客户端的开发者。它读取 `clip.yaml` 中的接口和鉴权配置，生成基于 commander 的 Bun CLI：每个接口对应一条命令和一个可独立修改的 TypeScript 文件。

凭据由 `clip auth` 单独管理，生成的命令运行时读取凭据并添加请求头，换 key 不必重新生成代码。生成器面向返回 JSON 的 API，输入格式是项目自己的 `clip.yaml`。

## 功能

- 校验 schema 的字段、命令名称、路径参数以及重复接口定义。
- 将路径参数变成位置参数，将 query 和 JSON body 字段变成命令行选项，处理必填项和基础数字、布尔值转换。
- 生成 CLI 入口、HTTP client、凭据读取器、独立命令文件及项目配置。
- 支持单请求头 API key、浏览器登录 token、Cloudflare Access 双请求头服务令牌。
- 通过 `CLIP_BASE_URL` 切换目标服务，通过 `CLIP_HOME` 指定凭据目录。
- 为 header 和 browser-login 配置生成 API 测试；`cf-access` 目前只生成 CLI，不生成这组测试。

生成的代码可以手动调整。再次生成会覆盖同名文件，修改后应先保存自己的版本。数组参数、非 JSON 响应等处理需要按具体 API 调整生成代码。

## 使用

### 从源码安装

需要 Bun。CLI 包在仓库中标记为 private，使用源码安装：

```bash
git clone https://github.com/nocoo/clip.git
cd clip
bun install --frozen-lockfile
cd packages/cli
bun link
cd ../..
clip --help
```

确保 Bun 的可执行文件目录位于 `PATH` 中。也可以在仓库根目录用 `bun packages/cli/src/index.ts` 代替 `clip`，不注册全局命令。

### 跑通本地示例

在仓库根目录的一个终端启动内存中的 Todo API：

```bash
bun packages/example-api/src/index.ts
```

它默认使用 `http://localhost:3456`。在另一个终端回到仓库根目录：

```bash
clip auth set todo --header X-API-Key
clip install packages/example-api/clip.yaml
todo list
todo create --title 'Try clip'
todo list
```

第一个命令会提示输入 key。本地示例的默认值为 `test-api-key`；如果启动服务时设置了 `API_KEY`，输入对应值。`clip install` 会生成项目、安装生成项目的依赖，再通过 `bun link` 注册 `todo` 命令。

接入自己的 API 时，从 [示例 schema](packages/example-api/clip.yaml) 复制并修改 `name`、`alias`、`baseUrl`、`auth` 和 `endpoints`。只生成文件可用 `clip generate path/to/clip.yaml`；默认输出到 `.clip-output/<alias>/`，用 `--output` 指定其他目录。

### 鉴权和凭据

| 鉴权类型 | 使用方式 |
| --- | --- |
| `header` | `clip auth set <alias>`；在含 `clip.yaml` 的目录读取 header 名称，也可传 `--header` |
| `browser-login` | 在含对应 `clip.yaml` 的目录运行 `clip auth login <alias>`；生成的 CLI 也有 `login` 命令 |
| `cf-access` | 在含对应 `clip.yaml` 的目录运行 `clip auth set <alias>`，按提示输入 Client ID 和 Client Secret |

浏览器登录需要服务端实现 `@nocoo/base-cli` 对应的登录和本机回调协议，默认入口为 `/api/auth/cli`。它不能自动适配任意网站的登录页。

凭据默认保存在 `~/.clip/<alias>/credentials.json`。目录权限为 `0700`，文件为 `0600`；内容是明文 JSON。建议用交互输入保存真实凭据，避免将值写入 shell history。`clip auth show <alias>` 显示遮罩值，`clip auth remove <alias>` 删除凭据。

`clip test <alias>` 会对配置的 API 执行生成测试，可能调用创建、更新或删除接口，应使用专门的测试服务和数据。

## 开发

在仓库根目录执行：

```bash
bun install --frozen-lockfile
bun run typecheck
bun run lint
```

文档站位于 `packages/web/`，开发命令如下；Astro 工具链需要受支持的 Node.js，建议使用 Node.js 24 或更新版本。

```bash
bun run --cwd packages/web dev
bun run --cwd packages/web build
```

| 路径 | 内容 |
| --- | --- |
| `packages/cli/` | Schema、代码生成、凭据管理 |
| `packages/example-api/` | Todo API 和示例 schema |
| `packages/demo-app/` | Bookmarks API、登录流程测试服务 |
| `packages/web/` | Astro 静态文档站 |
| `tests/e2e/` | 实际 CLI 进程与 HTTP 集成测试 |

## 测试

```bash
bun run test:unit
bun run test:e2e
```

第一条运行 Vitest 单元测试并生成覆盖率报告。第二条启动临时 API 服务，运行实际生成的 CLI，验证请求、浏览器登录回调和安装流程；测试使用临时凭据目录、独立端口和隔离的 Bun 安装目录，不需要生产凭据。

## 技术栈

| 技术 | 用途 |
| --- | --- |
| Bun、TypeScript | CLI 运行环境和工作区 |
| commander | 生成的命令行路由和参数解析 |
| Zod、yaml | Schema 解析与校验 |
| `@nocoo/base-cli` | 浏览器登录和本机回调 |
| Hono | 本地示例和测试 API |
| Astro | 静态文档站 |
| Vitest、Bun test | 单元与进程 / HTTP 集成测试 |

## 文档

- [文档索引与设计背景](docs/README.md)
- [当前 schema 定义](packages/cli/src/schema/validator.ts)
- [Todo API 示例](packages/example-api/clip.yaml)
- [代码生成模板](packages/cli/src/codegen/templates.ts)

## 许可证

[MIT](LICENSE)
