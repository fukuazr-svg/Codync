# 候选 dev79d 的验收与回退计划

基线：官方 dev `79d70f91`（2.45.1）＋ 我们的补丁，整合提交 `67f71424`（tree `7b653cc7`）。
状态：**源码合并完成，未编译、未打包、不可安装**。下面每一道闸在跑通之前，不许说"已验证"。

## 一、本机还没跑的门禁（按顺序，都要真实输出）

| # | 命令 | 工作目录 | 通过标准 |
|---|---|---|---|
| 1 | `cargo fmt --check` | `host/` | exit 0 |
| 2 | `cargo clippy --all-targets -- -D warnings` | `host/` | exit 0 |
| 3 | `cargo test --bin codync-host -- --test-threads=1` | `host/` | 无新增 FAIL；已知 3 个在官方基线上同样失败的单独列出 |
| 4 | `cargo test --test always_allow_e2e -- --test-threads=1` | `host/` | 全 PASS（#403 Always allow） |
| 5 | `cargo test --test team_e2e -- --test-threads=1` | `host/` | 全 PASS |
| 6 | `cargo test --test bot_inspection_e2e -- --test-threads=1` | `host/` | 全 PASS（#415） |
| 7 | `cargo test --test decision_e2e -- --test-threads=1` | `host/` | 全 PASS（#416 官方功能未被我们的补丁打断） |
| 8 | `npm ci && npm run typecheck` | `apps/desktop/` | exit 0 |
| 9 | `npm test` | `apps/desktop/` | 与官方基线相同结果（已知 20 个失败） |
| 10 | `npm run e2e -- permission-language.spec.ts` | `apps/desktop/` | 全 PASS（#407 文案） |
| 11 | `npm run dist:win:main -- --x64 --publish never` | `apps/desktop/` | 出安装包 |

跑前必须先拿到 `F:/Qbot/work/shiyan-current-component-batches-20261111/content-batch.build.lock`，
跑完只释放自己的锁。

## 二、出包后要核的东西

- 安装包字节数与 sha256（本机 `Get-FileHash -Algorithm SHA256`）
- `codync-host.exe` / `codync-hostw.exe` / `app.asar` 三个文件的 sha256，与包内记录对得上
- Release 标签：`ours-2.45.1-<日期>-79d70f91`
- 直连 `127.0.0.1:19222/health` 返回 `ok: true`、`version: 2.45.1`

## 三、回退

- 上一版安装包：`work\ours-build\codync-windows-x64.exe`
  （`ours-2.44.1-20261111-234219c-p15be05a`，145132355 字节，sha256 `e1e685f6…2fe4`）
- 当前已装版：`ours-2.44.1-20261112-lead410-2352f7db`（`2352f7db`），host sha256 `395148c7…8867`
- 回退时先停新 host，再装回旧包，装完立刻核 health 与三个文件 sha256

## 四、没验的边界

- iOS / Android / macOS / Linux 本轮一行都没编译
- 真模型长跑、正式环境联调没做
- 全机重活队列没拿到锁，所以上面 11 道闸一道都还没跑
