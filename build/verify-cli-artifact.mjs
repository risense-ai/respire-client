import {createHash} from 'node:crypto';
import {copyFileSync, readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';

// Bind downloaded release-mode binaries to the requested source commit before extraction.
const [directory, target, gitSha] = process.argv.slice(2);
if (!directory || !target || !/^[0-9a-f]{40}$/.test(gitSha || '')) {
  throw new Error('Usage: node verify-cli-artifact.mjs <directory> <CLI target> <40-character CLI SHA>');
}
const root = resolve(directory);
const metadata = JSON.parse(readFileSync(join(root, `cli-build-${target}.json`), 'utf8'));
const suffix = target.includes('windows') ? '.exe' : '';
const binary = `rsrs-${target}${suffix}`;
const runtime = `rsrs-${target}-runtime.tar.gz`;
if (metadata.schema_version !== 1 || metadata.git_sha !== gitSha || metadata.target !== target
    || typeof metadata.version !== 'string' || !metadata.version
    || metadata.binary_file !== binary || metadata.runtime_file !== runtime) {
  throw new Error('CLI artifact metadata does not match the requested source commit and target');
}
for (const [name, digest] of [[binary, metadata.binary_sha256], [runtime, metadata.runtime_sha256]]) {
  if (typeof digest !== 'string' || !/^[0-9a-f]{64}$/.test(digest)
      || createHash('sha256').update(readFileSync(join(root, name))).digest('hex') !== digest) {
    throw new Error(`CLI artifact checksum mismatch: ${name}`);
  }
}
copyFileSync(join(root, binary), join(root, `rsrs${suffix}`));
console.log(`Verified release-mode CLI ${metadata.version} ${target} at ${gitSha}`);
