# Connect a Mac from the website

Implemented for macOS (Apple Silicon and Intel). Home must run on the prepared Linux server. This is an explicit installation flow, not silent browser access to a computer.

In the sidebar choose **连接我的电脑**, download the ZIP, extract it and open `连接我的电脑.command`. The first run asks for a dedicated folder. The helper installs user-scoped, checksum-pinned Node and Syncthing components, generates a local SSH key, redeems a 30-minute single-device enrollment and registers a login LaunchAgent. No sudo or Claude login is needed on the Mac. macOS may require Finder's Open confirmation. Windows/Linux desktop installers are not included.

The server creates a new, independent folder under its configured sharing root. Its path appears in the dialog and can be selected when creating a project. Existing project bindings and synchronization pairs are never changed. The local folder must not already be managed by another synchronization service. The helper rejects home/system/credential folders and overlaps with its own existing pairs; it cannot enumerate every third-party synchronization service.

Syncthing connects through a dedicated, host-key-pinned SSH forward. All local listeners use loopback; global discovery, local discovery, relays, NAT traversal and automatic upgrades are disabled for the helper's private Syncthing instance. Files synchronize in both directions, including deletions. Both ends keep 20 versions of remotely replaced files and retain conflict copies. This is not a complete backup or a file lock. Common credential directories and filenames are excluded; arbitrary private text in ordinary documents is not detected. Sleeping/offline computers resume after reconnecting; login autostart requires the Mac user to log in.

The dialog shows pending, connecting, offline, syncing, synced and unavailable states from the server Syncthing API. It refreshes only while open and visible. **解除连接** removes that enrollment's keys and Syncthing share/device configuration, retaining disk files. Failed cleanup remains visible and retryable. Already-open maintenance shells are not forcibly terminated. The installed `停止同步.command` stops only this local helper and removes its login registration; server revocation is separate.

## Optional local development

Selecting **允许本机维护工作台** grants a separate maintenance SSH key and includes a source snapshot with a baseline hash manifest. The helper puts it under `~/Workbench Development/<connection-id>`, separately from synced files and authentication data. Open that folder in a local coding agent. `LOCAL-SETUP.md` supplies the local runtime and connection details; it and `.workbench-connection.json` / `.workbench-baseline.json` are ignored by Git. No provider credentials, chat database or private server configuration is downloaded.

`node bin/deploy-personal.mjs --check` lists local changes. Without `--check`, it runs dependency installation and syntax checks, verifies each changed file against the downloaded server baseline, backs up existing files and Home SQLite, checks for active work, stops Home admission, checks again and restarts Home/Worker around deployment. A failed health check restores source files. File deletion and dependency changes require manual maintainer handling. This helper is for a single owner's server, not an isolation boundary for untrusted developers. The configured maintenance SSH account must have the operator's normal deployment privileges. Do not give maintenance access to someone who should only synchronize files.

Changes do not auto-publish. Test the actual behavior before deployment. Browser changes that must replace cached assets also need a service-worker cache version bump. Keep credentials, local connection files and source sync data out of public Git repositories.

## Server preparation

An administrator provisions Syncthing, an SSH account restricted to forwarding, a sharing root inside the cloud Worker's configured roots, and Home's private `DATA_DIR/computer-link.json`. The feature is unavailable without this file. Example values are placeholders:

```json
{
  "publicOrigin": "https://xxxxx",
  "sshHost": "xxxxx",
  "sshPort": 22,
  "sshUser": "xxxxx",
  "syncPort": 22000,
  "hostKey": "ssh-ed25519 xxxxx",
  "folderRoot": "/xxxxx/shared-folders",
  "authorizedKeys": "/xxxxx/computer-link/sync_authorized_keys",
  "syncthingUrl": "http://127.0.0.1:8384",
  "syncthingConfig": "/xxxxx/syncthing/config.xml",
  "maintenanceUser": "xxxxx",
  "maintenanceAuthorizedKeys": "/xxxxx/computer-link/maintenance_authorized_keys",
  "deployment": {
    "sourceRoot": "/xxxxx/workbench",
    "homeData": "/xxxxx/home",
    "backupRoot": "/xxxxx/backups",
    "homeService": "xxxxx-home.service",
    "workerService": "xxxxx-worker.service",
    "homePort": 4317
  }
}
```

Omit maintenance fields if no maintenance access is intended. Home needs write access to the **dedicated** key files and sharing root, and read access to Syncthing's private XML. Never point these key files at an existing user's ordinary authorized_keys: Home rewrites only its own enrollment set.

Use sshd's `AuthorizedKeysCommand /usr/bin/cat /xxxxx/computer-link/sync_authorized_keys` with `AuthorizedKeysCommandUser xxxxx` (the Home user), only in a `Match User` block for the restricted SSH account. Set `PasswordAuthentication no`, `KbdInteractiveAuthentication no`, `AllowTcpForwarding local`, `PermitOpen 127.0.0.1:22000`, `PermitTTY no`, `X11Forwarding no`, `AllowAgentForwarding no`, `PermitTunnel no`, `GatewayPorts no` and `ForceCommand /usr/bin/false`. Keep existing administrative access intact. Optional maintenance keys use a separate Match User block and file; do not apply the forwarding-only ForceCommand to maintenance. Verify with `sshd -t` before reloading.

The only public unauthenticated gateway exception is the exact **POST /api/computer-link/claim** path, proxied directly to Home. It requires the unguessable, expiring enrollment bearer and accepts only a validated SSH public key and Syncthing identity. All listing, creation, downloads and revocation retain the existing browser/API authentication. Do not expose the whole `/api` prefix. For Caddy, place an exact method/path matcher and `handle` before the normal authenticated gateway fallback. No new firewall port is needed beyond the server's existing SSH and HTTPS ports.

State lives in `DATA_DIR/computer-link/devices.json`, mode 0600, with hashed enrollment tokens. Enrollment is serialized and retryable for the identical device; changed identities and expired/revoked tokens fail closed. This reuses Home and the existing Syncthing service, with no new scheduler or cloud account login.
