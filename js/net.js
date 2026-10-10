/* ============================================================
   NET — online 2-player over WebRTC (PeerJS)
   Lockstep: both browsers run the same deterministic game (same seed,
   decks and House Rules). Each player's decisions travel as option
   indices; a state hash on every message detects desyncs.
   ============================================================ */
(function () {
  const NS = window.NTCG = window.NTCG || {};
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PROTO = 1, PREFIX = 'narutcgsim-v1-';
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no look-alikes (0/O, 1/I)
  const newCode = () => Array.from({ length: 5 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');
  const buildId = () => { const t = document.querySelector('script[src*="js/engine.js"]'); return (t && (t.getAttribute('src').match(/v=(\d+)/) || [])[1]) || 'dev'; };

  let peer = null, conn = null, S = null; // S = live session { me, g, ui, queue, waiter, over }
  let deckId = 'st-red';

  function loadPeer() {
    if (window.Peer) return Promise.resolve();
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'js/vendor/peerjs.min.js'; s.onload = res; s.onerror = () => rej(new Error('Could not load the networking library.')); document.head.appendChild(s); });
  }
  const send = m => { if (conn && conn.open) conn.send(m); };
  function status(html, cls) { const el = $('#onStatus'); if (el) { el.innerHTML = html; el.className = 'on-status ' + (cls || ''); } }
  function busy(b) { ['#onQuick', '#onCreate', '#onJoin', '#onCode'].forEach(s => { const e = $(s); if (e) e.disabled = b; }); $('#onCancel').style.display = b ? '' : 'none'; }

  // cheap fingerprint of everything that must match on both sides
  function hash(g) {
    let h = 2166136261;
    const add = v => { const s = String(v); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } h ^= 124; };
    add(g.turn); add(g.active);
    for (const P of g.players) {
      add(P.leader.life); add(P.chakra.join('')); add(P.deck.length); add(P.trash.length);
      P.hand.forEach(c => add(c.card.id)); P.supports.forEach(c => add(c.card.id));
      P.chars.forEach(u => add(u.card.id + (u.rested ? 'r' : 's') + (u.damage || 0)));
    }
    return h >>> 0;
  }

  // ---------------- lobby ----------------
  function open() {
    const SC = NS.Screens;
    $('#onName').value = SC.store.get('myName', 'Player');
    renderDecks();
    status('Quick Match pairs you with whoever else is looking. To play a friend, create a room and share the code.');
    busy(false);
    SC.show('online');
  }
  function renderDecks() {
    const SC = NS.Screens;
    if (!SC.decks().some(d => d.id === deckId)) deckId = SC.decks()[0].id;
    $('#onDecks').innerHTML = SC.decks().map(d => {
      const L = NS.Cards.byId[d.leader];
      return `<div class="deck-tile ${deckId === d.id ? 'sel' : ''}" data-id="${d.id}">
        <div class="dt-art" style="${NS.View.portraitCSS(L, 1.25)}"></div><div class="dt-shade"></div>
        <div class="dt-tag" style="color:${L.color === 'red' ? 'var(--red)' : 'var(--blue)'}">${d.kind} · ${L.color}</div>
        ${deckId === d.id ? '<div class="dt-badge" style="background:var(--me)">YOUR DECK</div>' : ''}
        <div class="dt-info"><div class="dt-name">${esc(d.name)}</div><div class="dt-desc">${esc(d.desc || '')}</div></div></div>`;
    }).join('');
  }
  const myName = () => { const n = ($('#onName').value || 'Player').slice(0, 16); NS.Screens.store.set('myName', n); return n; };
  const myDeck = house => { const d = NS.Cards.fitDeck(NS.Screens.deckById(deckId), house); return { name: d.name, leader: d.leader, cards: d.cards }; };

  function reset() {
    if (conn) { try { conn.close(); } catch (e) { } conn = null; }
    if (peer) { try { peer.destroy(); } catch (e) { } peer = null; }
  }
  function fail(msg) { quickRun++; reset(); busy(false); status(esc(msg), 'err'); }

  // Host side of the handshake: wait for one guest on `peer`, check version + deck, then start.
  function hostOn(house, mine) {
    peer.on('connection', c => {
      if (conn) { c.on('open', () => { c.send({ t: 'reject', why: 'full' }); setTimeout(() => c.close(), 300); }); return; }
      conn = c;
      c.on('open', () => c.send({ t: 'welcome', proto: PROTO, build: buildId(), house }));
      c.on('data', m => {
        if (m.t === 'hello' && !S) {
          const no = why => { c.send({ t: 'reject', why }); conn = null; setTimeout(() => c.close(), 300); };
          if (m.proto !== PROTO || m.build !== buildId()) return no('Game versions differ. Both players should refresh the page (Ctrl+Shift+R).');
          const bad = m.deck && NS.Cards.byId[m.deck.leader] ? NS.Cards.validate(m.deck, house) : ['unknown Leader'];
          if (bad.length) return no('Your deck is not legal under the rules of this match: ' + bad[0]);
          const start = { t: 'start', seed: (Math.random() * 4294967296) >>> 0, names: [myName(), String(m.name || 'Guest').slice(0, 16)], decks: [mine, m.deck], house };
          c.send(start);
          begin(start, 0);
          // the match runs peer-to-peer from here: leave the matchmaking server so the room/queue id is free again
          const p0 = peer;
          setTimeout(() => { try { p0.disconnect(); } catch (e) { } }, 500);
        } else onData(m);
      });
      c.on('close', () => onClose(c));
    });
  }
  // Guest side: connect to `id`. `onFail(why, kind)` is called if no match starts.
  function guestTo(id, onFail, waitMs) {
    let settled = false;
    const done = (why, kind) => { if (settled) return; settled = true; clearTimeout(timer); onFail(why, kind); };
    const timer = setTimeout(() => done('Could not reach the other player.', 'timeout'), waitMs || 15000);
    const go = () => {
      conn = peer.connect(id, { reliable: true });
      const c0 = conn;
      conn.on('data', m => {
        if (m.t === 'welcome') {
          if (m.proto !== PROTO || m.build !== buildId()) return done('Game versions differ. Both players should refresh the page (Ctrl+Shift+R).', 'version');
          const deck = myDeck(m.house), errs = NS.Cards.validate(deck, m.house);
          if (errs.length) return done('Your deck is not legal under the rules of this match: ' + errs[0], 'deck');
          conn.send({ t: 'hello', proto: PROTO, build: buildId(), name: myName(), deck });
        } else if (m.t === 'reject') done(m.why, m.why === 'full' ? 'full' : 'reject');
        else if (m.t === 'start') { settled = true; clearTimeout(timer); begin(m, 1); }
        else onData(m);
      });
      conn.on('close', () => { if (!settled) done('The other player went away.', 'closed'); else onClose(c0); });
    };
    peer.on('error', e => { if (!S) done(e.type === 'peer-unavailable' ? 'No room with that code. Check it with the host.' : 'Connection problem: ' + (e.type || e.message), e.type === 'peer-unavailable' ? 'gone' : 'error'); });
    if (peer.open) go(); else peer.on('open', go);
  }

  // ---- private room ----
  async function create() {
    NS.Audio.ensure();
    busy(true); status('Opening a room…');
    try { await loadPeer(); } catch (e) { return fail(e.message); }
    const house = Object.assign({}, NS.house);
    const mine = myDeck(house);
    const errs = NS.Cards.validate(mine, house);
    if (errs.length) return fail('Your deck is not legal under your House Rules: ' + errs[0]);
    const tryOpen = n => {
      const code = newCode();
      peer = new Peer(PREFIX + code);
      peer.on('open', () => status(`Room code <b class="on-code">${code}</b><br>Share it with your opponent. Waiting for them to join…`, 'ok'));
      peer.on('error', e => {
        if (e.type === 'unavailable-id' && n < 5) { peer.destroy(); return tryOpen(n + 1); }
        if (!S) fail('Connection problem: ' + (e.type || e.message));
      });
      hostOn(house, mine);
    };
    tryOpen(0);
  }
  async function join() {
    NS.Audio.ensure();
    const code = ($('#onCode').value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 5) return status('Enter the 5-character room code.', 'err');
    busy(true); status('Connecting…');
    try { await loadPeer(); } catch (e) { return fail(e.message); }
    peer = new Peer();
    guestTo(PREFIX + code, why => fail(why === 'full' ? 'That room is already full.' : why));
  }

  // ---- quick match ----
  // Serverless queue: everyone tries to claim one well-known id. Whoever gets it waits as host;
  // whoever finds it taken connects to that host. The id is released as soon as a match starts.
  let quickRun = 0;
  async function quick() {
    NS.Audio.ensure();
    busy(true); status('Looking for an opponent…', 'ok');
    try { await loadPeer(); } catch (e) { return fail(e.message); }
    const house = Object.assign({}, NS.HOUSE_DEFAULTS); // standard rules for strangers
    const mine = myDeck(house);
    const errs = NS.Cards.validate(mine, house);
    if (errs.length) return fail('Quick Match uses the standard rules, and this deck is not legal under them: ' + errs[0]);
    const run = ++quickRun, qid = PREFIX + 'queue-' + buildId();
    const alive = () => run === quickRun && !S;
    const again = () => { if (!alive()) return; reset(); setTimeout(attempt, 400 + Math.random() * 1200); };
    function attempt() {
      if (!alive()) return;
      peer = new Peer(qid);
      let asGuest = false;
      peer.on('open', () => { if (!alive()) return; status('In the queue. Waiting for another player…<br><span style="color:var(--dim)">Keep this tab open.</span>', 'ok'); hostOn(house, mine); });
      peer.on('error', e => {
        if (!alive() || asGuest) return;
        if (e.type !== 'unavailable-id') return fail('Connection problem: ' + (e.type || e.message));
        // someone is already waiting: join them
        asGuest = true;
        try { peer.destroy(); } catch (x) { }
        peer = new Peer();
        status('Opponent found. Connecting…', 'ok');
        guestTo(qid, (why, kind) => { if (!alive()) return; if (kind === 'version' || kind === 'deck') return fail(why); status('Looking for an opponent…', 'ok'); again(); }, 8000);
      });
    }
    attempt();
  }

  // ---------------- match ----------------
  function begin(st, me) {
    const ui = new NS.GameUI({ humans: [me === 0, me === 1], hotseat: false, online: true });
    S = { me, ui, queue: [], waiter: null, over: false, desync: false };
    const local = ui.controllerFor(me);
    // the engine logs every decision as an index; ours are sent, theirs are awaited
    const next = () => S.queue.length ? Promise.resolve(S.queue.shift()) : new Promise(r => { S.waiter = r; });
    const theirs = async pick => {
      const hint = setTimeout(() => { if (S && !S.over) ui.showPrompt(`Waiting for ${esc(S.g.p(1 - me).name)}…`); }, 1200);
      const m = await next();
      clearTimeout(hint); ui.hidePrompt();
      if (m.h !== hash(S.g)) desync();
      return pick(m.k);
    };
    const remote = {
      takeMain: (g, pi, acts) => theirs(k => k === -1 ? null : acts[k] || { kind: 'illegal-remote' }),
      respond: (g, pi, win) => theirs(k => k < 0 ? null : win.options[k] || null),
      choose: (g, req) => theirs(k => k < 0 ? null : req.options[k]),
    };
    const mine = { takeMain: async (g, pi, a) => { const r = await local.takeMain(g, pi, a); S.sendNext = true; return r; }, respond: async (g, pi, w) => { const r = await local.respond(g, pi, w); S.sendNext = true; return r; }, choose: async (g, req) => { const r = await local.choose(g, req); S.sendNext = true; return r; } };
    const g = new NS.Game({
      names: st.names, ui, house: st.house, seed: st.seed,
      controllers: me === 0 ? [mine, remote] : [remote, mine],
      leaders: st.decks.map(d => NS.Cards.byId[d.leader]), decks: st.decks.map(NS.Cards.expand),
    });
    g.onDecision = k => { if (S && S.sendNext) { S.sendNext = false; send({ t: 'd', k, h: hash(g) }); } };
    S.g = g;
    ui.setGame(g);
    NS.Screens.setGame(g, ui);
    NS.Screens.show('game');
    NS.Audio.play('taiko'); NS.Audio.playTrack('battle');
    ui.render({ noFlip: true });
    g.start().then(() => { if (S && S.g === g) S.over = true; });
  }
  function onData(m) {
    if (!S) return;
    if (m.t === 'd') { if (S.waiter) { const w = S.waiter; S.waiter = null; w(m); } else S.queue.push(m); }
    else if (m.t === 'bye') ended('Your opponent left the match.');
    else if (m.t === 'desync') ended('The two games fell out of sync, so the match was stopped.');
  }
  function desync() { if (S.desync) return; S.desync = true; send({ t: 'desync' }); ended('The two games fell out of sync, so the match was stopped.'); }
  function onClose(c) { if (c !== conn) return; if (S && !S.over && !S.g.over) ended('Connection to your opponent was lost.'); else if (!S) conn = null; /* a guest dropped before the match started: keep waiting */ }
  function ended(msg) {
    if (!S || S.over) return;
    S.over = true;
    const g = S.g;
    S = null; g.abort(); reset();
    const close = NS.View.modal(`<h2>Match ended</h2><p>${esc(msg)}</p><div class="row-btns"><button class="btn primary" id="neOk">Back to menu</button></div>`, m => {
      m.querySelector('#neOk').onclick = () => { close(); NS.Screens.show('title'); NS.Audio.playTrack('title'); };
    });
  }
  // called whenever the local player leaves the game screen
  function leave() {
    if (S) { send({ t: 'bye' }); S.over = true; S = null; }
    setTimeout(reset, 200);
  }

  function init() {
    $('#onDecks').onclick = e => { const t = e.target.closest('.deck-tile'); if (!t) return; NS.Audio.play('click'); deckId = t.dataset.id; renderDecks(); };
    $('#onCreate').onclick = create;
    $('#onQuick').onclick = quick;
    $('#onJoin').onclick = join;
    $('#onCode').addEventListener('keydown', e => { if (e.key === 'Enter') join(); });
    $('#onCancel').onclick = () => { quickRun++; reset(); busy(false); status('Cancelled.'); };
    $('#onBack').addEventListener('click', () => { if (!S) { quickRun++; reset(); } });
  }

  NS.Net = { init, open, leave, active: () => !!S, _hash: hash };
})();
