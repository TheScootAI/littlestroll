// PeerJS wrapper. One host, one joiner. Only the room code goes to the broker; the
// peer id is littlerun-<CODE>. Everything on the wire goes through protocol.js.
import { Peer } from 'peerjs';
import { peerIdFor } from './code.js';
import { encode, decode, accepts, PROTOCOL_V } from './protocol.js';
import { retryDelay, shouldReplacePartner, isSilent, SILENCE_MS } from './reconnect.js';

const ATTEMPT_MS = 2500;   // one reconnect attempt that has not been welcomed by now has failed

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
      if (s.conn && s.welcomed && isSilent(performance.now(), s.lastRx, SILENCE_MS)) s._drop(s.conn);
    }, 1000);
    return s;
  }

  _incoming(c) {
    if (!this.conn) { this._adopt(c); return; }
    // The slot is held. Decide at the first hello: a partner that has gone quiet is
    // probably the same walker coming back on a half-dead connection, so the new one wins.
    let decided = false;
    c.on('data', (d) => {
      if (decided) return;
      const m = decode(d);
      if (!m || m.t !== 'hello') return;
      decided = true;
      if (this.conn && !shouldReplacePartner(performance.now() - this.lastRx)) {
        try { c.send(encode({ t: 'full' })); } catch { /* ignore */ }
        setTimeout(() => { try { c.close(); } catch { /* ignore */ } }, 500);
        return;
      }
      if (this.conn) this._drop(this.conn);
      this._adopt(c);
      this._hostData(c, d);
    });
  }

  _adopt(c) {
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
    s.code = code;
    // a dead data channel does not always fire a close event: silence is closure
    s.watch = setInterval(() => {
      if (s.status === 'connected' && isSilent(performance.now(), s.lastRx, SILENCE_MS)) s._hostGone();
    }, 1000);
    s.timer = setTimeout(() => { if (!s.welcomed) s._fail(); }, timeoutMs);
    s._makePeer(() => s._connect());
    return s;
  }

  _makePeer(onOpen) {
    const peer = new Peer();
    this.peer = peer;
    peer.on('open', () => { if (this.peer === peer && !this.closed) onOpen(); });
    peer.on('error', () => {
      if (this.peer !== peer || this.closed) return;
      if (this.status === 'reconnecting') this._attemptFailed();
      else if (this.status === null) this._fail();
      // connected: a broker hiccup does not close the data channel
    });
    return peer;
  }

  _connect() {
    const c = this.peer.connect(peerIdFor(this.code), { reliable: true });
    this.conn = c;
    c.on('open', () => { if (this.conn === c) c.send(encode({ t: 'hello', v: PROTOCOL_V })); });
    c.on('data', (d) => { if (this.conn === c) this._joinData(d); });
    c.on('close', () => { if (this.conn === c) this._hostGone(); });
    c.on('error', () => { if (this.conn === c) this._hostGone(); });
  }

  _fail() {
    clearTimeout(this.timer);
    clearInterval(this.watch);
    this._status('failed');
    this._teardown();
  }

  // The connection closed, or the host went silent. That does not mean the host is
  // gone (it may have dropped us for silence), so try to get back in.
  _hostGone() {
    if (this.status === 'connected') this._startReconnect();
    else if (this.status === 'reconnecting') this._attemptFailed();
    // else: first connection, wait for welcome or timeout
  }

  _startReconnect() {
    const old = this.conn;
    this.conn = null;
    try { old?.close(); } catch { /* ignore */ }
    this.welcomed = false;
    this.attempt = 0;
    this.reconnectStart = performance.now();
    this._status('reconnecting');
    this._scheduleRetry();
  }

  _scheduleRetry() {
    clearTimeout(this.retryTimer);
    const d = retryDelay(this.attempt, performance.now() - this.reconnectStart);
    if (d === null) { this._giveUp(); return; }
    this.retryTimer = setTimeout(() => this._retry(), d);
  }

  _retry() {
    if (this.closed || this.status !== 'reconnecting') return;
    this.attempt++;
    const old = this.conn;
    this.conn = null;
    try { old?.close(); } catch { /* ignore */ }
    clearTimeout(this.attemptTimer);
    this.attemptTimer = setTimeout(() => this._attemptFailed(), ATTEMPT_MS);
    const peer = this.peer;
    if (peer && !peer.destroyed && !peer.disconnected && peer.open) this._connect();
    else {
      try { peer?.destroy(); } catch { /* ignore */ }
      this._makePeer(() => this._connect());
    }
  }

  _attemptFailed() {
    if (this.status !== 'reconnecting') return;
    clearTimeout(this.attemptTimer);
    const old = this.conn;
    this.conn = null;
    try { old?.close(); } catch { /* ignore */ }
    this._scheduleRetry();
  }

  _giveUp() {
    this._stopRetry();
    this._status('lost');
    this._teardown();
  }

  _stopRetry() {
    clearTimeout(this.retryTimer);
    clearTimeout(this.attemptTimer);
  }

  _joinData(d) {
    const m = decode(d);
    if (!m || !accepts('join', this.welcomed, m.t)) return;
    this.lastRx = performance.now();
    if (m.t === 'full') {
      clearTimeout(this.timer);
      this._stopRetry();
      this._status('full');
      this._teardown();
      return;
    }
    if (m.t === 'welcome') {
      this.welcomed = true;
      clearTimeout(this.timer);
      this._stopRetry();
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
    this._stopRetry();
    clearInterval(this.watch);
    this._teardown();
  }
}
