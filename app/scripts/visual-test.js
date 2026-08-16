// Visual Engine 纯逻辑单测运行器：vite lib(cjs) 打包 entry → node 执行
// 运行：node scripts/visual-test.js
const { execSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const appRoot = path.join(__dirname, '..');
const outDir = process.env.VISUAL_TEST_OUT || path.join(os.tmpdir(), 'aurora-visual-test');
const entry = path.join(__dirname, 'visual-test-entry.ts');
const config = path.join(__dirname, 'visual-test.config.ts');

if (!fs.existsSync(entry)) { console.error('缺少 visual-test-entry.ts'); process.exit(1); }

try {
  execSync(`npx vite build --config "${config}"`, {
    cwd: appRoot,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, VISUAL_TEST_OUT: outDir },
  });
  const outFile = path.join(outDir, 'visual-test.cjs');
  if (!fs.existsSync(outFile)) { console.error('打包产物缺失：' + outFile); process.exit(1); }
  require(outFile);
} catch (e) {
  console.error('visual-test 失败：' + (e.message || e));
  process.exit(1);
}
