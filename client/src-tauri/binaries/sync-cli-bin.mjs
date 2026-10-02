import {createHash} from 'node:crypto';
import {chmodSync, copyFileSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, isAbsolute, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
// Consume the CLI build output; the client never checks out private Core.
const [argument, requestedTarget] = process.argv.slice(2);
if (!argument) throw new Error('Usage: node sync-cli-bin.mjs <CLI binary directory after stage-core-runtime> [desktop target]');
const source = resolve(argument), output = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(source,'core-runtime.json'),'utf8'));
if (manifest.schema_version !== 1 || typeof manifest.target !== 'string' || !Array.isArray(manifest.files)) throw new Error('Unsupported Core runtime manifest');
const matrix = JSON.parse(readFileSync(join(output,'../../../contracts/compatibility-matrix.json'),'utf8'));
const target = requestedTarget || manifest.target.replace('linux-musl','linux-gnu');
if (matrix.cliArtifactTargets[target] !== manifest.target) throw new Error('Unsupported CLI/desktop target combination');
const suffix = manifest.target.includes('windows') ? '.exe' : '';
const binary = `rsrs${suffix}`;
for (const name of [`rsrs-${target}${suffix}`,binary]) {
  copyFileSync(join(source,binary),join(output,name));
  chmodSync(join(output,name),0o755);
}
const runtime = join(output,'runtime'); mkdirSync(runtime,{recursive:true});
for (const file of manifest.files) {
  if (isAbsolute(file.path) || /^[A-Za-z]:/.test(file.path) || file.path.includes('\\') || file.path.split('/').some(part=>!part || part==='.' || part==='..')) throw new Error('Unsafe runtime path');
  const bytes = readFileSync(join(source,file.path));
  if (createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw new Error(`Runtime checksum mismatch: ${file.path}`);
  mkdirSync(dirname(join(runtime,file.path)),{recursive:true});
  writeFileSync(join(runtime,file.path),bytes);
  if (!file.path.includes('/')) copyFileSync(join(source,file.path),join(output,file.path));
}
copyFileSync(join(source,'core-runtime.json'),join(runtime,'core-runtime.json'));
// Tauri resource mapping places Windows DLLs next to the bundled sidecar.
const resources = {'binaries/runtime/core-runtime.json':'core-runtime.json'};
for (const file of manifest.files) resources[`binaries/runtime/${file.path}`] = file.path;
const config = {bundle:{resources}};
writeFileSync(join(output,'../tauri.core-runtime.conf.json'),JSON.stringify(config,null,2)+'\n');
console.log(`Staged ${manifest.target} sidecar; bundle with --config src-tauri/tauri.core-runtime.conf.json`);
