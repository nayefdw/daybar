// Tests the real packaged executable, with an isolated profile, using the
// normal sign-up UI and planner API. No demo auth or database seeding.
import { _electron as electron, expect } from '@playwright/test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const executablePath = process.env.DAYBAR_TEST_EXE || join(desktop, 'dist/win-unpacked/Daybar.exe');
const profile = mkdtempSync(join(tmpdir(), 'daybar-desktop-test-'));
const results = join(desktop, 'test-results');
mkdirSync(results, { recursive: true });
const env = { ...process.env, DAYBAR_USER_DATA: profile };
delete env.ELECTRON_RUN_AS_NODE;
let application, page, serverOrigin, taskId, workspaceId;
const taskTitle = 'Desktop persistence check';
const today = new Date().toISOString().slice(0, 10);

async function launch() {
  application = await electron.launch({ executablePath, env, timeout: 180000 });
  page = await application.firstWindow();
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => console.error('Renderer error:', error.message));
  page.on('response', async response => {
    if (new URL(response.url()).pathname === '/api/planner') {
      console.log('Planner response:', response.status(), await response.text().catch(() => '<unavailable>'));
    }
  });
  await page.waitForURL(url => url.protocol === 'http:', { timeout: 180000 });
  serverOrigin = new URL(page.url()).origin;
}

async function api(url, body) {
  return page.evaluate(async ({ url, body }) => {
    const response = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
    if (!response.ok) throw new Error(`${url}: ${response.status} ${await response.text()}`);
    return response.json();
  }, { url, body });
}

async function quit() {
  const closed = application.waitForEvent('close', { timeout: 30000 });
  await application.evaluate(({ app }) => { setTimeout(() => app.quit(), 10); });
  await closed;
  application = undefined;
  await assert.rejects(fetch(serverOrigin + '/api/health', { signal: AbortSignal.timeout(1500) }), 'Quitting must stop the bundled server.');
}

try {
  await launch();
  await page.goto(serverOrigin + '/register');
  await page.locator('input[name=name]').fill('Desktop Test');
  await page.locator('input[name=email]').fill('desktop@example.test');
  await page.locator('input[name=password]').fill('Desktop-smoke-test-2026!');
  await page.locator('form.login-form').getByRole('button', { name: /Create account|Konto erstellen/i }).click();
  await expect(page.locator('.sidebar')).toBeVisible({ timeout: 60000 });
  const skip = page.getByRole('button', { name: /^(Skip|Überspringen)$/ });
  await skip.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  if (await skip.isVisible()) await skip.click();
  await page.getByRole('navigation', { name: /^(Planner|Planer)$/ }).getByRole('button', { name: /^(Today|Heute)$/ }).click();
  // The first-visit offline prompt appears after account setup and can
  // take focus. Dismiss it before exercising the keyboard capture flow.
  const offlinePrompt = page.getByRole('button', { name: /^(Don't ask again|Nicht mehr fragen)$/ });
  await offlinePrompt.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  if (await offlinePrompt.isVisible()) await offlinePrompt.click();
  const capture = page.locator('.db-capture input').first();
  await capture.fill(taskTitle);
  await expect(capture).toHaveValue(taskTitle);
  const saved = page.waitForResponse(response => new URL(response.url()).pathname === '/api/planner' && response.request().method() === 'POST', { timeout: 30000 });
  await capture.press('Enter');
  const response = await saved;
  assert.ok(response.ok(), `Task creation: ${response.status()} ${await response.text()}`);
  await expect(page.getByText(taskTitle, { exact: true }).first()).toBeVisible({ timeout: 30000 });
  const boot = await api('/api/bootstrap');
  workspaceId = boot.workspace.id;
  const state = await api(`/api/planner/state?workspace=${workspaceId}&today=${today}`);
  taskId = state.items.find(item => item.title === taskTitle)?.id;
  assert.ok(taskId, 'The UI-created task reached the actual SQLite database.');
  await page.screenshot({ path: join(results, 'daybar-windows.png') });
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  assert.equal(await page.evaluate(() => typeof window.process), 'undefined');
  const preferences = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences());
  assert.equal(preferences.sandbox, true);
  assert.equal(preferences.contextIsolation, true);
  assert.equal(preferences.nodeIntegration, false);

  // Closing keeps the local server alive in the tray; quitting stops it.
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), false);
  assert.ok((await fetch(serverOrigin + '/api/health/ready')).ok);
  await quit();
  assert.ok(existsSync(join(profile, 'data/flowplan.sqlite')));

  await launch();
  await expect(page.locator('.sidebar')).toBeVisible({ timeout: 60000 });
  const after = await api(`/api/planner/state?workspace=${workspaceId}&today=${today}`);
  assert.equal(after.items.find(item => item.id === taskId)?.title, taskTitle);
  await api('/api/planner', { action: 'item.done', workspaceId, today, id: taskId, done: true });
  await quit();

  await launch();
  await expect(page.locator('.sidebar')).toBeVisible({ timeout: 60000 });
  const completed = await api(`/api/planner/state?workspace=${workspaceId}&today=${today}`);
  assert.ok(completed.items.find(item => item.id === taskId)?.doneAt, 'Completion must survive another restart.');
  await quit();
  console.log('PASS: packaged launch, sign-up, task creation, sandbox, tray, clean shutdown, persistent session and task completion across two restarts.');
} catch (error) {
  if (page && !page.isClosed()) {
    console.error('Planner diagnostics:', await api('/api/planner/state').catch(error => error.message));
  }
  if (page && !page.isClosed()) await page.screenshot({ path: join(results, 'failure.png') }).catch(() => {});
  const log = join(profile, 'desktop.log');
  if (existsSync(log)) console.error(readFileSync(log, 'utf8').slice(-18000));
  throw error;
} finally {
  if (application) await application.close().catch(() => {});
}
