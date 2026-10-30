/* ============================================================
   REPLAYS — finished games kept in this browser and played back
   with every card face-up.
   A game is fully determined by its seed, decks, House Rules and the
   list of decisions the engine logs (Game.decide), so a replay is just
   those: a few KB each, in localStorage, nothing sent anywhere.
   ============================================================ */
(function () {
  const NS = window.NTCG = window.NTCG || {};
  const KEY = 'ncg.replays', MAX = 30;
  const STOP = { message: 'aborted' }; // what the engine treats as an abort
  const VER = ((typeof document !== 'undefined' && document.currentScript && document.currentScript.src.match(/[?&]v=(\w+)/)) || [])[1] || '';
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const LEVELS = { genin: 'Genin AI', chunin: 'Chunin AI', jonin: 'Jonin AI', kage: 'Kage AI', hokage: 'Hokage AI' };

  // ---------------- storage ----------------
  function list() { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
  function keep(all) { // newest first; when storage is full the oldest replays go first
    for (let n = Math.min(all.length, MAX); n > 0; n--) {
      try { localStorage.setItem(KEY, JSON.stringify(all.slice(0, n))); return true; } catch (e) { /* full or unavailable: try with fewer */ }
    }
    return false;
  }
  const get = id => list().find(r => r.id === id) || null;
  function remove(id) { keep(list().filter(r => r.id !== id)); }
  // what the end of a game looked like, to notice a replay that no longer plays out the same (rules changed since)
  const ending = g => JSON.stringify([g.winner, g.turn, g.players.map(P => [P.leader.life, P.chars.length, P.trash.length, P.deck.length])]);

  // Called once a match is decided (result screen). Returns the saved replay, or null.
  function save(g, d, ui) {
    if (!g || g.opts.tutorial || !g.log || !g.log.length || !g.opts.decks) return null;
    if (g.replayId) return get(g.replayId);
    const o = ui.opts || {};
    const who = [0, 1].map(i => o.online ? (i === ui.viewPi ? 'You' : 'Online') : o.hotseat ? 'Local' : i === ui.viewPi ? 'You' : (LEVELS[g.opts.ai] || 'AI'));
    const rec = {
      v: 1, id: 'r' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36), at: Date.now(), ver: VER,
      names: g.players.map(P => P.name), leaders: g.players.map(P => P.leader.card.id), who,
      decks: g.opts.decks.map(dk => dk.map(c => c.id)),
      seed: g.seed, first: g.opts.first, noShuffle: !!g.opts.noShuffle, house: g.house,
      log: g.log.slice(), view: o.hotseat ? 0 : ui.viewPi,
      winner: d.winner, why: d.why || '', turns: g.turn, end: ending(g),
    };
    g.replayId = rec.id;
    return keep([rec].concat(list())) ? rec : null;
  }

  // ---------------- rebuilding a game ----------------
  function newGame(rec, o) {
    return new NS.Game(Object.assign({
      names: rec.names, house: rec.house, seed: rec.seed, first: rec.first, noShuffle: rec.noShuffle,
      leaders: rec.leaders.map(id => NS.Cards.byId[id]),
      decks: rec.decks.map(dk => dk.map(id => NS.Cards.byId[id])),
    }, o));
  }
  // Play the whole recording without the board, keeping the position at the start of every turn
  // (turns[k] = before turn k + 1), so playback can jump to any turn at once.
  async function scan(rec) {
    const ids = rec.leaders.concat(...rec.decks);
    if (ids.some(id => !NS.Cards.byId[id])) return { error: 'This replay uses cards this version of the simulator does not have.' };
    const halt = { takeMain: () => Promise.reject(STOP), respond: () => Promise.reject(STOP), choose: () => Promise.reject(STOP) };
    const g = newGame(rec, { controllers: [halt, halt], replay: rec.log.slice() }), turns = [];
    const snap = g.snapshot;
    g.snapshot = function () { const s = snap.call(this); turns.push({ s: JSON.parse(JSON.stringify(s)), at: this.log.length }); return s; };
    try { await g.start(); } catch (e) { return { error: 'This replay could not be played back.' }; }
    // the same game if it used up the recording and ended as it did (or stopped where the clock stopped it)
    const same = g.log.length === rec.log.length && (g.over ? !rec.end || ending(g) === rec.end : !!rec.why);
    return { turns, same };
  }

  // ---------------- playback ----------------
  let S = null; // the replay being watched
  class Player {
    constructor(rec, sc) {
      this.rec = rec; this.sc = sc; this.view = rec.view || 0;
      this.playing = true; this.stepping = false; this.events = 0; this.jumps = 0;
      this.onKey = e => this.key(e);
      document.addEventListener('keydown', this.onKey);
    }
    // a fresh board and game: from the very start (k = 0) or from the start of turn k
    mount(k) {
      const rec = this.rec, N = this.sc.turns.length;
      k = Math.max(0, Math.min(N, k | 0));
      const ui = new NS.GameUI({ humans: [false, false], view: this.view, replay: this, reveal: true });
      const ctl = { takeMain: () => this.tail(), respond: () => this.tail(), choose: () => this.tail() };
      const g = k ? newGame(rec, { ui, controllers: [ctl, ctl], decks: [[], []] }) : newGame(rec, { ui, controllers: [ctl, ctl], replay: rec.log.slice() });
      g.onStep = () => this.step(g);
      ui.setGame(g);
      NS.Screens.setGame(g, ui);
      this.g = g; this.ui = ui; this.turn = k; this.sinceTurn = 0; this.done = false;
      const t = this.sc.turns[k - 1];
      this.run = k ? g.resume(t.s, rec.log.slice(t.at)) : g.start(); // both set the position up before their first await
      ui.render({ noFlip: true });
      this.bar();
    }
    // GameUI.onEvent asks here before showing each event
    async gate(type, g) {
      if (g !== this.g) throw STOP;
      if (type === 'turn') { this.turn = g.turn; this.sinceTurn = 0; this.bar(); }
      this.sinceTurn++; this.events++;
      if (!this.playing) await this.hold(g);
    }
    // the engine asks here before each recorded decision: "next" stops at the first one after something happened
    async step(g) {
      if (g !== this.g) throw STOP;
      if (this.stepping && this.events > 0) { this.stepping = false; this.playing = false; this.bar(); }
      if (!this.playing) await this.hold(g);
    }
    hold(g) { return new Promise((res, rej) => { this.waiter = { res, rej, g }; }); }
    release() { const w = this.waiter; this.waiter = null; if (w) w.res(); }
    // the recording is used up before the game ended (the clock stopped it, or the rules changed since)
    tail() {
      this.finish(null);
      return new Promise((res, rej) => { this.tailRej = rej; });
    }
    finish(d) {
      if (this.done) return;
      this.done = true; this.playing = false; this.stepping = false;
      const rec = this.rec, w = d ? d.winner : rec.winner;
      const name = w != null ? esc(rec.names[w]) : '';
      const why = d ? '' : rec.why === 'time' ? ` (${esc(rec.names[1 - w])} ran out of time)` : rec.why === 'away' ? ` (${esc(rec.names[1 - w])} stopped responding)` : '';
      if (!d && !rec.why) this.ui.toast(rec.ver && rec.ver !== VER ? 'The replay stops here: it was recorded on an older version of the simulator, and the rules have changed since.' : 'The recording ends here.');
      else if (name) this.ui.toast(`<b>${name}</b> wins${why}`);
      this.bar();
    }
    async stop() {
      const g = this.g; if (!g) return;
      this.g = null;
      g.abort();
      const w = this.waiter; this.waiter = null; if (w) w.rej(STOP);
      if (this.tailRej) { this.tailRej(STOP); this.tailRej = null; }
      try { await this.run; } catch (e) { /* aborted */ }
    }
    async jump(k) {
      const id = ++this.jumps;
      this.bar(true);
      await this.stop();
      if (id !== this.jumps || S !== this) return;
      clearFx();
      this.events = 0; this.stepping = false;
      this.mount(k);
    }
    play() { if (this.done) return this.jump(0).then(() => this.play()); this.playing = true; this.stepping = false; this.release(); this.bar(); }
    pause() { this.playing = false; this.stepping = false; this.bar(); }
    next() { if (this.done) return; this.stepping = true; this.events = 0; this.playing = true; this.release(); this.bar(); }
    prev() { this.jump(this.sinceTurn > 2 || this.done ? this.turn : this.turn - 1); }
    flip() { this.view = 1 - this.view; if (this.ui) { this.ui.viewPi = this.view; this.ui.render({ noFlip: true }); } }
    key(e) {
      if (S !== this || e.target.closest('input, textarea') || document.querySelector('.modal-back.show')) return;
      if (e.key === ' ') { e.preventDefault(); this.playing ? this.pause() : this.play(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); e.shiftKey ? this.jump(this.turn + 1) : this.next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); this.prev(); }
    }
    async exit() {
      if (S !== this) return;
      S = null;
      document.removeEventListener('keydown', this.onKey);
      const b = $('#replayBar'); if (b) b.remove();
      await this.stop();
      NS.Screens.show('title'); NS.Audio.playTrack('title');
      openList();
    }
    // ---- control bar (sits where End Turn is during a match) ----
    bar(busy) {
      let b = $('#replayBar');
      if (!b) {
        b = document.createElement('div');
        b.id = 'replayBar'; b.className = 'replay-bar';
        b.innerHTML = `<span class="rb-tag">Replay</span>
          <button class="iconbtn" data-a="restart" title="Back to the start">${NS.icon('restart')}</button>
          <button class="iconbtn" data-a="prev" title="Start of this turn / previous turn (Left arrow)">${NS.icon('prevTurn')}</button>
          <button class="iconbtn rb-play" data-a="play" title="Play / pause (Space)"></button>
          <button class="iconbtn" data-a="next" title="Next action (Right arrow)">${NS.icon('step')}</button>
          <button class="iconbtn" data-a="nextTurn" title="Next turn (Shift + Right arrow)">${NS.icon('nextTurn')}</button>
          <input type="range" class="rb-range" min="0" step="1">
          <span class="rb-at"></span>
          <button class="iconbtn rb-speed" data-a="speed" title="Animation speed"></button>
          <button class="iconbtn" data-a="flip" title="Swap sides">${NS.icon('swap')}</button>
          <button class="iconbtn" data-a="exit" title="Leave the replay">${NS.icon('close')}</button>`;
        $('#screen-game').appendChild(b);
        b.onclick = e => {
          const a = e.target.closest('[data-a]'); if (!a || S !== this) return;
          NS.Audio.play('click');
          ({ restart: () => this.jump(0), prev: () => this.prev(), play: () => (this.playing ? this.pause() : this.play()), next: () => this.next(),
            nextTurn: () => this.jump(this.turn + 1), speed: () => { NS.settings.cycleSpeed(); this.bar(); }, flip: () => this.flip(), exit: () => this.exit() })[a.dataset.a]();
        };
        const r = $('.rb-range', b);
        r.oninput = () => { $('.rb-at', b).textContent = label(+r.value, this.sc.turns.length); };
        r.onchange = () => this.jump(+r.value);
      }
      const N = this.sc.turns.length, r = $('.rb-range', b);
      r.max = N; if (document.activeElement !== r) r.value = this.turn;
      $('.rb-at', b).textContent = this.done ? 'End' : label(this.turn, N);
      $('.rb-play', b).innerHTML = NS.icon(this.playing ? 'pause' : 'play');
      $('.rb-speed', b).textContent = { slow: '0.7x', normal: '1x', fast: '2x', turbo: '6x' }[NS.settings.speed] || '1x';
      b.querySelector('[data-a="nextTurn"]').disabled = this.turn >= N;
      b.classList.toggle('busy', !!busy);
    }
  }
  const label = (k, N) => k ? `Turn ${k} / ${N}` : 'Start';
  function clearFx() {
    document.querySelectorAll('.cutin, .phase-banner, .speedlines, .atk-overlay, .outcome, .afterimage, .resp-pill, .float-text').forEach(e => e.remove());
    const mb = $('#modalBack'); if (mb) mb.className = 'modal-back';
    if (NS.FXGL && NS.FXGL.stop) NS.FXGL.stop();
  }

  async function watch(id) {
    const rec = typeof id === 'string' ? get(id) : id;
    if (!rec) return;
    const sc = await scan(rec);
    if (sc.error) return NS.Screens.alert('Replay', esc(sc.error));
    if (S) await S.exit();
    $('#result').classList.remove('show');
    const mb = $('#modalBack'); if (mb) mb.className = 'modal-back';
    S = new Player(rec, sc);
    NS.Screens.show('game');
    NS.Audio.playTrack('battle');
    S.mount(0);
    if (!sc.same) S.ui.toast('This replay was recorded on an older version of the simulator and may not play out exactly as it happened.');
  }

  // ---------------- list ----------------
  function when(t) {
    const d = new Date(t), s = (Date.now() - t) / 1000;
    if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  function openList() {
    const all = list();
    const side = (r, i) => { const L = NS.Cards.byId[r.leaders[i]]; return `<span class="rl-p ${r.winner === i ? 'won' : ''}"><i style="${L ? NS.View.portraitCSS(L, 1.5) : ''}"></i><span><b>${esc(r.names[i])}</b><small>${esc(r.who[i])}${L ? ' · ' + esc(L.name) : ''}</small></span></span>`; };
    const rows = all.map(r => `<div class="rl-row" data-id="${r.id}">${side(r, 0)}<span class="rl-vs">vs</span>${side(r, 1)}
      <span class="rl-meta">${r.winner != null ? esc(r.names[r.winner]) + ' won' : 'Unfinished'} · Turn ${r.turns}<br><small>${r.shared ? 'Shared · ' : ''}${when(r.at)}</small></span>
      <button class="btn small primary" data-w="${r.id}">${NS.icon('play')} Watch</button><button class="btn small ghost" data-s="${r.id}">Share</button><button class="btn small ghost" data-d="${r.id}">Delete</button></div>`).join('');
    const close = NS.View.modal(`<h2>Replays</h2><p>Your last ${MAX} finished games are kept in this browser. Replays show both players' hands and face-down Supports. Share one as a code or a file, and anyone with the simulator can watch it.</p>
      <div class="rl-list">${rows || '<div class="rl-empty">No replays yet. Finish a match and it appears here.</div>'}</div>
      <div class="row-btns"><button class="btn" id="rlOpen">Open a shared replay</button><button class="btn" id="rlClose">Close</button></div>`, m => {
      $('#rlClose', m).onclick = () => close();
      $('#rlOpen', m).onclick = () => { NS.Audio.play('click'); close(); openShared(); };
      m.onclick = e => {
        const w = e.target.closest('[data-w]'), s = e.target.closest('[data-s]'), d = e.target.closest('[data-d]');
        if (w) { NS.Audio.play('click'); close(); watch(w.dataset.w); }
        if (s) { NS.Audio.play('click'); close(); share(s.dataset.s); }
        if (d) {
          if (d.dataset.sure) { remove(d.dataset.d); close(); openList(); return; }
          d.dataset.sure = '1'; d.textContent = 'Delete?'; d.classList.add('sure');
        }
      };
    }, 'replays');
  }

  // ---------------- sharing ----------------
  // A replay travels as a short code: "NCG1." and the record, deflated and base64url-encoded ("NCG0." uncompressed,
  // for browsers without CompressionStream), or as a .json file of the record. Nothing goes through a server.
  const b64 = {
    enc: u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
    dec: t => { const s = atob(t.replace(/-/g, '+').replace(/_/g, '/')), u8 = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i); return u8; },
  };
  const through = async (u8, stream) => new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(stream)).arrayBuffer());
  const portable = rec => { const o = Object.assign({}, rec); delete o.id; delete o.shared; return o; };
  async function toCode(rec) {
    const raw = new TextEncoder().encode(JSON.stringify(portable(rec)));
    if (typeof CompressionStream === 'function') return 'NCG1.' + b64.enc(await through(raw, new CompressionStream('deflate-raw')));
    return 'NCG0.' + b64.enc(raw);
  }
  const problem = msg => Object.assign(new Error(msg), { shown: true }); // a reason worth showing the player as it is
  // a code or a file's text back into a replay record; it came from someone else, so only known fields of the right
  // kind are kept
  async function fromText(t) {
    t = String(t || '').trim();
    let r;
    if (t[0] === '{') r = JSON.parse(t);
    else {
      const m = t.replace(/\s+/g, '').match(/^NCG([01])\.([A-Za-z0-9_-]+)$/);
      if (!m) throw problem('That is not a replay code. It starts with NCG1.');
      let u8 = b64.dec(m[2]);
      if (m[1] === '1') {
        if (typeof DecompressionStream !== 'function') throw problem('This browser cannot open replay codes. Try the replay file instead.');
        u8 = await through(u8, new DecompressionStream('deflate-raw'));
      }
      r = JSON.parse(new TextDecoder().decode(u8));
    }
    const two = x => Array.isArray(x) && x.length === 2;
    if (!r || r.v !== 1 || !two(r.names) || !two(r.leaders) || !two(r.decks) || !r.decks.every(Array.isArray) || !Array.isArray(r.log)) throw problem('This replay is damaged or from a newer version of the simulator.');
    const house = {};
    for (const k in NS.HOUSE_DEFAULTS) if (r.house && typeof r.house[k] === typeof NS.HOUSE_DEFAULTS[k]) house[k] = r.house[k];
    const side = i => i === 0 || i === 1 ? i : null;
    return {
      v: 1, id: 'r' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36), at: +r.at || Date.now(), ver: String(r.ver || '').slice(0, 20), shared: true,
      names: r.names.map(s => String(s).slice(0, 40)), leaders: r.leaders.map(String), who: (two(r.who) ? r.who : ['', '']).map(s => String(s).slice(0, 20)),
      decks: r.decks.map(d => d.slice(0, 80).map(String)), seed: r.seed >>> 0, first: side(r.first) == null ? undefined : r.first, noShuffle: !!r.noShuffle,
      house: Object.assign({}, NS.HOUSE_DEFAULTS, house), log: r.log.slice(0, 20000).map(k => k | 0), view: side(r.view) || 0,
      winner: side(r.winner), why: ['time', 'away', 'quit'].includes(r.why) ? r.why : '', turns: +r.turns | 0, end: typeof r.end === 'string' ? r.end.slice(0, 400) : undefined,
    };
  }
  async function share(id) {
    const rec = get(id);
    if (!rec) return;
    const code = await toCode(rec);
    const close = NS.View.modal(`<h2>Share Replay</h2><p>${esc(rec.names[0])} vs ${esc(rec.names[1])}, turn ${rec.turns}. Send this code to anyone with the simulator: they open it in <b>Replays</b> with <b>Open a shared replay</b>. It shows both players' hands. The file holds the same game, for attaching.</p>
      <textarea class="rl-code" readonly spellcheck="false">${esc(code)}</textarea><p class="rl-note"></p>
      <div class="row-btns"><button class="btn primary" id="rsCopy">Copy code</button><button class="btn" id="rsFile">Download file</button><button class="btn" id="rsBack">Back</button></div>`, m => {
      const ta = $('.rl-code', m), note = $('.rl-note', m);
      ta.onfocus = () => ta.select();
      $('#rsCopy', m).onclick = async () => {
        let ok = false;
        try { await navigator.clipboard.writeText(code); ok = true; } catch (e) { ta.focus(); ta.select(); try { ok = document.execCommand('copy'); } catch (e2) { /* select it for the player instead */ } }
        note.textContent = ok ? `Copied (${code.length} characters).` : 'Select the code and copy it.';
      };
      $('#rsFile', m).onclick = () => {
        const a = document.createElement('a'), d = new Date(rec.at), stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        a.href = URL.createObjectURL(new Blob([JSON.stringify(portable(rec))], { type: 'application/json' }));
        a.download = `naruto-replay-${stamp}-${rec.names.join('-vs-').replace(/[^\w-]+/g, '_').slice(0, 60)}.json`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      };
      $('#rsBack', m).onclick = () => { close(); openList(); };
    }, 'replays');
  }
  function openShared() {
    const close = NS.View.modal(`<h2>Open a Shared Replay</h2><p>Paste a replay code, or choose a replay file. It is added to your replays and starts playing.</p>
      <textarea class="rl-code" spellcheck="false" placeholder="NCG1.…"></textarea><p class="rl-note"></p><input type="file" accept=".json,application/json" hidden>
      <div class="row-btns"><button class="btn primary" id="roWatch">Watch</button><button class="btn" id="roFile">Choose file…</button><button class="btn" id="roBack">Back</button></div>`, m => {
      const ta = $('.rl-code', m), note = $('.rl-note', m), file = $('input[type=file]', m);
      const open = async text => {
        try {
          const rec = await fromText(text);
          const sc = await scan(rec);
          if (sc.error) throw problem(sc.error);
          keep([rec].concat(list()));
          close(); watch(rec);
        } catch (e) { note.textContent = e && e.shown ? e.message : 'That replay could not be read. Check that the whole code was copied.'; }
      };
      $('#roWatch', m).onclick = () => { if (ta.value.trim()) open(ta.value); else note.textContent = 'Paste a code first.'; };
      $('#roFile', m).onclick = () => file.click();
      file.onchange = async () => { const f = file.files[0]; if (f) open(await f.text()); };
      $('#roBack', m).onclick = () => { close(); openList(); };
      ta.focus();
    }, 'replays');
  }

  NS.Replay = { save, watch, openList, list, _scan: scan, _toCode: toCode, _fromText: fromText };
})();
