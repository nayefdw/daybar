# Daybar for Windows

This shell runs the existing Daybar production application unchanged in a
sandboxed Electron window. Its server uses a bundled standard Node.js
runtime, keeping `node:sqlite`, worker threads and native modules on the
same ABI used during the Windows build.

## Build (Windows x64)

Install Node.js 26 and Git, then from the repository root:

```powershell
npm ci
npm install --prefix desktop
npm --prefix desktop test
npm run typecheck
npm --prefix desktop run build
npm --prefix desktop run smoke
```

The build reads the root app version, builds Next.js, copies the standalone
server and assets, dereferences Windows junctions, includes the Node
runtime and licenses, creates the existing Daybar icon in PNG/ICO format,
and produces an NSIS installer and ZIP under `desktop/dist/`.

`npm --prefix desktop start` launches the prepared bundle for development.
Rebuild after web changes. `DAYBAR_USER_DATA` optionally sets a separate
profile for tests. `DAYBAR_TEST_EXE` selects an installed executable for
the smoke test; neither variable is needed by normal users.

## Runtime

- The server listens only on `127.0.0.1` and retains normal Daybar account
  authentication and origin checks.
- `%APPDATA%\Daybar\data` holds SQLite, uploads, and all server-side data.
  Chromium's session and storage live in the same profile, outside the
  installation. No writable user data belongs under Program Files.
- One desktop instance owns the profile. A second launch focuses it.
- The last local port is reused where available. Port conflicts choose a
  free port; readiness checks the new server's random instance header.
- Close hides to the tray; Quit drains the server over IPC. Parent death
  also triggers shutdown. The eight-second server drain has a twelve-second
  force-stop ceiling.
- The renderer has no Node integration, preload bridge or IPC access.
  It is sandboxed and isolated; external HTTP(S)/mailto links open through
  Windows, and other external protocols are refused.
- Voice recording requests explicit microphone permission. Camera and
  unrelated permission requests are denied.
- Logs rotate at 2 MiB. `desktop.json` retains the chosen port and window
  geometry. Removing that file only resets desktop preferences.

## Validation and distribution

The Windows workflow runs desktop tests, the app typecheck, planner tests,
a production build, and Playwright against the real unpacked executable.
It creates a real account, adds a task through the UI, verifies the sandbox
and tray behavior, quits, restarts twice, and checks session/task/completion
persistence. It then installs the NSIS package into a path containing
spaces and repeats the executable checks. Failed checks do not publish the
installer artifact; screenshots and the resolved desktop dependency lock
are uploaded separately for diagnosis/reproducibility.

Direct desktop dependency versions are pinned. The first install resolves
transitive dependencies with npm; preserve the generated package-lock.json
from the build evidence when reproducing that exact toolchain.

The installer is unsigned unless a maintainer configures a signing
certificate. No automatic updates are enabled. Install a newer build over
the old one; back up the data folder before downgrading or updating.

The packaged `resources/bundle/source/daybar-source.zip` contains the Git
commit used for the build. Root LICENSE and third-party notices ship beside
it, Node's license beside its executable, and Electron's notices beside
Daybar.exe. Keep these with redistribution.
