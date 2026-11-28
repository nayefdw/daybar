'use strict';
// Runs under the bundled, ordinary Node executable, not Electron's Node.
// node:sqlite and optional native packages retain their normal Node ABI.
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const http = require('node:http');
const emit = http.Server.prototype.emit;
http.Server.prototype.emit = function (event, ...args) {
  if (event === 'request') args[1].setHeader('X-Daybar-Instance', process.env.DAYBAR_INSTANCE);
  return emit.call(this, event, ...args);
};

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  // Windows cannot deliver SIGTERM through child.kill gracefully. Emit it
  // inside Node so Next.js and Daybar both run their existing drain hooks.
  const timer = setTimeout(() => process.exit(0), 10000);
  timer.unref();
  if (process.listenerCount('SIGTERM')) process.emit('SIGTERM');
  else process.exit(0);
}
process.on('message', message => { if (message?.type === 'shutdown') shutdown(); });
// No orphan local server if the desktop process crashes or is force-closed.
process.on('disconnect', shutdown);
import(pathToFileURL(path.join(__dirname, 'server/server.js')).href).catch(error => {
  console.error(error);
  process.exit(1);
});
