const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const manifest = require('../build-resources/runtime-manifest.json');
const runtime = path.resolve(__dirname, '../../runtime/mpv');
for (const [file, expected] of Object.entries(manifest.files)) {
  const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(runtime, file))).digest('hex');
  if (actual !== expected) throw new Error(`Runtime checksum mismatch: ${file}. Review the runtime upgrade before changing the manifest.`);
}
console.log('mpv runtime: all pinned files verified');
