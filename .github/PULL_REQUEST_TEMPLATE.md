<!-- English or 中文. Keep only applicable checks; explain N/A or tests not run. Never include secrets, tokens, databases or private memories. / 可用中英文；不适用项写 N/A，未运行测试说明原因；勿附密钥、token、数据库或私密记忆。 -->

## Problem and change / 问题与变更
<!-- Concrete before/after behavior; link issue(s), e.g. Refs #123 or Fixes #123 only when resolved. / 说明前后行为并关联 Issue；仅解决时使用 Fixes。 -->

## Validation / 验证
<!-- Commands/scenarios, result and evidence; distinguish passed, failed, skipped and not run. Use isolated synthetic data. / 列命令/场景、结果与证据，区分通过、失败、跳过、未运行。 -->
<!-- UI: redacted screenshots if visual behavior changed; test affected views and account/profile switching when relevant. Native/Web claims need evidence on those actual platforms. / 界面变更附脱敏截图；按需测试页面和账户切换，平台结论须有对应证据。 -->

## Compatibility and migration / 兼容与迁移
<!-- CLI JSON contract and bundled sidecar, desktop/Web behavior, legacy environment/config/data paths, accessibility/i18n and tracked frontend outputs. / CLI 协议与 sidecar、桌面/Web、旧环境/配置/数据路径、可访问性/语言与已跟踪前端产物。 Explain migration/rollback or state none. / 说明迁移/回退方式，或写无。 -->

## Applicable checks / 适用检查
- [ ] Focused change; linked issue or explained motivation. / 改动聚焦，已关联问题或说明动机。
- [ ] Relevant tests/checks recorded above; gaps explained. / 已记录相关验证与未验证项。
- [ ] Compatibility, migration and documentation impact addressed (or N/A). / 已说明兼容、迁移与文档影响（或 N/A）。
- [ ] Logs, screenshots and fixtures contain no credentials or private user data. / 日志、截图和测试资料不含凭据或私密数据。

<!-- Security details belong in a verified private channel; see CONTRIBUTING.md. / 安全漏洞细节走已确认私密渠道，见 CONTRIBUTING.md。 -->
