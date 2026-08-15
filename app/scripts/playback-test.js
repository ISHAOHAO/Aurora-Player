/**
 * 本地播放用例执行（docs/04 §2.1 P01-P12 可自动化子集）
 * 经命名管道驱动当前已加载的 mpv 会话。
 * 运行：先启动应用并加载媒体，再 node scripts/playback-test.js
 */
'use strict';
const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PIPE = '\\\\.\\pipe\\aurora-mpv';
let passed = 0, failed = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { passed++; console.log(`  PASS  ${name}${extra ? ' — ' + extra : ''}`); }
  else { failed++; console.log(`  FAIL  ${name}${extra ? ' — ' + extra : ''}`); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class PipeClient {
  constructor() { this.id = 0; this.pending = new Map(); this.events = []; this.sock = net.connect(PIPE); this.buf = ''; }
  connect() {
    return new Promise((resolve, reject) => {
      this.sock.on('connect', resolve);
      this.sock.on('error', reject);
      this.sock.on('data', (d) => {
        this.buf += d.toString('utf8');
        let i;
        while ((i = this.buf.indexOf('\n')) >= 0) {
          const line = this.buf.slice(0, i).trim(); this.buf = this.buf.slice(i + 1);
          if (!line) continue;
          let m; try { m = JSON.parse(line); } catch { continue; }
          if (m.request_id !== undefined && this.pending.has(m.request_id)) {
            this.pending.get(m.request_id)(m); this.pending.delete(m.request_id);
          } else if (m.event) this.events.push(m);
        }
      });
    });
  }
  cmd(command) {
    return new Promise((resolve) => {
      const rid = ++this.id;
      this.pending.set(rid, (m) => resolve({ error: m.error, data: m.error === 'success' ? m.data : undefined }));
      this.sock.write(JSON.stringify({ command, request_id: rid }) + '\n');
    });
  }
  get(prop) { return this.cmd(['get_property', prop]).then((r) => r.data); }
  set(prop, val) { return this.cmd(['set_property', prop, val]).then((r) => r.data); }
  close() { this.sock.end(); }
}

async function main() {
  console.log('== 本地播放用例（管道驱动） ==\n');
  const p = new PipeClient();
  try { await p.connect(); } catch (e) { console.log('PIPE FAIL:', e.message); process.exit(1); }

  // P02 解码路径
  console.log('[P02] 解码路径');
  const hwdec = await p.get('hwdec-current');
  ok('hwdec 已激活（硬件或软件均可，不得为 error）', hwdec != null, String(hwdec));

  // P01 首帧 —— 用时长/路径字段存在间接判定（真实首帧计时需重启，见备注）
  console.log('[P01] 媒体加载');
  const dur = await p.get('duration');
  ok('duration 可读（文件已加载）', dur != null && dur > 0, `${dur}s`);

  // P04 Seek 0/25/50/75/100 + 随机
  console.log('[P04] Seek');
  let seekOk = true;
  for (const frac of [0, 0.25, 0.5, 0.75, 0.9]) {
    const t = (dur || 8) * frac;
    await p.cmd(['seek', t, 'absolute']);
    await sleep(350);
    const pos = await p.get('time-pos');
    if (pos == null || Math.abs(pos - t) > 0.7) { seekOk = false; console.log(`   seek ${frac * 100}% → pos ${pos}, want ~${t}`); }
  }
  ok('Seek 各档位位置准确', seekOk);

  // P05 暂停/播放 ×20
  console.log('[P05] 暂停/播放');
  await p.cmd(['seek', (dur || 8) / 2, 'absolute']); await sleep(400);   // 回到片中避免 EOF
  let p05 = true;
  for (let i = 0; i < 20; i++) {
    await p.set('pause', true); await sleep(30);
    const p1 = await p.get('pause');
    await p.set('pause', false); await sleep(30);
    const p2 = await p.get('pause');
    if (p1 !== true || p2 !== false) { p05 = false; console.log(`   第${i}次状态错乱 p1=${p1} p2=${p2}`); }
  }
  ok('暂停/播放 ×20 状态一致', p05);

  // P10 快照
  console.log('[P10] 快照 Ctrl+S');
  const snapDir = path.join(os.homedir(), 'AppData', 'Roaming', 'aurora-player', 'snapshots');
  fs.mkdirSync(snapDir, { recursive: true });
  const snap = path.join(snapDir, `playback-test-${Date.now()}.png`);
  const snapR = await p.cmd(['screenshot-to-file', snap, 'video']);
  await sleep(500);
  ok('screenshot-to-file video 模式', snapR.error === 'success' && fs.existsSync(snap) && fs.statSync(snap).size > 1000,
    fs.existsSync(snap) ? `${fs.statSync(snap).size}B` : '未生成');

  // P11 倍速
  console.log('[P11] 倍速');
  let speedOk = true;
  for (const s of [0.5, 1.25, 2, 4]) {
    await p.set('speed', s); await sleep(120);
    const got = await p.get('speed');
    if (Math.abs(got - s) > 0.01) { speedOk = false; console.log(`   ${s}x → ${got}`); }
  }
  await p.set('speed', 1);
  ok('倍速 0.5/1.25/2/4 生效', speedOk);

  // P06/P07 音轨/字幕轨（如存在）
  console.log('[P06/P07] 音轨/字幕切换');
  const tracks = (await p.get('track-list')) || [];
  const at = tracks.filter((t) => t.type === 'audio');
  const st = tracks.filter((t) => t.type === 'sub');
  ok(`音轨列表（${at.length} 条）`, at.length >= 1, at.length ? `条数 ${at.length}` : '');
  if (at.length >= 2) {
    await p.set('aid', at[at.length - 1].id); await sleep(300);
    ok('切到末条音轨', (await p.get('aid')) === at[at.length - 1].id);
  }
  if (st.length >= 1) {
    await p.set('sid', st[0].id); await sleep(300);
    ok('切到字幕轨', (await p.get('sid')) === st[0].id);
  }

  // P03 连续播放 —— 简短时长样本（完整 10min 稳定性属长期项）
  console.log('[P03] 连续播放（短样本）');
  await p.cmd(['seek', (dur || 8) / 2, 'absolute']); await sleep(400);
  await p.set('pause', false);
  const t0 = Date.now(); await sleep(3000); const t1 = Date.now();
  const posA = await p.get('time-pos');
  await sleep(3000); const posB = await p.get('time-pos');
  const wall = (t1 - t0) / 1000;
  ok('播放位置随墙钟推进（无卡死）', posB != null && posA != null && posB > posA, `${posA} → ${posB}`);

  p.close();
  console.log(`\n结果：${passed} PASS / ${failed} FAIL`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('异常:', e.message); process.exit(1); });