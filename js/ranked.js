/* ============================================================
   RANKED — profiles, the ranked queue, results and the leaderboard
   Server: functions/api/ranked/* (Cloudflare Pages Functions + D1).
   A profile is a name and a secret key kept in this browser; the
   "account code" is that key, to keep the profile on another device.
   ============================================================ */
(function () {
  const NS = window.NTCG = window.NTCG || {};
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const KEY = 'ntcg.ranked.key', PEND = 'ntcg.ranked.pending';
  const ls = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } } };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const mmss = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');

  let me = null, pos = null, up = null; // up: the ranked server answers (null = not checked yet)
  let run = 0, queued = false, cur = null; // cur: the ranked match being played or just finished

  async function api(path, opt) {
    const key = ls.get(KEY);
    const r = await fetch('/api/ranked/' + path, Object.assign({}, opt, { headers: Object.assign({ 'content-type': 'application/json' }, key ? { authorization: 'Bearer ' + key } : {}) }));
    let d = null;
    try { d = await r.json(); } catch (e) { /* not JSON: no ranked server here */ }
    if (!r.ok || !d) throw Object.assign(new Error((d && d.error) || 'The ranked server is not available.'), { status: r.status, down: !d });
    return d;
  }

  // ---------------- the Ranked box on the Online Match screen ----------------
  async function refresh() {
    const box = $('#rkBox'); if (!box) return;
    try {
      if (ls.get(KEY)) { const d = await api('profile'); me = d.profile; pos = d.position; }
      else if (up == null) await api('leaderboard'); // is there a ranked server at all?
      up = true;
    } catch (e) {
      if (e.status === 401) { me = null; up = true; } // the key is not known here (profile deleted, or another site's)
      else up = false;
    }
    render();
  }
  function render() {
    const box = $('#rkBox'); if (!box) return;
    box.style.display = up ? '' : 'none';
    if (!up) return;
    const head = `<div class="rk-head"><span>Ranked</span><button class="rk-link" data-rk="board">Leaderboard</button></div>`;
    if (!me) {
      box.innerHTML = head + `<p class="rk-text">Rated matches with a public leaderboard. No sign-up: pick a name and play.</p>
        <div class="rk-btns"><button class="btn small primary" data-rk="create">Create profile</button><button class="btn small ghost" data-rk="restore">Use account code</button></div>`;
      return;
    }
    const sub = me.placement ? `Placement: ${me.placement} game${me.placement > 1 ? 's' : ''} left` : `${me.tier} · ${me.rating}${pos ? ` · #${pos}` : ''}`;
    box.innerHTML = head + `<div class="rk-me"><div class="rk-badge t-${me.tier.toLowerCase()}">${esc(me.tier[0])}</div><div class="rk-who"><b>${esc(me.name)}</b><small>${sub} · ${me.wins}W ${me.losses}L</small></div><button class="rk-link" data-rk="account">Account</button></div>
      <button class="btn primary rk-play" data-rk="play" ${queued ? 'disabled' : ''}>Ranked Match</button>`;
  }
  function bind() {
    const box = $('#rkBox'); if (!box) return;
    box.addEventListener('click', e => {
      const b = e.target.closest('[data-rk]'); if (!b) return;
      NS.Audio.play('click');
      ({ board, create, restore, account, play })[b.dataset.rk]();
    });
    // the lobby's Cancel and Back also leave the ranked queue
    $('#onCancel').addEventListener('click', () => leaveQueue('Cancelled.'));
    $('#onBack').addEventListener('click', () => leaveQueue());
    const open = NS.Net.open;
    NS.Net.open = () => { open(); refresh(); };
  }

  // ---------------- profile ----------------
  function create() {
    const close = NS.View.modal(`<h2>Create a ranked profile</h2><p>Your name is shown on the leaderboard and to your opponents.</p>
      <div class="field"><label>Name</label><input id="rkName" maxlength="16" autocomplete="off" spellcheck="false" value="${esc((NS.Screens.store.get('myName', '') || '').slice(0, 16))}"></div>
      <p class="rl-note" id="rkErr"></p><div class="row-btns"><button class="btn primary" id="rkGo">Create</button><button class="btn" id="rkNo">Cancel</button></div>`, m => {
      const go = async () => {
        $('#rkGo', m).disabled = true; $('#rkErr', m).textContent = '';
        try {
          const d = await api('profile', { method: 'POST', body: JSON.stringify({ name: $('#rkName', m).value }) });
          ls.set(KEY, d.token); me = d.profile; pos = d.position; close(); render(); showCode(true);
        } catch (e) { $('#rkErr', m).textContent = e.message; $('#rkGo', m).disabled = false; }
      };
      $('#rkGo', m).onclick = go;
      $('#rkName', m).addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
      $('#rkNo', m).onclick = () => close();
      $('#rkName', m).focus();
    });
  }
  function showCode(fresh) {
    const code = ls.get(KEY) || '';
    const close = NS.View.modal(`<h2>${fresh ? 'Profile created' : 'Account code'}</h2>
      <p>${fresh ? 'Your profile lives in this browser. ' : ''}This code is your profile. Save it somewhere safe: it brings your rating back after clearing the browser, or onto another device under <b>Use account code</b>. Anyone with the code can play as you.</p>
      <textarea class="rl-code" id="rkCode" readonly>${esc(code)}</textarea><p class="rl-note" id="rkN"></p>
      <div class="row-btns"><button class="btn primary" id="rkCopy">Copy code</button><button class="btn" id="rkOk">Done</button></div>`, m => {
      const t = $('#rkCode', m); t.select();
      $('#rkCopy', m).onclick = () => { t.select(); const ok = () => { $('#rkN', m).textContent = 'Copied.'; }; if (navigator.clipboard) navigator.clipboard.writeText(code).then(ok, () => { document.execCommand('copy'); ok(); }); else { document.execCommand('copy'); ok(); } };
      $('#rkOk', m).onclick = () => close();
    });
  }
  function restore() {
    const close = NS.View.modal(`<h2>Use an account code</h2><p>Paste the code of a ranked profile to play as it in this browser.</p>
      <textarea class="rl-code" id="rkIn" placeholder="Account code" spellcheck="false"></textarea><p class="rl-note" id="rkErr"></p>
      <div class="row-btns"><button class="btn primary" id="rkGo">Use code</button><button class="btn" id="rkNo">Cancel</button></div>`, m => {
      $('#rkGo', m).onclick = async () => {
        const code = $('#rkIn', m).value.trim(), old = ls.get(KEY);
        if (!code) return;
        ls.set(KEY, code);
        try { const d = await api('profile'); me = d.profile; pos = d.position; close(); render(); NS.UIx.toast(`Playing as ${d.profile.name}`); }
        catch (e) { ls.set(KEY, old); $('#rkErr', m).textContent = e.status === 401 ? 'No profile has that code.' : e.message; }
      };
      $('#rkNo', m).onclick = () => close();
    });
  }
  function account() {
    const close = NS.View.modal(`<h2>${esc(me.name)}</h2><p>${esc(me.placement ? `Placement: ${me.placement} game${me.placement > 1 ? 's' : ''} left` : `${me.tier} · rating ${me.rating}${pos ? ` · #${pos} on the leaderboard` : ''}`)} · ${me.wins} wins, ${me.losses} losses</p>
      <div class="field"><label>Change name</label><div class="on-join"><input id="rkName" maxlength="16" value="${esc(me.name)}" autocomplete="off" spellcheck="false"><button class="btn" id="rkRen">Save</button></div></div><p class="rl-note" id="rkErr"></p>
      <div class="row-btns"><button class="btn" id="rkCode">Show account code</button><button class="btn ghost" id="rkOut">Remove from this browser</button><button class="btn primary" id="rkOk">Done</button></div>`, m => {
      $('#rkRen', m).onclick = async () => {
        try { const d = await api('profile', { method: 'PATCH', body: JSON.stringify({ name: $('#rkName', m).value }) }); me = d.profile; $('#rkErr', m).textContent = 'Saved.'; render(); }
        catch (e) { $('#rkErr', m).textContent = e.message; }
      };
      $('#rkCode', m).onclick = () => { close(); showCode(false); };
      $('#rkOut', m).onclick = e => {
        const b = e.currentTarget;
        if (!b.classList.contains('sure')) { b.classList.add('sure'); b.textContent = 'Sure? Copy the code first'; return; }
        ls.set(KEY, null); me = null; pos = null; close(); render();
      };
      $('#rkOk', m).onclick = () => close();
    });
  }

  // ---------------- leaderboard ----------------
  async function board() {
    const close = NS.View.modal(`<h2>Leaderboard</h2><p class="lb-sub" id="lbSub">Loading…</p><div class="lb-list" id="lbList"></div><div class="row-btns"><button class="btn primary" id="lbOk">Close</button></div>`, m => {
      $('#lbOk', m).onclick = () => close();
    }, 'lb');
    try {
      const d = await api('leaderboard'), m = $('#modal');
      if (!$('#lbList', m)) return;
      $('#lbSub', m).innerHTML = `${d.total} ranked player${d.total === 1 ? '' : 's'} · Glicko-2 ratings · ${5} placement games to appear${d.me ? ` · you: ${d.position ? `<b>#${d.position}</b> ` : ''}${esc(d.me.tier)} ${d.me.rating}` : ''}`;
      $('#lbList', m).innerHTML = d.players.map((p, i) => `<div class="lb-row ${d.me && p.id === d.me.id ? 'me' : ''}"><span class="lb-pos">${i + 1}</span><b>${esc(p.name)}</b><span class="lb-tier t-${p.tier.toLowerCase()}">${esc(p.tier)}</span><span class="lb-rt">${p.rating}</span><span class="lb-wl">${p.wins}W ${p.losses}L</span></div>`).join('')
        || '<div class="rl-empty">Nobody has finished their placement games yet. Be the first.</div>';
    } catch (e) { const s = $('#lbSub'); if (s) s.textContent = e.message; }
  }

  // ---------------- the ranked queue ----------------
  async function play() {
    if (!me || queued || NS.Net.active()) return;
    const deck = NS.Net.deck(), errs = NS.Cards.validate(deck, NS.HOUSE_DEFAULTS);
    if (errs.length) return NS.Net.status('Ranked uses the standard rules, and this deck is not legal under them: ' + esc(errs[0]), 'err');
    NS.Audio.ensure();
    const r0 = ++run;
    queued = true; render(); NS.Net.busy(true); NS.Net.status('Joining the ranked queue…', 'ok');
    try {
      let r = await api('queue', { method: 'POST', body: JSON.stringify({ deck, build: NS.Net.build() }) });
      while (r0 === run && r.state === 'waiting') {
        NS.Net.status(`Ranked queue: looking for an opponent near ${me.rating}… <b>${mmss(r.waited)}</b><br><span style="color:var(--dim)">Keep this tab open.</span>`, 'ok');
        await sleep(2500);
        if (r0 !== run) return;
        r = await api('queue');
      }
      if (r0 !== run) return;
      if (r.state !== 'matched') throw new Error('You left the queue.');
      startMatch(r.match);
    } catch (e) { if (r0 === run) { queued = false; render(); NS.Net.busy(false); NS.Net.status(esc(e.message), 'err'); } }
  }
  function leaveQueue(msg) {
    if (!queued) return;
    run++; queued = false; render();
    api('queue', { method: 'DELETE' }).catch(() => { });
    if (msg) NS.Net.status(msg);
  }
  function startMatch(m) {
    const opp = m.players[1 - m.seat];
    cur = { id: m.id, rated: m.rated, opp, note: null };
    NS.Audio.play('upgrade');
    NS.Net.status(`Opponent found: <b>${esc(opp.name)}</b> (${esc(opp.tier)}, ${opp.rating}). Connecting…${m.rated ? '' : '<br><span style="color:var(--dim)">Not rated: you have played each other a lot today.</span>'}`, 'ok');
    NS.Net.ranked({ id: m.id, seat: m.seat, start: m.start, onEnd: rep => report(m.id, rep) }, why => {
      queued = false; render(); NS.Net.busy(false);
      NS.Net.status(esc(why) + '<br>The match was called off and does not count.', 'err');
      report(m.id, { winner: null, why: 'nostart', log: [] });
    });
  }

  // ---------------- results ----------------
  // sent with keepalive, so it still goes out when the page is closing; kept until the server has it
  function report(id, rep) {
    queued = false;
    const body = JSON.stringify(Object.assign({ match: id, token: ls.get(KEY) }, rep));
    ls.set(PEND, body);
    send(body).then(d => { if (cur && cur.id === id) settle(d); }).catch(() => { /* sent again on the next visit */ });
  }
  function send(body) {
    const key = ls.get(KEY);
    return fetch('/api/ranked/result', { method: 'POST', keepalive: true, headers: Object.assign({ 'content-type': 'application/json' }, key ? { authorization: 'Bearer ' + key } : {}), body })
      .then(r => r.json().then(d => { if (!r.ok) throw new Error(d.error || 'error'); ls.set(PEND, null); return d; }));
  }
  // the result screen gets a line with the rating change once the server has settled the match
  async function settle(d) {
    const id = cur.id;
    for (let i = 0; d.status === 'live' && i < 40 && cur && cur.id === id; i++) { note(d); await sleep(i < 10 ? 3000 : 10000); try { d = await api('match?id=' + encodeURIComponent(id)); } catch (e) { return; } }
    if (d.profile) { me = d.profile; render(); }
    note(d);
  }
  function note(d) {
    let html;
    if (d.status === 'done' && d.rated) html = `<b>Ranked</b> ${d.before} <span class="${d.delta >= 0 ? 'up' : 'dn'}">${d.delta >= 0 ? '+' : ''}${d.delta}</span> → ${d.before + d.delta} · ${esc(d.profile.tier)}`;
    else if (d.status === 'done') html = '<b>Ranked</b> not rated: you have played this opponent a lot today';
    else if (d.status === 'void') html = `<b>Ranked</b> no result${d.how === 'disputed' ? ': the two reports disagree' : d.how === 'no start' ? ': the match never started' : ': both sides lost the connection or the games fell out of sync'}`;
    else html = '<b>Ranked</b> waiting for your opponent\'s result…';
    const put = (n) => {
      const body = $('#result.show .r-body');
      if (!body) { if (n < 20) setTimeout(() => put(n + 1), 500); return; }
      let el = $('.r-rank', body);
      if (!el) { el = document.createElement('div'); el.className = 'r-rank'; const sub = $('.r-sub', body); sub.parentNode.insertBefore(el, sub.nextSibling); }
      el.innerHTML = html;
    };
    put(0);
  }

  window.addEventListener('DOMContentLoaded', () => {
    bind();
    const p = ls.get(PEND); if (p) send(p).catch(() => { }); // a result that did not get through last time
  });
  NS.Ranked = { refresh, board };
})();
