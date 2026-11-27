import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(desktop, '..');
if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Build on Windows x64; the server contains platform-specific native modules.');
if (Number(process.versions.node.split('.')[0]) < 26) throw new Error('Build with Node.js 26 or newer, matching CI.');

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', windowsHide: true, env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}).`);
}

// Keep installer and the web app on the same version.
const manifest = JSON.parse(readFileSync(join(desktop, 'package.json'), 'utf8'));
manifest.version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
writeFileSync(join(desktop, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');

run(process.execPath, [join(root, 'node_modules/next/dist/bin/next'), 'build']);
const standalone = join(root, '.next/standalone');
if (!existsSync(join(standalone, 'server.js'))) throw new Error('Next.js did not produce its standalone server.');

// Only remove the known generated folder, never a caller-supplied path.
const bundle = join(desktop, 'bundle');
if (dirname(bundle) !== desktop) throw new Error('Invalid build directory.');
rmSync(bundle, { recursive: true, force: true });
mkdirSync(bundle, { recursive: true });
// Windows junctions can contain absolute paths into the build checkout.
// Dereference them so the installed application is fully relocatable.
cpSync(standalone, join(bundle, 'server'), { recursive: true, dereference: true });
cpSync(join(root, '.next/static'), join(bundle, 'server/.next/static'), { recursive: true, dereference: true });
cpSync(join(root, 'public'), join(bundle, 'server/public'), { recursive: true, dereference: true });
// Never ship a developer's environment or database if tracing picked it up.
for (const name of ['.env', '.env.local', '.env.production', '.env.production.local', 'data']) {
  rmSync(join(bundle, 'server', name), { recursive: true, force: true });
}
cpSync(join(desktop, 'server-runner.cjs'), join(bundle, 'server-runner.cjs'));
mkdirSync(join(bundle, 'runtime'));
cpSync(process.execPath, join(bundle, 'runtime/node.exe'));
const nodeLicense = join(dirname(process.execPath), 'LICENSE');
if (!existsSync(nodeLicense)) throw new Error('Node distribution LICENSE is missing beside node.exe.');
cpSync(nodeLicense, join(bundle, 'runtime/LICENSE'));
for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'licenses']) cpSync(join(root, name), join(bundle, name), { recursive: true });
mkdirSync(join(bundle, 'source'));
run('git', ['archive', '--format=zip', '--output=' + join(bundle, 'source/daybar-source.zip'), 'HEAD']);
writeFileSync(join(bundle, 'source/README.txt'), 'Daybar is AGPL-3.0-only. Complete source for this build is in daybar-source.zip. See desktop/README.md for build instructions.\n');

mkdirSync(join(desktop, 'assets'), { recursive: true });
const { default: sharp } = await import('sharp');
const png = await sharp(join(root, 'public/icon.svg')).resize(256, 256).png().toBuffer();
writeFileSync(join(desktop, 'assets/icon.png'), png);
// ICO entry with a 256×256 PNG payload (supported by Windows Vista+).
const ico = Buffer.alloc(22);
ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4);
ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12);
ico.writeUInt32LE(png.length, 14); ico.writeUInt32LE(22, 18);
writeFileSync(join(desktop, 'assets/icon.ico'), Buffer.concat([ico, png]));
run(process.execPath, [join(desktop, 'node_modules/electron-builder/cli.js'), '--win', '--x64', '--publish', 'never'], desktop);
