// Also usable by a Windows user to assemble downloaded-release URLs into an EXE/MSI.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { download, validate } = require('../main/split-update');
async function main() {
  const source = process.argv[2];
  if (!source) throw new Error('用法: node app/scripts/verify-split-release.js <清单.json> [输出.exe或.msi]');
  const manifest = validate(JSON.parse(fs.readFileSync(source, 'utf8')));
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-release-verify-'));
  try {
    const file = await download(manifest, cache);
    if (process.argv[3]) fs.copyFileSync(file, path.resolve(process.argv[3]), fs.constants.COPYFILE_EXCL);
    console.log('所有远程分片及合并文件 SHA-512 验证通过，版本', manifest.version);
  } finally { fs.rmSync(cache, { recursive: true, force: true }); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
