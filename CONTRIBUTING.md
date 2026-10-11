# Contributing / 贡献指南

English and 中文 are welcome. Keep one issue or PR focused on one problem; search existing issues/PRs and link related work before opening a duplicate. / 欢迎中英文；一次提交聚焦一个问题，先搜索已有 Issue/PR 并关联相关工作。

## Issues / 问题报告

Use the bug or feature form. Installation, desktop and Web UI problems fit the bug form; fill conditional fields only when relevant. Blank issues remain available for other topics. Give a minimal reproduction with synthetic data, expected/actual behavior and the relevant versions/platform. / 使用缺陷或功能表单；安装、桌面与 Web 界面问题使用缺陷表单，仅填写适用上下文。其他事项可用空白 Issue。提供虚构数据最小复现、期望/实际及版本/平台。

For client reports, identify Tauri desktop vs shared Web UI, client and bundled/external CLI versions, installer or browser, platform and affected view. UI steps and cropped/redacted screenshots help; include scale/theme/language when relevant. / Client 报告区分 Tauri 桌面与共享 Web UI，提供客户端/CLI 版本、安装包或浏览器、平台与页面。补充界面步骤和裁剪脱敏截图，按需说明缩放/主题/语言。

## Pull requests / 合并请求

Use a small branch against `main` and the PR template. Explain the problem and resulting behavior, link related issues (use `Fixes #...` only when fully resolved), and include actual test commands/results. Mark checks N/A with a reason when irrelevant; say explicitly when CI or platform tests did not run or were skipped. / 从 `main` 建立小分支，使用 PR 模板说明问题和行为变化、关联 Issue 并记录真实测试；不适用项说明原因，明确 CI/平台测试未运行或跳过。

Preserve the versioned CLI JSON/sidecar boundary and [compatibility matrix](contracts/compatibility-matrix.json); the client does not contain Core source. Retain existing legacy environment/config/data-path compatibility. UI changes should cover applicable accessibility/language behavior and keep tracked frontend distributions consistent with the existing build workflow. / 保留版本化 CLI 协议/sidecar 边界、兼容矩阵和旧环境/配置/数据路径兼容；客户端不含 Core 源码。界面变更按需检查可访问性/语言，遵循现有构建流程保持已跟踪前端产物一致。

## Validation / 验证

Follow [README.md](README.md) and existing [CI](.github/workflows/ci.yml); use isolated test data. Run checks relevant to the changed behavior and record limitations instead of claiming untested platforms passed. No new coverage threshold is introduced. / 遵循 README 与现有 CI，使用隔离资料；运行相关检查并如实记录限制，勿将未测试平台写为通过；不新增覆盖率门槛。

Frontend changes: in `client/tree-ui`, run `npm ci`, `npm test`, and `npm run build` using the Node version documented in README. Native changes need matching CLI artifacts and target-specific Tauri checks; frontend tests alone do not verify installed desktop packages. Existing CI checks the compatibility matrix, staging script syntax, UI tests and production build. / 前端按 README 的 Node 版本运行已有命令；原生变更需要匹配 CLI 与目标平台 Tauri 验证，前端测试不能代替安装包验证。

Documentation/template-only changes can use syntax, path/link and diff review; state explicitly if product tests were not run. / 纯文档/模板变更可做语法、路径/链接和差异检查，明确未运行产品测试。

Every push to `main` currently starts a DEV desktop release; a docs-only merge has that effect too. Maintainers must decide that release impact before merging contribution-only changes. This guide does not authorize publishing, changing release workflows or changing repository security settings. / 当前 `main` 每次 push 会触发桌面 DEV 发布，文档合并也会触发。维护者须先决定该影响；本指南不授权发布或修改发布工作流/安全设置。

## Private data and security / 私密数据与安全

Use English or 中文. Search existing issues first. Never post passwords, API keys/tokens, databases/backups, private memories, account identifiers or unredacted logs/screenshots. / 可用中英文；先搜索现有问题。不要提交密码、密钥/token、数据库/备份、私密记忆、账户标识或未脱敏日志/截图。

Security vulnerabilities: do not disclose details in a public Issue or PR. Check this repository's Security tab for a private reporting option; if none is offered, ask maintainers to establish a private channel without including vulnerability details. No security email or private channel is currently documented. / 安全漏洞不要公开披露；查看本仓库 Security 页是否提供私密报告入口。若没有，只请求维护者建立私密渠道，不附漏洞细节。目前未公布安全邮箱或私密渠道。
