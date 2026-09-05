const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { LIMIT, validate } = require('../main/split-update');
async function splitRelease(file, version, out, base, partSize = LIMIT) {
  if (!Number.isInteger(partSize) || partSize < 1 || partSize > LIMIT) throw new Error('无效分片大小');
  await fs.promises.mkdir(out, { recursive: true });
  const full = crypto.createHash('sha512'), parts = [];
  const input = await fs.promises.open(file, 'r');
  let size = 0;
  try {
    let eof = false;
    while (!eof) {
      const buffer = Buffer.alloc(partSize); let used = 0;
      while (used < partSize) {
        const { bytesRead } = await input.read(buffer, used, partSize - used, null);
        if (!bytesRead) { eof = true; break; }
        used += bytesRead;
      }
      if (!used) break;
      const data = buffer.subarray(0, used);
      const name = `${path.basename(file)}.part${String(parts.length + 1).padStart(3, '0')}`;
      await fs.promises.writeFile(path.join(out, name), data);
      full.update(data); size += used;
      parts.push({ url: new URL(encodeURIComponent(name), base).href, size: used, sha512: crypto.createHash('sha512').update(data).digest('base64') });
    }
  } finally { await input.close(); }
  const manifest = validate({ schema: 1, version, platform: 'win32-x64', size, sha512: full.digest('base64'), parts });
  await fs.promises.writeFile(path.join(out, 'latest-split.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
module.exports = { splitRelease };
