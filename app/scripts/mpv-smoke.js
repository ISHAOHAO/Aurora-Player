const http = require('node:http');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const assert = require('node:assert/strict');
const { createMediaGateway } = require('../dlna/lan-network');
const { MpvTransport } = require('../main/mpv-transport');
const { CAST_OPTIONS } = require('../main/cast-options');
async function run() {
  const wav = Buffer.alloc(44 + 16000 * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
  let originRequests = 0;
  const origin = http.createServer((_req, res) => { originRequests++; res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': wav.length }); res.end(wav); });
  const gateway = createMediaGateway();
  const server = http.createServer((req, res) => gateway.serve(req, res));
  await new Promise(resolve => origin.listen(0, '127.0.0.1', resolve));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = '\\\\.\\pipe\\aurora-smoke-' + process.pid;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-mpv-smoke-'));
  const log = path.join(temp, 'mpv.log');
  const uri = await gateway.register(`http://127.0.0.1:${origin.address().port}/media.wav`, 'current', server.address().port);
  const proc = spawn(path.resolve(__dirname, '../../runtime/mpv/mpv.exe'), ['--vo=null', '--ao=null', '--pause=yes', '--idle=yes',
    '--no-terminal', '--volume=23', '--mute=yes', `--log-file=${log}`, `--input-ipc-server=${address}`, ...CAST_OPTIONS, '--', uri], { stdio: 'ignore', windowsHide: true });
  const client = new MpvTransport(address);
  const timeout = setTimeout(() => { console.error('mpv smoke timeout', fs.existsSync(log) ? fs.readFileSync(log, 'utf8').slice(-3000) : 'no log'); proc.kill(); process.exitCode = 1; }, 12000);
  try {
    client.connect();
    await Promise.race([once(client, 'connected'), once(proc, 'exit').then(() => { throw new Error('mpv exited before connect'); })]);
    let duration;
    for (let i = 0; i < 30; i++) {
      duration = await client.command('get_property', 'duration');
      if (duration.data > 0) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(Math.abs(duration.data - 2) < 0.05, 'WAV duration should be approximately two seconds');
    assert.equal((await client.command('get_property', 'file-format')).data, 'wav');
    assert.equal((await client.command('get_property', 'volume')).data, 23);
    assert.equal((await client.command('get_property', 'mute')).data, true);
    await client.command('set_property', 'volume', 0);
    assert.equal((await client.command('get_property', 'volume')).data, 0);
    assert.ok(originRequests > 0);
    assert.equal(client.pending.size, 0);
    console.log('MPV SMOKE PASS: real pipe, LAN media, startup volume/mute and zero volume');
  } finally {
    clearTimeout(timeout); client.dispose(); proc.kill();
    await once(proc, 'close');
    server.closeAllConnections(); server.close(); origin.closeAllConnections(); origin.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
