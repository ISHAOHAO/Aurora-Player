const net = require('node:net');
const { EventEmitter } = require('node:events');
const { StringDecoder } = require('node:string_decoder');

/** A transport belongs to exactly one playback session. All requests settle on disposal. */
class MpvTransport extends EventEmitter {
  constructor(address, { connect = net.connect, timeout = 2000, retryDelay = 200, attempts = 30 } = {}) {
    super();
    Object.assign(this, { address, connectSocket: connect, timeout, retryDelay, attempts });
    this.pending = new Map();
    this.sequence = 0;
    this.disposed = false;
    this.connected = false;
    this.socket = null;
    this.retryTimer = null;
  }
  connect() {
    if (this.disposed) return;
    const socket = this.connectSocket(this.address);
    this.socket = socket;
    const decoder = new StringDecoder('utf8');
    let buffer = '';
    socket.on('connect', () => {
      if (this.disposed || this.socket !== socket) return;
      this.connected = true;
      this.emit('connected');
    });
    socket.on('data', chunk => {
      if (this.disposed || this.socket !== socket) return;
      buffer += decoder.write(chunk);
      if (buffer.length > 4 * 1024 * 1024) { socket.destroy(); return; }
      let index;
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
        let message;
        try { message = JSON.parse(line); } catch { this.emit('warning', 'Invalid mpv JSON'); continue; }
        if (this.pending.has(message.request_id)) this.pending.get(message.request_id)(message);
        else if (message.event) this.emit('event', message);
      }
    });
    socket.on('error', () => socket.destroy());
    socket.on('close', () => {
      if (this.socket !== socket) return;
      this.connected = false;
      this.socket = null;
      this.clearPending('disconnected');
      if (this.disposed) return;
      if (--this.attempts <= 0) { this.emit('unavailable'); return; }
      this.retryTimer = setTimeout(() => this.connect(), this.retryDelay);
    });
  }
  command(...args) {
    if (this.disposed || !this.connected || !this.socket) return Promise.resolve({ error: 'disconnected' });
    return new Promise(resolve => {
      const id = ++this.sequence;
      const timer = setTimeout(() => done({ error: 'timeout' }), this.timeout);
      const done = result => {
        if (!this.pending.delete(id)) return;
        clearTimeout(timer); resolve(result);
      };
      this.pending.set(id, done);
      try {
        this.socket.write(JSON.stringify({ command: args, request_id: id }) + '\n', error => {
          if (error) done({ error: 'disconnected' });
        });
      } catch { done({ error: 'disconnected' }); }
    });
  }
  clearPending(error) { for (const finish of this.pending.values()) finish({ error }); }
  dispose() {
    this.disposed = true;
    this.connected = false;
    clearTimeout(this.retryTimer);
    this.clearPending('cancelled');
    this.socket?.destroy();
    this.socket = null;
  }
}
module.exports = { MpvTransport };
