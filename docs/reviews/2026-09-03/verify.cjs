// The original defect probes have been converted into correct-behavior regression tests.
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const scripts = path.join(root, 'app/scripts');
const tests = fs.readdirSync(scripts).filter(file => file.endsWith('.test.js')).map(file => path.join(scripts, file));
const result = spawnSync(process.execPath, ['--test', ...tests], { cwd: root, stdio: 'inherit', windowsHide: true });
if (result.error) console.error(result.error);
process.exitCode = result.status ?? 1;
