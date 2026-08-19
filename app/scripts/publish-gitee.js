/**
 * 把 electron-builder 产出的 release/latest.yml 改写为 Gitee 绝对直链版，
 * 落到仓库根 update/latest.yml（版本真相源）。
 *
 * 为什么：electron-updater 的 generic provider 会读取 latest.yml 里的 files[].url；
 * 我们把安装包本体放在 Gitee release 附件（稳定下载地址），用绝对直链写入，
 * 与 raw 托管的 latest.yml 解耦，且国内访问稳定。
 *
 * 用法（打包完成后）：
 *   node scripts/publish-gitee.js
 */
const fs = require('fs');
const path = require('path');

const REPO = 'is-haohao/Aurora-Player';
const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'release', 'latest.yml');
const DST = path.join(ROOT, 'update', 'latest.yml');

if (!fs.existsSync(SRC)) {
  console.error('找不到', SRC, '\n请先运行打包：npm run dist:win');
  process.exit(1);
}

const yaml = fs.readFileSync(SRC, 'utf8');
const verMatch = yaml.match(/^version:\s*(.+)$/m);
if (!verMatch) {
  console.error('无法从 latest.yml 解析 version');
  process.exit(1);
}
const version = verMatch[1].trim().replace(/^v/, '');
const base = `https://gitee.com/${REPO}/releases/download/v${version}/`;

// 把 files 块里的 - url: 与顶层 path: 改写为 Gitee 绝对直链（保留 sha512/size）
const out = yaml
  .replace(/^(\s*-\s*url:\s*)(.+)$/gm, (_, p, u) => `${p}${base}${path.basename(u.trim())}`)
  .replace(/^path:\s*(.+)$/m, (_, p) => `path: ${base}${path.basename(p.trim())}`);

fs.mkdirSync(path.dirname(DST), { recursive: true });
fs.writeFileSync(DST, out);

console.log('已生成', DST);
console.log('版本', version, '| 安装包直链前缀', base);
console.log('\n请将以下文件上传到 Gitee 发行版 v' + version + '：');
const files = [...out.matchAll(/^\s*-\s*url:\s*(.+)$/gm)].map((m) => '  ' + path.basename(m[1].trim()));
// 顶层 path 也是安装包
const topPath = out.match(/^path:\s*(.+)$/m);
if (topPath) {
  const name = path.basename(topPath[1].trim());
  if (!files.some((f) => f.includes(name))) files.push('  ' + name);
}
console.log(files.join('\n'));
console.log('\n上传后提交 update/latest.yml 即可生效。');
