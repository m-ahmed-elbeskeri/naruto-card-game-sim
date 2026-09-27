/* ============================================================
   UI — official-style cards, playmat board, animations, input
   ============================================================ */
(function () {
  const NS = window.NTCG = window.NTCG || {};
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const S = () => (NS.settings ? NS.settings.speedMul() : 1);
  const wait = ms => new Promise(r => setTimeout(r, ms * S()));

  // ---------------- card rendering ----------------
  function artCSS(src) {
    if (src && src.full) return `background-image:url('${src.url}');background-size:cover;background-position:center`;
    if (!src) return `background-image:url('${NS.ASSETS.swirl}');background-size:cover;background-position:50% 50%`;
    const [x, y, w, h] = src.box;
    const sx = src.w / w * 100, sy = src.h / h * 100;
    const px = src.w === w ? 0 : x / (src.w - w) * 100, py = src.h === h ? 0 : y / (src.h - h) * 100;
    return `background-image:url('${src.url}');background-size:${sx}% ${sy}%;background-position:${px}% ${py}%`;
  }
  // art for cut-ins / avatars: upper part of the illustration
  function portraitCSS(card, zoom) {
    const src = card.art;
    if (!src) return `background-image:url('${NS.ASSETS.swirl}');background-size:cover;background-position:center`;
    if (src.full) return `background-image:url('${src.url}');background-size:${(zoom || 1.6) * 100}% auto;background-position:50% 22%`;
    const [x, y, w, h] = src.box;
    const z = zoom || 1.6;
    const sx = src.w / w * 100 * z;
    const cx = x + w / 2, cy = y + h * 0.28;
    return `background-image:url('${src.url}');background-size:${sx}% auto;background-position:${(cx / src.w) * 100}% ${(cy / src.h) * 100}%`;
  }
  const KW = [
    [/\[Activate: Main\]/g, 'act', 'Activate: Main'], [/\[Once Per Turn\]/g, 'once', 'Once Per Turn'], [/\[Rush\]/g, 'rush', 'Rush'],
    [/\[On Summon\]/g, 'on', 'On Summon'], [/\[When Attacking\]/g, 'on', 'When Attacking'], [/\[Your Turn\]/g, 'on', 'Your Turn'],
    [/\[Summon Requirements\]/g, 'req', 'Summon Requirements'], [/\[Recovery\]/g, 'rec', 'Recovery'],
  ];
  function kwHTML(t, cls) {
    let s = esc(t);
    KW.forEach(([re, c, l]) => { s = s.replace(re, `<span class="${cls || 'kwd'} ${c}">${l}</span>`); });
    return s;
  }
  function cardHTML(card, o) {
    o = o || {};
    const w = o.w || 150;
    let face;
    if (card.type === 'chakra') face = `<div class="nc" data-card="chakra" style="--w:${w}px"><div class="nc-art" style="${artCSS(NS.ASSETS.chakraFace)}"></div></div>`;
    else if (card.type === 'summoncard') face = `<div class="nc" data-card="summon" style="--w:${w}px"><div class="nc-art" style="${artCSS(NS.ASSETS.summonFace)}"></div></div>`;
    else if (card.mode === 'plain') face = `<div class="nc m-plain" data-card="${card.id}" style="--w:${w}px;background-image:url('${NS.ASSETS.swirl}')"><div class="pend"><img src="${NS.ASSETS.logo}" alt=""><b>${esc(card.name)}</b><small>Art not yet revealed</small></div></div>`;
    else face = `<div class="nc r-${card.rarity}${card.type === 'ex' ? ' ex' : ''}" data-card="${card.id}" style="--w:${w}px"><div class="nc-art" style="${artCSS(card.art)}"></div>${card.type === 'ex' ? '<div class="ex-rim"></div>' : ''}</div>`;
    if (!o.statbar || card.type === 'chakra' || card.type === 'summoncard') return face;
    const live = o.live || { pow: card.pow, dmg: card.dmg };
    const cls = (a, b) => a > b ? 'up' : a < b ? 'dn' : '';
    const hp = live.hp != null ? live.hp : card.hp;
    return `<div class="card-wrap">${face}<div class="statbar"><span class="${cls(live.dmg, card.dmg)}">DMG <b>${live.dmg}</b></span><span class="${cls(live.pow, card.pow)}">POW <b>${live.pow}</b></span>${card.hp != null ? `<span class="${hp < card.hp ? 'dn' : ''}">HP <b>${hp}</b></span>` : `<span>LIFE <b>${o.life != null ? o.life : card.life}</b></span>`}</div></div>`;
  }
  function backHTML(kind, w) {
    return `<div class="nback ${kind || ''}" style="--w:${w || 150}px;background-image:url('${NS.ASSETS.swirl}')"><div class="lg"><img src="${NS.ASSETS.logo}" alt="" draggable="false"></div></div>`;
  }
  function textPanel(card, extra) {
    const conf = card.id && card.type !== 'chakra' ? `Card image via ExBurst database · text ${card.conf === 'official' ? 'from naruto-cardgame.com' : 'from the Gen Con 2026 English demo cards'}` : '';
    const stats = card.type === 'leader' ? `<span>DMG ${card.dmg}</span><span>POW ${card.pow}</span><span>LIFE ${card.life}</span>` : card.type === 'chakra' || card.type === 'summoncard' ? '' : `<span>DMG ${card.dmg}</span><span>POW ${card.pow}</span><span>HP ${card.hp}</span>`;
    let body = (card.text || []).map(t => `<p>${kwHTML(t, 'kw')}</p>`).join('');
    if (card.support) body += `<p><span class="kw sup">SUPPORT ${esc(card.support.name)}</span> <span class="kw tim">${esc(NS.TIMING[card.support.timing])}</span> Cost ${card.support.cost} Chakra — ${esc(card.support.text)}</p>`;
    if (card.type === 'chakra') body = '<p>When using Chakra, turn this card face-down. Refilled by your Leader\'s <span class="kw rec">Recovery</span>.</p>';
    if (card.type === 'summoncard') body = '<p>You may rest this card to summon a Character card. Stands up again in your Refresh Phase.</p>';
    return `<div class="pv-text"><h4>${esc(card.name)}</h4><div class="meta">${card.type === 'ex' ? 'EX Character' : card.type === 'leader' ? 'Leader' : card.type === 'character' ? 'Character' : ''} ${card.color ? '· ' + card.color.toUpperCase() : ''} ${card.id && card.type !== 'chakra' ? '· ' + (card.unnumbered ? 'demo (no number)' : card.id) : ''} ${card.traits ? '· ' + esc(card.traits.join(' / ')) : ''}</div>${stats ? `<div class="st">${stats}</div>` : ''}${body}${extra ? `<p>${extra}</p>` : ''}${conf ? `<div class="conf">${conf}. Pre-release — details may change.</div>` : ''}</div>`;
  }
  function showPreview(card, ev, extra, live) {
    const pv = $('#preview');
    pv.innerHTML = cardHTML(card, { w: 300 }) + textPanel(card, extra);
    pv.classList.add('show');
    const W = 650;
    const x = ev.clientX > window.innerWidth / 2 ? ev.clientX - W - 24 : ev.clientX + 24;
    const y = Math.max(8, Math.min(window.innerHeight - 430, ev.clientY - 210));
    pv.style.left = Math.max(8, x) + 'px'; pv.style.top = y + 'px';
    const n = pv.querySelector('.nc');
    if (n) { const fx = ev.clientX / window.innerWidth, fy = ev.clientY / window.innerHeight; n.style.setProperty('--ry', ((fx - .5) * 16) + 'deg'); n.style.setProperty('--rx', ((.5 - fy) * 10) + 'deg'); n.style.setProperty('--gx', fx * 100 + '%'); n.style.setProperty('--gy', fy * 100 + '%'); }
  }
  function hidePreview() { $('#preview').classList.remove('show'); }
  function modal(html, onMount, cls) {
    const back = $('#modalBack'), m = $('#modal');
    m.innerHTML = html;
    back.className = 'modal-back show' + (cls ? ' ' + cls : '');
    if (onMount) onMount(m);
    return () => { back.className = 'modal-back'; m.innerHTML = ''; };
  }
  const CHAKRA_CARD = { type: 'chakra', name: 'Chakra Card', id: 'C-001' };
  const SUMMON_CARD = { type: 'summoncard', name: 'Summon Card', id: 'S-001' };

  // =====================================================================
  class GameUI {
    constructor(opts) {
      this.opts = opts;           // {humans:[bool,bool], hotseat}
      this.root = $('#gb');
      this.viewPi = opts.humans[0] ? 0 : 1;
      this.state = 'idle';
      this.acts = [];
      this.build();
    }
    setGame(g) { this.g = g; }
    me() { return this.viewPi; }
    sc() { return NS.stageScale || 1; }
    toStage(x, y) { const r = $('#stage').getBoundingClientRect(); return { x: (x - r.left) / this.sc(), y: (y - r.top) / this.sc() }; }

    build() {
      this.root.innerHTML = `
        <div class="mat-swirl" style="background-image:url('${NS.ASSETS.swirl}')"></div><div class="emblem"></div><div class="vignette"></div><div class="lowlife"></div>
        <div class="zone" style="left:230px;top:14px;width:1090px;height:112px"><span class="zl" style="left:16px;top:6px">Support Area</span></div>
        <div class="zone" style="left:230px;top:132px;width:1090px;height:184px"><span class="zl" style="left:16px;top:6px">Character Area</span></div>
        <div class="zone center-line" style="left:230px;top:348px;width:1090px;height:0"></div>
        <div class="zone" style="left:230px;top:380px;width:1090px;height:184px"><span class="zl" style="left:16px;bottom:6px">Character Area <i>※Characters cannot attack the turn they are played</i></span></div>
        <div class="zone" style="left:230px;top:570px;width:1090px;height:112px"><span class="zl" style="left:16px;bottom:6px">Support Area <i>※Up to 5 face-down</i></span></div>
        <div class="zone" style="left:1340px;top:232px;width:248px;height:72px"><span class="zl" style="left:8px;bottom:-20px;font-size:11px">Chakra Area</span></div>
        <div class="zone" style="left:1340px;top:596px;width:248px;height:72px"><span class="zl" style="left:8px;top:-20px;font-size:11px">Chakra Area</span></div>
        <div id="layer"></div>
        <div class="center-band"><div class="turn-chip" id="turnChip">—</div><div class="phase-dots" id="phaseDots"><span data-p="refresh">REFRESH</span><span data-p="draw">DRAW</span><span data-p="main">MAIN</span><span data-p="end">END</span></div><button class="end-btn" id="endBtn" disabled>End Turn</button></div>
        <div class="topbtns"><button class="iconbtn" id="logBtn" title="Battle log">${NS.icon('menu')}</button><button class="iconbtn" id="sndBtn" title="Music">${NS.icon('music')}</button><button class="iconbtn" id="spdBtn" title="Animation speed">${NS.icon('fast')}</button><button class="iconbtn" id="quitBtn" title="Quit">${NS.icon('close')}</button></div>
        <div class="logpanel panel" id="logPanel"><h3>Battle Log</h3><div class="logbody" id="logBody"></div></div>
        <div class="toast-log" id="toastLog"></div>
        <div class="prompt" id="prompt"></div>`;
      $('#endBtn').onclick = () => { if (this.state === 'main' && this.acts.some(a => a.kind === 'end')) { NS.Audio.play('pass'); this.resolveMain({ kind: 'end' }); } };
      $('#logBtn').onclick = () => $('#logPanel').classList.toggle('open');
      $('#sndBtn').onclick = () => { NS.Audio.setMusic(!NS.Audio.musicOn); NS.settings.save({ music: NS.Audio.musicOn }); };
      $('#spdBtn').onclick = () => { NS.settings.cycleSpeed(); this.toast(`Animation speed: ${NS.settings.speed}`); };
      $('#quitBtn').onclick = () => NS.Screens.confirmQuit();
      this.root.addEventListener('mousemove', e => this.onHover(e));
      this.root.addEventListener('mouseleave', hidePreview);
      this.root.addEventListener('click', e => this.onClick(e));
      this.root.addEventListener('contextmenu', e => { e.preventDefault(); this.cancel(); });
    }
    toast(msg) {
      const t = document.createElement('div');
      t.innerHTML = msg;
      const box = $('#toastLog');
      box.appendChild(t);
      while (box.children.length > 3) box.firstChild.remove();
      setTimeout(() => t.remove(), 3100);
    }
    onLog(msg, cls) {
      const b = $('#logBody'); if (!b) return;
      const d = document.createElement('div'); d.className = cls || ''; d.textContent = msg;
      b.appendChild(d); b.scrollTop = b.scrollHeight;
      if (['ko', 'ex', 'support', 'dmg', 'heal', 'win', 'chakra'].includes(cls)) this.toast(esc(msg));
    }

    // =====================================================================
    // RENDER
    // =====================================================================
    el(key) { return this.root.querySelector(`[data-k="${key}"]`); }
    render(o) {
      o = o || {};
      const g = this.g; if (!g) return;
      const before = new Map();
      $$('[data-k]', this.root).forEach(e => before.set(e.dataset.k, e.getBoundingClientRect()));
      const me = this.viewPi, op = 1 - me;
      let h = '';
      h += this.sideHTML(op, true) + this.sideHTML(me, false);
      $('#layer').innerHTML = h;
      // FLIP
      $$('[data-k]', this.root).forEach(e => {
        const b = before.get(e.dataset.k);
        if (!b || o.noFlip) return;
        const a = e.getBoundingClientRect();
        const dx = (b.left + b.width / 2 - a.left - a.width / 2) / this.sc(), dy = (b.top + b.height / 2 - a.top - a.height / 2) / this.sc();
        if (Math.abs(dx) + Math.abs(dy) < 3) return;
        e.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'translate(0,0)' }], { duration: 450 * S(), easing: 'cubic-bezier(.3,.8,.3,1.1)', composite: 'add' });
      });
      this.renderChrome();
      this.highlight();
      this.updateArrow();
    }
    // ---------- attack targeting overlay ----------
    showArrow(att, tgt, label, kind) {
      this.hideArrow();
      const o = document.createElement('div');
      o.className = 'atk-overlay ' + (kind || '');
      o.innerHTML = `<svg><defs><linearGradient id="atkGrad" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffd23a"/><stop offset="1" stop-color="#ff2a2a"/></linearGradient><marker id="atkHead" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 Z" fill="#ff3a2a"/></marker></defs><path class="atk-glow"/><path class="atk-line" marker-end="url(#atkHead)"/></svg><div class="atk-reticle"><i></i><i></i><i></i><i></i></div><div class="atk-chip">${label}</div>`;
      document.body.appendChild(o);
      this.arrow = { el: o, a: att.uid, t: tgt.uid };
      this.updateArrow();
    }
    updateArrow() {
      const A = this.arrow; if (!A) return;
      const ae = this.el(A.a), te = this.el(A.t);
      if (!ae || !te) return;
      const p = this.center(ae), q = this.center(te);
      const mx = (p.x + q.x) / 2 + (q.y - p.y) * 0.12, my = (p.y + q.y) / 2 - Math.abs(q.x - p.x) * 0.12 - 30;
      const d = `M${p.x},${p.y} Q${mx},${my} ${q.x},${q.y}`;
      A.el.querySelectorAll('path.atk-line, path.atk-glow').forEach(x => x.setAttribute('d', d));
      const grad = A.el.querySelector('#atkGrad'); grad.setAttribute('x1', p.x); grad.setAttribute('y1', p.y); grad.setAttribute('x2', q.x); grad.setAttribute('y2', q.y);
      const r = A.el.querySelector('.atk-reticle'); const tr = te.getBoundingClientRect();
      r.style.left = q.x + 'px'; r.style.top = q.y + 'px'; r.style.width = r.style.height = Math.max(tr.width, tr.height) * 0.9 + 'px';
      const chip = A.el.querySelector('.atk-chip'); chip.style.left = mx + 'px'; chip.style.top = (my + (q.y > p.y ? 10 : -10)) + 'px';
    }
    hideArrow() { if (this.arrow) { const el = this.arrow.el; el.classList.add('out'); setTimeout(() => el.remove(), 250); this.arrow = null; } }
    outcome(el, text, cls) {
      if (!el) return;
      const c = this.center(el), o = document.createElement('div');
      o.className = 'outcome ' + (cls || ''); o.textContent = text;
      o.style.left = c.x + 'px'; o.style.top = c.y + 'px';
      document.body.appendChild(o); setTimeout(() => o.remove(), 1500);
    }
    afterimages(a, t) {
      const p = this.center(a), q = this.center(t), r = a.getBoundingClientRect();
      [0.2, 0.4, 0.6].forEach((k, i) => setTimeout(() => {
        const gh = document.createElement('div'); gh.className = 'afterimage'; gh.innerHTML = a.innerHTML;
        gh.style.left = (r.left + (q.x - p.x) * k * 0.8) + 'px'; gh.style.top = (r.top + (q.y - p.y) * k * 0.8) + 'px';
        gh.style.width = r.width + 'px'; gh.style.height = r.height + 'px';
        document.body.appendChild(gh); setTimeout(() => gh.remove(), 380);
      }, i * 45 * S()));
    }
    sideHTML(pi, top) {
      const g = this.g, P = g.p(pi), H = g.house;
      const side = top ? 'side-opp' : 'side-me';
      let h = '';
      // supports
      const supY = top ? 20 : 576, charY = top ? 140 : 388;
      h += `<div class="row ${side}" data-zone="support-${pi}" style="left:230px;width:1090px;top:${supY}px;height:106px">`;
      for (let i = 0; i < 5; i++) {
        const s = P.supports[i];
        if (!s) { h += `<div class="slot" style="width:76px;height:106px;border:1px dashed rgba(240,124,20,.18);border-radius:4px"></div>`; continue; }
        const mine = pi === this.viewPi;
        h += `<div class="slot ${side} sup" data-k="${s.iid}" data-sup="${s.iid}">${backHTML('', 76)}${mine ? `<div class="peek">${cardHTML(s.card, { w: 64 })}</div>` : ''}</div>`;
      }
      h += `</div>`;
      // characters
      h += `<div class="row ${side}" data-zone="chars-${pi}" style="left:230px;width:1090px;top:${charY}px;height:168px;gap:34px">`;
      for (let i = 0; i < H.charLimit; i++) {
        const u = P.chars[i];
        if (!u) { h += `<div class="slot" style="width:120px;height:168px;border:1px dashed rgba(240,124,20,.14);border-radius:6px"></div>`; continue; }
        const sick = u.summonedTurn === g.turn && g.active === pi && !g.hasRush(u);
        const flag = u.flags.cantAttackTurn >= g.turn ? 'GENJUTSU' : u.flags.immuneSupportTurn === g.turn ? 'SHIELDED' : u.negated ? 'NEGATED' : '';
        const rush = u.summonedTurn === g.turn && g.active === pi && g.hasRush(u) && !u.rested;
        h += `<div class="slot ${side} ${u.rested ? 'rested' : ''}" data-k="${u.uid}" data-unit="${u.uid}">${cardHTML(u.card, { w: 120, statbar: true, live: { pow: g.pow(u), dmg: g.dmg(u), hp: g.hpLeft(u) } })}${flag ? `<div class="flag">${flag}</div>` : ''}${rush && !flag ? `<div class="flag rush">${NS.icon('fast')} RUSH</div>` : ''}</div>`;
      }
      h += `</div>`;
      // leader, life, summon, chakra
      const L = P.leader;
      const lY = top ? 8 : 684, lifeY = top ? 14 : 790, sumY = top ? 140 : 684, ckY = top ? 238 : 602;
      const lifePct = Math.max(0, Math.min(100, L.life / 15 * 100)), ghostPct = Math.max(lifePct, Math.min(100, ((this.ghost && this.ghost[pi] != null ? this.ghost[pi] : L.life) / 15) * 100));
      h += `<div class="leader-box ${g.active === pi ? 'active' : ''}" style="left:1436px;top:${lY}px;width:140px"><div class="slot ${side} ${L.rested ? 'rested' : ''}" data-k="${L.uid}" data-unit="${L.uid}">${cardHTML(L.card, { w: 140, statbar: true, life: L.life, live: { pow: g.pow(L), dmg: g.dmg(L) } })}</div></div>`;
      h += `<div class="leader-box" style="left:1348px;top:${lifeY}px;width:72px"><div class="life ${L.life <= 5 ? 'low' : ''}" style="position:static;width:72px" data-life="${pi}" data-zone="life-${pi}"><small>LIFE</small><b>${L.life}</b></div><div class="pname" style="font-size:13px">${esc(P.name)}</div></div>`;
      h += `<div class="slot ${P.summonRested ? 'rested' : ''} ${side}" data-k="SUM${pi}" style="position:absolute;left:1356px;top:${sumY}px">${cardHTML(SUMMON_CARD, { w: 58 })}</div>`;
      h += `<div class="chakra-row" data-zone="chakra-${pi}" style="left:1348px;top:${ckY}px">${P.chakra.map((up, i) => `<div class="ck" data-ck="${pi}-${i}">${up ? cardHTML(CHAKRA_CARD, { w: 42 }) : backHTML('chakra', 42)}</div>`).join('')}</div>`;
      // deck / trash / hand
      const dY = top ? 14 : 740;
      h += `<div class="pile" data-pile="deck-${pi}" style="left:16px;top:${dY}px">${P.deck.length ? backHTML('', 96) : '<div class="empty" style="width:96px;height:134px"></div>'}<div class="cnt">DECK ${P.deck.length}</div></div>`;
      const tt = P.trash[P.trash.length - 1];
      h += `<div class="pile trash" data-pile="trash-${pi}" style="left:122px;top:${dY}px">${tt ? cardHTML(tt.card, { w: 96 }) : '<div class="empty">TRASH</div>'}<div class="cnt">TRASH ${P.trash.length}</div></div>`;
      if (top) {
        h += `<div style="position:absolute;left:16px;top:176px;display:flex">${P.hand.map((c, i) => `<div data-k="${c.iid}" style="margin-right:-44px;transform:rotate(${(i - P.hand.length / 2) * 3}deg)">${backHTML('', 64)}</div>`).join('')}</div><div style="position:absolute;left:16px;top:272px;font-size:12px;font-weight:900;color:var(--dim);letter-spacing:2px">HAND ${P.hand.length}</div>`;
      } else {
        const n = P.hand.length;
        const can = new Set(this.state === 'main' ? this.acts.filter(a => a.card).map(a => a.card.iid) : []);
        h += `<div class="hand" data-zone="hand">${P.hand.map((c, i) => { const rot = (i - (n - 1) / 2) * Math.min(4, 30 / Math.max(1, n)); return `<div class="hc ${can.has(c.iid) ? 'can-act' : this.state === 'main' ? 'dim' : ''}" data-k="${c.iid}" data-hand="${c.iid}" style="--r:${rot}deg;--ty:${Math.abs(i - (n - 1) / 2) * 4}px"><div class="lift">${cardHTML(c.card, { w: 128 })}</div></div>`; }).join('')}</div>`;
      }
      return h;
    }
    renderChrome() {
      const g = this.g;
      const chip = $('#turnChip');
      const mine = g.active === this.viewPi && this.opts.humans[this.viewPi];
      chip.className = 'turn-chip ' + (mine ? 'mine' : 'theirs');
      chip.textContent = g.phase === 'over' ? 'Game over' : `Turn ${g.turn} · ${mine ? 'Your turn' : g.p(g.active).name}`;
      $$('#phaseDots span').forEach(s => s.classList.toggle('on', s.dataset.p === g.phase));
      $('#endBtn').disabled = this.state !== 'main' || !this.acts.some(a => a.kind === 'end');
      const myLife = g.p(this.viewPi).leader.life;
      this.root.classList.toggle('opp-turn', g.active !== this.viewPi);
      this.root.classList.toggle('danger', myLife <= 5 && g.phase !== 'over');
      if (g.phase !== 'over' && NS.Audio.musicOn) NS.Audio.playTrack(myLife <= 5 || g.p(1 - this.viewPi).leader.life <= 5 ? 'tension' : 'battle');
    }
    highlight() {
      $$('.can-act, .targetable', $('#layer')).forEach(e => { if (!e.classList.contains('hc')) e.classList.remove('can-act', 'targetable'); });
      if (this.state === 'main') {
        const actors = new Set();
        this.acts.forEach(a => {
          if (a.kind === 'attack') actors.add(a.attacker.uid);
          if (a.kind === 'charAbility') actors.add(a.unit.uid);
          if (a.kind === 'leaderAbility' || a.kind === 'recovery') actors.add(this.g.p(this.viewPi).leader.uid);
          if (a.kind === 'support') actors.add(a.sup.iid);
        });
        actors.forEach(k => { const e = this.el(k); if (e) e.classList.add('can-act'); });
      }
      if (this.state === 'target') this.targets.forEach(t => { const e = this.el(t.uid); if (e) e.classList.add('targetable'); });
      if (this.state === 'choose' && this.req && this.req.kind === 'unit') this.req.options.forEach(u => { const e = this.el(u.uid); if (e) e.classList.add('targetable'); });
      this.renderChrome();
    }

    // =====================================================================
    // INPUT
    // =====================================================================
    findUnit(uid) { const g = this.g; return [0, 1].map(i => [g.p(i).leader].concat(g.p(i).chars)).flat().find(u => u.uid === uid); }
    findSup(iid) { const g = this.g; return g.p(0).supports.concat(g.p(1).supports).find(s => s.iid === iid); }
    onHover(e) {
      const g = this.g; if (!g) return;
      const hc = e.target.closest('.hc');
      $$('.hc.tilt', this.root).forEach(x => { if (x !== hc) { x.classList.remove('tilt'); const n = x.querySelector('.nc'); if (n) n.style.transform = ''; } });
      if (hc) {
        const n = hc.querySelector('.nc'), r = n.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        hc.classList.add('tilt');
        n.style.transform = `perspective(700px) rotateY(${(px - .5) * 18}deg) rotateX(${(.5 - py) * 14}deg)`;
        n.style.setProperty('--gx', px * 100 + '%'); n.style.setProperty('--gy', py * 100 + '%');
      }
      const hand = e.target.closest('[data-hand]'), unit = e.target.closest('[data-unit]'), sup = e.target.closest('[data-sup]'), pile = e.target.closest('[data-pile^=trash]');
      if (hand) { const c = g.p(this.viewPi).hand.find(x => x.iid === hand.dataset.hand); if (c) return showPreview(c.card, e, this.handHint(c)); }
      if (unit) {
        const u = this.findUnit(unit.dataset.unit);
        if (u) {
          const bits = [];
          if (u.isLeader) bits.push(`<b>Life ${u.life}</b>${u.rested ? ' · rested' : ''}`);
          else bits.push(`Current <b>POW ${g.pow(u)}</b> · <b>DMG ${g.dmg(u)}</b> · HP ${u.card.hp}${u.rested ? ' · <b>rested</b> (can be attacked)' : ''}${u.negated ? ' · effects negated' : ''}`);
          return showPreview(u.card, e, bits.join('<br>'), { pow: g.pow(u), dmg: g.dmg(u) });
        }
      }
      if (sup) { const s = this.findSup(sup.dataset.sup); if (s && s.owner === this.viewPi) return showPreview(s.card, e, `Face-down in your Support Area. Activate for <b>${s.card.support.cost}</b> Chakra.`); }
      if (pile) { const pi = +pile.dataset.pile.split('-')[1]; const t = g.p(pi).trash; if (t.length) return showPreview(t[t.length - 1].card, e, `Trash: ${t.length} cards (click to view)`); }
      const ck = e.target.closest('[data-ck]'); if (ck) return showPreview(CHAKRA_CARD, e, `Face-up Chakra: <b>${g.faceUpChakra(+ck.dataset.ck[0])}</b>/5`);
      if (e.target.closest('[data-k^=SUM]')) return showPreview(SUMMON_CARD, e);
      hidePreview();
    }
    handHint(c) {
      if (this.state !== 'main') return '';
      const a = this.acts.filter(x => x.card === c);
      if (!a.length) return '<span style="color:#ff9a8a">No legal action for this card right now.</span>';
      return 'Click to ' + a.map(x => ({ summon: 'summon', ex: 'EX summon', set: 'set as Support' }[x.kind])).join(' / ') + '.';
    }
    onClick(e) {
      if (e.target.closest('.popover')) return;
      this.closePop();
      const g = this.g; if (!g) return;
      const pile = e.target.closest('[data-pile^=trash]');
      if (pile) return this.showTrash(+pile.dataset.pile.split('-')[1]);
      if (this.state === 'main') {
        const hand = e.target.closest('[data-hand]');
        if (hand) { const acts = this.acts.filter(a => a.card && a.card.iid === hand.dataset.hand); if (acts.length) return this.pop(acts, e, acts[0].card.card.name); return; }
        const unit = e.target.closest('[data-unit]');
        if (unit) {
          const u = this.findUnit(unit.dataset.unit);
          const acts = this.acts.filter(a => (a.kind === 'attack' && a.attacker === u) || (a.kind === 'charAbility' && a.unit === u) || (u.isLeader && u.owner === this.viewPi && (a.kind === 'leaderAbility' || a.kind === 'recovery')));
          if (acts.length) {
            const menu = [];
            const atk = acts.filter(a => a.kind === 'attack');
            if (atk.length) menu.push({ kind: '_attack', attacker: u, list: atk });
            acts.filter(a => a.kind !== 'attack').forEach(a => menu.push(a));
            return this.pop(menu, e, u.isLeader ? 'Leader' : u.card.name);
          }
        }
        const sup = e.target.closest('[data-sup]');
        if (sup) { const acts = this.acts.filter(a => a.kind === 'support' && a.sup.iid === sup.dataset.sup); if (acts.length) return this.pop(acts, e, 'Support'); }
      }
      if (this.state === 'target') {
        const unit = e.target.closest('[data-unit]');
        if (unit) { const t = this.targets.find(x => x.uid === unit.dataset.unit); if (t) { const a = this.pendingAttack.find(x => x.target === t); this.state = 'main'; return this.resolveMain(a); } }
        return this.cancel();
      }
      if (this.state === 'choose' && this.req && this.req.kind === 'unit') {
        const unit = e.target.closest('[data-unit]');
        if (unit) { const u = this.req.options.find(x => x.uid === unit.dataset.unit); if (u) return this.resolveChoice(u); }
      }
    }
    label(a) {
      const g = this.g, P = g.p(this.viewPi);
      switch (a.kind) {
        case 'summon': return ['Summon (rest Summon card)', ''];
        case 'ex': return ['EX Summon (trash requirements)', ''];
        case 'set': return ['Set face-down as Support', ''];
        case 'support': return [`${a.fromHand ? 'Activate from hand' : 'Activate'}: ${a.sup.card.support.name}`, a.sup.card.support.cost];
        case 'leaderAbility': return [NS.LEADER[P.leader.card.id].label, P.leader.card.id === 'N-001' ? 1 : ''];
        case 'recovery': return ['[Recovery] — rest Leader, refill all Chakra', ''];
        case 'charAbility': return [NS.ABILITY[a.unit.card.id].label, ''];
        case '_attack': return ['Attack…', ''];
      }
      return [a.kind, ''];
    }
    pop(acts, e, title) {
      const pos = this.toStage(e.clientX, e.clientY);
      const pv = document.createElement('div');
      pv.className = 'popover';
      pv.innerHTML = `<div class="pv-title">${esc(title)}</div>` + acts.map((a, i) => { const [l, c] = this.label(a); return `<button data-i="${i}"><span>${esc(l)}</span>${c !== '' ? `<span class="cost">${c}</span>` : ''}</button>`; }).join('') + `<button class="cancel">Cancel</button>`;
      pv.style.left = Math.min(1600 - 280, pos.x + 8) + 'px';
      const fromHand = e.target.closest && e.target.closest('[data-hand]');
      pv.style.top = (fromHand ? 700 - acts.length * 44 - 50 : Math.max(8, Math.min(900 - 40 - acts.length * 44, pos.y - 20))) + 'px';
      this.root.appendChild(pv);
      pv.addEventListener('click', ev => {
        ev.stopPropagation();
        const b = ev.target.closest('button'); if (!b) return;
        this.closePop();
        if (b.classList.contains('cancel')) return;
        const a = acts[+b.dataset.i];
        NS.Audio.play('click');
        if (a.kind === '_attack') {
          this.state = 'target';
          this.pendingAttack = a.list;
          this.targets = a.list.map(x => x.target);
          this.showPrompt(`Choose a target for ${a.attacker.isLeader ? 'your Leader' : a.attacker.card.name} (right-click to cancel)`);
          return this.highlight();
        }
        this.resolveMain(a);
      });
      this.popEl = pv;
    }
    closePop() { if (this.popEl) { this.popEl.remove(); this.popEl = null; } }
    cancel() { this.closePop(); if (this.state === 'target') { this.state = 'main'; this.hidePrompt(); this.highlight(); } }
    showPrompt(t, optional, onSkip) {
      const p = $('#prompt');
      p.className = 'prompt show';
      p.innerHTML = `<span class="p-lead">${NS.icon('target')} ${esc(t)}</span>${optional ? '<button class="btn small" id="pSkip">Skip</button>' : ''}`;
      if (optional) $('#pSkip').onclick = ev => { ev.stopPropagation(); onSkip(); };
    }
    hidePrompt() { $('#prompt').className = 'prompt'; }
    resolveMain(a) {
      const r = this.mainResolve; this.mainResolve = null;
      this.state = 'idle'; this.acts = []; this.hidePrompt(); this.closePop();
      this.render({ noFlip: true });
      if (r) r(a);
    }
    resolveChoice(v) {
      const r = this.chooseResolve; this.chooseResolve = null;
      this.state = 'idle'; this.req = null; this.hidePrompt(); this.highlight();
      if (r) r(v);
    }
    showTrash(pi) {
      const P = this.g.p(pi);
      const close = modal(`<h2>${esc(P.name)} — Trash (${P.trash.length})</h2><div class="cards-row">${P.trash.slice().reverse().map(c => cardHTML(c.card, { w: 150 })).join('') || '<i>Empty</i>'}</div><div class="row-btns"><button class="btn small" id="mc">Close</button></div>`, m => { $('#mc', m).onclick = () => close(); });
    }

    async ensureView(pi) {
      if (!this.opts.hotseat || this.viewPi === pi) return;
      hidePreview();
      const h = $('#handoff');
      h.innerHTML = `<h1>${esc(this.g.p(pi).name)}</h1><p style="font-size:18px;color:#ccc">Pass the device — hide your face-down Supports!</p><button class="btn primary" id="hgo" style="text-align:center">Ready ${NS.icon('play')}</button>`;
      h.classList.add('show');
      await new Promise(r => { $('#hgo').onclick = r; });
      h.classList.remove('show');
      this.viewPi = pi;
      this.render({ noFlip: true });
    }

    // ---------------- human controller ----------------
    controllerFor(pi) {
      const ui = this;
      return {
        async takeMain(g, p, acts) {
          await ui.ensureView(p);
          ui.state = 'main'; ui.acts = acts;
          ui.render({ noFlip: true });
          return new Promise(res => { ui.mainResolve = res; });
        },
        async respond(g, p, win) {
          await ui.ensureView(p);
          return ui.responseModal(win);
        },
        async choose(g, req) {
          await ui.ensureView(req.player);
          return ui.humanChoose(req);
        },
      };
    }
    responseModal(win) {
      const g = this.g;
      let ctx;
      if (win.kind === 'attack') {
        const a = win.attack;
        ctx = a.pi === this.viewPi ? `Your ${esc(g.unitName(a.attacker))} is attacking ${esc(g.unitName(a.target))}. Use a [Quick] Support?` : `<b style="color:#ff6a6a">${esc(g.unitName(a.attacker))}</b> attacks your <b>${esc(g.unitName(a.target))}</b> (${a.target.isLeader ? `${g.dmg(a.attacker)} damage` : `${g.pow(a.attacker)} POW vs ${a.target.card.hp} HP`}). Respond with a Support?`;
      } else if (win.kind === 'summon') ctx = 'Your opponent summoned a Character. Cut in with a [Quick] Support?';
      else if (win.kind === 'effect') ctx = 'Your opponent activated an effect. Cut in with a [Quick] Support?';
      else ctx = `Opponent activated <b style="color:#ffb86a">${esc(win.link.sup.card.support.name)}</b> (${esc(win.link.sup.card.name)}). Respond?`;
      NS.Audio.play('edge');
      return new Promise(res => {
        const close = modal(`<h2>${win.kind === 'attack' ? 'Incoming Attack!' : win.kind === 'support' ? 'Support Activated!' : 'Support Cut-in'}</h2><p>${ctx}</p><div class="cards-row">${win.options.map((s, i) => `<div class="pickable" data-i="${i}">${cardHTML(s.card, { w: 170 })}<div class="lbl">${esc(s.card.support.name)} · ${s.card.support.cost} Chakra</div></div>`).join('')}</div><div class="row-btns">${win.noSkip ? '' : '<button class="btn" id="noResp">No response</button>'}</div>`, m => {
          $$('.pickable', m).forEach(b => b.onclick = () => { close(); NS.Audio.play('click'); res(win.options[+b.dataset.i]); });
          const nr = $('#noResp', m); if (nr) nr.onclick = () => { close(); res(null); };
        }, 'resp');
      });
    }
    humanChoose(req) {
      return new Promise(res => {
        this.chooseResolve = res;
        this.req = req;
        if (req.kind === 'unit') {
          this.state = 'choose';
          this.showPrompt(req.prompt, req.optional, () => this.resolveChoice(null));
          this.highlight();
          return;
        }
        this.state = 'modal';
        if (req.kind === 'mulligan') {
          const close = modal(`<h2>Opening Hand</h2><p>${esc(req.prompt)}</p><div class="cards-row">${this.g.p(req.player).hand.map(c => cardHTML(c.card, { w: 170 })).join('')}</div><div class="row-btns"><button class="btn primary" data-v="keep">Keep</button><button class="btn" data-v="mulligan">Mulligan</button></div>`, m => {
            $$('button[data-v]', m).forEach(b => b.onclick = () => { close(); this.resolveChoice(b.dataset.v); });
          });
          return;
        }
        if (req.kind === 'card') {
          const close = modal(`<h2>Choose a Card</h2><p>${esc(req.prompt)}</p><div class="cards-row">${req.options.map((c, i) => `<div class="pickable" data-i="${i}">${cardHTML(c.card, { w: 170 })}</div>`).join('')}</div><div class="row-btns">${req.optional ? '<button class="btn" id="sk">Skip</button>' : ''}</div>`, m => {
            $$('.pickable', m).forEach(b => b.onclick = () => { close(); this.resolveChoice(req.options[+b.dataset.i]); });
            const sk = $('#sk', m); if (sk) sk.onclick = () => { close(); this.resolveChoice(null); };
          });
          return;
        }
        this.resolveChoice(req.optional ? null : req.options[0]);
      });
    }

    // =====================================================================
    // EVENTS → ANIMATION
    // =====================================================================
    center(el) { return NS.FX.centerOf(el); }
    async onEvent(type, d, g) {
      const snd = n => NS.Audio.play(n);
      const mine = pi => pi === this.viewPi;
      switch (type) {
        case 'coin': this.render({ noFlip: true }); snd('taiko'); await NS.FX.banner(esc(g.p(d.player).name), 'goes first', { hold: 1000 }); break;
        case 'dealt': this.render(); snd('draw'); await wait(400); break;
        case 'mulligan': this.render(); break;
        case 'turn': {
          this.render({ noFlip: true });
          if (g.p(d.player).turns <= 1 && !g.house.firstRoundAttacks && this.opts.humans[d.player] && d.player === this.viewPi) setTimeout(() => this.toast('First turn: neither player can attack on their first turn, even with Rush'), 900 * S());
          snd('taiko');
          if (mine(d.player) && this.opts.humans[d.player]) NS.Audio.jingle('turn');
          await NS.FX.banner(mine(d.player) && this.opts.humans[d.player] ? 'Your Turn' : `${esc(g.p(d.player).name)}'s Turn`, `Turn ${d.turn}`, { hold: 750, cls: mine(d.player) ? '' : 'blue' });
          break;
        }
        case 'refresh': this.render(); await wait(250); break;
        case 'draw': {
          if (d.silent) break;
          this.render();
          snd('draw');
          const el = this.el(d.card.iid), from = $(`[data-pile="deck-${d.player}"]`);
          if (el && from) { const a = this.center(from), b = this.center(el); el.animate([{ transform: `translate(${(a.x - b.x) / this.sc()}px,${(a.y - b.y) / this.sc()}px) scale(.6)`, opacity: .3 }, { opacity: 1 }], { duration: 420 * S(), easing: 'cubic-bezier(.3,.8,.3,1)', composite: 'add' }); }
          await wait(200);
          break;
        }
        case 'phase': this.render({ noFlip: true }); break;
        case 'summonCard': this.render(); snd('card'); await wait(200); break;
        case 'summon': {
          this.render();
          const el = this.el(d.unit.uid);
          if (el) {
            el.animate([{ transform: 'translateY(-60px) scale(1.4)', opacity: 0, filter: 'brightness(3)' }, { transform: 'none', opacity: 1, filter: 'none' }], { duration: 480 * S(), easing: 'cubic-bezier(.2,1.3,.4,1)' });
            const c = this.center(el);
            NS.FX.summonSeal(c.x, c.y + 50, { traits: d.unit.card.traits, gold: d.ex });
            NS.FX.shock(c.x, c.y, { color: d.ex ? '255,210,60' : '255,150,60', max: d.ex ? 240 : 140 });
            if (d.ex) { NS.FX.sparks(c.x, c.y, { colors: ['#fff', '#ffe27a', '#ffb347'], count: 50, speed: 11 }); NS.FX.chroma(160); }
            if (d.ex) { NS.FX.pillar(c.x, c.y + 80, '#ffd23a'); NS.FX.punch(c.x, c.y, 0.05); }
          }
          snd('seal'); snd('hit');
          if (d.ex && NS.settings.cutins) {
            NS.FX.flash('#ffb347'); NS.FX.shake(12);
            await NS.FX.cutIn({ title: d.unit.card.name, sub: 'EX Summon', color: '#ffd23a', artStyle: portraitCSS(d.unit.card), side: mine(d.player) ? 'left' : 'right', hold: 1000 });
          }
          await wait(d.ex ? 300 : 350);
          break;
        }
        case 'tribute': {
          const el = this.el(d.unit.uid);
          if (el) { const c = this.center(el); NS.FX.chakra(c.x, c.y, { color: '#b86aff', count: 40 }); el.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(.6) translateY(-30px)', filter: 'brightness(3) hue-rotate(200deg)' }], { duration: 450 * S(), fill: 'forwards' }); }
          snd('chakra');
          await wait(420);
          break;
        }
        case 'set': {
          this.render();
          const el = this.el(d.sup.iid);
          if (el) { el.animate([{ transform: 'translateY(80px) rotate(10deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 380 * S(), easing: 'cubic-bezier(.2,1.2,.4,1)' }); const c = this.center(el); NS.FX.smoke(c.x, c.y, { count: 8, color: '#888' }); }
          snd('hidden');
          await wait(300);
          break;
        }
        case 'supportFlip': {
          const el = this.el(d.sup.iid);
          const ckr = this.root.querySelector(`[data-ck="${d.player}-0"]`);
          if (el && ckr) { NS.FX.stream(this.center(ckr), this.center(el), '#ffb347'); await wait(300); }
          if (el) {
            el.innerHTML = cardHTML(d.sup.card, { w: 76 });
            el.animate([{ transform: 'rotateY(90deg) scale(1.4)' }, { transform: 'scale(1.3)' }, { transform: 'none' }], { duration: 500 * S() });
            const c = this.center(el); NS.FX.burst(c.x, c.y, { colors: ['#ffb347', '#fff'], count: 40 });
          }
          snd('reveal');
          if (NS.settings.cutins) await NS.FX.cutIn({ title: d.sup.card.support.name, sub: `${d.sup.card.name} · Support`, color: '#f07c14', artStyle: portraitCSS(d.sup.card), side: mine(d.player) ? 'left' : 'right', hold: 950 });
          if (el) {
            const from = this.center(el);
            let to = from;
            if (d.attack && d.attack.attacker) { const ae = this.el(d.attack.attacker.uid); if (ae) to = this.center(ae); }
            else if (['N-004', 'N-015'].includes(d.sup.card.id)) { const r = $('#stage').getBoundingClientRect(); to = { x: r.left + r.width * .48, y: r.top + r.height * .39 }; }
            if (d.sup.card.id === 'N-010') { const le = this.el(g.p(d.player).leader.uid); if (le) to = this.center(le); }
            const ms = NS.FX.jutsuFX(d.sup.card.id, d.sup.card.id === 'N-010' ? to : from, to);
            await wait(ms);
          }
          await wait(150);
          break;
        }
        case 'supportEnd': this.render(); await wait(200); break;
        case 'chakra': {
          this.render({ noFlip: true });
          if (d.amount < 0) { snd('chakra'); for (let i = 0; i < 5; i++) { const e = this.root.querySelector(`[data-ck="${d.player}-${i}"]`); if (e && !g.p(d.player).chakra[i]) { const c = this.center(e); NS.FX.burst(c.x, c.y, { colors: ['#f07c14', '#ffd23a'], count: 10, speed: 3 }); } } }
          await wait(220);
          break;
        }
        case 'recovery': {
          this.render();
          const el = this.el(g.p(d.player).leader.uid);
          if (el) { const c = this.center(el); NS.FX.chakra(c.x, c.y, { color: '#f07c14', count: 70 }); NS.FX.shock(c.x, c.y, { color: '255,170,60', max: 220 }); NS.FX.sparks(c.x, c.y, { colors: ['#ffe27a', '#ffb347'], count: 30, speed: 8 }); }
          for (let i = 0; i < 5; i++) { const e = this.root.querySelector(`[data-ck="${d.player}-${i}"]`); if (e) e.animate([{ transform: 'rotateY(180deg)' }, { transform: 'none' }], { duration: 500 * S(), delay: i * 70 * S() }); }
          snd('upgrade');
          await NS.FX.banner('Recovery', 'All Chakra restored', { hold: 700 });
          break;
        }
        case 'buff': {
          this.render({ noFlip: true });
          const el = this.el(d.unit.uid);
          if (el) { const c = this.center(el); NS.FX.floatText(c.x, c.y - 40, d.text, '#ffd23a', 30); NS.FX.chakra(c.x, c.y, { color: '#ffb347', count: 30 }); }
          snd('power');
          await wait(420);
          break;
        }
        case 'attack': {
          const a = this.el(d.attacker.uid), t = this.el(d.target.uid);
          this.render({ noFlip: true });
          const a2 = this.el(d.attacker.uid);
          const t2 = this.el(d.target.uid);
          let label, kind = '';
          if (d.target.isLeader) label = `${NS.icon('swords')} <b>${g.dmg(d.attacker)} DMG</b> ${NS.icon('arrow')} Leader`;
          else { const pw = g.pow(d.attacker), hp = g.hpLeft(d.target); kind = pw >= hp ? 'lethal' : 'weak'; label = `${NS.icon('swords')} POW <b>${pw}</b> vs HP <b>${hp}</b> ${NS.icon('arrow')} ${pw >= hp ? '<b class="ko">K.O.</b>' : `${NS.icon('shield')} survives`}`; }
          if (a2 && t2) {
            const p = this.center(a2);
            this.showArrow(d.attacker, d.target, label, kind);
            t2.classList.add('targeted');
            NS.FX.floatText(p.x, p.y - 60, 'ATTACK!!', '#ff5a3a', 42);
            NS.FX.speedLines(500, '#ffffff');
            snd('whoosh');
            await this.lunge(a2, t2, 0.45);
          }
          void a;
          await wait(200);
          break;
        }
        case 'interrupted': {
          this.hideArrow();
          { const te = this.el(d.attack.target.uid); this.outcome(te, 'INTERRUPTED', 'blocked'); }
          NS.FX.shake(6);
          await NS.FX.banner('Attack Cancel!!', 'Interrupted by a Support', { hold: 800, cls: 'red' });
          this.render();
          break;
        }
        case 'hit': {
          const a = this.el(d.attacker.uid), t = this.el(d.target.uid);
          this.hideArrow();
          if (a && t) { this.afterimages(a, t); await this.lunge(a, t, 0.8, true); }
          if (t) {
            const c = this.center(t);
            if (a) { const p = this.center(a); NS.FX.slashLine(p.x, p.y, c.x + (c.x - p.x) * 0.3, c.y + (c.y - p.y) * 0.3, '#ffb347'); }
            snd('impact');
            await NS.FX.impactFrame(c.x, c.y, d.amount >= 3 || !d.target.isLeader);
            NS.FX.burst(c.x, c.y, { colors: ['#fff', '#ffb347', '#ff5a3a'], count: 30, speed: 7 });
            NS.FX.sparks(c.x, c.y, { count: 45, speed: 12, dir: a ? Math.atan2(c.y - this.center(a).y, c.x - this.center(a).x) : null, spread: 1.6 });
            NS.FX.shock(c.x, c.y, { max: 200 });
            if (d.amount >= 3 || !d.target.isLeader) NS.FX.chroma(150);
            NS.FX.punch(c.x, c.y, 0.035);
            const ang = a ? Math.atan2(c.y - this.center(a).y, c.x - this.center(a).x) : 0, kx = Math.cos(ang) * 22, ky = Math.sin(ang) * 22;
            t.classList.remove('hitflash'); void t.offsetWidth; t.classList.add('hitflash');
            t.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${kx}px,${ky}px) rotate(${kx > 0 ? 4 : -4}deg)`, offset: .25 }, { transform: `translate(${-kx * .2}px,${-ky * .2}px)`, offset: .6 }, { transform: 'translate(0,0)' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.3,1)', composite: 'add' });
            if (d.target.isLeader) this.outcome(t, `−${d.amount} LIFE`, 'dmg');
          }
          NS.FX.shake(d.target.isLeader ? 12 : 8);
          await wait(150);
          break;
        }
        case 'life': {
          this.ghost = this.ghost || {};
          if (d.amount < 0) this.ghost[d.player] = g.p(d.player).leader.life - d.amount; else this.ghost[d.player] = null;
          this.render({ noFlip: true });
          setTimeout(() => { if (this.ghost) this.ghost[d.player] = null; const gb = this.root.querySelector(`[data-lb="${d.player}"] .ghost`); if (gb) gb.style.width = Math.max(0, g.p(d.player).leader.life / 15 * 100) + '%'; }, 650 * S());
          { const lb = this.root.querySelector(`[data-lb="${d.player}"]`); if (lb) { lb.classList.remove('hurt', 'healed'); void lb.offsetWidth; lb.classList.add(d.amount < 0 ? 'hurt' : 'healed'); } }
          const el = this.root.querySelector(`[data-life="${d.player}"]`);
          if (el) { const c = this.center(el); NS.FX.damage(c.x - 60, c.y, `${d.amount > 0 ? '+' : ''}${d.amount}`, d.amount < 0 ? '#ff4a3a' : '#5aff8a', d.amount > 0); el.animate([{ transform: 'scale(1.7)' }, { transform: 'none' }], { duration: 500 }); }
          if (d.amount < 0) NS.FX.flash('#ff2a2a');
          snd(d.amount < 0 ? 'defeat' : 'win');
          await wait(420);
          break;
        }
        case 'ko': {
          const el = this.el(d.unit.uid);
          if (el) {
            const c = this.center(el);
            NS.FX.burst(c.x, c.y, { colors: ['#ff4a4a', '#fff', '#555'], count: 50, speed: 7 });
            NS.FX.puff(c.x, c.y, { count: 14 });
            NS.FX.sparks(c.x, c.y, { colors: ['#fff', '#ff6a4a', '#ffd23a'], count: 40, speed: 11 });
            NS.FX.shock(c.x, c.y, { color: '255,80,60', max: 180 });
            this.outcome(el, 'K.O.!', 'ko');
            NS.FX.shatter(el);
            el.style.visibility = 'hidden';
          }
          NS.FX.shake(9); snd('shatter'); snd('defeat');
          await wait(520);
          this.render();
          break;
        }
        case 'bounce': {
          const el = this.el(d.unit.uid);
          if (el) { const c = this.center(el); NS.FX.smoke(c.x, c.y, { count: 20 }); el.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(80px) scale(.6)' }], { duration: 380 * S(), fill: 'forwards' }); }
          snd('poof'); await wait(380); this.render();
          break;
        }
        case 'immune': { const el = this.el(d.unit.uid); if (el) { const c = this.center(el); NS.FX.ring(c.x, c.y, { color: '#6ac8ff', max: 110, width: 10 }); NS.FX.floatText(c.x, c.y - 30, 'NO EFFECT', '#6ac8ff', 28); } await wait(400); break; }
        case 'withstand': { this.render({ noFlip: true }); const el = this.el(d.target.uid); this.outcome(el, `${d.left} HP LEFT`, 'blocked'); await wait(450); break; }
        case 'fizzle': this.hideArrow(); this.render(); await wait(200); break;
        case 'genjutsu': {
          const el = this.el(d.unit.uid);
          if (el) { const c = this.center(el); NS.FX.ring(c.x, c.y, { color: '#ff2a2a', max: 180, width: 12 }); NS.FX.burst(c.x, c.y, { colors: ['#ff2a2a', '#1a0000'], count: 40 }); }
          snd('lightning'); this.render({ noFlip: true }); await wait(500);
          break;
        }
        case 'revealTop': await this.flashCard(d.card.card, `${esc(g.p(d.player).name)} reveals the top card`); break;
        case 'toDeck': this.render(); break;
        case 'gameOver': this.render({ noFlip: true }); await wait(500); NS.Screens.showResult(g, d, this); break;
        default: this.render();
      }
    }
    async lunge(a, t, frac, back) {
      const p = this.center(a), q = this.center(t);
      const dx = (q.x - p.x) / this.sc() * frac, dy = (q.y - p.y) / this.sc() * frac;
      a.style.zIndex = 40;
      const kf = back ? [{ transform: 'translate(0,0)' }, { transform: `translate(${dx}px,${dy}px) scale(1.12)`, offset: .45 }, { transform: 'translate(0,0)' }] : [{ transform: 'translate(0,0)' }, { transform: `translate(${-dx * 0.15}px,${-dy * 0.15}px) scale(1.08)` }, { transform: 'translate(0,0)' }];
      await a.animate(kf, { duration: (back ? 420 : 300) * S(), easing: 'cubic-bezier(.4,0,.2,1)', composite: 'add' }).finished.catch(() => { });
      a.style.zIndex = '';
    }
    flashCard(card, title) {
      return new Promise(res => {
        const close = modal(`<h2>${title}</h2><div class="cards-row">${cardHTML(card, { w: 220 })}</div>`);
        hidePreview();
        setTimeout(() => { close(); res(); }, 1300 * Math.max(0.4, S()));
      });
    }
  }

  // hover any card inside a pop-up (mulligan, choices, trash, responses) to inspect it
  document.addEventListener('mousemove', e => {
    const m = e.target.closest && e.target.closest('#modal');
    if (!m) { if (e.target.closest && e.target.closest('#modalBack')) hidePreview(); return; }
    const el = e.target.closest('[data-card]');
    if (!el) return hidePreview();
    const id = el.dataset.card;
    const card = id === 'chakra' ? CHAKRA_CARD : id === 'summon' ? SUMMON_CARD : NS.Cards.byId[id];
    if (card) showPreview(card, e);
  });
  NS.View = { cardHTML, backHTML, artCSS, portraitCSS, textPanel, showPreview, hidePreview, modal, esc, CHAKRA_CARD, SUMMON_CARD };
  NS.GameUI = GameUI;
})();
