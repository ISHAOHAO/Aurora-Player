/** Generate staged Gitee attachments. Never publish a production manifest implicitly. */
const fs = require('node:fs');
const path = require('node:path');
const { splitRelease } = require('./split-release');
const { matches } = require('../main/split-update');
async function main() {
  const version = require('../package.json').version;
  const root = path.resolve(__dirname, '../..');
  const dir = path.join(root, 'release', `v${version}`);
  const yaml = fs.readFileSync(path.join(dir, 'latest.yml'), 'utf8');
  if (yaml.match(/^version:\s*(.+)$/m)?.[1].trim() !== version) throw new Error('清单版本不匹配');
  const exe = `AuroraPlayer-Setup-${version}.exe`;
  const sha512 = yaml.match(/^sha512:\s*(.+)$/m)?.[1].trim();
  const file = path.join(dir, exe);
  if (!sha512 || !await matches(file, fs.statSync(file).size, sha512)) throw new Error('安装包与打包清单校验值不匹配');
  const base = `https://gitee.com/is-haohao/Aurora-Player/releases/download/v${version}/`;
  const out = path.join(dir, 'gitee-split');
  await splitRelease(file, version, out, base);
  // MSI is a separate manual-install channel, never the automatic updater target.
  const msi = path.join(dir, `AuroraPlayer-Setup-${version}.msi`);
  if (fs.existsSync(msi)) await splitRelease(msi, version, path.join(out, 'msi'), base);
  console.log('已生成分片与待发布清单：', out);
  console.log('上传 EXE 分片到对应 Gitee 发行版后，先运行 node app/scripts/verify-split-release.js <latest-split.json路径>。');
  console.log('验证成功后，才将 EXE 的 latest-split.json 复制到 update/latest-split.json 并提交。');
  console.log('MSI 分片位于 msi 子目录，仅供手动合并。原 update/latest.yml 保持不变。');
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
