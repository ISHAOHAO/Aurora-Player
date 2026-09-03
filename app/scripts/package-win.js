// 构建中间文件留在 .release-build，只将可交付文件汇集到 release/v<version>。
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const appDir = path.resolve(__dirname, '..');
const root = path.resolve(appDir, '..');
const { version } = require('../package.json');
const lock = require('../package-lock.json');
if (!/^\d+\.\d+\.\d+$/.test(version) || lock.version !== version || lock.packages[''].version !== version) {
  throw new Error('应用版本和锁文件版本必须一致，且为三段式数字版本。');
}
const stage = path.join(root, '.release-build', `v${version}`);
const dest = path.join(root, 'release', `v${version}`);
const noteName = `RELEASE-NOTES-v${version}.md`;
const notes = path.join(root, 'docs', 'releases', noteName);
if (!fs.existsSync(notes)) throw new Error(`请先编写版本说明：${notes}`);
const names = [`AuroraPlayer-Setup-${version}.exe`, `AuroraPlayer-Setup-${version}.exe.blockmap`, `AuroraPlayer-Setup-${version}.msi`, 'latest.yml'];
if (names.some(name => fs.existsSync(path.join(dest, name)))) {
  throw new Error(`该版本已有产物，请先归档或使用新版本号：${dest}`);
}
const cli = path.join(root, 'build-tools', 'node_modules', 'electron-builder', 'cli.js');
const args = [cli, '--win', 'nsis', 'msi', '--publish', 'never'];
if (fs.existsSync(path.join(appDir, 'node_modules', 'electron', 'dist', 'electron.exe'))) {
  args.push('--config.electronDist=node_modules/electron/dist');
}
const result = spawnSync(process.execPath, args, { cwd: appDir, stdio: 'inherit', windowsHide: true });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
const manifest = fs.readFileSync(path.join(stage, 'latest.yml'), 'utf8');
if (!manifest.includes(`version: ${version}\n`) && !manifest.includes(`version: ${version}\r\n`)) throw new Error('构建清单版本不一致');
const installer = fs.readFileSync(path.join(stage, names[0]));
const hash = crypto.createHash('sha512').update(installer).digest('base64');
if (!manifest.includes(`sha512: ${hash}`) || !manifest.includes(`size: ${installer.length}`)) throw new Error('更新清单与 EXE 不匹配');
for (const name of names) fs.accessSync(path.join(stage, name));
fs.mkdirSync(dest, { recursive: true });
for (const name of names) fs.copyFileSync(path.join(stage, name), path.join(dest, name));
fs.copyFileSync(notes, path.join(dest, noteName));
const sums = [...names, noteName].map(name => `${crypto.createHash('sha256').update(fs.readFileSync(path.join(dest, name))).digest('hex')}  ${name}`).join('\n') + '\n';
fs.writeFileSync(path.join(dest, 'SHA256SUMS.txt'), sums);
console.log(`\n版本 ${version} 已汇集到 ${dest}\n构建中间文件：${stage}\n未上传附件，未修改生产更新清单。`);
