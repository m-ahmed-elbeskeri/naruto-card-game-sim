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
  const PROTO = 2, PREFIX = 'narutcgsim-v1-';
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no look-alikes (0/O, 1/I)
  const newCode = () => Array.from({ length: 5 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');
  const buildId = () => { const t = document.querySelector('script[src*="js/engine.js"]'); return (t && (t.getAttribute('src').match(/v=(\d+)/) || [])[1]) || 'dev'; };

  let peer = null, conn = null, S = null; // S = live session { me, g, ui, queue, waiter, over }
  let deckId = 'st-red';

  function loadPeer() {
    if (window.Peer) return Promise.resolve();
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'js/vendor/peerjs.min.js'; s.onload = res; s.onerror = () => rej(new Error('Could not load the networking library.')); document.head.appendChild(s); });
  }
  let out = m => { if (conn && conn.open) conn.send(m); };
  const send = m => out(m);
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
        if (c !== conn) return; // a connection that has been replaced has nothing more to say
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
        if (c0 !== conn) return;
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

  // ---------------- match clock ----------------
  // Each player has a bank for the whole match, a budget for each of their own turns, and a short limit for every
  // answer asked of them in the opponent's turn. A clock only runs while its owner is being asked something. Every
  // client times its own player and the time used travels with the decision, so both sides keep the same books.
  // Out of time for a turn or an answer: the default is played (end turn / no response). Out of bank: the match is lost.
  const CLOCK = { bank: 20 * 60e3, turn: 3 * 60e3, resp: 60e3, stall: 30e3, grace: 6e3 };
  const NEVER = new Promise(() => { });
  let now = () => Date.now();
  const newClock = () => ({ bank: [CLOCK.bank, CLOCK.bank], used: [0, 0], turn: -1, run: null, wait: null, el: null, beep: 0 });
  // time `pi` has for a decision right now, and whether it comes out of their turn budget
  function allow(g, pi) {
    const ck = S.ck;
    if (ck.turn !== g.turn) { ck.turn = g.turn; ck.used = [0, 0]; }
    const own = g.turn > 0 && g.active === pi;
    return { own, lim: Math.max(0, Math.min(ck.bank[pi], own ? CLOCK.turn - ck.used[pi] : CLOCK.resp)) };
  }
  function charge(pi, ms, own) { const ck = S.ck; ck.bank[pi] = Math.max(0, ck.bank[pi] - ms); if (own) ck.used[pi] += ms; }
  // what a player who runs out of time gets for a choice
  function defaultChoice(req) {
    if (req.kind === 'mulligan') return 'keep';
    if (req.optional) return null;
    const o = req.options;
    return req.ai ? o.reduce((b, x) => (req.ai(x) > req.ai(b) ? x : b), o[0]) : o[0];
  }
  function tick() {
    if (!S || S.over || !S.ck) return;
    const ck = S.ck, t = now();
    if (ck.run) { // our own clock
      const el = t - ck.run.t0, left = ck.run.lim - el;
      if (left <= 0) {
        if (ck.bank[S.me] - el <= 0) { send({ t: 'flag' }); return finish(1 - S.me, 'time'); }
        if (!ck.run.late) { const what = S.ui.autoResolve(); if (what) { ck.run.late = 1; S.ui.toast('Time ran out. ' + what + '.'); NS.Audio.play('pass'); } }
      } else if (left <= 10e3) { const sec = Math.ceil(left / 1000); if (sec !== ck.beep) { ck.beep = sec; NS.Audio.play('click'); } }
    }
    if (ck.wait) { // theirs, as seen from here
      const w = ck.wait;
      if (!w.t0 && t - w.at >= CLOCK.stall) w.t0 = w.at + CLOCK.stall; // their side never said it reached this question
      if (w.t0 && t - w.t0 > w.lim + CLOCK.grace) { send({ t: 'claim' }); return finish(S.me, 'away'); }
    }
    paint();
  }
  const fmt = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  function paint() {
    if (!S || !S.ck || typeof document === 'undefined') return;
    const ck = S.ck, g = S.g, t = now(), stage = document.getElementById('stage'), mb = document.getElementById('modalBack');
    if (!stage) return;
    if (!ck.el) {
      ck.el = document.createElement('div'); ck.el.className = 'clock';
      ck.el.innerHTML = [1 - S.me, S.me].map(pi => `<div class="ck-row ${pi === S.me ? 'me' : 'opp'}" data-pi="${pi}"><span class="ck-name">${esc(g.p(pi).name)}</span><span class="ck-bank">Match <b></b></span><b class="ck-time"></b><i class="ck-bar"></i></div>`).join('');
      document.body.appendChild(ck.el);
    }
    // it sits in the free band of the right-hand column, or in the top corner while a pop-up or the card inspector is over that band
    const st = stage.getBoundingClientRect(), k = st.width / 1600, pv = document.getElementById('preview');
    const corner = (mb && mb.classList.contains('show') && !mb.classList.contains('resp')) || (pv && pv.classList.contains('show') && pv._right);
    ck.el.style.transform = `translate(${Math.round(st.left + 1340 * k)}px,${Math.round(st.top + (corner ? 10 : 352) * k)}px) scale(${k.toFixed(4)})`;
    const set = (e, v) => { if (e.textContent !== v) e.textContent = v; };
    for (const row of ck.el.children) {
      const pi = +row.dataset.pi, asked = pi === S.me ? ck.run : ck.wait, live = asked && asked.t0 ? asked : null; // their clock runs once they are really being asked
      const el = live ? t - live.t0 : 0, turn = g.turn > 0 && g.active === pi && g.phase !== 'over';
      const left = asked ? Math.max(0, asked.lim - el) : turn ? Math.max(0, Math.min(ck.bank[pi], CLOCK.turn - (ck.turn === g.turn ? ck.used[pi] : 0))) : null;
      const bank = Math.max(0, ck.bank[pi] - el);
      row.classList.toggle('run', !!live); row.classList.toggle('low', !!live && left <= 30e3);
      set(row.querySelector('.ck-time'), left == null ? '' : fmt(left));
      set(row.querySelector('.ck-bank b'), fmt(bank)); row.querySelector('.ck-bank').classList.toggle('low', bank <= 120e3);
      row.querySelector('.ck-bar').style.transform = `scaleX(${left == null ? 0 : Math.min(1, left / ((asked ? asked.own : turn) ? CLOCK.turn : CLOCK.resp)).toFixed(4)})`;
    }
  }
  function stopClock() {
    if (S && S.timer) { clearInterval(S.timer); S.timer = 0; }
    if (S && S.ck) S.ck.el = null;
    if (typeof document !== 'undefined') document.querySelectorAll('.clock').forEach(e => e.remove());
  }

  // ---------------- match ----------------
  function begin(st, me) {
    const ui = new NS.GameUI({ humans: [me === 0, me === 1], hotseat: false, online: true });
    const g = wire(st, me, ui, ui.controllerFor(me));
    ui.setGame(g);
    NS.Screens.setGame(g, ui);
    NS.Screens.show('game');
    NS.Audio.play('taiko'); NS.Audio.playTrack('battle');
    ui.render({ noFlip: true });
    g.start().then(() => { if (S && S.g === g) { stopClock(); S.over = true; } });
  }
  // One side of the lockstep game. The engine logs every decision as an index: ours are sent, theirs are awaited.
  function wire(st, me, ui, local) {
    const s = S = { me, ui, queue: [], waiter: null, over: false, desync: false, asking: false, gone: '', think: null, used: 0, late: 0, timer: 0, ck: st.house && st.house.clock === false ? null : newClock() };
    const next = () => {
      if (s.queue.length) return Promise.resolve(s.queue.shift());
      if (s.gone) { ended(s.gone); return NEVER; } // they left and nothing more of theirs is waiting to be played
      return new Promise(r => { s.waiter = r; });
    };
    const theirs = async pick => {
      const ck = s.ck, op = 1 - me;
      if (ck) { const a = allow(s.g, op), n = s.g.log.length; ck.wait = { n, at: now(), lim: a.lim, own: a.own, t0: s.think && s.think.n === n ? s.think.at : 0 }; paint(); }
      const m = await next();
      if (S !== s || s.over) return NEVER;
      if (ck) { const w = ck.wait; ck.wait = null; charge(op, Math.max(0, Math.min(+m.u || 0, w.lim)), w.own); if (m.late) ui.toast(esc(s.g.p(op).name) + ' ran out of time'); paint(); }
      if (m.h !== hash(s.g)) desync();
      return pick(m.k);
    };
    const remote = {
      takeMain: (g, pi, acts) => theirs(k => k === -1 ? null : acts[k] || { kind: 'illegal-remote' }),
      respond: (g, pi, win) => theirs(k => k < 0 ? null : win.options[k] || null),
      choose: (g, req) => theirs(k => k < 0 ? null : req.options[k]),
    };
    // a decision of ours: the clock runs while the question is open; `dflt` is the answer when there is no time for it
    const ask = async (run, dflt) => {
      if (S !== s || s.over) return NEVER;
      if (s.gone) { ended(s.gone); return NEVER; }
      const ck = s.ck;
      let r;
      if (!ck) { s.asking = true; r = await run(); if (S !== s || s.over) return NEVER; s.asking = false; }
      else {
        const a = allow(s.g, me);
        if (ck.bank[me] <= 0) { send({ t: 'flag' }); finish(1 - me, 'time'); return NEVER; }
        if (a.lim <= 0) { r = dflt(); s.used = 0; s.late = 1; } // this turn's time is already spent
        else {
          send({ t: 'think', n: s.g.log.length });
          const q = ck.run = { t0: now(), lim: a.lim, own: a.own, late: 0 };
          ck.beep = 0; s.asking = true; paint();
          r = await run();
          if (S !== s || s.over) return NEVER; // the match was stopped while the question was open
          s.asking = false; ck.run = null;
          s.used = Math.round(Math.max(0, Math.min(a.lim, now() - q.t0))); s.late = q.late;
          charge(me, s.used, a.own); paint();
        }
      }
      s.sendNext = true;
      return r;
    };
    const mine = {
      takeMain: (g, pi, a) => ask(() => local.takeMain(g, pi, a), () => ({ kind: 'end' })),
      respond: (g, pi, w) => ask(() => local.respond(g, pi, w), () => (w.noSkip ? w.options[0] : null)),
      choose: (g, req) => ask(() => local.choose(g, req), () => defaultChoice(req)),
    };
    const g = new NS.Game({
      names: st.names, ui, house: st.house, seed: st.seed,
      controllers: me === 0 ? [mine, remote] : [remote, mine],
      leaders: st.decks.map(d => NS.Cards.byId[d.leader]), decks: st.decks.map(NS.Cards.expand),
    });
    g.onDecision = k => {
      if (S !== s || !s.sendNext) return;
      s.sendNext = false;
      const m = { t: 'd', k, h: hash(g) };
      if (s.ck) { m.u = s.used; if (s.late) m.late = 1; }
      send(m);
    };
    s.g = g;
    if (s.ck) s.timer = setInterval(tick, 200);
    return g;
  }
  function onData(m) {
    if (!S) return;
    if (m.t === 'd') { if (S.waiter) { const w = S.waiter; S.waiter = null; w(m); } else S.queue.push(m); }
    else if (m.t === 'think') { S.think = { n: m.n, at: now() }; const w = S.ck && S.ck.wait; if (w && w.n === m.n && !w.t0) { w.t0 = S.think.at; paint(); } }
    else if (m.t === 'flag') finish(S.me, 'time');      // their bank ran out
    else if (m.t === 'claim') finish(1 - S.me, 'away'); // they waited past our limit without an answer from here
    else if (m.t === 'bye') gone('Your opponent left the match.');
    else if (m.t === 'desync') ended('The two games fell out of sync, so the match was stopped.');
  }
  function desync() { if (S.desync) return; S.desync = true; send({ t: 'desync' }); ended('The two games fell out of sync, so the match was stopped.'); }
  function onClose(c) { if (c !== conn) return; if (S) gone('Connection to your opponent was lost.'); else conn = null; /* a guest dropped before the match started: keep waiting */ }
  // The other player has gone. Their last decisions may still be waiting to be played out here (they can be a whole
  // animation ahead, even at the result screen), so the match only stops once it needs something they never sent.
  function gone(msg) {
    if (!S || S.over || S.g.over) return;
    if (S.waiter || S.asking) return ended(msg);
    S.gone = msg;
  }
  function ended(msg) {
    if (!S || S.over) return;
    S.over = true;
    const g = S.g, ui = S.ui;
    stopClock();
    S = null; g.abort(); reset();
    if (ui && ui.dismiss) ui.dismiss();
    const close = NS.View.modal(`<h2>Match ended</h2><p>${esc(msg)}</p><div class="row-btns"><button class="btn primary" id="neOk">Back to menu</button></div>`, m => {
      m.querySelector('#neOk').onclick = () => { close(); NS.Screens.show('title'); NS.Audio.playTrack('title'); };
    });
  }
  // decided by the clock: the match stops here and goes to the result screen
  function finish(winner, why) {
    if (!S || S.over || S.g.over) return;
    const g = S.g, ui = S.ui;
    stopClock();
    S.over = true;
    g.abort(); g.over = true; g.winner = winner; g.phase = 'over';
    g.say(`${g.p(1 - winner).name} ${why === 'time' ? 'ran out of time' : 'stopped responding'}.`, 'win');
    ui.dismiss(); ui.render({ noFlip: true });
    NS.Screens.showResult(g, { winner, why }, ui);
  }
  // called whenever the local player leaves the game screen
  function leave() {
    if (S) { send({ t: 'bye' }); stopClock(); S.over = true; S = null; }
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

  NS.Net = { init, open, leave, active: () => !!S, defaultChoice, _hash: hash, _test: { wire, recv: onData, tick, CLOCK, state: () => S, out: f => { out = f; }, now: f => { now = f; } } };
})();
