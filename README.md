English | [Simplified Chinese](README.zh-CN.md)

# Agent Workbench — Personal Edition

A community fork of [robinli1228-ctrl/workbench](https://github.com/robinli1228-ctrl/workbench), for a personal, self-hosted Claude Code / Codex workspace. The original authors built the collaboration platform; this fork packages a small set of usability and deployment improvements under the same [MIT license](LICENSE).

**Install with your local Codex:** [installation handoff (中文)](docs/CODEX-INSTALL.zh-CN.md). The latest improvements are on `personal`; the older `v0.4.0-personal.1` tag does not contain them.

**Start here:** [personal server setup](docs/PERSONAL-SETUP.md) · [中文安装说明](docs/PERSONAL-SETUP.zh-CN.md) · [fork changes](docs/PERSONAL-CHANGES.md).

### What this fork adds

- A Mac **Connect my computer** flow: download lightweight connection materials and open a prefilled task in the local Codex app. The user sends it; Codex reviews the materials, prepares verified components and configures dedicated SSH and Syncthing with a chosen folder. Optional local maintenance includes source and a guarded deployment helper. A separate **下载文件** tab provides the complete standalone helper. [Setup and boundaries](docs/COMPUTER-CONNECT.md).

- Neutral charcoal dark mode that follows the device's light/dark preference.
- Mobile keyboard layout adjustments, including iPhone viewport panning.
- A separate working folder for **every new native session**. Same titles still create different folders; retries reuse the same folder; existing sessions retain their history and directory.
- New browser sessions on a connected cloud Worker without requiring an extra SSH device registration. iTerm launches still require SSH.
- An optional **read-only Syncthing status display** for an existing, explicitly configured two-way folder pair. Installing this fork alone does not start synchronization; the separate computer-connection flow configures only a newly authorized folder pair.
- Linux Codex DNS resolver symlink access within its configured project permission profile.
- “Project files” instead of “0 code repositories” when a project has no registered Git repositories.
- Indexed native-session ownership checks keep scheduling responsive as task history grows.
- After a Home restart, a verified idle native session becomes usable again when its Worker reconnects. Explicitly closing sessions remain blocked until their processes exit.
- Returning to a previously viewed group chat or native session shows a bounded, read-only text copy immediately while live data reconnects. Copies stay in the current browser tab; first visits still need the server.
- A stalled or failed page startup offers interface recovery; `/recover` refreshes only Workbench static files while preserving sign-in, drafts and conversations.
- Native chats load compact session state instead of the group task archive. Temporary read failures retain the last complete state and resume incremental updates; background refreshes show no moving progress bar.

Release `v0.4.0-personal.1` is based on upstream commit [`fcee919`](https://github.com/robinli1228-ctrl/workbench/commit/fcee9192f3587ab621925eebc29e1d16c783800e), **not the latest upstream main**. The enhanced branch is `personal`; the fork's `main` remains the upstream baseline imported when the fork was created. Use the `personal` branch for the current documented features and record its commit before deployment. Use a release tag only when you intentionally want that fixed older version. The existing update panel compares against `main`, so use this fork's documented branch/commit or an explicitly selected release for Personal Edition updates; it never installs updates automatically.

No accounts, subscriptions, vendor CLI binaries, login sessions, hosted service, or private project data are included. Each operator supplies their own runtime and credentials. This fork is not affiliated with Anthropic or OpenAI and does not change provider availability, terms, or account eligibility.

---

The upstream platform overview follows.

**Bring your AI coding CLIs together. Let them plan, build, review, and pass work to one another.**

Agent Workbench is a self-hosted workspace for collaboration between **Codex, Claude Code, Grok Build, and Antigravity**. Give the team a goal, assign responsibilities, and let different CLIs carry the work from planning through implementation, review, and testing.

For example, Claude Code can develop a plan, Codex can implement it, and Grok or Antigravity can review the result. Review feedback goes back to the implementer, who fixes the issues and returns the work for another check. Each role can continue its own conversation while the team moves the task forward.

The CLIs run on your own computers and servers, using their existing tools and login sessions. Workbench coordinates assignments, feedback, code deliveries, and artifacts in one project conversation.

> Development preview (`0.4.0`), intended for a single trusted operator or a small trusted team. Workbench drives native CLIs; model access, billing, and quotas follow each provider's terms. See [current boundaries](#limitations-and-roadmap).

## From individual assistants to a working team

Using several coding assistants often means copying the same requirements into different terminals, forwarding review comments, finding the right code version, and asking who is waiting for whom.

Workbench makes those handoffs part of the project workflow:

- **Take turns on the same task.** Pass a plan to an implementer, send the implementation for review, and return feedback for revision.
- **Split independent work.** Assign separate parts of a project to different roles, subject to device capacity and workspace rules.
- **Review across models.** Ask other roles to inspect an implementation independently, then send the findings back to its author.
- **Keep the next step visible.** Track assignments, pending replies, task records, and execution details in one place.

Address a role directly with `@role`, or ask the project manager to coordinate the work. A role combines a device, CLI, model, reasoning setting, and responsibility. You choose the team and its workflow.

## A typical collaboration

Ask the manager:

> Add a quotation import feature. Agree on a plan, assign implementation, have two other roles review it independently, then test the fixes and report the result. Do not merge or deploy.

The team can work through the following cycle:

```mermaid
flowchart LR
    Request[Your request] --> Plan[Plan]
    Plan --> Build[Implement]
    Build --> Review[Independent reviews]
    Review -->|Changes requested| Build
    Review -->|Ready to verify| Test[Test]
    Test -->|Issues found| Build
    Test -->|Verified| Report[Report and artifacts]
```

| Stage | Example role | What it passes on |
| --- | --- | --- |
| Plan | Claude Code as manager | Scope, acceptance criteria, and assignments |
| Implement | Codex as developer | Code version, changes, and self-check results |
| Review | Grok and Antigravity as reviewers | Independent findings against the assigned version |
| Revise | Original developer | Fixes and responses to review findings |
| Verify and report | Tester and manager | Test evidence, artifacts, and remaining issues |

These are example assignments, not fixed vendor roles. Any supported CLI can take a suitable responsibility. Handoffs carry task instructions, code versions, artifacts, and feedback; the CLIs keep their own native sessions. The manager can coordinate the next step through Workbench's collaboration tools. Merge, deployment, and other production actions require separate explicit authorization.

## What you can do

### Collaborate in a project group chat

Keep requirements, assignments, discussion, and final results together. Use direct mentions, manager coordination, role consultations, or whole-task transfers to decide who works next.

Each group has its own task list with descriptions, steps, owners, status, and change history. Task records describe the work; execution queues and run records show what is actually running or waiting. A successful process exit does not by itself mean the task passed review.

### Continue native conversations

The Sessions view lets you browse and continue supported native CLI conversations. Read replies, expand tool calls on demand, and queue follow-up messages while a reply is running.

Every new session gets a unique folder under the selected device's `native-sessions` directory, separate from managed projects and other sessions, even when titles match. This applies to page and iTerm creation. Retrying the same creation reuses its folder; continuing an existing conversation keeps its original folder and history. Creating a session does not enable file synchronization.

New sessions opened on the page use the device's existing Worker connection; a cloud Worker does not need a separate SSH registration. Preparing a cloud iTerm launch still requires SSH access.

Claude and Codex also support side questions for a separate discussion alongside the main flow. History, side-question, and quota capabilities vary by CLI.

### Hand work between your computer and servers

Run planning or interactive work on your computer and assign another role to a server with the required environment. Each execution device has a Worker that drives its installed CLIs and accesses its configured project directories.

Bind the corresponding project folders on participating devices. Use fixed-commit Git deliveries when a reviewer or collaborator needs an exact code version. Optional source synchronization exchanges saved files within explicitly configured scopes, with visible status and conflict records. Synchronization is enabled per project scope; it does not commit, merge, or deploy code. When all participating Workers support bounded transfers, both manual and automatic synchronization split large changes into ordered parts instead of rejecting the project for having more than 10,000 files. File-size, storage, exclusion, and conflict protections still apply. Home automatically reclaims unused synchronization content during maintenance and before a storage-limit refusal, while preserving active transfers, retained versions and conflict evidence.

An existing Syncthing folder pair can be observed through a private `DATA_DIR/external-file-sync.json` mapping. Its live status replaces the built-in sync-off indicator without enabling another transfer engine. The project sync panel shows observed counts and connection state; synchronization controls remain with Syncthing. See the architecture document for configuration.

Cross-device collaboration passes work and its inputs between roles. It does not migrate a vendor's native session to another device.

### Inspect the work and its outputs

The web interface follows the device’s light or dark appearance automatically, including live changes while the page is open. Chat, settings, file previews and mobile input controls use the same appearance.

Open run details to inspect inputs, CLI output, tool calls, and results. Media reads retain verified continuous file prefixes on Home, so later playback or downloads reuse saved bytes and fetch the missing suffix; files beyond the cache limit still stream without a saved copy. View Markdown reports and file previews in a dialog or side panel. Long history and tool details load on demand.

Bare filenames in replies use explicit file paths from the same turn's tool records when the match is unique. Group-chat history loads those records on a file click; ambiguous names remain unresolved. Completed session replies stay visible while native history catches up, then return to the history view without duplicating the final answer.

Device availability, queues, failures, and supported Token or quota information help you decide where to assign the next task. Usage figures are observations from the CLI environment, not provider billing statements.

### Keep your existing CLI environment

Install and log in to the CLIs on the devices where they will run. Workbench uses those native runtimes and their tool environments. GitHub and Gitee repository hosting are supported.

Linux Codex project scope enables network access and reads the actual target of `/etc/resolv.conf` when it is a symlink, including systemd-resolved setups. External tools and MCP connections still need to be configured on the execution device; logging in does not copy another device's tools.

Shared project rules and preferences belong in the project's `AGENTS.md`, with a `CLAUDE.md` pointer where needed. Workbench also keeps one platform memory shared by every project (environment, accounts and secrets, lessons, procedures, personal details, platform-wide decisions), organized once a day from all group chats by a separately configured small model (which also merges duplicates daily) and searched with `wb memory search` by roles and by CLIs on the Sessions page; a project's own decisions stay in its chat history (`wb history search`). It is not added to prompts and can be edited in Settings → Memory. Existing instruction files are preserved when a project is prepared. Role-specific instructions can define how each collaborator contributes.

## Architecture overview

| Component | Responsibility |
| --- | --- |
| **Home** | Serves the web UI, stores project and conversation state, and coordinates queues and assignments |
| **Worker** | Runs on an execution device, discovers its CLIs, executes work, and reports events and results |
| **Native CLI** | Uses its own session, model access, tools, and local project files to perform the assigned work |

A single-machine setup runs Home and Worker together as separate processes. For multiple devices, keep one Home and connect Workers from the other computers or servers over authenticated WebSockets.

The implementation uses JavaScript ES modules, Node.js, SQLite, and a browser/PWA interface with no front-end build step. See the [architecture document](docs/ARCHITECTURE.md) for implementation boundaries.

## Requirements

- Node.js **22.16 or later**. The repository's `.nvmrc` pins a tested version.
- Git.
- At least one supported CLI installed and logged in on each execution device: `codex`, `claude`, `grok`, or `agy`.
- For a collaboration team, configure multiple roles using the CLIs and models available on your devices.
- SSH access is optional and used by the remote-device onboarding helper.

## Quick start (single machine)

```sh
git clone --branch v0.4.0-personal.1 https://github.com/zhangyc-413/workbench-personal.git
cd workbench-personal
nvm use          # optional, if you use nvm
npm ci
mkdir -p "$HOME/workbench-projects"
export WORKER_ROOTS="$HOME/workbench-projects"
export WORKSPACE_ROOT="$HOME/workbench-projects"
npm run dev
```

Open [http://127.0.0.1:4317](http://127.0.0.1:4317). The default listener is local only. `npm run dev` starts Home and Worker as separate processes.

In the UI:

1. Open Settings → Devices and CLIs and check that your device and installed CLIs are detected.
2. Create a project, choose its folder, and select a device, CLI, and model for the manager.
3. Configure the repositories and roles yourself, or ask the manager to propose them and confirm its configuration cards.
4. Give the manager a goal, or `@` a role to start a specific assignment.

To start the processes separately:

```sh
npm start        # Home
npm run worker   # Worker, in another terminal
```

## Configuration

Use [`.env.example`](.env.example) as a reference. Workbench does not automatically load `.env` files; export settings in your shell or service manager.

| Setting | Purpose |
| --- | --- |
| `HOST`, `PORT` | Home listener; defaults to `127.0.0.1:4317` |
| `DATA_DIR` | Home's private data directory |
| `API_TOKEN` | Browser/API access token; required for non-loopback listening |
| `WORKER_TOKEN` | Shared Worker registration credential; must match Home |
| `HOME_URL` | Worker's WebSocket connection to Home |
| `WORKER_ROOTS` | Project directories the Worker may use |
| `WORKSPACE_ROOT` | Default parent for new projects and independent sessions; use a dedicated folder, not an existing project's root |
| `WORKER_READ_ROOTS` | Optional extra folders (e.g. a local service's logs) that roles on other devices, and Sessions-page CLIs on any device, may read with `wb device ls/read`; read-only, separated like `PATH` |
| `WORKER_DATA_DIR` | Private data directory for that Worker |
| `WORKER_CONCURRENCY` | Device execution capacity; defaults to `2` |
| `CODEX_BIN`, `CLAUDE_BIN`, `GROK_BIN`, `AGY_BIN` | Optional paths to CLI executables |

Keep runtime data, credentials, logs, and private validation artifacts out of Git. Do not share one Worker data directory between processes. For remote access, use an SSH tunnel or an HTTPS/WSS reverse proxy; Home does not terminate TLS itself.

The [operating guide](docs/OPERATING-GUIDE.md) covers device onboarding, account configuration, multi-device setup, data handling, and release procedures.

## Limitations and roadmap

- **Trusted operators.** Browsers share Home credentials; there is no per-user identity or enterprise tenant isolation. Managed CLI execution uses automatic approval modes, with no native per-step approval. Workbench is not an OS sandbox for untrusted code.
- **One Home.** Automatic replication and failover are not implemented. An unavailable or sleeping Home cannot dispatch work.
- **CLI differences.** Available models, history, side questions, and quota reporting depend on the CLI and device. Missing information is not evidence of zero usage or a completed task.
- **Explicit file synchronization.** Synchronization must be configured. The optional simple metadata mode supports two devices and retains the Mac display-side requirement; compare its behavior and limits in the [file-sync contract](docs/design-source-sync.md).
- **Concurrent editing.** The project's Concurrent edits switch is off by default. Turning it on does not add file-level locks; roles editing the same files can overwrite one another's changes.
- **Task handoffs, not native-session migration.** Roles can exchange assignments, fixed code versions, and artifacts across devices. Controlled cross-device migration of native sessions remains a [design](docs/design-session-handoff.md).
- **Review and release remain distinct.** A completed run, an accepted review, a merged commit, and a deployed version are separate outcomes. The collaboration workflow does not grant automatic merge or deployment permission.

## Development

```sh
npm ci
npm run check    # JavaScript syntax checks
git diff --check
```

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md) before contributing. Behavior changes also need verification appropriate to the affected flow; syntax checks alone do not establish runtime correctness.

## Documentation

- [Operating guide](docs/OPERATING-GUIDE.md): setup, accounts, devices, and release procedures.
- [Architecture](docs/ARCHITECTURE.md): current components and interface boundaries.
- [Product scope](docs/PRD.md): goals and planned capabilities.
- [Coordination design](docs/design-coordination.md): manager and role collaboration.
- [Review delivery](docs/design-review-delivery.md): fixed-version review inputs.
- [Source synchronization](docs/design-source-sync.md): scope, conflict handling, and current limits.
- [Documentation index](docs/README.md): detailed feature contracts and designs.

## License

[MIT](LICENSE).

Computer connection also supports an explicitly configured SSH-only trial: enrollment uses an existing loopback Home tunnel, then the scoped helper key carries synchronization and a separate local Home forward. Cloud project creation can select existing folders within the Worker’s configured roots; it does not enable whole-server browsing. See `docs/COMPUTER-CONNECT.md`.
