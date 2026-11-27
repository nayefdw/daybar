# Daybar on Windows

## Install and open

1. Open the repository's **Actions → Windows desktop** page and select a
   successful build of the version you want.
2. Download **Daybar-Windows-x64** from Artifacts (GitHub sign-in may be
   required) and extract the download.
3. Run **Daybar-0.12.0-Setup-x64.exe** and choose an installation folder.
   This is a per-user installation; administrator rights are not needed.
4. Open Daybar from Start or the desktop shortcut. On first launch choose
   **Create account**. This is an account on your own local Daybar instance.

Windows 10/11 on an Intel or AMD 64-bit PC is the target. Docker, a server,
a browser tab, and an installed copy of Node.js are not needed. The ZIP
alternative contains the full application: extract all of it, then run
`Daybar.exe`. Its profile is still stored in AppData, not beside the EXE.

This build is not code-signed. Windows may show an unknown-publisher or
SmartScreen prompt. Check the repository/build you downloaded and the
included SHA256SUMS.txt before deciding whether to run it.

## Everyday use

The interface is the Daybar from this repository: Today, Upcoming, Calendar,
Tasks, Habits and Notes, with the existing documents, databases and
whiteboards. Normal local planning works without internet. External links,
AI providers and other configured online integrations need connectivity.

- Close the window to keep Daybar running in the system tray.
- Double-click the tray icon, or press **Ctrl+Shift+D**, to show it.
- Use **File → Quit** or **Quit Daybar** in the tray menu to stop it fully.
- Use the tray menu to optionally start Daybar when you sign in to Windows.
- Use **View** to zoom, reload or enter full screen.

The desktop app creates a separate local instance. It does not automatically
connect to an existing hosted Daybar, iCloud or ThisDay. Existing ThisDay
JSON import/export remains available in the planner. The iPhone Shortcut
cannot reach this loopback-only instance over Wi-Fi; use file transfer or
your existing hosted instance for that workflow. Remote SSO and browser
handoff are not configured by this local desktop shell; use a local
email/password account.

## Your data and backups

Data is in `%APPDATA%\Daybar\data` (SQLite, uploads, backups and other server
files). **File → Open data folder** opens it. Your login session and window
preferences live in `%APPDATA%\Daybar` alongside that folder.

Before a manual backup, choose **Quit Daybar**, wait for the tray icon to
disappear and the process to exit, then copy the entire `data` directory.
Restore it only while Daybar is fully stopped. Copy all files, including
SQLite's journal files if present; do not copy just flowplan.sqlite while
the application is running. Keep backups secure because they contain your
private planner data.

Installing a newer version and uninstalling the application retain your
profile. Back it up before upgrades; database migrations may make a later
downgrade incompatible. Updates are installed manually.

## If it does not start

Quit any existing Daybar process and try again. The app shows a startup
error rather than a blank window. **Help → Open diagnostics folder** opens
the folder containing `desktop.log` (and its previous rotated copy).
Never delete `data` as a troubleshooting step. If a window was saved on a
monitor that is no longer connected, Daybar recentres it on an available
display automatically.

For source builds and verification, see [desktop/README.md](../../desktop/README.md).
