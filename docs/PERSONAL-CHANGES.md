# Personal Edition changes

## Latest `personal` branch (after the first release)

The branch adds Mac SSH/Syncthing enrollment with optional local maintenance, complete helper packages and a lighter Codex-assisted setup handoff. It also restores cached chat text before reconnecting, keeps native-state refreshes compact and quiet, recovers idle sessions after Home restart, avoids historical scans during ownership checks and offers browser startup recovery without clearing user data. These changes are not in the existing `v0.4.0-personal.1` release tag. See [current setup](PERSONAL-SETUP.md) and [Codex installation handoff](CODEX-INSTALL.zh-CN.md).

## v0.4.0-personal.1

Base: upstream `fcee9192f3587ab621925eebc29e1d16c783800e` (MIT).

This release packages the following additions to the upstream application:

| Area | Changed behavior | Boundary |
| --- | --- | --- |
| Appearance | Automatic system light/dark colors; neutral dark surfaces | No new appearance settings or manual theme switch |
| Mobile layout | Visual viewport height and offset, bounded composers, compact side questions | Browser emulation cannot certify every physical iPhone/keyboard combination |
| Native sessions | Unique device folder per new session; stable folder on retry | Existing native histories and resumed directories are not moved; group chats retain their project bindings |
| Cloud sessions | Browser page creation uses the existing authenticated Worker connection | iTerm/SSH creation still needs configured SSH access |
| File synchronization | Read-only status for an existing mapped Syncthing send/receive pair | Does not configure Syncthing, create synchronization scopes, choose a master, inspect conflicts or synchronize new session folders |
| Project sidebar | Projects without registered Git repositories show “Project files” | No Git repository is initialized automatically |
| Codex on Linux | Permit the resolved DNS configuration file inside the project permission profile | Does not grant all of `/run`, install MCP tools, or fix every CLI/container networking failure |

The source changes retain the upstream scheduler, queues, permission choices, native adapters, and storage model. This release does not add tenant isolation, account sharing, automatic provider failover, or a new collaboration engine.

## Source and update policy

- `personal` is the enhanced branch and the default landing page of this fork.
- `main` is retained as imported upstream source. Upstream changes require an explicit integration and validation before a new Personal Edition release.
- Install the `personal` branch for the current feature set and record its exact commit; choose a release tag when that older fixed version is intended. Do not pull `main` into a running customized installation.
- The existing update panel compares the package repository's `main`. It is informational, does not install anything, and is not a Personal Edition release updater.
- Stop the processes at a safe idle point before replacing application files. Preserve private Home/Worker data and CLI credentials separately. Old session directories remain where they were created.

## 中文说明

本版本保留上游的调度、队列和权限机制，重点改进个人使用体验。新建“会话”有独立文件夹，“群聊”仍绑定项目；旧会话不会搬家。同步状态展示不等于自动同步，双向同步也不等于服务器永远覆盖本机。

发布的是通用程序和配置示例，任何人使用前都需要自己的服务器或电脑、CLI 账号、工作目录和访问令牌。更新时保留私有数据，先停止空闲服务，再切换经过验证的发布版本。

## Attribution

The original Agent Workbench platform and upstream history are by [robinli1228-ctrl/workbench](https://github.com/robinli1228-ctrl/workbench) and its contributors. Original copyright and license notices are preserved. Personal Edition modifications are distributed under the same MIT terms; no vendor CLI or model is redistributed.
