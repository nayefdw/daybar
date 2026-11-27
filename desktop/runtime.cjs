'use strict';
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');

function readSettings(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

function writeSettings(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.tmp', JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(file + '.tmp', file);
}

function isAppURL(value, origin) {
  try { return !!origin && new URL(value).origin === origin; } catch { return false; }
}

function externalURL(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function validPort(value) {
  return Number.isInteger(value) && value >= 1024 && value <= 65535;
}

function reservePort(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => {
      const chosen = server.address().port;
      server.close((error) => error ? reject(error) : resolve(chosen));
    });
  });
}

async function choosePort(preferred) {
  try { return await reservePort(validPort(preferred) ? preferred : 47831); }
  catch (error) {
    if (!['EADDRINUSE', 'EACCES'].includes(error.code)) throw error;
    return reservePort(0);
  }
}

// Do not inherit a shell's database, proxy authentication or debug settings.
// This is a self-contained local instance. The OS variables keep native
// libraries, certificates, the locale and temporary directories working.
function serverEnvironment(parent, { port, dataDir, instance }) {
  const env = {};
  for (const [key, value] of Object.entries(parent)) {
    if (/^(systemroot|windir|comspec|path|pathext|temp|tmp|userprofile|appdata|localappdata|programdata|programfiles|programfiles\(x86\)|commonprogramfiles|homedrive|homepath|username|computername|lang|lc_all|tz|ssl_cert_file|ssl_cert_dir|node_extra_ca_certs)$/i.test(key)) env[key] = value;
  }
  return {
    ...env,
    NODE_ENV: 'production',
    HOSTNAME: '127.0.0.1',
    PORT: String(port),
    APP_URL: `http://127.0.0.1:${port}`,
    FLOWPLAN_DATA_DIR: dataDir,
    FLOWPLAN_LOCAL_LOGIN: 'true',
    FLOWPLAN_SHUTDOWN_SECONDS: '8',
    NEXT_TELEMETRY_DISABLED: '1',
    DAYBAR_INSTANCE: instance,
  };
}

async function waitForServer(origin, instance, child, timeout = 120000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error('The Daybar server exited during startup.');
    try {
      const response = await fetch(`${origin}/api/health/ready`, { signal: AbortSignal.timeout(1500) });
      if (response.ok && response.headers.get('x-daybar-instance') === instance) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('The local Daybar server did not become ready within two minutes.');
}

function stopServer(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise(resolve => {
    const timer = setTimeout(() => child.kill(), 12000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
    if (child.connected) child.send({ type: 'shutdown' }, error => { if (error) child.kill(); });
    else child.kill();
  });
}

module.exports = { readSettings, writeSettings, isAppURL, externalURL, validPort, choosePort, serverEnvironment, waitForServer, stopServer };
