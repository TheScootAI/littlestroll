// PeerJS wrapper. One host, one joiner. Only the room code goes to the broker; the
// peer id is littlerun-<CODE>. Everything on the wire goes through protocol.js.
import { Peer } from 'peerjs';
import { peerIdFor } from './code.js';
import { encode, decode, shouldAccept, accepts, PROTOCOL_V } from './protocol.js';

const STALE_MS = 2500;   // a partner silent this long is treated as gone (reload, crash)

export class Session {
  constructor(role) {
    this.role = role;
    this.status = null;
    this.getWelcome = () => ({ seed: 0, solved: 0 });   // host: set by the game
    this._onStatus = () => {};
    this.onMessage = () => {};
    this.peer = null;
    this.conn = null;       // the partner (host) or the host (joiner)
    this.welcomed = false;
    this.lastRx = 0;
    this.closed = false;
  }

  // Assigning a handler replays the current status, so nothing is missed between
  // creating the session and handing it to the game.
  get onStatus() { return this._onStatus; }
  set onStatus(fn) {
    this._onStatus = fn;
    if (this.status) fn(this.status);
  }

  _status(s) {
    if (this.closed || this.status === s) return;
    this.status = s;
    this._onStatus(s);
  }

  static host(code) {
    const s = new Session('host');
    const peer = new Peer(peerIdFor(code));
    s.peer = peer;
    peer.on('open', () => s._status('waiting'));
    peer.on('connection', (c) => s._incoming(c));
    peer.on('disconnected', () => {
      // lost the broker, not the partner: win the id back so the code keeps working
      if (!s.closed && !peer.destroyed) { try { peer.reconnect(); } catch { /* ignore */ } }
    });
    peer.on('error', () => { if (s.status === null) s._status('failed'); });
    // a closed tab can take a long while to show up as a closed channel; the joiner
    // sends ~15 times a second, so silence means gone
    s.watch = setInterval(() => {
      if (s.conn && s.welcomed && performance.now() - s.lastRx > STALE_MS + 1500) s._drop(s.conn);
    }, 1000);
    return s;
  }

  _incoming(c) {
    const stale = this.conn && performance.now() - this.lastRx > STALE_MS;
    if (stale) this._drop(this.conn);
    if (!shouldAccept(!!this.conn)) {
      c.on('open', () => {
        try { c.send(encode({ t: 'full' })); } catch { /* ignore */ }
        setTimeout(() => { try { c.close(); } catch { /* ignore */ } }, 500);
      });
      return;
    }
    this.conn = c;
    this.welcomed = false;
    this.lastRx = performance.now();
    c.on('data', (d) => this._hostData(c, d));
    c.on('close', () => this._partnerGone(c));
    c.on('error', () => this._partnerGone(c));
  }

  _drop(c) {
    if (this.conn === c) { this.conn = null; this.welcomed = false; }
    try { c.close(); } catch { /* ignore */ }
    if (this.role === 'host' && this.status === 'connected') this._status('lost');
  }

  _partnerGone(c) {
    if (this.conn !== c) return;
    this.conn = null;
    this.welcomed = false;
    if (this.status === 'connected') this._status('lost');
    else if (this.status === 'lost' || this.status === 'waiting') { /* still free */ }
  }

  _hostData(c, d) {
    if (c !== this.conn) return;
    const m = decode(d);
    if (!m || !accepts('host', this.welcomed, m.t)) return;
    this.lastRx = performance.now();
    if (m.t === 'hello') {
      const w = this.getWelcome();
      c.send(encode({ t: 'welcome', v: PROTOCOL_V, seed: w.seed, solved: w.solved }));
      this.welcomed = true;
      if (this.status === 'connected') this.status = null;   // re-welcome of a new partner
      this._status('connected');
      return;
    }
    this.onMessage(m);
  }

  static join(code, { timeoutMs = 12000 } = {}) {
    const s = new Session('join');
    const peer = new Peer();
    s.peer = peer;
    s.timer = setTimeout(() => { if (!s.welcomed) s._fail(); }, timeoutMs);
    peer.on('open', () => {
      const c = peer.connect(peerIdFor(code), { reliable: true });
      s.conn = c;
      c.on('open', () => c.send(encode({ t: 'hello', v: PROTOCOL_V })));
      c.on('data', (d) => s._joinData(d));
      c.on('close', () => s._hostGone());
      c.on('error', () => s._hostGone());
    });
    peer.on('error', () => { if (!s.welcomed) s._fail(); });
    return s;
  }

  _fail() {
    clearTimeout(this.timer);
    this._status('failed');
    this._teardown();
  }

  _hostGone() {
    if (this.status === 'connected') { this._status('lost'); this._teardown(); }
    else if (!this.welcomed && this.status === null) { /* wait for welcome or timeout */ }
  }

  _joinData(d) {
    const m = decode(d);
    if (!m || !accepts('join', this.welcomed, m.t)) return;
    if (m.t === 'full') {
      clearTimeout(this.timer);
      this._status('full');
      this._teardown();
      return;
    }
    if (m.t === 'welcome') {
      this.welcomed = true;
      clearTimeout(this.timer);
      this._status('connected');
    }
    this.onMessage(m);
  }

  send(msg) {
    const c = this.conn;
    if (!c || !c.open) return;
    if (this.role === 'host' && !this.welcomed) return;
    try { c.send(encode(msg)); } catch { /* ignore */ }
  }

  _teardown() {
    try { this.conn?.close(); } catch { /* ignore */ }
    try { this.peer?.destroy(); } catch { /* ignore */ }
  }

  close() {
    this.closed = true;
    clearTimeout(this.timer);
    clearInterval(this.watch);
    this._teardown();
  }
}
