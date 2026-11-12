# Personal Edition setup

[中文完整安装说明](PERSONAL-SETUP.zh-CN.md) · [README](../README.md) · [changes and limits](PERSONAL-CHANGES.md)

Use your own machines, CLI accounts, credentials and project directories. Every `xxxxx` below is a placeholder. No account or model service is bundled.

## Install and try locally

Install Git, Node.js 22 (`.nvmrc` pins `22.22.1`), and at least one supported CLI. Authenticate the CLI as the same operating-system user that will run Worker. MCP and browser tools must be configured on that execution machine separately.

```sh
git clone --branch v0.4.0-personal.1 https://github.com/zhangyc-413/workbench-personal.git
cd workbench-personal
nvm install     # optional: for nvm users
nvm use
npm ci
mkdir -p "$HOME/workbench-projects"
export WORKER_ROOTS="$HOME/workbench-projects"
export WORKSPACE_ROOT="$HOME/workbench-projects"
npm run dev
```

Open `http://127.0.0.1:4317`. A tagged checkout being in detached HEAD state is expected. Create a development branch if you want to edit the code.

Check Settings → Devices and CLIs. Create either a native **Session** (its own directory) or a project **Group chat** (a bound project child directory). Do not bind the entire workspace parent as a project: independent session creation rejects overlapping managed directories. A saved device workspace setting overrides `WORKSPACE_ROOT`; review it when upgrading an existing installation. Existing sessions keep their original directories and histories.

The simple trial keeps private data inside `.data` in the checkout. Preserve it before changing or removing the installation.

## Persistent Linux server

Run under a dedicated non-root user. Install and log in to the CLIs as that user. Generate two separate random credentials for `API_TOKEN` and `WORKER_TOKEN`:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Create a private script outside the checkout, for example `~/.config/workbench-personal/run.sh`, with mode `700`. Replace every `xxxxx`. Use absolute executable paths (`command -v node`, `command -v codex`, `command -v claude`); services do not inherit an interactive shell's nvm initialization.

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
# Uncomment and fill these if needed by the service environment:
# export CLAUDE_BIN='/xxxxx/claude'
# export CODEX_BIN='/xxxxx/codex'
mkdir -p "$DATA_DIR" "$WORKER_DATA_DIR" "$WORKSPACE_ROOT"
cd '/xxxxx/workbench-personal'
exec '/xxxxx/node' src/dev.mjs
```

Run the script manually first. Then adapt [`examples/personal/workbench.service`](../examples/personal/workbench.service), replacing its `User` and script path, and have the server administrator install it as `workbench-personal.service`:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now workbench-personal
sudo systemctl status workbench-personal
```

This provides boot startup and restart after failures, not uninterrupted model availability. Network failures, server outages, CLI exits and expired authorizations still matter. Keep the service's private files owned by its runtime user. Back up existing data and stop idle services before migrating an existing installation.

## Remote browser access

From your computer, forward a local port to the server's loopback listener:

```sh
ssh -N -L 14317:127.0.0.1:4317 xxxxx@xxxxx
```

Open `http://127.0.0.1:14317` and enter **API_TOKEN** in Workbench's API Token dialog. `WORKER_TOKEN` is a separate registration credential. Closing SSH disconnects this local entry point, while the server processes continue running.

For phone access, provision a domain, HTTPS and an authenticated entry point using the existing [remote-access module](../modules/remote-access/README.md) or [operating guide](OPERATING-GUIDE.md). A domain alone does not provide those services. Keep internal listeners private. A gateway login password, a Home API token and a vendor CLI password are different credentials.

## Optional file synchronization

Installation does not enable synchronization. Choose one engine for a given folder pair. New independent session folders are not automatically added.

If you already operate a Syncthing **send/receive** pair, Home can observe it through a private `DATA_DIR/external-file-sync.json`:

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

The outer key is the Workbench project ID; the other identifiers come from Syncthing. Only numeric loopback HTTP endpoints are accepted. Home must be able to read the local Syncthing configuration; its API credential stays on Home. Restart Home at an idle point to load a mapping. Disable the project's existing built-in synchronization before adding this mapping; the observer does not stop existing transfers.

The observer displays state and counts. Syncthing owns pairing, transfers, exclusions, versioning and conflicts. With two-way synchronization there is no fixed master: an offline computer catches up when its sync service reconnects; concurrent edits may produce conflict copies. Do not synchronize live Workbench databases or vendor login directories as project files.

## Updates and boundaries

- Install Personal Edition releases. The enhanced branch is `personal`; `main` retains upstream code. The built-in update panel compares `main` and is not a Personal Edition release updater.
- At an idle point, stop services, back up private Home/Worker data and project/native-session files, change release, run `npm ci`, and restart. Never run two Homes against one database.
- Browsers can close without stopping server tasks. A powered-off computer cannot run its Worker or synchronize local files.
- Occupied sessions and full device capacity require checking the owning tasks/processes. Do not clear databases or remove permission checks to bypass them.
- The Linux DNS change only adds the resolved configuration-file path to the permission profile. It neither installs tools nor fixes every CLI/network configuration.
- Browser access grants broad machine-operation capabilities. This remains a trusted-operator application, not a public multi-tenant service.
