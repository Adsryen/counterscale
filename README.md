# Counterscale

![](/packages/server/public/counterscale-logo-300x300.webp)

![ci status](https://github.com/benvinegar/counterscale/actions/workflows/ci.yaml/badge.svg)
[![License](https://img.shields.io/github/license/benvinegar/counterscale)](https://github.com/benvinegar/counterscale/blob/master/LICENSE)
[![codecov](https://codecov.io/gh/benvinegar/counterscale/graph/badge.svg?token=NUHURNB682)](https://codecov.io/gh/benvinegar/counterscale)

#已迁移至：https://github.com/Adsryen/qingstat


Counterscale 是一款可自托管在 [Cloudflare](https://cloudflare.com) 上的简易网站分析（Web Analytics）追踪器与仪表盘。

它的目标是部署简单、维护成本低，即便流量较大，运营费用也接近为零——Cloudflare [Workers 免费额度](https://developers.cloudflare.com/workers/platform/pricing/#workers) 理论上可支撑约每天 10 万次访问。

## 致谢与二次开发说明

本仓库基于 [benvinegar/counterscale](https://github.com/benvinegar/counterscale) 进行二次开发。

感谢原作者 [Ben Vinegar](https://github.com/benvinegar) 及所有贡献者开源并持续维护 Counterscale。本项目站在原项目之上扩展与修改；核心设计与大量实现均来自上游。

- 上游仓库：[https://github.com/benvinegar/counterscale](https://github.com/benvinegar/counterscale)
- 上游文档与发布说明：[Releases](https://github.com/benvinegar/counterscale/releases)
- 原项目赞助方：[Modem](https://modem.dev)（开发团队的自动分诊 PM）

若你需要官方/上游版本，请直接使用原仓库。本 fork 的改动以本仓库为准；与上游行为不一致处，以本仓库说明为准。

### 本 fork 已上线能力（相对上游）

- **`/install`**：登录后按 `siteId` 生成可复制的 HTML / npm 埋点代码
- **`/admin`**：基于 Cloudflare **D1** 的站点元数据管理（名称、siteId、启用状态）；访问量仍写入 Analytics Engine
- 导航 **Admin** 已收敛为后台 **`/console`**（概览 / 站点 / 设置；日夜主题）
- 旧路径 `/dashboard`、`/install`、`/admin` 会重定向到 `/console` 对应页

### 本 fork 线上实例（ops）

| 项 | 值 |
|----|-----|
| Worker | `counterscale` |
| URL | https://pv.we-together.club（备用 workers.dev 仍可用） |
| AE dataset | `metricsDataset`（binding `WEB_COUNTER_AE`） |
| D1 | `counterscale`（binding `DB`） |
| R2 | `counterscale-daily-rollups` |

#### Windows 重新部署注意

上游脚本偏 macOS/Linux。在 **PowerShell** 下建议：

```powershell
# 1) tracker 产物拷贝（package.json 的 copytracker 使用 Unix cp，Windows 会失败）
Copy-Item packages/tracker/dist/loader/tracker.js packages/server/public/tracker.js -Force

# 2) 构建并部署
pnpm --filter @counterscale/server build
$sha = (git rev-parse HEAD).Trim()
Set-Location packages/server
npx wrangler deploy --var "VERSION:$sha"
```

- 首次部署前必须在 Cloudflare 控制台 **启用 Analytics Engine**，否则 Worker 上传会 403。
- 写入 secrets 时避免 PowerShell 管道带入 **UTF-8 BOM**（会导致登录/读 secret 异常）。可用 Git Bash：`printf '%s' 'value' | npx wrangler secret put NAME`。
- D1 schema 变更后先：`npx wrangler d1 migrations apply counterscale --remote`（在 `packages/server` 目录）。
- 临时仪表盘密码应在正式使用前轮换（`CF_PASSWORD_HASH` / `CF_JWT_SECRET`）。

## 许可证

Counterscale 以 MIT 许可证发布的免费开源软件。详见：[LICENSE](LICENSE)。

## 限制

Counterscale 主要依赖 Cloudflare Workers 与 [Workers Analytics Engine](https://developers.cloudflare.com/analytics/analytics-engine/)。截至 2025 年 2 月，Workers Analytics Engine **最长保留约 90 天** 数据，因此仪表盘默认只能展示最近 90 天的记录。

不过，项目也支持将数据以 Apache Arrow 文件形式长期保存在 R2 中。长期存储默认开启，可通过 CLI 关闭。

## 安装

### 环境要求

- macOS 或 Linux 环境
- Node.js v20 及以上
- 有效的 [Cloudflare](https://cloudflare.com) 账号（免费或付费均可）

### Cloudflare 准备

若还没有账号，请先 [注册 Cloudflare](https://dash.cloudflare.com/sign-up) 并完成邮箱验证。

1. 打开 Cloudflare 控制台；若尚未配置，请先设置 [Workers 子域名](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)。
2. 为账号启用 [Cloudflare Analytics Engine](https://developers.cloudflare.com/analytics/analytics-engine/)（测试功能）。路径：Storage & Databases → Analytics Engine，点击 **Enable**（[截图](./docs/enable-analytics-engine.png)）。随后弹出的 “Create Dataset” 可忽略并关闭。
   - 说明：若你是第一次使用 Workers，需要先创建任意一个 Worker，才能启用 Analytics Engine。路径：Workers & Pages → Overview，点击 **Create Worker**（[截图](./docs/create-worker.png)）创建 “Hello World” Worker（名称随意，之后可删除）。
3. 创建 [Cloudflare API Token](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)。至少需要 `Account.Account Analytics` 权限（[截图](./docs/api-token.png)）。
   - **警告：请保持该页面打开，或把 Token 妥善保存（如密码管理器）。关闭后无法再次查看该 Token，只能重新创建。**

### 部署 Counterscale

先登录 Cloudflare，并授权 Cloudflare CLI（Wrangler）：

```bash
npx wrangler login
```

然后运行 Counterscale 安装程序：

```bash
npx @counterscale/cli@latest install
```

按提示操作。需要填入刚才创建的 Cloudflare API Token。还会询问是否为仪表盘设置密码保护：

- 选择 **Yes**（公开部署时建议开启）：将提示你设置访问仪表盘所需的密码。
- 选择 **No**：仪表盘可公开访问，无需登录。

脚本结束后，服务端应用应已部署。访问 `https://{部署时输出的子域名}.workers.dev` 进行验证。

**注意：** 首次部署 Counterscale 时，Worker 子域名生效可能需要几分钟。

### 在网站上开始记录访问

可通过以下方式之一加载追踪代码：

#### 1. 脚本加载（CDN）

部署完成后，可在你的部署 URL 下获取 `tracker.js`：

```
https://{部署时输出的子域名}.workers.dev/tracker.js
```

将以下片段复制到网站 HTML 中：

```html
<script
    id="counterscale-script"
    data-site-id="your-unique-site-id"
    src="https://{部署时输出的子域名}.workers.dev/tracker.js"
    defer
></script>
```

#### 2. 包 / 模块方式

Counterscale tracker 已发布为 npm 包：

```bash
npm install @counterscale/tracker
```

使用你的站点 ID 与已部署的上报端点初始化：

```typescript
import * as Counterscale from "@counterscale/tracker";

Counterscale.init({
    siteId: "your-unique-site-id",
    reporterUrl: "https://{部署时输出的子域名}.workers.dev/collect",
});
```

**可用方法**

| 方法 | 参数 | 返回类型 | 说明 |
|------|------|----------|------|
| `init(opts)` | `ClientOpts` | `void` | 使用站点配置初始化客户端。若不存在全局实例则创建。 |
| `isInitialized()` | 无 | `boolean` | 检查客户端是否已初始化。 |
| `getInitializedClient()` | 无 | `Client \| undefined` | 返回已初始化的客户端实例；未初始化则为 `undefined`。 |
| `trackPageview(opts?)` | `TrackPageviewOpts?` | `void` | 记录一次页面浏览。需先初始化；未传 URL/来源时会自动检测。 |
| `cleanup()` | 无 | `void` | 清理客户端实例与事件监听，并将全局客户端置为 `undefined`。 |

#### 3. 服务端模块

若希望在服务端而非浏览器中统计，可使用 `/server` 模块：

```bash
npm install @counterscale/tracker
```

```typescript
import * as Counterscale from "@counterscale/tracker/server";

// 初始化
Counterscale.init({
    siteId: "your-unique-site-id",
    reporterUrl:
        "https://{部署时输出的子域名}.workers.dev/collect",
    reportOnLocalhost: false, // 可选，默认 false
    timeout: 2000, // 可选，默认 1000ms
});

// 记录页面浏览
await Counterscale.trackPageview({
    url: "https://example.com/page", // 或相对路径：'/page'
    hostname: "example.com", // 使用相对 URL 时必填
    referrer: "https://google.com",
    utmSource: "social",
    utmMedium: "twitter",
});
```

**服务端模块方法**

| 方法 | 参数 | 返回类型 | 说明 |
|------|------|----------|------|
| `init(opts)` | `ServerClientOpts` | `void` | 初始化服务端 tracker。 |
| `isInitialized()` | 无 | `boolean` | 检查是否已初始化。 |
| `getInitializedClient()` | 无 | `ServerClient \| undefined` | 返回已初始化的服务端客户端实例。 |
| `trackPageview(opts)` | `TrackPageviewOpts` | `Promise<void>` | 记录页面浏览。需显式传入 URL 与 hostname。 |
| `cleanup()` | 无 | `void` | 清理服务端客户端实例。 |

服务端模块面向后端场景，与浏览器端差异包括：

- 无 DOM 相关能力（自动追踪、浏览器埋点等）
- 使用 `fetch`，而非 `XMLHttpRequest`
- 需要显式传入 URL 与 hostname
- 采用 fire-and-forget：追踪错误不会抛出异常

## 升级

多数版本升级只需重新运行 CLI 安装程序：

```bash
npx @counterscale/cli@latest install

# 或指定版本
# npx @counterscale/cli@VERSION install
```

一般无需重新输入 API Key，历史数据会保留。

Counterscale 遵循 [语义化版本（Semantic Versioning）](https://semver.org/)。升级到大版本（如 2.x、3.x、4.x）时可能有额外步骤，请查阅上游 [release notes](https://github.com/benvinegar/counterscale/releases)。

## 故障排查

若网站无法立即访问（例如 “Secure Connection Failed”），可能是 Cloudflare 尚未激活你的子域名（`yoursubdomain.workers.dev`）。通常需要约一分钟；可在 Cloudflare 控制台查看新创建的 Worker 状态（Workers & Pages → counterscale）。

## 进阶用法

### 手动记录页面浏览

初始化 tracker 时将 `autoTrackPageviews` 设为 `false`，再在需要时手动调用 `Counterscale.trackPageview()`：

```typescript
import * as Counterscale from "@counterscale/tracker";

Counterscale.init({
    siteId: "your-unique-site-id",
    reporterUrl: "https://{部署时输出的子域名}.workers.dev/collect",
    autoTrackPageviews: false, // 关闭自动追踪
});

// 发生页面浏览时
Counterscale.trackPageview();
```

### 自定义域名

部署 URL 可绑定到你自己的域名。详见 Cloudflare 文档：[Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)。

## CLI 命令

Counterscale 提供命令行工具（CLI），用于安装、配置与管理部署。

### 可用命令

#### `install`

安装并将 Counterscale 部署到 Cloudflare 的主命令。

```bash
npx @counterscale/cli@latest install
```

选项：

- `--advanced` - 启用高级模式，可自定义 Worker 名称与 analytics dataset
- `--verbose` - 输出更详细的日志

#### `auth`

管理部署的认证设置。

```bash
npx @counterscale/cli@latest auth [subcommand]
```

子命令：

- `enable` - 启用认证
- `disable` - 关闭认证
- `roll` - 更新 / 轮换认证密码

##### 示例

启用认证：

```bash
npx @counterscale/cli@latest auth enable
```

关闭认证：

```bash
npx @counterscale/cli@latest auth disable
```

更新 / 轮换密码：

```bash
npx @counterscale/cli@latest auth roll
```

#### `storage`

管理长期存储设置。

```bash
npx @counterscale/cli@latest storage [subcommand]
```

子命令：

- `enable` - 启用长期存储
- `disable` - 关闭长期存储

##### 示例

启用存储：

```bash
npx @counterscale/cli@latest storage enable
```

关闭存储：

```bash
npx @counterscale/cli@latest storage disable
```

## 开发

本地开发与贡献方式见 [Contributing](CONTRIBUTING.md)（英文）。

## 说明

### 数据库

实际上只有一个“数据库”：Cloudflare Analytics Engine 数据集，通过 Cloudflare API 以 HTTP 通信。

目前没有本地“测试数据库”。因此在本地开发时：

- 写入会 no-op（不会真正记录访问）
- 读取会打到生产环境的 Analytics Engine 数据集（本地开发界面看到的是生产数据）

### 采样（Sampling）

Cloudflare Analytics Engine 使用采样，以便在高流量下仍能以较低成本完成数据写入与查询（多数分析工具类似，参见 [Google Analytics 关于采样的说明](https://support.google.com/analytics/answer/2637192?hl=en#zippy=%2Cin-this-article)）。CF AE 采样机制详见：[Sampling](https://developers.cloudflare.com/analytics/analytics-engine/sampling/)。
