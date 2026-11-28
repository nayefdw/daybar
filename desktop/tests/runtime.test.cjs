const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { EventEmitter } = require('node:events');
const { readSettings, writeSettings, isAppURL, externalURL, choosePort, serverEnvironment, waitForServer, stopServer } = require('../runtime.cjs');

test('only exact local origins stay inside the privileged app window', () => {
  const origin = 'http://127.0.0.1:47831';
  assert.equal(isAppURL(origin + '/#plan/today', origin), true);
  for (const url of ['http://127.0.0.1:47832/', 'http://127.0.0.1.evil.test:47831', 'https://evil.test', 'javascript:alert(1)', 'file:///C:/Windows']) assert.equal(isAppURL(url, origin), false);
  assert.equal(externalURL('https://example.com/a'), 'https://example.com/a');
  assert.equal(externalURL('mailto:hello@example.com'), 'mailto:hello@example.com');
  for (const url of ['file:///C:/Windows/system32/cmd.exe', 'javascript:alert(1)', 'ms-settings:privacy', 'https://user:password@example.com']) assert.equal(externalURL(url), null);
});

test('port conflicts select another loopback port without connecting to the other service', async () => {
  const occupied = net.createServer();
  await new Promise(resolve => occupied.listen(0, '127.0.0.1', resolve));
  try {
    const port = await choosePort(occupied.address().port);
    assert.notEqual(port, occupied.address().port);
    assert.ok(port >= 1024 && port <= 65535);
  } finally { await new Promise(resolve => occupied.close(resolve)); }
});

test('desktop settings survive restarts and malformed settings recover safely', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daybar-settings-'));
  const file = path.join(dir, 'desktop.json');
  try {
    assert.deepEqual(readSettings(file), {});
    writeSettings(file, { port: 47831, bounds: { x: 0, y: 10, width: 1200, height: 800 } });
    assert.equal(readSettings(file).bounds.width, 1200);
    fs.writeFileSync(file, '{broken');
    assert.deepEqual(readSettings(file), {});
    fs.writeFileSync(file, '[]');
    assert.deepEqual(readSettings(file), {});
  } finally { fs.rmSync(dir, { recursive: true }); }
});

test('server uses its own persistent directory and does not inherit dangerous configuration', () => {
  const env = serverEnvironment({ PATH: 'tools', SystemRoot: 'C:\\Windows', DATABASE_URL: 'postgres://other', FLOWPLAN_DATA_DIR: 'other', AUTH_PROXY_USER_HEADER: 'x-user', NODE_OPTIONS: '--inspect', ELECTRON_RUN_AS_NODE: '1' }, { port: 5555, dataDir: 'C:\\Daybar\\data', instance: 'nonce' });
  assert.equal(env.HOSTNAME, '127.0.0.1');
  assert.equal(env.APP_URL, 'http://127.0.0.1:5555');
  assert.equal(env.FLOWPLAN_DATA_DIR, 'C:\\Daybar\\data');
  assert.equal(env.SystemRoot, 'C:\\Windows');
  for (const key of ['DATABASE_URL', 'AUTH_PROXY_USER_HEADER', 'NODE_OPTIONS', 'ELECTRON_RUN_AS_NODE']) assert.equal(env[key], undefined);
});

test('readiness verifies the launched process, not an unrelated service', async t => {
  let instance = 'wrong';
  t.mock.method(globalThis, 'fetch', async () => new Response('{}', { headers: { 'X-Daybar-Instance': instance } }));
  const origin = 'http://127.0.0.1:47831';
  const child = { exitCode: null, signalCode: null };
  await assert.rejects(waitForServer(origin, 'expected', child, 100));
  instance = 'expected';
  await waitForServer(origin, 'expected', child, 1000);
  await assert.rejects(waitForServer(origin, 'expected', { ...child, exitCode: 1 }, 1000), /exited/);
});

test('shutdown uses the IPC drain on Windows and waits for the child to exit', async () => {
  const child = new EventEmitter();
  child.exitCode = child.signalCode = null;
  child.connected = true;
  child.send = (message, callback) => {
    assert.deepEqual(message, { type: 'shutdown' });
    callback();
    setImmediate(() => child.emit('exit', 0));
  };
  child.kill = () => assert.fail('graceful shutdown should not force-kill');
  await stopServer(child);
  await stopServer(null);
});
