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
      document.querySelectorAll('.cutin, .phase-banner, .speedlines, .atk-overlay, .outcome, .afterimage').forEach(e => e.remove());
      $('#modalBack').classList.remove('show');
    }
    NS.View.hidePreview();
  }

  // ---------------- title ----------------
  function buildTitle() {
    $('#backdrop').style.backgroundImage = `url('${NS.ASSETS.swirl}')`;
    $('#keyart').style.backgroundImage = `url('${NS.ASSETS.keyArt}')`;
    $('#logoImg').src = NS.ASSETS.logo;
    $('#tSwirl').style.backgroundImage = `url('${NS.ASSETS.swirl}')`;
    const wall = $('.t-wall');
    window.addEventListener('mousemove', e => {
      if (!document.body.classList.contains('on-title') || document.hidden) return;
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
  // embers + chakra motes orbiting the Rasengan
  function titleParticles() {
    const cv = $('#tParticles'), ctx = cv.getContext('2d');
    let W = cv.width = window.innerWidth, H = cv.height = window.innerHeight;
    window.addEventListener('resize', () => { W = cv.width = window.innerWidth; H = cv.height = window.innerHeight; });
    const P = [];
    for (let i = 0; i < 55; i++) P.push({ x: Math.random() * W, y: Math.random() * H, vx: .3 + Math.random() * 1.2, vy: -.2 - Math.random() * .8, s: 1 + Math.random() * 2.6, a: Math.random(), h: 20 + Math.random() * 25 });
    const orb = [];
    for (let i = 0; i < 28; i++) orb.push({ ang: Math.random() * 6.28, r: 40 + Math.random() * 90, sp: .03 + Math.random() * .05, s: 1 + Math.random() * 2 });
    function frame(t) {
      requestAnimationFrame(frame);
      if (!document.body.classList.contains('on-title') || document.hidden) return;
      const lowfx = document.body.classList.contains('lowfx');
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      for (const p of P) {
        p.x += p.vx; p.y += p.vy + Math.sin(t / 900 + p.x / 90) * .2; p.a += .01;
        if (p.x > W + 10 || p.y < -10) { p.x = Math.random() * W * .6; p.y = H + 10; }
        if (lowfx) continue;
        ctx.globalAlpha = .35 + Math.sin(p.a) * .3;
        ctx.drawImage(NS.FX.glowSprite(p.h < 32 ? '#ff8a2a' : '#ffb347'), p.x - p.s * 3, p.y - p.s * 3, p.s * 6, p.s * 6);
      }
      // rasengan orbit (key-art space -> stage space)
      const rb = $('.rasengan').getBoundingClientRect();
      const cx = rb.left, cy = rb.top;
      for (const o of orb) {
        o.ang += o.sp;
        const x = cx + Math.cos(o.ang) * o.r, y = cy + Math.sin(o.ang) * o.r * .45;
        ctx.globalAlpha = .85;
        ctx.drawImage(NS.FX.glowSprite('#6ac8ff'), x - o.s * 3, y - o.s * 3, o.s * 6, o.s * 6);
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    requestAnimationFrame(frame);
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
  function openSetup(hot) {
    setup.hot = hot;
    $('#setupTitle').textContent = hot ? 'Local Duel' : 'Choose Your Deck';
    $('#aiField').style.display = hot ? 'none' : '';
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
    $$('#aiSeg button').forEach(b => b.onclick = () => { $$('#aiSeg button').forEach(x => x.classList.remove('on')); b.classList.add('on'); setup.lv = b.dataset.lv; });
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
      names, ui, house: NS.house,
      controllers: [ui.controllerFor(0), setup.hot ? ui.controllerFor(1) : new NS.AI.AIController(setup.lv)],
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
  function confirmQuit() {
    const close = NS.View.modal(`<h2>Leave the match?</h2><p>The current game will be abandoned.</p><div class="row-btns"><button class="btn primary" id="qy">Quit</button><button class="btn" id="qn">Keep playing</button></div>`, m => {
      $('#qy', m).onclick = () => { close(); if (game) game.abort(); game = null; $('#result').classList.remove('show'); show('title'); NS.Audio.playTrack('title'); };
      $('#qn', m).onclick = () => close();
    });
  }
  function showResult(g, d, ui) {
    const w = d.winner;
    const humanWin = ui.opts.hotseat ? true : w === 0;
    const r = $('#result');
    r.className = 'result show ' + (humanWin ? 'win' : 'lose');
    r.innerHTML = `<div class="r-card">${NS.View.cardHTML(g.p(w).leader.card, { w: 230 })}</div>
      <div class="r-title">${ui.opts.hotseat ? esc(g.p(w).name) + ' wins' : humanWin ? 'Victory' : 'Defeat'}</div>
      <div class="r-sub">${esc(g.p(0).name)} ${g.p(0).leader.life} Life · ${esc(g.p(1).name)} ${g.p(1).leader.life} Life · ${g.turn} turns</div>
      <div class="row-btns"><button class="btn primary" id="rA">Rematch</button><button class="btn" id="rM">Main menu</button><button class="btn ghost" id="rB">View board</button></div>`;
    if (humanWin) { NS.FX.confetti({ colors: ['#f07c14', '#ffd23a', '#fff', '#e2267c', '#1ea0cf'] }); NS.Audio.jingle('victory'); } else NS.Audio.jingle('defeat');
    $('#rA').onclick = () => { r.classList.remove('show'); startGame(); };
    $('#rM').onclick = () => { r.classList.remove('show'); show('title'); NS.Audio.playTrack('title'); };
    $('#rB').onclick = () => r.classList.remove('show');
  }

  // ---------------- gallery ----------------
  let gFilter = 'all';
  function openGallery() {
    const chips = [['all', 'All'], ['red', 'Red'], ['blue', 'Blue'], ['leader', 'Leaders'], ['ex', 'EX'], ['support', 'Has Support']];
    $('#gFilters').innerHTML = chips.map(([k, l]) => `<span class="chip ${gFilter === k ? 'on' : ''}" data-f="${k}">${l}</span>`).join('') + `<span style="margin-left:auto;color:var(--dim);font-size:13px">${NS.Cards.all.length} revealed cards · pre-release</span>`;
    $('#gFilters').onclick = e => { const c = e.target.closest('.chip'); if (c) { gFilter = c.dataset.f; openGallery(); } };
    const list = NS.Cards.all.filter(c => gFilter === 'all' || c.color === gFilter || c.type === gFilter || (gFilter === 'support' && c.support));
    $('#gPool').innerHTML = list.map(c => `<div class="pool-item" data-id="${c.id}">${NS.View.cardHTML(c, { w: 170 })}</div>`).join('')
      + `<div class="pool-item" data-id="C">${NS.View.cardHTML(NS.View.CHAKRA_CARD, { w: 170 })}</div><div class="pool-item" data-id="S">${NS.View.cardHTML(NS.View.SUMMON_CARD, { w: 170 })}</div>`;
    show('gallery');
  }
  function bindPreview(el) {
    el.addEventListener('mousemove', e => {
      const it = e.target.closest('[data-id]'); if (!it) return NS.View.hidePreview();
      const c = it.dataset.id === 'C' ? NS.View.CHAKRA_CARD : it.dataset.id === 'S' ? NS.View.SUMMON_CARD : NS.Cards.byId[it.dataset.id];
      if (c) NS.View.showPreview(c, e);
    });
    el.addEventListener('mouseleave', () => NS.View.hidePreview());
  }

  // ---------------- builder ----------------
  let deck = null;
  const newDeck = () => ({ id: 'd' + Date.now(), name: 'My Deck', leader: 'N-001', cards: {} });
  function openBuilder() { deck = deck || newDeck(); renderBuilder(); show('builder'); }
  function renderBuilder() {
    const L = NS.Cards.byId[deck.leader];
    const H = NS.house;
    $('#bFilters').innerHTML = NS.Cards.leaders().map(l => `<span class="chip ${deck.leader === l.id ? 'on' : ''}" data-l="${l.id}">Leader: ${esc(l.name)} (${l.color})</span>`).join('') + `<span style="margin-left:auto;color:var(--dim);font-size:13px">Click to add · right-click to remove · ${H.deckSize} cards, max ${H.copyLimit} copies</span>`;
    $('#bFilters').onclick = e => { const c = e.target.closest('[data-l]'); if (c && c.dataset.l !== deck.leader) { deck.leader = c.dataset.l; deck.cards = {}; renderBuilder(); } };
    const pool = NS.Cards.poolFor(L.color);
    $('#bPool').innerHTML = pool.map(c => { const q = deck.cards[c.id] || 0; return `<div class="pool-item ${q >= H.copyLimit ? 'maxed' : ''}" data-id="${c.id}">${NS.View.cardHTML(c, { w: 170 })}${q ? `<div class="qty">${q}</div>` : ''}</div>`; }).join('');
    const total = Object.values(deck.cards).reduce((a, b) => a + b, 0);
    const errs = NS.Cards.validate(deck);
    const rows = Object.entries(deck.cards).map(([id, n]) => [NS.Cards.byId[id], n]).filter(r => r[0]).sort((a, b) => a[0].name.localeCompare(b[0].name));
    const saved = customDecks();
    $('#bDeck').innerHTML = `<input id="dlName" value="${esc(deck.name)}" maxlength="28">
      <div class="dl-stats"><span>Leader <b>${esc(L.name)}</b></span><span>Cards <b>${total}</b>/${H.deckSize}</span></div>
      <div class="dl-stats"><span>EX <b>${rows.filter(r => r[0].type === 'ex').reduce((a, r) => a + r[1], 0)}</b></span><span>With Support <b>${rows.filter(r => r[0].support).reduce((a, r) => a + r[1], 0)}</b></span></div>
      <div class="dl-list">${rows.map(([c, n]) => `<div class="dl-row" style="--cc:${c.color === 'red' ? 'var(--red)' : 'var(--blue)'}" data-rm="${c.id}"><span>${esc(c.name)} <small>${c.type === 'ex' ? 'EX · ' : ''}${c.support ? esc(c.support.name) : c.id}</small></span><span class="q">×${n}</span></div>`).join('') || '<div style="color:var(--dim);padding:10px">Click cards on the left to add them.</div>'}</div>
      <div class="dl-errs">${errs.length ? errs.map(esc).join('<br>') : `<span class="dl-ok">${NS.icon('check')} Legal deck</span>`}</div>
      <div class="dl-btns"><button class="btn primary" id="dS">Save</button><button class="btn" id="dN">New</button><button class="btn" id="dL">Load…</button><button class="btn" id="dF">Auto-fill</button><button class="btn ghost" id="dD" ${saved.find(s => s.id === deck.id) ? '' : 'disabled'}>Delete</button></div>`;
    $('#dlName').oninput = e => { deck.name = e.target.value; };
    $('#dS').onclick = () => { const all = customDecks(); const i = all.findIndex(s => s.id === deck.id); const copy = JSON.parse(JSON.stringify(deck)); if (i >= 0) all[i] = copy; else all.push(copy); store.set('decks', all); NS.Audio.play('upgrade'); renderBuilder(); };
    $('#dN').onclick = () => { deck = newDeck(); renderBuilder(); };
    $('#dF').onclick = () => { deck = Object.assign(NS.Cards.fitDeck(deck), { id: deck.id, name: deck.name }); renderBuilder(); };
    $('#dD').onclick = () => { store.set('decks', customDecks().filter(s => s.id !== deck.id)); deck = newDeck(); renderBuilder(); };
    $('#dL').onclick = () => {
      const list = customDecks().concat(NS.STARTERS.map(s => Object.assign({}, s, { id: 'd' + Date.now() + s.id, name: s.name + ' (copy)' })));
      const close = NS.View.modal(`<h2>Load a Deck</h2><div class="row-btns" style="flex-direction:column">${list.map((d, i) => `<button class="btn" data-i="${i}">${esc(d.name)}</button>`).join('')}<button class="btn ghost" id="lc">Close</button></div>`, m => {
        $$('button[data-i]', m).forEach(b => b.onclick = () => { deck = JSON.parse(JSON.stringify(list[+b.dataset.i])); close(); renderBuilder(); });
        $('#lc', m).onclick = () => close();
      });
    };
    $('#bDeck .dl-list').onclick = e => { const r = e.target.closest('[data-rm]'); if (!r) return; deck.cards[r.dataset.rm]--; if (!deck.cards[r.dataset.rm]) delete deck.cards[r.dataset.rm]; renderBuilder(); };
  }
  function bindBuilder() {
    $('#bPool').addEventListener('click', e => {
      const it = e.target.closest('[data-id]'); if (!it) return;
      const q = deck.cards[it.dataset.id] || 0;
      if (q >= NS.house.copyLimit) return;
      deck.cards[it.dataset.id] = q + 1; NS.Audio.play('card'); renderBuilder();
    });
    $('#bPool').addEventListener('contextmenu', e => {
      e.preventDefault();
      const it = e.target.closest('[data-id]'); if (!it || !deck.cards[it.dataset.id]) return;
      deck.cards[it.dataset.id]--; if (!deck.cards[it.dataset.id]) delete deck.cards[it.dataset.id]; renderBuilder();
    });
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
        <tr><td>${cm}</td><td>Cut-ins chain, and they resolve from <b>last to first</b>. Kakashi and Shisui can negate each other and Support summons (such as Choji), but not normal or EX summons.</td></tr></table>
      <h3>Playing the Simulator</h3>
      <p>Cards glowing orange can act, so click one to see its options. Hover over any card to read it in full, and right-click to cancel targeting. A response panel pops up whenever you have a Support you can cut in with.</p>
      <p style="font-size:13px;color:var(--dim)">Sources: <a href="https://www.naruto-cardgame.com/en/welcome/" target="_blank">naruto-cardgame.com</a>, the official trailer, the Gen Con 2026 demo cards, and the community Naruto Card Game Rulebook v1.4 (<a href="https://www.reddit.com/r/NarutoCardGame/" target="_blank">r/NarutoCardGame</a> / fan Discord). This is an unofficial fan simulator, not affiliated with Bandai, Shueisha, Studio Pierrot or Masashi Kishimoto.</p>`;
  }

  // ---------------- settings (incl. House Rules) ----------------
  function openSettings() {
    const st = NS.settings, H = NS.house;
    const tog = (k, l, s, obj) => `<div class="set-row"><div>${l}<small>${s}</small></div><button class="toggle ${(obj || st)[k] ? 'on' : ''}" data-k="${k}" data-o="${obj ? 'h' : 's'}"></button></div>`;
    const num = (k, l, s, min, max) => `<div class="set-row"><div>${l}<small>${s}</small></div><input type="number" min="${min}" max="${max}" value="${H[k]}" data-n="${k}"></div>`;
    const close = NS.View.modal(`<h2>Settings</h2><div class="settings-list">
      <h4>Presentation</h4>
      ${tog('lowfx', 'Reduced effects (performance)', 'Fewer particles and background animations — use on slower PCs')}
      ${tog('music', 'Music', 'Generated soundtrack')}${tog('sfx', 'Sound effects', 'Hits, jutsu, chakra')}${tog('cutins', 'Jutsu cut-ins', 'Big banners for Supports and EX summons')}
      <div class="set-row"><div>Animation speed</div><div class="seg" style="width:320px">${['slow', 'normal', 'fast', 'turbo'].map(s => `<button data-sp="${s}" class="${st.speed === s ? 'on' : ''}">${s}</button>`).join('')}</div></div>
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
      <div class="set-row"><div>Reset House Rules</div><button class="btn small" id="hrReset">Defaults</button></div>
      </div><div class="row-btns" style="margin-top:18px"><button class="btn primary" id="sDone">Done</button></div>`, m => {
      $$('.toggle', m).forEach(t => t.onclick = () => {
        const k = t.dataset.k;
        if (t.dataset.o === 'h') { H[k] = !H[k]; store.set('house', H); t.classList.toggle('on', H[k]); return; }
        const v = !st[k]; st.save({ [k]: v }); t.classList.toggle('on', v);
        if (k === 'music') NS.Audio.setMusic(v);
        if (k === 'sfx') NS.Audio.setSfx(v);
        if (k === 'lowfx') { document.body.classList.toggle('lowfx', v); NS.FX.setQuality(v ? 0.4 : 1); }
      });
      $$('[data-n]', m).forEach(i => i.onchange = () => { H[i.dataset.n] = Math.max(+i.min, Math.min(+i.max, +i.value || 0)); store.set('house', H); });
      $$('[data-sp]', m).forEach(b => b.onclick = () => { st.save({ speed: b.dataset.sp }); $$('[data-sp]', m).forEach(x => x.classList.toggle('on', x === b)); });
      $('#hrReset', m).onclick = () => { Object.assign(H, NS.HOUSE_DEFAULTS); store.set('house', H); close(); openSettings(); };
      $('#sDone', m).onclick = () => close();
    });
  }

  function init() {
    document.body.classList.add('on-title');
    NS.house = Object.assign({}, NS.HOUSE_DEFAULTS, store.get('house', {}));
    buildTitle(); buildRules(); bindSetup(); bindBuilder();
    bindPreview($('#gPool')); bindPreview($('#bPool'));
    document.addEventListener('click', e => {
      const b = e.target.closest('[data-go]'); if (!b) return;
      NS.Audio.ensure(); NS.Audio.play('click');
      if (NS.settings.music) NS.Audio.startMusic();
      const go = b.dataset.go;
      if (go === 'tutorial') NS.Tutorial.start();
      else if (go === 'setup-ai') openSetup(false);
      else if (go === 'setup-hot') openSetup(true);
      else if (go === 'builder') openBuilder();
      else if (go === 'gallery') openGallery();
      else if (go === 'settings') openSettings();
      else show(go);
    });
  }
  NS.Screens = { init, show, confirmQuit, showResult, store, setGame(g, u) { if (game) game.abort(); game = g; ui = u; } };
})();
