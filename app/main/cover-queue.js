const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
class CoverQueue {
  constructor(executable, directory, outputFor) {
    Object.assign(this, { executable, directory, outputFor });
    this.jobs = new Map(); this.generation = 0; this.running = false; this.proc = null;
  }
  add(file, done) {
    if (this.jobs.has(file)) { this.jobs.get(file).push(done); return; }
    if (this.jobs.size >= 10000) { done(null); return; }
    this.jobs.set(file, [done]); this.next();
  }
  cancel() {
    this.generation++;
    this.jobs.clear();
    this.proc?.kill();
  }
  async next() {
    if (this.running || !this.jobs.size) return;
    this.running = true;
    const file = this.jobs.keys().next().value;
    const callbacks = this.jobs.get(file);
    const generation = this.generation;
    let temp, poster = null;
    try {
      await fs.mkdir(this.directory(), { recursive: true });
      temp = await fs.mkdtemp(path.join(this.directory(), '_cover-'));
      if (generation !== this.generation) return;
      const success = await new Promise(resolve => {
        const proc = spawn(this.executable, ['--no-config', '--no-audio', '--no-sub', '--frames=1', '--start=8%',
          '--hwdec=no', '--vo=image', '--vo-image-format=jpg', '--vo-image-jpeg-quality=82', `--vo-image-outdir=${temp}`, '--no-terminal', '--', file], { stdio: 'ignore', windowsHide: true });
        this.proc = proc;
        let settled = false;
        const finish = code => { if (settled) return; settled = true; clearTimeout(timer); resolve(code === 0); };
        const timer = setTimeout(() => { proc.kill(); finish(-1); }, 20000);
        proc.once('error', () => finish(-1)); proc.once('close', finish);
      });
      if (success && generation === this.generation) {
        const image = (await fs.readdir(temp)).find(name => name.endsWith('.jpg'));
        if (image) { poster = this.outputFor(file); await fs.copyFile(path.join(temp, image), poster); }
      }
    } catch (e) { console.error('[cover] generation failed', e.code || e.message); }
    finally {
      if (temp) await fs.rm(temp, { recursive: true, force: true }).catch(e => console.error('[cover] cleanup', e.code));
      this.running = false; this.proc = null;
      if (generation === this.generation) {
        this.jobs.delete(file);
        for (const cb of callbacks) { try { cb(poster); } catch (e) { console.error('[cover] save failed', e.message); } }
      }
      this.next();
    }
  }
}
module.exports = { CoverQueue };
