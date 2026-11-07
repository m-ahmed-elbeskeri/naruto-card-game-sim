/* ============================================================
   SCREENS — title, setup, builder, gallery, rules, settings, result
   ============================================================ */
(function () {
  const NS = window.NTCG = window.NTCG || {};
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem('ncg.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('ncg.' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  };
  function show(id) {
    $$('.screen').forEach(s => s.classList.remove('active'));
    $('#screen-' + id).classList.add('active');
    document.body.classList.toggle('in-game', id === 'game');
    document.body.classList.toggle('on-title', id === 'title');
    const tv = document.getElementById('tVideo');
    if (tv && tv.src) { if (id === 'title') tv.play().catch(() => { }); else tv.pause(); }
    if (id !== 'game') {
      document.querySelectorAll('.coach').forEach(e => e.remove());
      document.querySelectorAll('.coach-focus').forEach(e => e.classList.remove('coach-focus'));
      document.querySelectorAll('.cutin, .phase-banner, .speedlines, .atk-overlay, .outcome, .afterimage, .resp-pill, .clock, .replay-bar').forEach(e => e.remove());
      $('#modalBack').classList.remove('show');
    }
    document.querySelectorAll('.popover').forEach(e => e.remove()); NS.View.hidePreview(true);
    if (id !== 'game' && NS.FXGL) NS.FXGL.stop();
  }

  // ---------------- title ----------------
  function buildTitle() {
    $('#backdrop').style.backgroundImage = `url('${NS.ASSETS.swirl}')`;
    $('#keyart').style.backgroundImage = `url('${NS.ASSETS.keyArt}')`;
    $('#logoImg').src = NS.ASSETS.logo;
    $('#tSwirl').style.backgroundImage = `url('${NS.ASSETS.swirl}')`;
    const wall = $('.t-wall');
    window.addEventListener('mousemove', e => {
      // parallax for the key art; the menu video stays still (moving a full-screen video every frame halved the frame rate)
      if (!document.body.classList.contains('on-title') || document.hidden || wall.classList.contains('has-video')) return;
      const lowfx = document.body.classList.contains('lowfx');
      const r = wall.getBoundingClientRect();
      wall.style.setProperty('--mx', ((e.clientX - r.left) / r.width - .5).toFixed(3));
      wall.style.setProperty('--my', ((e.clientY - r.top) / r.height - .5).toFixed(3));
    });
    titleParticles();
    // optional user live wallpaper
    const v = $('#tVideo');
    const tryVid = ['backgrounds/menu.mp4', 'backgrounds/menu.webm'];
    const next = () => { const src = tryVid.shift(); if (!src) return; v.src = src; };
    v.addEventListener('error', next);
    v.addEventListener('canplay', () => { wall.classList.add('has-video'); v.play().catch(() => { }); }, { once: true });
    next();
    // click shockwave on the menu
    window.addEventListener('pointerdown', e => {
      if (!document.body.classList.contains('on-title') || e.target.closest('.btn')) return;
      const r = document.createElement('div'); r.className = 'click-ripple'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px';
      document.body.appendChild(r); setTimeout(() => r.remove(), 750);
      NS.FX.chakra(e.clientX, e.clientY, { color: '#ffb347', count: 30 });
    });
  }
  // Embers drifting up, and chakra motes orbiting the Rasengan. They are small elements moved by CSS animations, which
  // the browser runs without repainting anything: the full-screen canvas this used to be was redrawn every frame and
  // cost ~20 ms a frame over the menu video, so the menu ran at ~30 fps with stalls.
  function titleParticles() {
    const rnd = (a, b) => a + Math.random() * (b - a), f = (x, n) => x.toFixed(n == null ? 1 : n);
    $('#tEmbers').innerHTML = Array.from({ length: 22 }, (_, i) => { // ~2x this many animated layers made Intel graphics drop to ~35 fps
      const s = rnd(5, 15), d = rnd(9, 22);
      return `<i class="e${i % 3}" style="left:${f(rnd(-8, 62))}%;width:${f(s)}px;height:${f(s)}px;animation-duration:${f(d)}s;animation-delay:-${f(rnd(0, d))}s"><b class="${i % 4 ? '' : 'pale'}" style="animation-duration:${f(rnd(1.4, 3.2))}s;animation-delay:-${f(rnd(0, 3))}s"></b></i>`;
    }).join('');
    $('#tOrbit').innerHTML = Array.from({ length: 24 }, () => { const d = rnd(1.4, 3.6); return `<i style="--r:${f(rnd(40, 130), 0)}px;--s:${f(rnd(6, 16), 0)}px;animation-duration:${f(d, 2)}s;animation-delay:-${f(rnd(0, d), 2)}s"></i>`; }).join('');
  }

  // ---------------- decks ----------------
  const customDecks = () => store.get('decks', []);
  function allDecks() {
    return NS.STARTERS.map(d => Object.assign({ kind: 'Starter' }, d))
      .concat(customDecks().map(d => Object.assign({ kind: 'Custom', desc: 'Your custom deck' }, d)));
  }
  function deckById(id) { return allDecks().find(d => d.id === id) || NS.STARTERS[0]; }
  function playable(def) { return NS.Cards.validate(NS.Cards.fitDeck(def)).length === 0; }

  // ---------------- setup ----------------
  const setup = { hot: false, pick: 'me', me: 'st-red', opp: 'st-blue', lv: 'chunin' };
  const THINK_NOTES = {
    quick: 'Plays faster. Up to 0.7s per move, about 40 seconds of thinking per game. In tests it played about as well as normal.',
    normal: 'The standard Hokage. Up to 1.4s per move, about a minute of thinking per game.',
    long: 'Searches deeper. Up to 3.5s per move, about 3 minutes of thinking per game. Tests so far found no clear gain over normal.',
    'very long': 'Searches deeper still. Up to 7s per move, about 6 minutes of thinking per game. Tests so far found no clear gain over normal.',
    extreme: 'As deep as it goes. Up to 28s per move, about 25 minutes of thinking per game. Tests so far found no clear gain over normal, and it uses a lot of memory and battery.',
  };
  function syncThink() {
    $('#thinkField').style.display = !setup.hot && setup.lv === 'hokage' ? '' : 'none';
    const t = THINK_NOTES[NS.settings.think] ? NS.settings.think : 'normal';
    $$('#thinkSeg button').forEach(b => b.classList.toggle('on', b.dataset.th === t));
    $('#thinkNote').textContent = THINK_NOTES[t] + ' A faster device gets more out of the same time.';
  }
  function openSetup(hot) {
    setup.hot = hot;
    $('#setupTitle').textContent = hot ? 'Local Duel' : 'Choose Your Deck';
    $('#aiField').style.display = hot ? 'none' : '';
    syncThink();
    $('#nameMe').value = store.get('myName', 'Player');
    $('#nameOpp').value = hot ? 'Player 2' : store.get('oppName', 'Rival');
    renderDecks();
    show('setup');
  }
  function renderDecks() {
    $('#deckGrid').innerHTML = allDecks().map(d => {
      const L = NS.Cards.byId[d.leader];
      const ok = playable(d);
      return `<div class="deck-tile ${setup.me === d.id ? 'sel' : ''} ${setup.opp === d.id ? 'sel-opp' : ''}" data-id="${d.id}">
        <div class="dt-art" style="${NS.View.portraitCSS(L, 1.25)}"></div><div class="dt-shade"></div>
        <div class="dt-tag" style="color:${L.color === 'red' ? 'var(--red)' : 'var(--blue)'}">${d.kind} · ${L.color}</div>
        ${setup.me === d.id ? '<div class="dt-badge" style="background:var(--me)">YOU</div>' : ''}${setup.opp === d.id ? `<div class="dt-badge" style="background:var(--opp);top:${setup.me === d.id ? 40 : 12}px">OPPONENT</div>` : ''}
        <div class="dt-info"><div class="dt-name">${esc(d.name)}</div><div class="dt-desc">${esc(d.desc || '')}${ok ? '' : ' <b style="color:#ff9a8a">(not legal under current House Rules)</b>'}</div></div></div>`;
    }).join('');
    $('#matchup').innerHTML = `<b style="color:var(--me)">${esc(deckById(setup.me).name)}</b><br><span style="color:var(--dim)">vs</span><br><b style="color:var(--opp)">${esc(deckById(setup.opp).name)}</b>`;
  }
  function bindSetup() {
    $('#deckGrid').onclick = e => {
      const t = e.target.closest('.deck-tile'); if (!t) return;
      NS.Audio.play('click');
      setup[setup.pick] = t.dataset.id;
      renderDecks();
    };
    $('#pickMe').onclick = () => { setup.pick = 'me'; $('#pickMe').classList.add('on'); $('#pickOpp').classList.remove('on'); };
    $('#pickOpp').onclick = () => { setup.pick = 'opp'; $('#pickOpp').classList.add('on'); $('#pickMe').classList.remove('on'); };
    $$('#aiSeg button').forEach(b => b.onclick = () => { $$('#aiSeg button').forEach(x => x.classList.remove('on')); b.classList.add('on'); setup.lv = b.dataset.lv; if (setup.lv === 'hokage' && NS.AZ) NS.AZ.warm(); syncThink(); });
    $$('#thinkSeg button').forEach(b => b.onclick = () => { NS.settings.save({ think: b.dataset.th }); syncThink(); });
    $('#startBtn').onclick = startGame;
  }

  let game = null, ui = null;
  function startGame() {
    NS.Audio.ensure(); NS.Audio.play('taiko');
    const defs = [deckById(setup.me), deckById(setup.opp)].map(d => NS.Cards.fitDeck(d));
    const errs = defs.map(d => NS.Cards.validate(d));
    if (errs[0].length || errs[1].length) return alertModal('Deck not legal', errs.flat().join('<br>') + '<br><br>Adjust the House Rules (Settings) or edit the deck.');
    const names = [($('#nameMe').value || 'Player').slice(0, 16), ($('#nameOpp').value || 'Rival').slice(0, 16)];
    store.set('myName', names[0]); if (!setup.hot) store.set('oppName', names[1]);
    if (game) game.abort();
    ui = new NS.GameUI({ humans: [true, setup.hot], hotseat: setup.hot });
    game = new NS.Game({
      names, ui, house: NS.house, ai: setup.hot ? null : setup.lv,
      controllers: [ui.controllerFor(0), setup.hot ? ui.controllerFor(1) : setup.lv === 'hokage' && NS.AZ ? NS.AZ.hokage() : new NS.AI.AIController(setup.lv)],
      leaders: defs.map(d => NS.Cards.byId[d.leader]),
      decks: defs.map(NS.Cards.expand),
    });
    ui.setGame(game);
    show('game');
    NS.Audio.playTrack('battle');
    ui.render({ noFlip: true });
    game.start();
  }
  function alertModal(title, html) {
    const close = NS.View.modal(`<h2>${title}</h2><p>${html}</p><div class="row-btns"><button class="btn small" id="aok">OK</button></div>`, m => { $('#aok', m).onclick = () => close(); });
  }
  function quit() { if (NS.Net) NS.Net.leave(); if (game) game.abort(); game = null; $('#result').classList.remove('show'); show('title'); NS.Audio.playTrack('title'); }
  function confirmQuit() {
    if (!game || game.over || game.phase === 'over') return quit(); // the match is already decided: nothing is abandoned
    const close = NS.View.modal(`<h2>Leave the match?</h2><p>The current game will be abandoned.</p><div class="row-btns"><button class="btn primary" id="qy">Quit</button><button class="btn" id="qn">Keep playing</button></div>`, m => {
      $('#qy', m).onclick = () => { close(); quit(); };
      $('#qn', m).onclick = () => close();
    });
  }
  // back from "View board" to the result screen (the End Turn button reads "Results" once the match is over)
  function reopenResult() { const r = $('#result'); if (r.innerHTML) r.classList.add('show'); }
  function showResult(g, d, ui) {
    const rec = NS.Replay ? NS.Replay.save(g, d, ui) : null;
    const w = d.winner, hot = !!ui.opts.hotseat;
    const humanWin = hot ? true : w === ui.viewPi;
    const online = !!ui.opts.online;
    const me = hot ? w : ui.viewPi, op = 1 - me, L = g.p(1 - w);
    const W = g.p(w).leader.card;
    const title = hot ? 'Winner' : humanWin ? 'Victory' : 'Defeat';
    const why = d.why === 'time' ? `${esc(L.name)} ran out of time` : d.why === 'away' ? `${esc(L.name)} stopped responding` : L.leader.life <= 0 ? `${esc(L.name)}'s Leader was defeated` : L.deck.length === 0 ? `${esc(L.name)} ran out of cards` : `${esc(g.p(w).name)} wins the match`;
    const st = ui.stats || [{}, {}];
    const secs = Math.max(0, Math.round((Date.now() - (ui.t0 || Date.now())) / 1000));
    const rows = [['Life left', i => Math.max(0, g.p(i).leader.life)], ['Attack damage', i => st[i].dmg || 0], ['Attacks', i => st[i].atk || 0], ['Characters summoned', i => st[i].sum || 0], ['Characters lost', i => st[i].lost || 0], ['Supports used', i => st[i].sup || 0]];
    const side = i => `<div class="r-side ${i === w ? 'won' : ''}"><i style="${NS.View.portraitCSS(g.p(i).leader.card, 1.5)}"></i><b>${esc(g.p(i).name)}</b><span>${i === w ? 'Winner' : 'Defeated'}</span></div>`;
    const r = $('#result');
    r.className = 'result show ' + (humanWin ? 'win' : 'lose');
    r.innerHTML = `<div class="r-art" style="${NS.View.portraitCSS(W, 1.15)}"></div><div class="r-shade"></div><div class="r-band"></div>
      <div class="r-kanji">${humanWin ? '勝利' : '敗北'}</div>
      <div class="r-motes">${Array.from({ length: 16 }, (_, i) => `<i style="--x:${(i * 61 + 7) % 100};--d:${(i * 37 % 50) / 10};--t:${5 + (i * 13 % 40) / 10};--s:${3 + i % 4}"></i>`).join('')}</div>
      <div class="r-body">
        <div class="r-cap">Match result <em>·</em> Turn ${g.turn} <em>·</em> ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}</div>
        <div class="r-title">${title.split('').map((c, i) => `<i style="--i:${i}">${c}</i>`).join('')}</div>
        <div class="r-sub">${hot ? esc(g.p(w).name) + ' · ' : ''}${why}</div>
        <div class="r-stats">
          <div class="r-head">${side(me)}<div class="r-vs">VS</div>${side(op)}</div>
          ${rows.map(([lbl, f], k) => `<div class="r-row" style="--k:${k}"><b data-n="${f(me)}">0</b><span>${lbl}</span><b data-n="${f(op)}">0</b></div>`).join('')}
        </div>
        <div class="row-btns">${online ? '<button class="btn primary" id="rA">Online lobby</button>' : '<button class="btn primary" id="rA">Rematch</button>'}<button class="btn" id="rM">Main menu</button><button class="btn ghost" id="rB">View board</button>${rec ? '<button class="btn ghost" id="rR">Watch replay</button>' : ''}</div>
      </div>`;
    NS.Audio.jingle(humanWin ? 'victory' : 'defeat');
    // count the numbers up once the table has slid in
    const t0 = performance.now() + 900, nums = $$('.r-row b', r);
    (function tick(t) {
      if (!r.classList.contains('show') || !nums[0].isConnected) return;
      const k = Math.min(1, Math.max(0, (t - t0) / 700)), e = 1 - Math.pow(1 - k, 3);
      nums.forEach(n => { n.textContent = Math.round(+n.dataset.n * e); });
      if (k < 1) requestAnimationFrame(tick);
    })(performance.now());
    $('#rA').onclick = () => { r.classList.remove('show'); if (online) { NS.Net.leave(); NS.Audio.playTrack('title'); return NS.Net.open(); } startGame(); };
    $('#rM').onclick = () => { r.classList.remove('show'); if (online) NS.Net.leave(); show('title'); NS.Audio.playTrack('title'); };
    $('#rB').onclick = () => { r.classList.remove('show'); ui.toast('Press <b>Results</b> to go back to the result screen'); };
    if (rec) $('#rR').onclick = () => { if (online) NS.Net.leave(); NS.Replay.watch(rec.id); };
  }

  // ---------------- card search and filters (Deck Builder and Revealed Cards) ----------------
  // Search words match a card's name, number, traits, ability text and Support (name, text, timing); every word must
  // match. Filters narrow by colour, type, Support timing, rarity, trait and (builder) whether the card is in the deck.
  const RAR = { L: 0, SR: 1, R: 2, C: 3 };
  const cardBlob = c => c._q || (c._q = [c.name, c.id, (c.traits || []).join(' '), (c.text || []).join(' '),
    c.support ? `support ${c.support.name} ${c.support.text} ${NS.TIMING[c.support.timing] || ''} cost ${c.support.cost}` : '',
    c.type === 'ex' ? 'ex' : c.type, c.color || '', c.rarity || ''].join(' ').toLowerCase());
  const newFilter = () => ({ q: '', color: 'all', type: 'all', sup: 'all', rar: 'all', trait: 'all', deck: 'all', sort: 'num' });
  const gF = newFilter(), bF = newFilter();
  const SORTS = {
    num: (a, b) => a.id.localeCompare(b.id), name: (a, b) => a.name.localeCompare(b.name),
    pow: (a, b) => (b.pow || 0) - (a.pow || 0), dmg: (a, b) => (b.dmg || 0) - (a.dmg || 0), hp: (a, b) => (b.hp || b.life || 0) - (a.hp || a.life || 0),
    cost: (a, b) => (a.support ? a.support.cost : 99) - (b.support ? b.support.cost : 99),
    rar: (a, b) => (a.rarity in RAR ? RAR[a.rarity] : 9) - (b.rarity in RAR ? RAR[b.rarity] : 9),
  };
  const words = q => q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const activeFilters = f => ['color', 'type', 'sup', 'rar', 'trait', 'deck'].filter(k => f[k] !== 'all').length;
  function filterCards(list, f, inDeck) {
    const w = words(f.q);
    return list.filter(c => w.every(x => cardBlob(c).includes(x))
      && (f.color === 'all' || c.color === f.color)
      && (f.type === 'all' || c.type === f.type)
      && (f.sup === 'all' || (f.sup === 'yes' ? !!c.support : f.sup === 'no' ? !c.support : !!c.support && c.support.timing === f.sup))
      && (f.rar === 'all' || c.rarity === f.rar)
      && (f.trait === 'all' || (c.traits || []).includes(f.trait))
      && (f.deck === 'all' || (f.deck === 'in' ? inDeck(c) > 0 : inDeck(c) === 0)))
      .sort((a, b) => SORTS[f.sort](a, b) || a.id.localeCompare(b.id));
  }
  // search box, filter menus (choices taken from the cards on offer), sort, clear, and the match count
  function filterBar(f, pool, o) {
    const sel = (k, label, items) => `<label class="fb-sel"><span>${label}</span><select data-f="${k}">${items.map(([v, l]) => `<option value="${esc(v)}"${f[k] === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
    const timings = Object.keys(NS.TIMING).filter(t => pool.some(c => c.support && c.support.timing === t));
    const traits = [...new Set(pool.flatMap(c => c.traits || []))].sort();
    const rar = ['L', 'SR', 'R', 'C'].filter(r => pool.some(c => c.rarity === r));
    const n = activeFilters(f);
    return `<div class="fbar">
      <div class="fb-row"><div class="fb-search">${NS.icon('search')}<input type="search" data-f="q" value="${esc(f.q)}" placeholder="Search name, trait, ability, Support..." autocomplete="off" spellcheck="false" aria-label="Search cards"></div>
        <button class="fb-more${n ? ' on' : ''}" data-more title="Filters">${NS.icon('filter')}<span>Filters${n ? ` (${n})` : ''}</span></button>
        <span class="fb-count"></span></div>
      <div class="fb-opts">
      ${o.color ? sel('color', 'Color', [['all', 'All'], ['red', 'Red'], ['blue', 'Blue']]) : ''}
      ${sel('type', 'Type', [['all', 'All'], ...(o.leaders ? [['leader', 'Leader']] : []), ['character', 'Character'], ['ex', 'EX Character']])}
      ${sel('sup', 'Support', [['all', 'Any'], ['yes', 'Has a Support'], ['no', 'No Support'], ...timings.map(t => [t, NS.TIMING[t].replace(/[[\]]/g, '')])])}
      ${sel('rar', 'Rarity', [['all', 'Any'], ...rar.map(r => [r, r])])}
      ${sel('trait', 'Trait', [['all', 'Any'], ...traits.map(t => [t, t])])}
      ${o.deck ? sel('deck', 'Show', [['all', 'All cards'], ['in', 'In this deck'], ['out', 'Not in this deck']]) : ''}
      ${sel('sort', 'Sort by', [['num', 'Number'], ['name', 'Name'], ['pow', 'POW, highest first'], ['dmg', 'DMG, highest first'], ['hp', 'HP, highest first'], ['cost', 'Support cost, lowest first'], ['rar', 'Rarity']])}
      <button class="btn small ghost fb-clear" data-clear>Clear</button></div>
    </div>`;
  }
  function bindFilterBar(box, f, onChange) {
    const bar = $('.fbar', box), more = $('[data-more]', box);
    const sync = () => { const n = activeFilters(f); more.classList.toggle('on', !!n); $('span', more).textContent = 'Filters' + (n ? ` (${n})` : ''); };
    $$('[data-f]', box).forEach(el => el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', () => { f[el.dataset.f] = el.value; sync(); onChange(); }));
    more.onclick = () => bar.classList.toggle('open');
    $('[data-clear]', box).onclick = () => { Object.assign(f, newFilter(), { sort: f.sort }); $$('[data-f]', box).forEach(el => { el.value = f[el.dataset.f]; }); sync(); onChange(); };
    const q = $('input[data-f="q"]', box);
    q.addEventListener('keydown', e => { if (e.key === 'Escape' && q.value) { e.stopPropagation(); q.value = ''; f.q = ''; onChange(); } });
    return q;
  }
  // "/" jumps to the search box on the Deck Builder and Revealed Cards screens
  document.addEventListener('keydown', e => {
    if (e.key !== '/' || /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '') || $('#modalBack').classList.contains('show')) return;
    const s = $('.screen.active input[data-f="q"]'); if (s) { e.preventDefault(); s.focus(); s.select(); }
  });

  // ---------------- gallery ----------------
  // the Chakra and Summon card art versions are listed after the playable cards (see NS.CHAKRA_ARTS)
  const extraCards = () => (NS.CHAKRA_ARTS || []).map(a => ({ type: 'chakra', name: 'Chakra Card', id: a.id === 'sample' ? 'C-001' : a.id, face: a.face, art: a.name, key: 'C:' + a.id }))
    .concat((NS.SUMMON_ARTS || []).map(a => ({ type: 'summoncard', name: 'Summon Card', id: a.id === 'sample' ? 'S-001' : a.id, face: a.face, art: a.name, key: 'S:' + a.id })));
  const extraById = {};
  function openGallery() {
    $('#gFilters').innerHTML = filterBar(gF, NS.Cards.all, { color: true, leaders: true });
    bindFilterBar($('#gFilters'), gF, renderGallery);
    renderGallery();
    show('gallery');
  }
  function renderGallery() {
    const list = filterCards(NS.Cards.all, gF, () => 0);
    // Chakra / Summon art shows when nothing but the search box is in use and the search fits it
    const ex = activeFilters(gF) ? [] : extraCards().filter(c => words(gF.q).every(x => `${c.name} ${c.art} ${c.id} ${c.type}`.toLowerCase().includes(x)));
    ex.forEach(c => { extraById[c.key] = c; });
    $('#gFilters .fb-count').textContent = `${list.length} of ${NS.Cards.all.length} cards`;
    $('#gPool').innerHTML = list.map(c => `<div class="pool-item" data-id="${c.id}">${NS.View.cardHTML(c, { w: 170 })}</div>`).join('')
      + ex.map(c => `<div class="pool-item" data-id="${c.key}">${NS.View.cardHTML(c, { w: 170 })}<div class="pi-art">${esc(c.art)}</div></div>`).join('')
      || `<div class="pool-empty">No cards match.</div>`;
  }
  function bindPreview(el) {
    el.addEventListener('mousemove', e => {
      const it = e.target.closest('[data-id]'); if (!it) return NS.View.hidePreview();
      const k = it.dataset.id, c = extraById[k] || NS.Cards.byId[k];
      if (c) NS.View.showPreview(c, e);
    });
    el.addEventListener('mouseleave', () => NS.View.hidePreview());
  }

  // ---------------- builder ----------------
  let deck = null, savedAs = ''; // savedAs: the deck as last saved (JSON), to show unsaved changes
  const newDeck = () => ({ id: 'd' + Date.now(), name: 'My Deck', leader: 'N-001', cards: {} });
  const deckTotal = d => Object.values(d.cards).reduce((a, b) => a + b, 0);
  const isDirty = () => JSON.stringify(deck) !== savedAs;
  const toast = m => NS.UIx && NS.UIx.toast(m);
  function setDeck(d, saved) { deck = d; savedAs = saved ? JSON.stringify(d) : ''; }
  function openBuilder() { if (!deck) setDeck(newDeck(), false); renderBuilder(); show('builder'); }
  function renderBuilder() { renderBuilderTop(); renderPool(); renderDeckPanel(); }
  function renderBuilderTop() {
    const H = NS.house, L = NS.Cards.byId[deck.leader];
    $('#bFilters').innerHTML = `<div class="fb-leaders"><span class="fb-lbl">Leader</span>${NS.Cards.leaders().map(l => `<button class="lead-chip ${deck.leader === l.id ? 'on' : ''}" data-l="${l.id}" style="--cc:${l.color === 'red' ? 'var(--red)' : 'var(--blue)'}"><i style="${NS.View.portraitCSS(l, 1.7)}"></i>${esc(l.name)}<small>${l.color}</small></button>`).join('')}
      <span class="fb-hint">${NS.touch ? 'Tap a card to add a copy' : 'Click a card to add a copy, right-click to take one out. Press / to search'} · ${H.deckSize} cards, up to ${H.copyLimit} of each</span></div>`
      + filterBar(bF, NS.Cards.poolFor(L.color), { deck: true });
    $$('[data-l]', $('#bFilters')).forEach(b => b.onclick = () => changeLeader(b.dataset.l));
    const q = bindFilterBar($('#bFilters'), bF, renderPool);
    q.addEventListener('keydown', e => { if (e.key === 'Enter') { const first = $('#bPool .pool-item'); if (first) addCard(first.dataset.id); } }); // Enter adds the first match
  }
  function changeLeader(id) {
    if (id === deck.leader) return;
    const color = NS.Cards.byId[id].color, gone = Object.keys(deck.cards).filter(k => NS.Cards.byId[k] && NS.Cards.byId[k].color !== color);
    const n = gone.reduce((a, k) => a + deck.cards[k], 0);
    deck.leader = id; gone.forEach(k => { delete deck.cards[k]; });
    NS.Audio.play('click'); renderBuilder();
    if (n) toast(`${n} card${n > 1 ? 's' : ''} of the other color taken out`);
  }
  function addCard(id) {
    const H = NS.house, q = deck.cards[id] || 0, c = NS.Cards.byId[id];
    if (!c) return;
    if (q >= H.copyLimit) return toast(`Up to ${H.copyLimit} copies of a card`);
    if (deckTotal(deck) >= H.deckSize) return toast(`The deck is full (${H.deckSize} cards)`);
    deck.cards[id] = q + 1; NS.Audio.play('card'); renderPool(); renderDeckPanel();
  }
  function removeCard(id) {
    if (!deck.cards[id]) return;
    if (!--deck.cards[id]) delete deck.cards[id];
    NS.Audio.play('click'); renderPool(); renderDeckPanel();
  }
  function renderPool() {
    const H = NS.house, pool = NS.Cards.poolFor(NS.Cards.byId[deck.leader].color), full = deckTotal(deck) >= H.deckSize;
    const list = filterCards(pool, bF, c => deck.cards[c.id] || 0);
    $('#bFilters .fb-count').textContent = `${list.length} of ${pool.length} cards`;
    $('#bPool').innerHTML = list.map(c => {
      const q = deck.cards[c.id] || 0;
      return `<div class="pool-item ${q >= H.copyLimit ? 'maxed' : ''} ${q ? 'has' : ''}" data-id="${c.id}">${NS.View.cardHTML(c, { w: 170 })}<div class="pi-ctl"><button data-dec="${c.id}" ${q ? '' : 'disabled'} aria-label="Take one out">${NS.icon('minus')}</button><b>${q}/${H.copyLimit}</b><button data-inc="${c.id}" ${q >= H.copyLimit || full ? 'disabled' : ''} aria-label="Add one">${NS.icon('plus')}</button></div></div>`;
    }).join('') || `<div class="pool-empty">No cards match.<br><button class="btn small ghost" data-clear2>Clear search and filters</button></div>`;
  }
  // deck codes: NTCG1;<leader>;<name>;<id>x<count>;... (the name URI-encoded), to share a deck as text
  const deckCode = d => ['NTCG1', d.leader, encodeURIComponent(d.name || 'Deck')].concat(Object.entries(d.cards).filter(e => e[1] > 0).sort().map(([id, n]) => `${id}x${n}`)).join(';');
  function parseDeckCode(s) {
    const p = String(s || '').trim().split(';');
    if (p[0] !== 'NTCG1' || !NS.Cards.byId[p[1]] || NS.Cards.byId[p[1]].type !== 'leader') return null;
    const d = { id: 'd' + Date.now(), name: (() => { try { return decodeURIComponent(p[2] || 'Imported deck').slice(0, 28); } catch (e) { return 'Imported deck'; } })(), leader: p[1], cards: {} };
    for (const e of p.slice(3)) { const m = /^([A-Z]+-\d+)x(\d+)$/.exec(e.trim()); if (!m || !NS.Cards.byId[m[1]]) return null; d.cards[m[1]] = (d.cards[m[1]] || 0) + Math.min(99, +m[2]); }
    return d;
  }
  function renderDeckPanel() {
    const H = NS.house, L = NS.Cards.byId[deck.leader], total = deckTotal(deck), errs = NS.Cards.validate(deck);
    const rows = Object.entries(deck.cards).map(([id, n]) => [NS.Cards.byId[id], n]).filter(r => r[0]);
    const cnt = l => l.reduce((a, r) => a + r[1], 0), sup = rows.filter(r => r[0].support);
    const avg = k => total ? (rows.reduce((a, [c, n]) => a + (c[k] || 0) * n, 0) / total).toFixed(1) : '-';
    const costs = [...new Set(sup.map(r => r[0].support.cost))].sort().map(k => `${cnt(sup.filter(r => r[0].support.cost === k))}x${k}`).join(' ');
    const row = ([c, n]) => `<div class="dl-row" style="--cc:${c.color === 'red' ? 'var(--red)' : 'var(--blue)'}" data-id="${c.id}"><span class="dl-name">${esc(c.name)} <small>${c.id} · POW ${c.pow}${c.support ? ` · ${esc(c.support.name)} (${c.support.cost})` : ''}</small></span><span class="dl-q"><button data-dec="${c.id}" aria-label="Take one out">${NS.icon('minus')}</button><b>${n}</b><button data-inc="${c.id}" ${n >= H.copyLimit || total >= H.deckSize ? 'disabled' : ''} aria-label="Add one">${NS.icon('plus')}</button></span></div>`;
    const group = (title, list) => list.length ? `<div class="dl-head">${title} <b>${cnt(list)}</b></div>` + list.sort((a, b) => a[0].name.localeCompare(b[0].name) || a[0].id.localeCompare(b[0].id)).map(row).join('') : '';
    const saved = customDecks().some(s => s.id === deck.id), dirty = isDirty();
    $('#bDeck').innerHTML = `<div class="dl-top"><input id="dlName" value="${esc(deck.name)}" maxlength="28" aria-label="Deck name"><span class="dl-dirty ${dirty ? 'on' : ''}">${dirty ? 'Unsaved' : 'Saved'}</span></div>
      <div class="dl-bar ${total === H.deckSize ? 'full' : ''}"><i style="width:${Math.min(100, total / H.deckSize * 100).toFixed(1)}%"></i><span>${total} / ${H.deckSize} cards</span></div>
      <div class="dl-stats"><span>Leader <b>${esc(L.name)}</b></span><span>EX <b>${cnt(rows.filter(r => r[0].type === 'ex'))}</b></span><span>With a Support <b>${cnt(sup)}</b></span></div>
      <div class="dl-stats"><span>Average POW <b>${avg('pow')}</b></span><span>DMG <b>${avg('dmg')}</b></span><span>Support costs <b>${costs || '-'}</b></span></div>
      <div class="dl-list">${group('Characters', rows.filter(r => r[0].type === 'character'))}${group('EX Characters', rows.filter(r => r[0].type === 'ex'))}${rows.length ? '' : `<div class="dl-empty">${NS.touch ? 'Tap cards above to add them,' : 'Click cards to add them,'} or press <b>Auto-fill</b> to complete the deck at random.</div>`}</div>
      <div class="dl-errs">${errs.length ? errs.map(esc).join('<br>') : `<span class="dl-ok">${NS.icon('check')} Legal deck</span>`}</div>
      <div class="dl-btns"><button class="btn primary" id="dS">${NS.icon('save')} Save</button><button class="btn" id="dL">${NS.icon('folder')} Decks</button><button class="btn" id="dN">New</button></div>
      <div class="dl-btns dl-btns2"><button class="btn small" id="dF">Auto-fill</button><button class="btn small" id="dC" ${rows.length ? '' : 'disabled'}>Clear</button><button class="btn small" id="dX">${NS.icon('copy')} Deck code</button><button class="btn small ghost" id="dD" ${saved ? '' : 'disabled'}>${NS.icon('bin')} Delete</button></div>`;
    $('#dlName').oninput = e => { deck.name = e.target.value; const d = $('.dl-dirty'); d.classList.toggle('on', isDirty()); d.textContent = isDirty() ? 'Unsaved' : 'Saved'; };
    $('#dS').onclick = () => { const all = customDecks(), i = all.findIndex(s => s.id === deck.id), copy = JSON.parse(JSON.stringify(deck)); if (i >= 0) all[i] = copy; else all.push(copy); store.set('decks', all); savedAs = JSON.stringify(deck); NS.Audio.play('upgrade'); toast('Deck saved'); renderDeckPanel(); };
    $('#dN').onclick = () => discardThen(() => { setDeck(newDeck(), false); renderBuilder(); });
    $('#dF').onclick = () => { deck = Object.assign(NS.Cards.fitDeck(deck), { id: deck.id, name: deck.name }); renderPool(); renderDeckPanel(); };
    $('#dC').onclick = () => { deck.cards = {}; renderPool(); renderDeckPanel(); };
    $('#dX').onclick = () => shareDeck();
    $('#dD').onclick = () => confirmBox('Delete this deck?', `"${esc(deck.name)}" will be removed from your saved decks.`, 'Delete', () => { store.set('decks', customDecks().filter(s => s.id !== deck.id)); setDeck(newDeck(), false); renderBuilder(); });
    $('#dL').onclick = () => openLibrary();
  }
  function confirmBox(title, text, yes, onYes) {
    const close = NS.View.modal(`<h2>${title}</h2><p>${text}</p><div class="row-btns"><button class="btn primary" id="cbY">${yes}</button><button class="btn" id="cbN">Cancel</button></div>`, m => {
      $('#cbY', m).onclick = () => { close(); onYes(); };
      $('#cbN', m).onclick = () => close();
    });
  }
  const discardThen = fn => (isDirty() && deckTotal(deck) ? confirmBox('Discard changes?', `"${esc(deck.name)}" has changes that are not saved.`, 'Discard', fn) : fn());
  function shareDeck() {
    const code = deckCode(deck);
    const close = NS.View.modal(`<h2>Deck code</h2><p>Copy this text to share "${esc(deck.name)}". Paste it under <b>Decks</b> &gt; <b>Import</b> to load it.</p><textarea class="rl-code" id="dcT" readonly>${esc(code)}</textarea><p class="rl-note" id="dcN"></p><div class="row-btns"><button class="btn primary" id="dcC">${NS.icon('copy')} Copy</button><button class="btn" id="dcX">Close</button></div>`, m => {
      const t = $('#dcT', m); t.focus(); t.select();
      $('#dcC', m).onclick = () => { const done = () => { $('#dcN', m).textContent = 'Copied.'; }; t.select(); if (navigator.clipboard) navigator.clipboard.writeText(code).then(done, () => { document.execCommand('copy'); done(); }); else { document.execCommand('copy'); done(); } };
      $('#dcX', m).onclick = () => close();
    });
  }
  // the deck library: your saved decks and the starters, searchable by deck name, Leader or a card in the deck
  function openLibrary() {
    const st = { q: '', color: 'all' };
    const byId = NS.Cards.byId;
    const close = NS.View.modal(`<h2>Decks</h2>${isDirty() && deckTotal(deck) ? `<p class="lib-warn">"${esc(deck.name)}" has unsaved changes. Opening another deck discards them.</p>` : ''}
      <div class="lib-tools"><div class="fb-search">${NS.icon('search')}<input type="search" id="libQ" placeholder="Search by deck name, Leader or a card in it" autocomplete="off" spellcheck="false"></div><div class="seg" id="libC"><button data-c="all" class="on">All</button><button data-c="red">Red</button><button data-c="blue">Blue</button></div></div>
      <div class="lib-list" id="libL"></div>
      <div class="lib-import"><textarea class="rl-code" id="libT" placeholder="Paste a deck code (NTCG1;...) here"></textarea><p class="rl-note" id="libN"></p></div>
      <div class="row-btns"><button class="btn" id="libI">Import code</button><button class="btn ghost" id="libX">Close</button></div>`, m => {
      const render = () => {
        const w = words(st.q);
        const all = customDecks().map(d => ({ d, mine: true })).concat(NS.STARTERS.map(d => ({ d, mine: false })));
        const list = all.filter(({ d }) => {
          const L = byId[d.leader]; if (!L) return false;
          const text = [d.name, L.name, L.color].concat(Object.keys(d.cards).map(id => byId[id] ? byId[id].name : '')).join(' ').toLowerCase();
          return (st.color === 'all' || L.color === st.color) && w.every(x => text.includes(x));
        });
        $('#libL', m).innerHTML = list.map(({ d, mine }, i) => {
          const L = byId[d.leader], ok = playable(d);
          return `<div class="lib-row" style="--cc:${L.color === 'red' ? 'var(--red)' : 'var(--blue)'}" data-i="${i}"><i style="${NS.View.portraitCSS(L, 1.7)}"></i><div class="lib-info"><b>${esc(d.name)}${d.id === deck.id ? ' <em>open</em>' : ''}</b><small>${mine ? 'Your deck' : 'Starter'} · ${esc(L.name)} · ${deckTotal(d)} cards${ok ? '' : ' · <span class="bad">not legal under the current House Rules</span>'}</small></div><div class="lib-acts"><button class="btn small" data-a="open">Open</button><button class="btn small ghost" data-a="dup">Copy</button>${mine ? `<button class="btn small ghost" data-a="del">${NS.icon('bin')}</button>` : ''}</div></div>`;
        }).join('') || '<div class="rl-empty">No decks match.</div>';
        $$('.lib-row', m).forEach(r => r.onclick = e => {
          const b = e.target.closest('[data-a]'); if (!b) return;
          const { d, mine } = list[+r.dataset.i], copy = JSON.parse(JSON.stringify(d));
          if (b.dataset.a === 'open') { close(); if (mine) setDeck(copy, true); else setDeck(Object.assign(copy, { id: 'd' + Date.now(), name: d.name.slice(0, 21) + ' (copy)' }), false); bF.q = ''; renderBuilder(); }
          else if (b.dataset.a === 'dup') { const c = Object.assign(copy, { id: 'd' + Date.now(), name: (d.name.slice(0, 21) + ' (copy)') }); store.set('decks', customDecks().concat([c])); toast('Copy saved'); render(); }
          else if (b.dataset.a === 'del') {
            if (!b.classList.contains('sure')) { b.classList.add('sure'); b.innerHTML = 'Delete?'; return; }
            store.set('decks', customDecks().filter(s => s.id !== d.id)); if (d.id === deck.id) savedAs = ''; render(); if (d.id === deck.id) renderDeckPanel();
          }
        });
      };
      $('#libQ', m).oninput = e => { st.q = e.target.value; render(); };
      $$('#libC button', m).forEach(b => b.onclick = () => { st.color = b.dataset.c; $$('#libC button', m).forEach(x => x.classList.toggle('on', x === b)); render(); });
      $('#libI', m).onclick = () => {
        const d = parseDeckCode($('#libT', m).value);
        if (!d) { $('#libN', m).textContent = 'That is not a deck code this simulator can read.'; return; }
        close(); setDeck(d, false); renderBuilder(); toast(`Imported "${d.name}". Save it to keep it.`);
      };
      $('#libX', m).onclick = () => close();
      render();
      if (!NS.touch) $('#libQ', m).focus();
    }, 'lib');
  }
  function bindBuilder() {
    $('#bPool').addEventListener('click', e => {
      const inc = e.target.closest('[data-inc]'), dec = e.target.closest('[data-dec]');
      if (dec) return removeCard(dec.dataset.dec);
      if (inc) return addCard(inc.dataset.inc);
      if (e.target.closest('[data-clear2]')) { Object.assign(bF, newFilter(), { sort: bF.sort }); return renderBuilder(); }
      const it = e.target.closest('[data-id]'); if (it) addCard(it.dataset.id);
    });
    $('#bPool').addEventListener('contextmenu', e => { const it = e.target.closest('[data-id]'); if (!it) return; e.preventDefault(); removeCard(it.dataset.id); });
    $('#bDeck').addEventListener('click', e => {
      const inc = e.target.closest('.dl-row [data-inc]'), dec = e.target.closest('.dl-row [data-dec]');
      if (dec) removeCard(dec.dataset.dec); else if (inc) addCard(inc.dataset.inc);
    });
    $('#bDeck').addEventListener('contextmenu', e => { const r = e.target.closest('.dl-row'); if (!r) return; e.preventDefault(); removeCard(r.dataset.id); });
    bindPreview($('#bDeck'));
  }

  // ---------------- rules ----------------
  function buildRules() {
    const ok = '<span class="tag ok">CONFIRMED</span>', cm = '<span class="tag hr">COMMUNITY</span>';
    $('#rulesBody').innerHTML = `
      <p><b>NARUTO CARD GAME</b> is Bandai's trading card game, releasing worldwide in <b>Summer 2027</b>. Bandai hasn't published the official rulebook yet. The simulator follows the official reveals plus the community <b>Naruto Card Game Rulebook v1.4</b> (The Lookout team / fan Discord), which was compiled from the Gen Con 2026 demos. Anything still uncertain can be changed under <b>House Rules</b> in Settings.</p>
      <h3>Goal</h3><p>${ok} Reduce the opposing Leader's <b>LIFE (15)</b> to 0. ${cm} You also lose if your deck runs out.</p>
      <h3>Deck</h3><table>
        <tr><td>${ok}</td><td><b>1 Leader</b>, a main deck of Characters (EX Characters included) of your Leader's color, plus <b>5 Chakra cards</b> and <b>1 Summon card</b> that start in play. Retail decks are 50 cards.</td></tr>
        <tr><td>${cm}</td><td>The Gen Con demo decks were <b>30 cards: 3 copies of each of 10 cards</b>. That's the default here.</td></tr>
        <tr><td>${ok}</td><td><b>DMG</b> is dealt to the enemy Leader, <b>POW</b> is dealt to enemy Characters, and <b>HP</b> is a Character's health.</td></tr></table>
      <h3>Starting the Game</h3><table>
        <tr><td>${cm}</td><td>Both players draw 5. Only the <b>second player</b> may take one full-hand mulligan.</td></tr>
        <tr><td>${cm}</td><td>The first player draws <b>1</b> card on their first turn; every other draw phase is <b>2</b> cards.</td></tr>
        <tr><td>${cm}</td><td><b>Neither player can attack during their first turn</b>, even with <span class="kw rush">Rush</span>.</td></tr></table>
      <h3>Turn Phases</h3><div class="ph">
        <div><b>Refresh</b>Your rested Leader, Characters and Summon card stand up. Face-down Chakra does <u>not</u> flip back.</div>
        <div><b>Draw</b>Draw 2 cards (1 on the first player's first turn).</div>
        <div><b>Main</b>Summon, set Supports, use abilities and attack, in any order you like.</div>
        <div><b>End</b>"During this turn" effects end, and damage on Characters wears off.</div></div>
      <h3>Main Phase</h3><table>
        <tr><td>${ok}</td><td><b>Summon:</b> rest your Summon card to play one Character per turn. It can't attack the turn it's played unless it has <span class="kw rush">Rush</span>.</td></tr>
        <tr><td>${cm}</td><td><b>EX Characters</b> don't use the Summon card and aren't limited to one per turn. Pay their <span class="kw req">Summon Requirements</span> by placing your Characters in the trash.</td></tr>
        <tr><td>${ok}</td><td><b>Support Area:</b> set as many cards face-down as you like, up to 5 in the area.</td></tr>
        <tr><td>${ok}</td><td><b>Chakra:</b> pay costs by turning Chakra face-down. <span class="kw rec">Recovery</span> rests your Leader and flips all of your Chakra face-up (from your second turn on).</td></tr></table>
      <h3>Battle</h3><table>
        <tr><td>${cm}</td><td>Steps: <b>Attack Declaration</b>, then <b>Effect Declaration</b> ([When Attacking] resolves), then <b>Support Cut-in</b>, then <b>Damage</b>.</td></tr>
        <tr><td>${cm}</td><td>Rest a standing Character or your Leader to attack the enemy Leader or a <b>rested</b> enemy Character. There is no blocking.</td></tr>
        <tr><td>${cm}</td><td>A Leader loses Life equal to the attacker's <b>DMG</b>. A Character loses HP equal to the attacker's <b>POW</b> and is K.O.'d at 0. <b>Damage stays until the end of the turn</b>, so several attacks can add up.</td></tr></table>
      <h3>Support Cut-ins</h3><table>
        <tr><td>${cm}</td><td>Supports can cut in when a card effect is activated, when the opponent attacks, and when the opponent plays a Character. Each Support has its own timing: <span class="kw tim">[During Your Main]</span>, <span class="kw tim">[During Your Opponent's Attack]</span>, <span class="kw tim">[Support Activated]</span>, or <span class="kw tim">[Quick]</span> (any valid cut-in window).</td></tr>
        <tr><td>${cm}</td><td>The <b>turn player</b> can activate Supports from the Support Area <b>or from hand</b>. The non-turn player can only use the Support Area. Always pay the Chakra cost first.</td></tr>
        <tr><td>${cm}</td><td>Cut-ins chain: each player in turn may answer the newest Support, and once a player passes, the whole chain resolves from <b>last to first</b>. <span class="kw tim">[During Your Opponent's Attack]</span> Supports can also answer a Support played during that attack. Kakashi and Shisui can negate each other and Support summons (such as Choji), but not normal or EX summons.</td></tr></table>
      <h3>Playing the Simulator</h3>
      <p>${NS.touch ? 'Cards glowing orange can act, so tap one to see its options. Tap any card to read it in full, and tap anywhere else to cancel targeting.' : 'Cards glowing orange can act, so click one to see its options. Hover over any card to read it in full, and right-click to cancel targeting.'} A response panel pops up whenever you have a Support you can cut in with.</p>
      <p style="font-size:13px;color:var(--dim)">Sources: <a href="https://www.naruto-cardgame.com/en/welcome/" target="_blank">naruto-cardgame.com</a>, the official trailer, the Gen Con 2026 demo cards, and the community Naruto Card Game Rulebook v1.4 (<a href="https://www.reddit.com/r/NarutoCardGame/" target="_blank">r/NarutoCardGame</a> / fan Discord). This is an unofficial fan simulator, not affiliated with Bandai, Shueisha, Studio Pierrot or Masashi Kishimoto.</p>`;
  }

  // ---------------- settings (incl. House Rules) ----------------
  // a row of small card faces to choose an art version from, plus text choices (extra: [value, label])
  function artPicker(key, label, note, arts, extra) {
    const cur = NS.settings[key], all = (arts || []).map(a => [a.id, a.name, a.face]).concat(extra.map(([v, l]) => [v, l, null]));
    const sel = all.find(a => a[0] === cur) || all[0];
    return `<div class="set-row art-row"><div>${label}<small>${note}</small><small class="art-cap">${esc(sel[1])}</small></div><div class="art-pick">${all.map(([v, l, f]) => `<button data-art="${key}" data-v="${v}" title="${esc(l)}" class="${v === sel[0] ? 'on' : ''}${f ? '' : ' txt'}">${f ? `<i style="${NS.View.artCSS(f)}"></i>` : esc(l)}</button>`).join('')}</div></div>`;
  }
  function openSettings() {
    const st = NS.settings, H = NS.house;
    const tog = (k, l, s, obj) => `<div class="set-row"><div>${l}<small>${s}</small></div><button class="toggle ${(obj || st)[k] ? 'on' : ''}" data-k="${k}" data-o="${obj ? 'h' : 's'}"></button></div>`;
    const num = (k, l, s, min, max) => `<div class="set-row"><div>${l}<small>${s}</small></div><input type="number" min="${min}" max="${max}" value="${H[k]}" data-n="${k}"></div>`;
    const close = NS.View.modal(`<h2>Settings</h2><div class="settings-list">
      <h4>Presentation</h4>
      <div class="set-row"><div>Visual effects<small>Reduced: fewer particles, no light layer. Off: no particles, flashes, screen shake or cut-ins; cards still move. Use on slower PCs</small></div><div class="seg" style="width:320px;flex:none">${[['full', 'Full'], ['low', 'Reduced'], ['off', 'Off']].map(([k, l]) => `<button data-fx="${k}" class="${st.fx === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      ${tog('music', 'Music', 'Generated soundtrack')}${tog('sfx', 'Sound effects', 'Hits, jutsu, chakra')}${tog('cutins', 'Jutsu cut-ins', 'Big banners for Supports and EX summons')}
      <div class="set-row"><div>Animation speed</div><div class="seg" style="width:320px">${['slow', 'normal', 'fast', 'turbo'].map(s => `<button data-sp="${s}" class="${st.speed === s ? 'on' : ''}">${s}</button>`).join('')}</div></div>
      ${artPicker('chakraArt', 'Chakra card art', 'Looks only: every version has the same text. Your opponent\'s Chakra shows their Leader\'s art', NS.CHAKRA_ARTS, [['leader', 'Each Leader\'s art'], ['mix', 'Mixed set C-001 to C-005']])}
      ${artPicker('summonArt', 'Summon card art', 'Looks only', NS.SUMMON_ARTS, [])}
      <h4>House Rules (defaults follow the community rulebook v1.4)</h4>
      ${num('deckSize', 'Deck size', 'Gen Con demo: 30 (retail: 50)', 10, 60)}
      ${num('copyLimit', 'Copies per card', 'Gen Con demo decks: 3', 1, 10)}
      ${num('handSize', 'Opening hand', 'Community rulebook: 5', 3, 8)}
      ${num('drawPerTurn', 'Cards drawn per turn', 'Community rulebook: 2', 1, 3)}
      ${num('firstTurnDraw', 'First player\'s first draw', 'Community rulebook: 1', 0, 3)}
      ${num('charLimit', 'Character Area size', 'Not confirmed', 3, 7)}
      ${tog('mulligan', 'Second player may mulligan', 'One full redraw', H)}
      ${tog('firstRoundAttacks', 'Allow attacks on each player\'s first turn', 'Community rulebook: no attacks, even with Rush', H)}
      ${tog('damagePersists', 'Damage stays until end of turn', 'Several attacks can add up to a K.O.', H)}
      ${tog('handSupports', 'Turn player can use Supports from hand', 'Community rulebook: yes', H)}
      ${tog('leaderCanAttack', 'Leader can attack', 'Leaders have DMG 1 / POW 3', H)}
      ${tog('attackRestedOnly', 'Only rested Characters can be attacked', 'One Piece-style targeting', H)}
      ${tog('exUsesSummonCard', 'EX summon also rests the Summon card', '', H)}
      ${tog('clock', 'Online match clock', '20 min per player, 3 min per turn, 1 min to answer in the opponent\'s turn. Applies to private rooms you host; Quick Match is always timed', H)}
      <div class="set-row"><div>Reset House Rules</div><button class="btn small" id="hrReset">Defaults</button></div>
      </div><div class="row-btns" style="margin-top:18px"><button class="btn primary" id="sDone">Done</button></div>`, m => {
      $$('.toggle', m).forEach(t => t.onclick = () => {
        const k = t.dataset.k;
        if (t.dataset.o === 'h') { H[k] = !H[k]; store.set('house', H); t.classList.toggle('on', H[k]); return; }
        const v = !st[k]; st.save({ [k]: v }); t.classList.toggle('on', v);
        if (k === 'music') NS.Audio.setMusic(v);
        if (k === 'sfx') NS.Audio.setSfx(v);
      });
      $$('[data-fx]', m).forEach(b => b.onclick = () => { st.save({ fx: b.dataset.fx }); st.applyFx(); $$('[data-fx]', m).forEach(x => x.classList.toggle('on', x === b)); });
      $$('[data-n]', m).forEach(i => i.onchange = () => { H[i.dataset.n] = Math.max(+i.min, Math.min(+i.max, +i.value || 0)); store.set('house', H); });
      $$('[data-sp]', m).forEach(b => b.onclick = () => { st.save({ speed: b.dataset.sp }); $$('[data-sp]', m).forEach(x => x.classList.toggle('on', x === b)); });
      $$('[data-art]', m).forEach(b => b.onclick = () => {
        const k = b.dataset.art, row = b.closest('.art-row');
        st.save({ [k]: b.dataset.v }); $$('[data-art]', row).forEach(x => x.classList.toggle('on', x === b));
        $('.art-cap', row).textContent = b.title;
        if (NS.activeUI && NS.activeUI.g) NS.activeUI.render({ noFlip: true });
      });
      $('#hrReset', m).onclick = () => { Object.assign(H, NS.HOUSE_DEFAULTS); store.set('house', H); close(); openSettings(); };
      $('#sDone', m).onclick = () => close();
    });
  }

  function init() {
    document.body.classList.add('on-title');
    NS.house = Object.assign({}, NS.HOUSE_DEFAULTS, store.get('house', {}));
    buildTitle(); buildRules(); bindSetup(); bindBuilder(); if (NS.Net) NS.Net.init();
    bindPreview($('#gPool')); bindPreview($('#bPool'));
    document.addEventListener('click', e => {
      const b = e.target.closest('[data-go]'); if (!b) return;
      NS.Audio.ensure(); NS.Audio.play('click');
      if (NS.settings.music) NS.Audio.startMusic();
      const go = b.dataset.go;
      if (go === 'tutorial') NS.Tutorial.start();
      else if (go === 'setup-ai') openSetup(false);
      else if (go === 'online') NS.Net.open();
      else if (go === 'builder') openBuilder();
      else if (go === 'gallery') openGallery();
      else if (go === 'settings') openSettings();
      else if (go === 'replays') NS.Replay.openList();
      else show(go);
    });
  }
  NS.Screens = { init, show, confirmQuit, showResult, reopenResult, store, alert: alertModal, decks: allDecks, deckById, setGame(g, u) { if (game) game.abort(); game = g; ui = u; } };
})();
