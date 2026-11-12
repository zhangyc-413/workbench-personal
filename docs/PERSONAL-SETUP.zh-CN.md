# 个人增强版：从安装到远程使用

[English](PERSONAL-SETUP.md) · [项目首页](../README.zh-CN.md) · [本版改进](PERSONAL-CHANGES.md)

适合一个人使用自己的电脑、服务器和 CLI 账号。先在一台机器上跑通，再增加域名或其他设备。`xxxxx` 都是占位符，需要替换成自己的值。

## 1. 准备环境和代码

- 安装 Git 和 Node.js 22；本版固定验证版本为 `.nvmrc` 中的 `22.22.1`。
- 在实际执行任务的机器上安装 Claude Code 或 Codex，并以将运行 Worker 的同一个系统用户登录。Workbench 不附带厂商 CLI、账号或订阅。
- MCP、浏览器工具等也要在执行机器上配置。登录同一个账号不会自动复制另一台电脑的工具。

```sh
git clone --branch v0.4.0-personal.1 https://github.com/zhangyc-413/workbench-personal.git
cd workbench-personal
nvm install     # 已使用 nvm 时执行；其他方式安装 Node 的用户可跳过
nvm use
npm ci
```

按发布标签安装时，Git 提示 detached HEAD 是正常现象：这是固定版本。做开发时自行新建分支。

## 2. 单机试用

先准备一个专门放项目的父文件夹。它不是某个业务项目本身，新会话会创建在它下面的 `native-sessions` 内。

```sh
mkdir -p "$HOME/workbench-projects"
export WORKER_ROOTS="$HOME/workbench-projects"
export WORKSPACE_ROOT="$HOME/workbench-projects"
npm run dev
```

浏览器打开 `http://127.0.0.1:4317`。这是本机入口。配置设备与 CLI，然后选择：

- **会话**：独立聊天和研究，每个新会话都有单独的文件夹；同名会话也分开。
- **群聊/项目**：绑定一个具体项目的子文件夹，由多个角色协作。

不要把整个 `workbench-projects` 父文件夹绑定为一个项目，否则新会话会因目录重叠而被拒绝。旧安装修改 `WORKSPACE_ROOT` 后，还需检查设备设置中保存的默认工作目录；已保存的设置优先于环境变量。旧会话仍在原目录，不会自动迁移。

此试用方式的数据在代码目录的 `.data` 内。不要直接删除这个目录来“重新安装”。

## 3. 放到服务器长期运行

使用专门的普通系统用户，在该用户下安装 Node 和 CLI、完成 CLI 登录。使用 Node 的绝对路径，不依赖交互终端的 nvm 初始化。

先生成两个不同的随机令牌，每次运行下面命令生成一个。它们分别用作 `API_TOKEN` 和 `WORKER_TOKEN`；保存到服务器的私有配置文件，不提交到 Git：

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

在代码目录之外创建私有启动脚本，例如 `~/.config/workbench-personal/run.sh`。替换下方所有 `xxxxx`；Node 路径可用 `command -v node` 获取，代码路径可用 `pwd` 获取。保存后给脚本权限 `700`。

```sh
#!/bin/sh
set -eu
umask 077
export PATH="/xxxxx/node-bin-directory:$PATH"
export HOST=127.0.0.1
export PORT=4317
export DATA_DIR="$HOME/.local/share/workbench-personal/home"
export WORKER_DATA_DIR="$HOME/.local/share/workbench-personal/worker"
export WORKER_ROOTS="$HOME/workbench-projects"
export WORKSPACE_ROOT="$HOME/workbench-projects"
export HOME_URL=ws://127.0.0.1:4317/worker
export API_TOKEN='xxxxx'
export WORKER_TOKEN='xxxxx'
export NODE_ID='personal-server'
export NODE_NAME='Personal server'
export NODE_KIND='cloud'
export WORKER_CONCURRENCY=2
# 如 CLI 不在服务的 PATH 中，取消注释并填入真实绝对路径：
# export CLAUDE_BIN='/xxxxx/claude'
# export CODEX_BIN='/xxxxx/codex'
mkdir -p "$DATA_DIR" "$WORKER_DATA_DIR" "$WORKSPACE_ROOT"
cd '/xxxxx/workbench-personal'
exec '/xxxxx/node' src/dev.mjs
```

先手动运行这个脚本检查能否启动。随后可使用 [`examples/personal/workbench.service`](../examples/personal/workbench.service) 作为 systemd 模板，替换 `User` 和启动脚本绝对路径后，由服务器管理员安装为 `workbench-personal.service`，再执行：

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now workbench-personal
sudo systemctl status workbench-personal
```

服务会开机启动并在异常退出后重启；服务器停机、网络故障、CLI 退出或账号授权失效仍会中断任务，它不是“保证模型永远在线”。配置文件和 CLI 凭据属于运行该服务的用户。已有安装迁移到此结构前，先停止空闲服务并备份私有数据。

## 4. 在自己的电脑或手机打开

先用 SSH 转发验证。**这条命令在自己的电脑上执行**，替换用户名与服务器地址：

```sh
ssh -N -L 14317:127.0.0.1:4317 xxxxx@xxxxx
```

本机打开 `http://127.0.0.1:14317`，在 Workbench 的 API Token 弹窗输入自己的 `API_TOKEN`。`WORKER_TOKEN` 用于设备连接，不在此输入。SSH 窗口关闭后，这个本机入口会断开，服务器服务仍继续运行。

若要手机随时访问，需要配置域名和 HTTPS 入口。可参考项目已有的 [远程访问模块](../modules/remote-access/README.md) 或 [多设备操作指南](OPERATING-GUIDE.md)。仅购买域名不会自动完成 HTTPS、访问认证和防火墙配置。不要把未认证的内部端口公开。

网页登录密码（若使用远程访问模块）与 Home 的 API Token 是不同凭据。不要把服务器密码或 CLI 账号密码填进 API Token 弹窗。

## 5. 文件同步是单独的一步

默认**不开启文件同步**。先选择一种同步方式，并只给需要的项目配置。不要让 Workbench 内置同步和 Syncthing 同时写同一对文件夹。

若已有 Syncthing 双向同步，在 Home 私有数据目录创建 `external-file-sync.json`：

```json
{
  "projects": {
    "xxxxx": {
      "url": "http://127.0.0.1:8384",
      "configPath": "/xxxxx/config.xml",
      "folderId": "xxxxx",
      "peerId": "xxxxx"
    }
  }
}
```

外层键是 Workbench 的项目 ID；其余值来自自己的 Syncthing 设置。只支持 Home 能读取配置的本机 Syncthing，以及 HTTP 数字回环地址。该文件只保存配置路径，程序在 Home 读取 Syncthing 的访问密钥，不把它发给浏览器。保存后在空闲时重启 Home 才会加载映射。映射前应已关闭该项目的内置同步；新映射不会停止已运行的内置同步任务。

这个适配器只显示状态，不负责安装、配对、排除规则、版本保留或处理冲突。双向同步没有固定主端：电脑关机时同步暂停，重新联网并启动同步服务后补齐；双方离线修改同一文件可能产生冲突副本。新建会话的目录不会自动加入同步。聊天数据库与厂商原生登录状态也不要当成普通项目文件同步。

## 6. 更新、备份和问题定位

- 从本仓库 Releases 选择版本；`personal` 是增强分支，`main` 保留上游代码。“检查更新”仍比较 `main`，不是此增强版的发布器。
- 升级前在任务空闲时停止服务，备份 Home/Worker 私有数据、项目文件和需要保留的原生会话，再切换发布版本、执行 `npm ci` 并重启。不要同时启动两个 Home 使用同一份数据库。
- 浏览器关闭不等于停止服务器；电脑关机则无法运行本机 Worker 或同步。
- “会话占用”“设备容量已满”需要检查原有任务及进程，不能通过删除数据库或关闭权限检查解决。
- Codex 的 DNS 修复只覆盖权限配置中的解析文件路径；CLI 自己的版本、网络权限及外部工具仍需正常配置。
- 此系统的浏览器用户具有较大的机器操作权限，适用于可信操作者，不是面向陌生用户的账号共享平台。
