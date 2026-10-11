/* ============================================================
   FXJ — card effect animations (drawn on the FXGL light layer)
   One effect per card that has one: support moves follow the move
   named on the card, the others draw on the character.
   ============================================================ */
(function () {
  const NS = window.NTCG = window.NTCG || {};
  const K = NS.FXGL._k, { glow, line, beam, sparks, motes, ringE, wave, rng, seg, clamp, easeOut, easeIn, easeIO, bell } = K;
  const AKI = '#6fd0ff', INO = '#c79bff';
  function glowE(e, x, y, r, color, a) { e.save(); e.globalCompositeOperation = 'lighter'; glow(e, x, y, r, color, a); e.restore(); }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

  // ---------------- drawing pieces (b = base layer, e = light layer) ----------------
  const BLU = '#7fc8ff', ORG = '#ff9a2e', GRN = '#7dffa8', RED = '#ff4a3a', PNK = '#ffa6cf', GLD = '#ffd56a', WAT = '#5fb8ff', PUR = '#a070ff', PALE = '#cfe0ff', YEL = '#ffe066';
  const VIO = [.62, .5, 1.0], KJ = '"Yuji Boku", "Yu Mincho", "MS Mincho", serif', TAU = 6.2832;
  const lerp = (a, b2, k) => a + (b2 - a) * k, L2 = (p, q, k) => [lerp(p[0], q[0], k), lerp(p[1], q[1], k)];
  const bez = (p0, c, p1) => q => { const m = 1 - q; return [m * m * p0[0] + 2 * m * q * c[0] + q * q * p1[0], m * m * p0[1] + 2 * m * q * c[1] + q * q * p1[1]]; };
  const lin = (p0, p1) => q => L2(p0, p1, q);
  const dirOf = (path, q) => { const a = path(q), c = path(q + .02); return Math.atan2(c[1] - a[1], c[0] - a[0]); };
  const jit = (t, amp) => { const r = rng(900 + Math.floor(t / 22)); return [(r() - .5) * 2 * amp, (r() - .5) * 2 * amp]; };
  function along(pts, f) { const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); const d = clamp(f, 0, 1) * L[L.length - 1], out = [pts[0]]; for (let i = 1; i < pts.length; i++) { if (L[i] <= d) { out.push(pts[i]); continue; } out.push(L2(pts[i - 1], pts[i], (d - L[i - 1]) / ((L[i] - L[i - 1]) || 1))); break; } return out; }

  function txt(c, s, x, y, size, col, a, font) { if (a <= 0 || size <= 0) return; c.save(); c.globalAlpha = clamp(a, 0, 1); c.font = `700 ${size}px ${font || 'Oswald, "Arial Narrow", sans-serif'}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = col; c.fillText(s, x, y); c.restore(); }
  function txtE(b, e, s, x, y, size, col, a, font) { txt(b, s, x + 2, y + 3, size, 'rgba(0,0,0,.75)', a, font); txt(b, s, x, y, size, '#ffffff', a, font); e.save(); e.globalCompositeOperation = 'lighter'; txt(e, s, x, y, size, col, a * .7, font); e.restore(); }

  // ---- lightning
  function boltPts(x1, y1, x2, y2, r, amp) { let pts = [[x1, y1], [x2, y2]], d = Math.hypot(x2 - x1, y2 - y1) * amp; for (let L = 0; L < 5; L++) { const n = [pts[0]]; for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], c = pts[i], dx = c[0] - a[0], dy = c[1] - a[1], l = Math.hypot(dx, dy) || 1, off = (r() - .5) * 2 * d; n.push([(a[0] + c[0]) / 2 - dy / l * off, (a[1] + c[1]) / 2 + dx / l * off], c); } pts = n; d *= .55; } return pts; }
  function bolt(e, x1, y1, x2, y2, o) {
    o = o || {}; const a = o.a == null ? 1 : o.a; if (a <= 0) return; const r = rng(o.seed || 1), pts = boltPts(x1, y1, x2, y2, r, o.amp == null ? .13 : o.amp), n = Math.max(2, Math.ceil(pts.length * clamp(o.k == null ? 1 : o.k, 0, 1))), w = o.w || 3;
    e.save(); e.globalCompositeOperation = 'lighter'; e.lineJoin = 'round'; e.lineCap = 'round';
    const path = () => { e.beginPath(); for (let i = 0; i < n; i++) i ? e.lineTo(pts[i][0], pts[i][1]) : e.moveTo(pts[i][0], pts[i][1]); };
    e.globalAlpha = clamp(a * .4, 0, 1); e.strokeStyle = o.color || BLU; e.lineWidth = w * 3.4; path(); e.stroke();
    e.globalAlpha = clamp(a, 0, 1); e.strokeStyle = '#ffffff'; e.lineWidth = w; path(); e.stroke(); e.restore();
    for (let f = 0; f < (o.fork || 0); f++) { const p = pts[Math.min(n - 1, 1 + Math.floor(r() * Math.max(1, n - 2)))], ang = Math.atan2(y2 - y1, x2 - x1) + (r() - .5) * 2.2, len = Math.hypot(x2 - x1, y2 - y1) * (.12 + r() * .2); bolt(e, p[0], p[1], p[0] + Math.cos(ang) * len, p[1] + Math.sin(ang) * len, { seed: (o.seed || 1) * 7 + f, w: w * .55, a: a * .8, amp: .2, color: o.color }); }
  }
  function crackle(e, x, y, rad, t, seed, n, a, col) { if (a <= 0) return; for (let i = 0; i < n; i++) { const r = rng(seed + i * 13 + Math.floor(t / 45) * 7), a1 = r() * TAU, a2 = a1 + (r() - .5) * 2.6, d1 = rad * r() * .6, d2 = rad * (.6 + r() * .5); bolt(e, x + Math.cos(a1) * d1, y + Math.sin(a1) * d1, x + Math.cos(a2) * d2, y + Math.sin(a2) * d2, { seed: seed + i + Math.floor(t / 45), w: 1.6, a, amp: .22, color: col }); } }
  // a path-following bolt (curved): short bolts between samples of the path, drawn up to k
  function boltPath(e, path, k, o) { o = o || {}; const N = o.n || 7; for (let i = 0; i < N; i++) { const q0 = i / N, q1 = (i + 1) / N; if (q0 >= k) break; const a = path(q0), c = path(Math.min(q1, k)); bolt(e, a[0], a[1], c[0], c[1], Object.assign({}, o, { seed: (o.seed || 1) + i * 3, amp: o.amp == null ? .2 : o.amp, k: 1, fork: 0 })); } }

  // ---- birds (lightning birds, crows, hawks)
  function bird(c, x, y, s, ang, flap, a, col, solid) {
    if (a <= 0) return; c.save(); c.translate(x, y); c.rotate(ang); if (!solid) c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'; c.lineJoin = 'round'; const f = .3 + .7 * Math.abs(flap);
    const path = () => { c.beginPath(); c.moveTo(-s * .5, -s * f); c.quadraticCurveTo(-s * .05, -s * .55 * f, s * .2, 0); c.quadraticCurveTo(-s * .05, s * .55 * f, -s * .5, s * f); c.moveTo(-s * .55, 0); c.lineTo(s * .6, 0); };
    if (solid) { c.globalAlpha = clamp(a, 0, 1); c.strokeStyle = col; c.lineWidth = Math.max(2, s * .3); path(); c.stroke(); }
    else { c.globalAlpha = clamp(a * .4, 0, 1); c.strokeStyle = col; c.lineWidth = s * .5; path(); c.stroke(); c.globalAlpha = clamp(a, 0, 1); c.strokeStyle = '#ffffff'; c.lineWidth = Math.max(1.2, s * .16); path(); c.stroke(); }
    c.restore();
  }

  function hawk(c, x, y, s, ang, flap, a, col) {
    if (a <= 0) return; c.save(); c.translate(x, y); c.rotate(ang); c.globalAlpha = clamp(a, 0, 1); c.fillStyle = col; const f = .45 + .55 * Math.abs(flap);
    c.beginPath(); c.ellipse(0, 0, s * .5, s * .13, 0, 0, TAU); c.fill();
    [-1, 1].forEach(d => { c.beginPath(); c.moveTo(s * .24, 0); c.quadraticCurveTo(s * .12, d * s * .55 * f, -s * .25, d * s * 1.0 * f); c.quadraticCurveTo(-s * .16, d * s * .5 * f, -s * .3, d * s * .1); c.closePath(); c.fill(); });
    c.beginPath(); c.moveTo(-s * .4, 0); c.lineTo(-s * .78, -s * .15); c.lineTo(-s * .68, 0); c.lineTo(-s * .78, s * .15); c.closePath(); c.fill(); c.restore();
  }

  // ---- rasengan and wind
  function rasen(e, x, y, r, t, a, col) {
    if (a <= 0 || r <= 1) return; e.save(); e.globalCompositeOperation = 'lighter'; glow(e, x, y, r * 2.4, 'rgba(80,160,255,.45)', a * .8); glow(e, x, y, r * 1.25, col || BLU, a); glow(e, x, y, r * .55, '#ffffff', a);
    e.translate(x, y); e.lineCap = 'round';
    for (let i = 0; i < 7; i++) { const ph = t / 60 + i * .9, r2 = r * (.35 + .6 * ((i * 37 % 10) / 10)); e.globalAlpha = clamp(a * .9, 0, 1); e.strokeStyle = i % 2 ? '#ffffff' : '#bfe6ff'; e.lineWidth = Math.max(1, r * .07); e.beginPath(); e.ellipse(0, 0, r2, r2 * (.35 + .5 * ((i * 53 % 10) / 10)), ph * (i % 2 ? 1 : -1.3) + i, ph, ph + 2.2); e.stroke(); }
    e.restore();
  }
  function arcE(e, x, y, r, a0, a1, w, col, a) { if (a <= 0 || r <= 0) return; e.save(); e.globalCompositeOperation = 'lighter'; e.lineCap = 'round'; e.globalAlpha = clamp(a * .4, 0, 1); e.strokeStyle = col; e.lineWidth = w * 3; e.beginPath(); e.arc(x, y, r, a0, a1); e.stroke(); e.globalAlpha = clamp(a, 0, 1); e.strokeStyle = '#ffffff'; e.lineWidth = w; e.beginPath(); e.arc(x, y, r, a0, a1); e.stroke(); e.restore(); }
  function star(e, x, y, r, n, rot, col, a) { for (let i = 0; i < n; i++) { const an = rot + i * TAU / n, l = r * (i % 2 ? .6 : 1); line(e, x, y, x + Math.cos(an) * l, y + Math.sin(an) * l, 5, col, a * .5); line(e, x, y, x + Math.cos(an) * l, y + Math.sin(an) * l, 2, '#ffffff', a); } }

  // ---- snakes
  function snake(b, e, path, k, o) {
    o = o || {}; if (k <= 0) return null; const len = o.len || .5, q0 = Math.max(0, k - len), w = o.w || 16, N = 28, L = [], R = [], al = o.a == null ? 1 : o.a; let hp, hd; if (al <= 0) return null;
    for (let i = 0; i <= N; i++) {
      const q = q0 + (k - q0) * i / N, p = path(q), p2 = path(q + .01), dx = p2[0] - p[0], dy = p2[1] - p[1], l = Math.hypot(dx, dy) || 1;
      const wig = Math.sin(q * (o.freq || 26) - (o.ph || 0)) * (o.wig == null ? w * .7 : o.wig) * Math.sin(Math.min(1, i / N * 3) * 1.57) * (1 - Math.pow(i / N, 4)), ww = w * (.25 + .75 * Math.sin(Math.min(1, i / N * 1.4) * 1.57)), cx = p[0] - dy / l * wig, cy = p[1] + dx / l * wig;
      L.push([cx - dy / l * ww / 2, cy + dx / l * ww / 2]); R.push([cx + dy / l * ww / 2, cy - dx / l * ww / 2]); if (i === N) { hp = [cx, cy]; hd = Math.atan2(dy, dx); }
    }
    const fill = o.col || '#5a4690', rim = o.rim || '#d9ccff';
    b.save(); b.globalAlpha = clamp(al, 0, 1); b.beginPath(); L.forEach((p, i) => i ? b.lineTo(p[0], p[1]) : b.moveTo(p[0], p[1])); for (let i = N; i >= 0; i--) b.lineTo(R[i][0], R[i][1]); b.closePath(); b.fillStyle = fill; b.fill(); b.strokeStyle = rim; b.lineWidth = 1.5; b.stroke();
    b.translate(hp[0], hp[1]); b.rotate(hd); const hs = w * (o.head || 1.15), jaw = (o.jaw || 0) * .6;
    b.save(); b.rotate(-jaw); b.beginPath(); b.moveTo(-hs * .4, -hs * .55); b.quadraticCurveTo(hs * .9, -hs * .6, hs * 1.5, 0); b.lineTo(-hs * .4, 0); b.closePath(); b.fill(); b.stroke(); b.fillStyle = '#ffe14a'; b.beginPath(); b.ellipse(hs * .45, -hs * .28, hs * .16, hs * .1, 0, 0, TAU); b.fill(); if (jaw > 0) { b.fillStyle = '#ffffff'; b.beginPath(); b.moveTo(hs * 1.15, 0); b.lineTo(hs * 1.02, hs * .4); b.lineTo(hs * .9, 0); b.fill(); } b.restore();
    b.save(); b.rotate(jaw); b.fillStyle = fill; b.beginPath(); b.moveTo(-hs * .4, hs * .45); b.quadraticCurveTo(hs * .8, hs * .5, hs * 1.35, 0); b.lineTo(-hs * .4, 0); b.closePath(); b.fill(); b.stroke(); b.restore();
    b.restore(); if (e) glowE(e, hp[0], hp[1], w * 2.2, 'rgba(160,112,255,.5)', .45 * al); return hp;
  }

  // ---- water
  function blob(e, x, y, rx, ry, t, a, seed, fill, rim) {
    if (a <= 0 || rx <= 1 || ry <= 1) return; e.save(); e.globalCompositeOperation = 'lighter'; e.globalAlpha = clamp(a, 0, 1); e.beginPath();
    for (let i = 0; i <= 40; i++) { const an = i / 40 * TAU, wob = 1 + .07 * Math.sin(an * 3 + t / 130 + (seed || 0)) + .05 * Math.sin(an * 5 - t / 90), px = x + Math.cos(an) * rx * wob, py = y + Math.sin(an) * ry * wob; i ? e.lineTo(px, py) : e.moveTo(px, py); }
    e.closePath(); e.fillStyle = fill || 'rgba(60,140,230,.3)'; e.fill(); e.strokeStyle = rim || 'rgba(190,230,255,.8)'; e.lineWidth = 2.5; e.stroke(); e.beginPath(); e.ellipse(x - rx * .35, y - ry * .4, rx * .22, Math.max(1, ry * .1), -.5, 0, TAU); e.fillStyle = 'rgba(255,255,255,.3)'; e.fill(); e.restore();
  }
  function splash(e, t, T, x, y, n, seed, sp) { sparks(e, t, { seed, t0: T, x, y, n, speed: sp || 520, life: 700, color: WAT, a0: 3.5, a1: 5.9, grav: 260, w: 3 }); }

  // ---- ground
  function cracks(b, e, x, y, R, k, seed, col, n) {
    if (k <= 0) return; const r = rng(seed);
    for (let i = 0; i < (n || 9); i++) { const an = r() * TAU, len = R * (.5 + r() * .5), st = 6, pts = [[x, y]]; let px = x, py = y; for (let s = 1; s <= st; s++) { const a2 = an + (r() - .5) * .9; px += Math.cos(a2) * len / st; py += Math.sin(a2) * len / st * .7; pts.push([px, py]); }
      const part = along(pts, k); b.save(); b.strokeStyle = 'rgba(0,0,0,.88)'; b.lineWidth = 3.2; b.lineCap = 'round'; b.lineJoin = 'round'; b.beginPath(); part.forEach((p, j) => j ? b.lineTo(p[0], p[1]) : b.moveTo(p[0], p[1])); b.stroke(); b.restore(); if (e && col && k < 1) { const p = part[part.length - 1]; glowE(e, p[0], p[1], 12, col, .7); } }
  }
  function smoke(b, t, T, x, y, n, seed, R, col, dur) { const r = rng(seed); for (let i = 0; i < n; i++) { const a = r() * TAU, d = (.2 + r() * .8) * R, life = (dur || 700) * (.6 + r() * .7), dl = r() * 90, sz = R * (.3 + r() * .4), k = (t - T - dl) / life; if (k <= 0 || k >= 1) continue; glow(b, x + Math.cos(a) * d * easeOut(k), y + Math.sin(a) * d * easeOut(k) * .75 - 22 * k, sz * (.55 + .7 * k), col || 'rgba(226,222,214,.9)', (1 - k) * .85); } }
  function rocks(b, t, T, x, y, n, seed, sp) { const r = rng(seed); for (let i = 0; i < n; i++) { const an = 3.6 + r() * 2.2, v = (sp || 420) * (.4 + r()), sz = 6 + r() * 12, rot = r() * 6, k = (t - T) / 800; if (k <= 0 || k >= 1) continue; const px = x + Math.cos(an) * v * k * .8, py = y + Math.sin(an) * v * k * .8 + 520 * k * k; b.save(); b.translate(px, py); b.rotate(rot + k * 8); b.globalAlpha = 1 - k * k; b.fillStyle = '#2a2622'; b.strokeStyle = '#6b6258'; b.lineWidth = 1; b.beginPath(); b.moveTo(-sz, -sz * .4); b.lineTo(sz * .3, -sz); b.lineTo(sz, sz * .2); b.lineTo(-sz * .2, sz * .8); b.closePath(); b.fill(); b.stroke(); b.restore(); } }

  // ---- eyes. kind 0: three tomoe, 1: Itachi / Kakashi blades, 2: Shisui pinwheel, 3: Sasuke star
  function eye(b, e, x, y, r, rot, a, kind) {
    if (a <= 0 || r <= 1) return; b.save(); b.globalAlpha = clamp(a, 0, 1); b.translate(x, y); const K = '#0a0406', Rr = '#c8141c';
    b.fillStyle = K; b.beginPath(); b.arc(0, 0, r * 1.08, 0, TAU); b.fill(); b.fillStyle = kind === 3 ? K : Rr; b.beginPath(); b.arc(0, 0, r, 0, TAU); b.fill();
    if (kind === 3) { b.strokeStyle = Rr; b.lineWidth = Math.max(1, r * .06); b.beginPath(); b.arc(0, 0, r * .96, 0, TAU); b.stroke(); }
    if (!kind) { b.strokeStyle = K; b.lineWidth = Math.max(1, r * .05); b.beginPath(); b.arc(0, 0, r * .62, 0, TAU); b.stroke(); }
    b.rotate(rot); b.fillStyle = K;
    if (!kind) for (let i = 0; i < 3; i++) { b.save(); b.rotate(i * 2.0944); b.translate(r * .62, 0); b.beginPath(); b.arc(0, 0, r * .15, 0, TAU); b.fill(); b.beginPath(); b.moveTo(0, -r * .15); b.quadraticCurveTo(-r * .05, -r * .42, -r * .3, -r * .36); b.quadraticCurveTo(-r * .1, -r * .25, -r * .12, -r * .02); b.fill(); b.restore(); }
    else if (kind === 1) for (let i = 0; i < 3; i++) { b.save(); b.rotate(i * 2.0944); b.beginPath(); b.moveTo(0, 0); b.quadraticCurveTo(r * .55, -r * .5, r * .95, -r * .1); b.quadraticCurveTo(r * .5, -r * .05, r * .1, r * .22); b.closePath(); b.fill(); b.restore(); }
    else if (kind === 2) for (let i = 0; i < 4; i++) { b.save(); b.rotate(i * 1.5708); b.beginPath(); b.moveTo(0, 0); b.quadraticCurveTo(r * .35, -r * .7, r * .98, -r * .42); b.quadraticCurveTo(r * .6, -r * .05, r * .2, r * .3); b.closePath(); b.fill(); b.restore(); }
    else { b.fillStyle = Rr; for (let i = 0; i < 3; i++) { b.beginPath(); b.ellipse(0, 0, r * .9, r * .3, i * 1.0472, 0, TAU); b.fill(); } b.fillStyle = K; }
    b.beginPath(); b.arc(0, 0, r * (kind === 3 ? .13 : .2), 0, TAU); b.fill(); b.restore(); if (e) glowE(e, x, y, r * 2.2, 'rgba(255,40,40,.5)', a * .55);
  }

  // ---- petals, flowers, wings, flame cloaks
  function petals(b, e, t, o) {
    const r = rng(o.seed);
    for (let i = 0; i < o.n; i++) { const dl = r() * (o.jit == null ? 300 : o.jit), life = (o.life || 1100) * (.6 + r() * .8), a0 = o.a0 || 0, an = a0 + r() * ((o.a1 == null ? TAU : o.a1) - a0), sp = o.speed * (.3 + r()), sz = (o.size || 9) * (.6 + r() * .8), spin = r() * 6.28, k = (t - o.t0 - dl) / life; if (k <= 0 || k >= 1) continue;
      const d = sp * easeOut(k) * life / 1000, x = o.x + Math.cos(an) * d + Math.sin(k * 6 + spin) * 14, y = o.y + Math.sin(an) * d + (o.grav == null ? 60 : o.grav) * k * k; b.save(); b.translate(x, y); b.rotate(spin + k * 7); b.globalAlpha = bell(Math.min(1, k * 1.15)) * (o.a || .95); b.fillStyle = o.col || '#ffb7d5'; b.beginPath(); b.ellipse(0, 0, sz, sz * .5 * Math.abs(Math.cos(k * 9 + spin)) + 1, 0, 0, TAU); b.fill(); b.restore(); if (e && i % 3 === 0) glowE(e, x, y, sz * 1.6, o.glow || 'rgba(255,150,200,.5)', bell(k) * .35); }
  }
  function flower(b, e, x, y, r, k, rot, col) { if (k <= 0) return; b.save(); b.translate(x, y); b.scale(1, .5); b.rotate(rot); for (let i = 0; i < 8; i++) { b.rotate(.7854); b.fillStyle = col || '#b78cff'; b.globalAlpha = .9; b.beginPath(); b.ellipse(r * .55 * k, 0, r * .5 * k, r * .2 * k, 0, 0, TAU); b.fill(); } b.fillStyle = '#ffd56a'; b.beginPath(); b.arc(0, 0, r * .16 * k, 0, TAU); b.fill(); b.restore(); if (e) glowE(e, x, y, r * 1.3, 'rgba(170,120,255,.5)', .4 * k); }
  function wings(e, x, y, s, open, t, a, col) {
    if (a <= 0 || open <= 0) return; e.save(); e.globalCompositeOperation = 'lighter'; e.translate(x, y);
    [-1, 1].forEach(d => { e.save(); e.scale(d * open, 1); e.fillStyle = col; e.strokeStyle = '#e8f6ff'; e.lineWidth = 2; e.globalAlpha = clamp(a * .5, 0, 1); e.beginPath(); e.moveTo(8, 0); e.bezierCurveTo(s * .5, -s * 1.25, s * 1.5, -s * 1.0, s * 1.25, -s * .1); e.bezierCurveTo(s * 1.1, s * .15, s * .5, s * .05, 8, 0); e.fill(); e.globalAlpha = clamp(a, 0, 1); e.stroke(); e.globalAlpha = clamp(a * .45, 0, 1); e.beginPath(); e.moveTo(8, 6); e.bezierCurveTo(s * .6, s * .3, s * 1.05, s * .9, s * .55, s * 1.0); e.bezierCurveTo(s * .2, s * .9, s * .1, s * .4, 8, 6); e.fill(); e.globalAlpha = clamp(a, 0, 1); e.stroke(); e.restore(); });
    e.restore();
  }
  function flamePath(c, x, y, w, h, t, seed, L) { c.beginPath(); c.moveTo(x - w / 2, y); for (let q = -w / 2; q <= w / 2; q += 6) { const n = Math.abs(Math.sin(q * .07 + t / (70 - L * 12) + L + seed)) * .6 + Math.abs(Math.sin(q * .17 - t / 50 + seed)) * .4; c.lineTo(x + q, y - h * (1 - L * .25) * (.2 + n) * (1 - Math.pow(Math.abs(q) / (w / 2 + 4), 2))); } c.lineTo(x + w / 2, y); c.closePath(); }
  function flames(e, x, y, w, h, t, seed, a, cols) { if (h <= 2 || a <= 0) return; cols = cols || ['rgba(226,70,16,.6)', 'rgba(255,150,30,.6)', 'rgba(255,236,170,.7)']; e.save(); e.globalCompositeOperation = 'lighter'; e.globalAlpha = clamp(a, 0, 1); for (let L = 0; L < 3; L++) { e.fillStyle = cols[L]; flamePath(e, x, y, w, h, t, seed, L); e.fill(); } e.restore(); }
  // Amaterasu: black fire with a thin violet rim
  function bflames(b, e, x, y, w, h, t, seed, a) { if (h <= 2 || a <= 0) return; b.save(); b.globalAlpha = clamp(a, 0, 1); b.fillStyle = '#050308'; flamePath(b, x, y, w, h, t, seed, 0); b.fill(); b.restore(); e.save(); e.globalCompositeOperation = 'lighter'; e.globalAlpha = clamp(a * .8, 0, 1); e.strokeStyle = 'rgba(150,80,255,.9)'; e.lineWidth = 2.5; flamePath(e, x, y, w, h, t, seed, 0); e.stroke(); e.restore(); }
  function aura(e, x, y, w, t, a, col, seed) { if (a <= 0) return; const h = w * 831 / 600, r = rng(seed || 5); e.save(); e.globalCompositeOperation = 'lighter'; glow(e, x, y, w * 1.25, col, a * .45); for (let i = 0; i < 24; i++) { const u = r(), side = r() < .5 ? -1 : 1, ph = r() * 6.28, edge = i % 3 ? 1 : r(), ky = (t / 900 + u) % 1; glow(e, x + side * (w / 2 + 4 + Math.sin(t / 200 + ph) * 6) * edge, y + h / 2 - ky * (h + 40), 14 + 18 * (1 - ky), col, a * (1 - ky) * .8); } e.restore(); }
  function tail(e, x, y, ang, len, t, w, col, a, ph) { if (a <= 0 || len <= 2) return; const p = q => { const an = ang + Math.sin(q * 3.2 + t / 260 + (ph || 0)) * .5 * q; return [x + Math.cos(an) * len * q, y + Math.sin(an) * len * q]; }; e.save(); e.globalCompositeOperation = 'lighter'; e.lineCap = 'round'; for (let i = 0; i < 14; i++) { const q0 = i / 14, a0 = p(q0), a1 = p((i + 1) / 14); e.globalAlpha = clamp(a * .55, 0, 1); e.strokeStyle = col; e.lineWidth = w * (1 - q0 * .75) * 2.2; e.beginPath(); e.moveTo(a0[0], a0[1]); e.lineTo(a1[0], a1[1]); e.stroke(); e.globalAlpha = clamp(a * .9, 0, 1); e.strokeStyle = '#fff2c0'; e.lineWidth = w * (1 - q0 * .8) * .5; e.stroke(); } e.restore(); }

  // ---- marks and tools
  function trigram(e, x, y, r, rot, a, col) {
    if (a <= 0 || r <= 2) return; col = col || PALE; ringE(e, x, y, r, 2.5, col, a, .42); ringE(e, x, y, r * .62, 1.5, col, a * .8, .42); ringE(e, x, y, r * .2, 2, col, a, .42);
    e.save(); e.globalCompositeOperation = 'lighter'; e.translate(x, y); e.scale(1, .42); e.rotate(rot); e.strokeStyle = col; e.globalAlpha = clamp(a, 0, 1);
    for (let i = 0; i < 8; i++) { e.rotate(.7854); e.lineWidth = 1.5; e.beginPath(); e.moveTo(r * .2, 0); e.lineTo(r * .62, 0); e.stroke(); e.lineWidth = 3.5; for (let j = 0; j < 3; j++) { const r2 = r * (.72 + j * .09); if ((i >> j) & 1) { e.beginPath(); e.arc(0, 0, r2, .14, .34); e.stroke(); e.beginPath(); e.arc(0, 0, r2, .44, .64); e.stroke(); } else { e.beginPath(); e.arc(0, 0, r2, .14, .64); e.stroke(); } } }
    e.restore();
  }
  function plus(e, x, y, s, a, col) { line(e, x - s, y, x + s, y, s * .5, col, a); line(e, x, y - s, x, y + s, s * .5, col, a); }
  function kunai(b, x, y, ang, s, a) { if (a <= 0) return; b.save(); b.translate(x, y); b.rotate(ang); b.globalAlpha = clamp(a, 0, 1); b.fillStyle = '#d9dde2'; b.strokeStyle = '#15161a'; b.lineWidth = 1.2; b.beginPath(); b.moveTo(s * 1.2, 0); b.lineTo(s * .2, -s * .2); b.lineTo(0, 0); b.lineTo(s * .2, s * .2); b.closePath(); b.fill(); b.stroke(); [-1, 1].forEach(d => { b.beginPath(); b.moveTo(s * .55, d * s * .1); b.lineTo(s * .15, d * s * .55); b.lineTo(s * .05, d * s * .12); b.closePath(); b.fill(); b.stroke(); }); b.fillStyle = '#e9d9a0'; b.fillRect(-s * .75, -s * .07, s * .75, s * .14); b.strokeRect(-s * .75, -s * .07, s * .75, s * .14); b.beginPath(); b.arc(-s * .87, 0, s * .12, 0, TAU); b.stroke(); b.restore(); }
  // sealing script: a row of brush marks written along a line up to k
  function script(b, e, x1, y1, x2, y2, k, seed, col, a) { const r = rng(seed), n = Math.max(3, Math.round(Math.hypot(x2 - x1, y2 - y1) / 11)); for (let i = 0; i < n; i++) { const q = i / (n - 1), hh = 4 + r() * 6, tl = (r() - .5) * .8; if (q > k) continue; const x = lerp(x1, x2, q), y = lerp(y1, y2, q), ang = Math.atan2(y2 - y1, x2 - x1) + 1.5708 + tl; b.save(); b.globalAlpha = clamp(a, 0, 1); b.strokeStyle = '#0b0a0d'; b.lineWidth = 2.6; b.lineCap = 'round'; b.beginPath(); b.moveTo(x - Math.cos(ang) * hh, y - Math.sin(ang) * hh); b.lineTo(x + Math.cos(ang) * hh, y + Math.sin(ang) * hh); b.stroke(); b.restore(); if (e && col) glowE(e, x, y, 8, col, a * (q > k - .12 ? .8 : .2)); } }
  // summoning formula on the floor
  function sealCircle(b, e, x, y, R, k, seed, col, a) { if (a <= 0 || k <= 0) return; [b, e].forEach(c => { c.save(); c.translate(x, y); c.scale(1, .45); c.translate(-x, -y); }); b.globalAlpha = clamp(a, 0, 1); b.strokeStyle = '#0b0a0d'; b.lineWidth = 4; b.beginPath(); b.arc(x, y, R * .22, 0, TAU * Math.min(1, k * 2)); b.stroke(); for (let i = 0; i < 8; i++) { const an = i * .7854 + .39; script(b, e, x + Math.cos(an) * R * .26, y + Math.sin(an) * R * .26, x + Math.cos(an) * R, y + Math.sin(an) * R, seg(k, .15, 1), seed + i, col, a); } b.restore(); e.restore(); }
  function chain(b, e, path, k, col, a) { const n = Math.round(44 * clamp(k, 0, 1)); for (let i = 0; i < n; i++) { const p = path(i / 44), p2 = path((i + .5) / 44); b.save(); b.globalAlpha = clamp(a, 0, 1); b.translate(p[0], p[1]); b.rotate(Math.atan2(p2[1] - p[1], p2[0] - p[0])); b.strokeStyle = col || '#e8c25a'; b.lineWidth = 3; b.beginPath(); b.ellipse(0, 0, 9, i % 2 ? 5 : 2, 0, 0, TAU); b.stroke(); b.restore(); if (e && i % 4 === 0) glowE(e, p[0], p[1], 14, 'rgba(255,200,90,.6)', a * .5); } }
  function blade(b, e, x, y, ang, len, w, a, col) { if (a <= 0 || len <= 2) return; b.save(); b.translate(x, y); b.rotate(ang); b.globalAlpha = clamp(a, 0, 1); const g = b.createLinearGradient(0, -w / 2, 0, w / 2); g.addColorStop(0, '#eef2f6'); g.addColorStop(.5, '#8d96a2'); g.addColorStop(1, '#3b4049'); b.fillStyle = g; b.strokeStyle = '#0c0d10'; b.lineWidth = 2; b.beginPath(); b.moveTo(0, -w / 2); b.lineTo(len * .88, -w / 2); b.quadraticCurveTo(len, -w / 2, len, w / 2); b.lineTo(0, w / 2); b.closePath(); b.fill(); b.stroke(); b.restore(); if (e) line(e, x + Math.cos(ang) * len * .08, y + Math.sin(ang) * len * .08, x + Math.cos(ang) * len * .95, y + Math.sin(ang) * len * .95, 1.6, col || PALE, a * .7); }
  // comet: a glowing head with a short tail along a path
  function comet(e, path, k, r, col, a) { if (k <= 0 || k >= 1 || a <= 0) return; for (let j = 9; j >= 0; j--) { const kk = k - j * .018; if (kk < 0) continue; const p = path(kk), f = 1 - j / 10; glowE(e, p[0], p[1], r * (.5 + f), col, a * f * .7); } const p = path(k); glowE(e, p[0], p[1], r * .6, '#ffffff', a); }

  // =====================================================================
  // the effects. Points are {x, y} in screen pixels; u is the card width on screen / 150.
  // Each returns its timings in ms (before speed scaling) or null when the light layer is unavailable.
  // Inside draw() everything is in card units: positions are divided by u and the layers are scaled by u.
  // =====================================================================
  function run(dur, cues, u, shakes, draw) {
    const done = new Set();
    return K.overlay(dur, cues, (b, e, P, t) => {
      b.scale(u, u); e.scale(u, u); P.u = u;
      shakes.forEach(([at, pw], i) => { if (t >= at && !done.has(i)) { done.add(i); NS.FX.shake(pw); } });
      draw(b, e, P, t);
    });
  }
  const pt = (p, u) => [p.x / u, p.y / u];
  const wv = (P, t, T, x, y, R, str, dur) => wave(P, t, T, x * P.u, y * P.u, R * P.u, str * P.u, dur);
  function hit(e, P, t, T, x, y, col, pw) { pw = pw || 1; if (t < T) return; const k = seg(t, T, T + 480); glowE(e, x, y, 170 * pw * (1 - .5 * k), col, (1 - seg(t, T, T + 360)) * .7); glowE(e, x, y, 56 * pw, '#ffffff', (1 - seg(t, T, T + 170)) * .9); ringE(e, x, y, (30 + 200 * easeOut(k)) * pw, 7 * (1 - k), col, 1 - k); sparks(e, t, { seed: Math.round(x * 3 + y + T), t0: T, x, y, n: Math.round(60 * pw), speed: 760 * pw, life: 480, color: col, w: 2.2 }); wv(P, t, T, x, y, 300 * pw, 24 * pw, 480); }
  const zap = (e, P, t, T, x, y, pw) => { if (t < T) return; hit(e, P, t, T, x, y, BLU, pw || .8); crackle(e, x, y, 90, t, Math.round(x), 5, 1 - seg(t, T, T + 650), BLU); };
  const toward = (a, c, d) => { const l = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1; return [a[0] + (c[0] - a[0]) / l * d, a[1] + (c[1] - a[1]) / l * d]; };
  const side = (a, c, k) => [(a[0] + c[0]) / 2 - (c[1] - a[1]) * k, (a[1] + c[1]) / 2 + (c[0] - a[0]) * k]; // a control point off to one side of a-c

  // Sasuke (N-015), Chidori Stream: forked lightning runs from his card to every Character at once
  function chidoriStream(from, pts, u) {
    const F = pt(from, u), T = i => 640 + i * 35, Q = pts.map(p => pt(p, u));
    return run(2000, [[0, 'lightning'], [340, 'lightning'], [640, 'impact']], u, [[640, 10]], (b, e, P, t) => {
      const g = easeOut(seg(t, 340, 620)), f = 1 - seg(t, 1050, 1400);
      if (t > 340 && f > 0) Q.forEach((p, i) => { bolt(e, F[0], F[1], p[0], p[1], { seed: 11 + i * 7 + Math.floor(t / 55), k: g, w: 4, a: f, fork: 3, amp: .16 }); bolt(e, F[0], F[1], p[0], p[1], { seed: 91 + i * 5 + Math.floor(t / 40), k: g, w: 1.6, a: f * .7, amp: .22 }); });
      for (let i = 0; i < 3; i++) { const k = seg(t, 340 + i * 120, 900 + i * 120); ringE(e, F[0], F[1] + 40, 60 + 520 * easeOut(k), 4 * (1 - k), BLU, (1 - k) * .8, .3); }
      Q.forEach((p, i) => zap(e, P, t, T(i), p[0], p[1]));
      glowE(e, F[0], F[1], 200, BLU, bell(seg(t, 0, 460)) * .5); crackle(e, F[0], F[1], 105, t, 3, 6, bell(seg(t, 0, 1200)), BLU);
      if (t > 340) P.flash = [.6, .8, 1, (1 - seg(t, 340, 520)) * .18];
    }) ? { hit: 640 } : null;
  }
  // Naruto (N-004), Rasengan: wound up over his card, driven into the middle of the field, and it bursts as a spiral
  function rasengan(from, pts, cen, u) {
    const F = pt(from, u), C = pt(cen, u), Q = pts.map(p => pt(p, u)), D = 760, T = Q.map(p => D + Math.min(1, Math.hypot(p[0] - C[0], p[1] - C[1]) / 420) * 300);
    return run(2000, [[80, 'chakra'], [520, 'whoosh'], [D, 'impact']], u, [[D, 13]], (b, e, P, t) => {
      const pos = L2([F[0], F[1] - 80], C, easeIn(seg(t, 520, D)));
      if (t < D) rasen(e, pos[0], pos[1], 46 * easeOut(seg(t, 80, 520)), t, 1);
      else { const k = seg(t, D, D + 650); rasen(e, C[0], C[1], 46 + 400 * easeOut(k), t, 1 - k); for (let j = 0; j < 9; j++) arcE(e, C[0], C[1], (40 + 430 * easeOut(k)) * (.3 + j * .08), t / 90 + j * 1.3, t / 90 + j * 1.3 + 1.6, 3, BLU, (1 - k) * .9); P.flash = [.75, .9, 1, (1 - seg(t, D, D + 260)) * .3]; }
      hit(e, P, t, D, C[0], C[1], BLU, 2); Q.forEach((p, i) => hit(e, P, t, T[i], p[0], p[1], BLU, .6));
    }) ? { hit: D + 120 } : null;
  }
  // Orochimaru (N-017), Striking Shadow Snake: one snake for each chosen card. It bites and pulls back
  function shadowSnake(from, pts, u) {
    const F = pt(from, u), Q = pts.map(p => pt(p, u)), GAP = 140, HIT = 640;
    return run(1500 + (Q.length - 1) * GAP, Q.map((_, i) => [HIT - 380 + i * GAP, 'whoosh']).concat(Q.map((_, i) => [HIT + i * GAP, 'hit'])), u, [], (b, e, P, t) => {
      Q.forEach((p, i) => { const T = HIT + i * GAP, k = easeIn(seg(t, T - 380, T)), back2 = 1 - easeIn(seg(t, T + 280, T + 720)); snake(b, e, bez(F, side(F, p, i % 2 ? .22 : -.22), p), Math.min(k, back2), { w: 22, len: .8, ph: t / 60, jaw: seg(k, .5, .9) * (1 - seg(t, T, T + 120)) }); hit(e, P, t, T, p[0], p[1], PUR, 1); });
      glowE(e, F[0], F[1], 200, PUR, bell(seg(t, 0, 460)) * .5);
    }) ? { hit: HIT, gap: GAP } : null;
  }
  // Hinata (N-018), Air Palm: a column of compressed air crosses the board. Rings and a ripple in the air
  function airPalm(from, to, u) {
    const F = pt(from, u), Tg = pt(to, u), T = 560, M = toward(F, Tg, 80), an = Math.atan2(Tg[1] - F[1], Tg[0] - F[0]);
    return run(1300, [[280, 'whoosh'], [T, 'impact']], u, [[T, 9]], (b, e, P, t) => {
      for (let j = 0; j < 6; j++) { const k = seg(t, 300 + j * 34, 520 + j * 34); if (k <= 0 || k >= 1) continue; const p = L2(M, Tg, k), r = 24 + 46 * k; e.save(); e.globalCompositeOperation = 'lighter'; e.globalAlpha = 1 - k * .6; e.strokeStyle = PALE; e.lineWidth = 3.5 * (1 - k * .5); e.beginPath(); e.ellipse(p[0], p[1], r, r * .32, an + 1.5708, 0, TAU); e.stroke(); e.restore(); P.waves.push([p[0] * u, p[1] * u, 50 * u, 14 * (1 - k) * u]); }
      if (t > 280 && t < 480) { glowE(e, M[0], M[1], 70, PALE, bell(seg(t, 280, 480))); star(e, M[0], M[1], 60, 8, 0, PALE, bell(seg(t, 280, 480))); }
      hit(e, P, t, T, Tg[0], Tg[1], PALE, 1.4);
    }) ? { hit: T } : null;
  }
  // Sakura (N-020), Inner Sakura: the shout itself lands on the board and the shock of it clears the card away
  function innerSakura(from, to, cen, u) {
    const C = pt(cen, u), Tg = pt(to, u), T = 540;
    return run(1400, [[260, 'cutin'], [420, 'impact']], u, [[420, 14]], (b, e, P, t) => {
      const k = seg(t, 260, 420), al = 1 - seg(t, 1000, 1300);
      if (k > 0 && al > 0) { b.save(); b.translate(C[0], C[1]); b.rotate(-.08); b.scale(1 + 1.6 * (1 - easeOut(k)), 1 + 1.6 * (1 - easeOut(k))); b.globalAlpha = al * seg(t, 260, 320); b.font = '900 108px "Zen Kaku Gothic New", "Yu Gothic", sans-serif'; b.textAlign = 'center'; b.textBaseline = 'middle'; b.lineJoin = 'round'; b.strokeStyle = '#0a0406'; b.lineWidth = 16; b.strokeText('しゃーんなろー!', 0, 0); b.fillStyle = '#ffffff'; b.fillText('しゃーんなろー!', 0, 0); b.restore(); }
      wv(P, t, 420, C[0], C[1], 700, 30, 560); if (t >= 420) { ringE(e, C[0], C[1], 80 + 560 * easeOut(seg(t, 420, 900)), 6 * (1 - seg(t, 420, 900)), PNK, 1 - seg(t, 420, 900)); P.flash = [1, .8, .9, (1 - seg(t, 420, 620)) * .18]; }
      hit(e, P, t, T, Tg[0], Tg[1], PNK, 1.3);
    }) ? { hit: T } : null;
  }
  // a straight lunge of lightning from one card through another (Kakashi's Lightning Blade, EX Sasuke's Chidori)
  function lunge(from, to, u, T) {
    const F0 = pt(from, u), Tg = pt(to, u), F = toward(F0, Tg, 80), end = toward(Tg, F, -170), C = T - 90;
    return run(1500, [[0, 'lightning'], [C, 'whoosh'], [T, 'impact']], u, [[T, 12]], (b, e, P, t) => {
      const ch = seg(t, 0, C - 10), f = 1 - seg(t, T + 20, T + 560);
      if (t < C) { glowE(e, F[0], F[1], 30 + 70 * ch, BLU, .9); glowE(e, F[0], F[1], 14 + 26 * ch, '#ffffff', 1); crackle(e, F[0], F[1], 60 + 80 * ch, t, 4, 9, 1, BLU); for (let j = 0; j < 4; j++) bolt(e, F[0], F[1], F[0] + (j - 1.5) * 90, F[1] + 90, { seed: j * 5 + Math.floor(t / 50), w: 2, amp: .25, a: ch }); }
      else if (f > 0) { const p = L2(F, end, easeOut(seg(t, C, T + 30))); beam(e, F[0], F[1], p[0], p[1], 8, BLU, f); bolt(e, F[0], F[1], p[0], p[1], { seed: 4 + Math.floor(t / 45), w: 3, amp: .08, fork: 5, a: f }); }
      zap(e, P, t, T, Tg[0], Tg[1], 1.4); if (t >= T) P.flash = [.8, .9, 1, (1 - seg(t, T, T + 130)) * .55];
    }) ? { hit: T } : null;
  }
  const lightningBlade = (from, to, u) => lunge(from, to, u, 610), chidori = (from, to, u) => lunge(from, to, u, 540);
  // Shisui (N-016), Koto Amatsukami: his eye opens, it appears in the opposing card, and the card gives in
  function kotoAmatsukami(from, to, u) {
    const F = pt(from, u), Tg = pt(to, u), E = toward(F, Tg, 150), T = 1000;
    return run(1700, [[150, 'edge'], [T, 'seal']], u, [], (b, e, P, t) => {
      if (t > 620 && t < T) { ringE(e, Tg[0], Tg[1], 118, 3, GRN, .8); ringE(e, Tg[0], Tg[1], 138, 1.5, GRN, .7 - .5 * seg(t, 620, T)); }
      eye(b, e, Tg[0], Tg[1], 58, t / 700, seg(t, 600, 800) * (1 - seg(t, T - 60, T + 80)) * .85, 2);
      eye(b, e, E[0], E[1], 54 * easeOut(seg(t, 150, 450)) * (1 - seg(t, 1250, 1550)), t / 700, 1, 2); line(e, E[0], E[1], Tg[0], Tg[1], 1.2, GRN, .5 * bell(seg(t, 450, T)));
      glowE(e, Tg[0], Tg[1], 200, 'rgba(120,255,170,.35)', bell(seg(t, T - 100, T + 600)));
    }) ? { hit: T } : null;
  }
  // Choji (N-002), Expansion Jutsu: the chosen card swells in a burst of smoke (the card itself is scaled by the UI)
  function expansion(to, u) {
    const Tg = pt(to, u);
    return run(1100, [[0, 'poof'], [0, 'impact']], u, [[0, 9]], (b, e, P, t) => {
      smoke(b, t, 0, Tg[0], Tg[1] + 40, 16, 3, 190, null, 800); wv(P, t, 0, Tg[0], Tg[1], 300, 20, 520);
      for (let j = 0; j < 2; j++) { const k = seg(t, 20 + j * 140, 520 + j * 140); ringE(e, Tg[0], Tg[1], 100 + 220 * easeOut(k), 5 * (1 - k), AKI, 1 - k); }
      glowE(e, Tg[0], Tg[1], 220, AKI, bell(seg(t, 0, 500)) * .5);
    }) ? { hit: 320 } : null;
  }
  // Suigetsu (N-021), Water Transformation: he runs across the board as a puddle and rises over the chosen card as a skin of water
  function waterTransform(from, to, u) {
    const F = pt(from, u), Tg = pt(to, u), same = Math.hypot(F[0] - Tg[0], F[1] - Tg[1]) < 30, A = [F[0], F[1] + 90], Bq = [Tg[0], Tg[1] + 128];
    return run(2000, [[250, 'chakra'], [880, 'hidden']], u, [], (b, e, P, t) => {
      const melt = seg(t, 250, 500), tr = same ? 1 : easeIO(seg(t, 500, 880)), rise = easeOut(seg(t, 880, 1180)), out = 1 - seg(t, 1600, 2000);
      if (t > 250 && t < 900) blob(e, lerp(A[0], Bq[0], tr), lerp(A[1], Bq[1], tr), 110 * (melt - seg(t, 800, 900) * .4), 26, t, 1, 1);
      if (!same && t > 500 && t < 900) for (let j = 1; j < 6; j++) blob(e, lerp(A[0], Bq[0], Math.max(0, tr - j * .06)), lerp(A[1], Bq[1], Math.max(0, tr - j * .06)), 40 - j * 5, 10, t, .7, j);
      if (rise > 0) { blob(e, Tg[0], Tg[1] + 128 - 128 * rise, 104, 138 * rise + 8, t, out, 2); splash(e, t, 880, Tg[0], Tg[1] + 128, 26, 3, 380); ringE(e, Tg[0], Tg[1] + 128, 110, 2, WAT, .6 * out, .25); }
    }) ? { hit: 1180 } : null;
  }
  // Karin (N-010), Bite Me: a bite on her arm, and her chakra pours across to the Leader
  function bite(b, e, x, y, s, close, a) { if (a <= 0) return; b.save(); b.globalAlpha = clamp(a, 0, 1); b.fillStyle = '#ffffff'; b.strokeStyle = '#1a0a0a'; b.lineWidth = 1.2; [-1, 1].forEach(d => { for (let i = 0; i < 6; i++) { const v = (i - 2.5) / 2.5, tx = x + v * s, gap = (1 - close) * s * .8 + 3, by = y + d * (gap - s * .32 * (1 - v * v) + s * .5); b.beginPath(); b.moveTo(tx - s * .16, by); b.lineTo(tx + s * .16, by); b.lineTo(tx, by - d * s * (i === 1 || i === 4 ? .5 : .3)); b.closePath(); b.fill(); b.stroke(); } }); b.restore(); glowE(e, x, y, s * 1.4, GRN, a * close * .6); }
  function biteMe(from, to, u) {
    const F = pt(from, u), Tg = pt(to, u), A = [F[0] + 16, F[1] - 26], pa = bez(A, side(A, Tg, -.3), Tg);
    return run(1800, [[250, 'slash'], [460, 'chakra'], [820, 'power']], u, [[440, 5]], (b, e, P, t) => {
      bite(b, e, A[0], A[1], 46, easeIn(seg(t, 250, 440)), seg(t, 200, 260) * (1 - seg(t, 1100, 1400)));
      if (t >= 440) glowE(e, A[0], A[1], 120, GRN, 1 - seg(t, 440, 800));
      for (let j = 0; j < 26; j++) { const k = ((t - 460) / 520 + j / 26) % 1; if (t < 460 + j * 14 || t > 1400) continue; const p = pa(k); glowE(e, p[0] + Math.sin(j * 7 + t / 90) * 9, p[1] + Math.cos(j * 5 + t / 80) * 9, 9 + 5 * Math.sin(j), GRN, bell(k) * (1 - seg(t, 1100, 1400))); }
      aura(e, Tg[0], Tg[1], 150, t, bell(seg(t, 700, 1750)), GRN, 4);
      [820, 1040].forEach(T => { if (t >= T) { const kk = seg(t, T, T + 460); ringE(e, Tg[0], Tg[1], 90 + 130 * easeOut(kk), 4 * (1 - kk), GRN, 1 - kk); } });
    }) ? { hit: 1040 } : null;
  }
  // Itachi (N-013), Tsukuyomi: a red moon, and the card is put on the cross and run through.
  // The UI turns the board itself into a black-and-white negative while this plays.
  function tsukuyomi(from, to, box, u) {
    const F = pt(from, u), Tg = pt(to, u), E = toward(F, Tg, 150), T = 1180, M = [(box.right - 150 * u) / u, (box.top + 130 * u) / u];
    return run(2000, [[80, 'edge'], [480, 'cutin'], [820, 'slash'], [910, 'slash'], [1000, 'slash'], [1090, 'slash'], [T, 'impact']], u, [[T, 8]], (b, e, P, t) => {
      const w = bell(seg(t, 420, 1500));
      b.fillStyle = `rgba(60,0,4,${.5 * w})`; b.fillRect(box.left / u, box.top / u, box.width / u, box.height / u);
      b.save(); b.globalAlpha = w; b.fillStyle = '#b3121a'; b.beginPath(); b.arc(M[0], M[1], 84, 0, TAU); b.fill(); b.restore(); glowE(e, M[0], M[1], 200, 'rgba(255,30,30,.6)', w);
      const cr = easeOut(seg(t, 560, 800)); // the cross shows around the card, never over it
      if (cr > 0) { b.save(); b.globalAlpha = w; b.fillStyle = '#060304'; [-1, 1].forEach(d => { b.fillRect(Tg[0] - 18, Tg[1] + d * 108 - (d < 0 ? 90 * cr : 0), 36, 90 * cr); b.fillRect(Tg[0] + d * 78 - (d < 0 ? 80 * cr : 0), Tg[1] - 66, 80 * cr, 30); }); b.restore(); }
      for (let j = 0; j < 4; j++) { const Tj = 820 + j * 90, k = seg(t, Tj, Tj + 80), an = [-2.4, -.7, 2.5, .6][j], x0 = Tg[0] + Math.cos(an) * 280, y0 = Tg[1] + Math.sin(an) * 220, x1 = Tg[0] + Math.cos(an) * 40, y1 = Tg[1] + Math.sin(an) * 40; if (k <= 0 || w <= 0) continue; const p = L2([x0, y0], [x1, y1], easeIn(k)); line(e, x0, y0, p[0], p[1], 3, '#ffffff', w); if (k >= 1) glowE(e, x1, y1, 46, '#ffffff', 1 - seg(t, Tj + 80, Tj + 260)); }
      eye(b, e, E[0], E[1], 46 * easeOut(seg(t, 80, 360)) * (1 - seg(t, 1350, 1600)), t / 380, 1, 1);
      if (t >= T) { ringE(e, Tg[0], Tg[1], 60 + 150 * easeOut(seg(t, T, T + 500)), 5 * (1 - seg(t, T, T + 500)), RED, 1 - seg(t, T, T + 500)); ringE(e, Tg[0], Tg[1], 124, 2, RED, .6 * (1 - seg(t, 1700, 2000))); }
    }) ? { hit: T, on: 560, off: 1380, dur: 2000 } : null;
  }
  // Naruto, Leader (N-001), Chakra Share: his chakra is passed across as a stream of flame and the chosen card takes on the cloak
  function chakraShare(from, to, u) {
    const F = pt(from, u), Tg = pt(to, u), same = Math.hypot(F[0] - Tg[0], F[1] - Tg[1]) < 30, T = same ? 300 : 720, pa = bez(F, side(F, Tg, .22), Tg);
    return run(T + 1000, [[200, 'fire'], [T, 'power']], u, [[T, 6]], (b, e, P, t) => {
      const g = seg(t, 260, T), al = 1 - seg(t, T, T + 300), out = 1 - seg(t, T + 600, T + 1000);
      if (!same && g > 0 && al > 0) for (let i = 0; i <= 30; i++) { const q = i / 30 * g, p = pa(q); glowE(e, p[0] + Math.sin(q * 18 - t / 60) * 10, p[1] + Math.cos(q * 14 - t / 70) * 8, 26 - 8 * q, i % 3 ? 'rgba(255,120,30,.8)' : '#ffe9a8', al * .8); }
      aura(e, Tg[0], Tg[1], 150, t, seg(t, T - 80, T + 200) * out, ORG, 3); flames(e, Tg[0], Tg[1] + 128, 190, 150 * seg(t, T, T + 300) * out, t, 3, .8);
      hit(e, P, t, T, Tg[0], Tg[1], ORG, .9); aura(e, F[0], F[1], 150, t, bell(seg(t, 80, T + 200)), ORG, 8);
    }) ? { hit: T } : null;
  }
  // Sasuke, Leader (N-012), Sharingan Foresight: his eye opens over the deck and reads the top card before it is drawn
  function foresight(deck, u) {
    const D = pt(deck, u), E = [D[0], D[1] - 190];
    return run(1300, [[150, 'edge'], [520, 'reveal']], u, [], (b, e, P, t) => {
      eye(b, e, E[0], E[1], 40 * easeOut(seg(t, 150, 400)) * (1 - seg(t, 1000, 1300)), t / 300, 1, 0);
      const s = seg(t, 380, 560); if (s > 0 && s < 1) line(e, D[0] - 70, lerp(D[1] - 90, D[1] + 90, s), D[0] + 70, lerp(D[1] - 90, D[1] + 90, s), 2, RED, 1);
      if (t > 420 && t < 700) ringE(e, D[0], D[1], 96, 2, RED, bell(seg(t, 420, 700))); glowE(e, D[0], D[1], 130, 'rgba(255,40,40,.5)', bell(seg(t, 380, 900)) * .6);
    }) ? { hit: 600 } : null;
  }
  // Naruto EX (N-003), Shadow Clone Jutsu: the crossed-fingers seal over his card. The clone then arrives in a burst of smoke (poof)
  function crossSeal(from, u) {
    const F = pt(from, u), X = [F[0] + 60, F[1] - 70];
    return run(600, [[0, 'edge']], u, [], (b, e, P, t) => { const hs = seg(t, 0, 150) * (1 - seg(t, 380, 600)); line(e, X[0], X[1] - 44, X[0], X[1] + 44, 9, '#ffffff', hs); line(e, X[0] - 44, X[1], X[0] + 44, X[1], 9, '#ffffff', hs); glowE(e, X[0], X[1], 80, ORG, hs); }) ? { hit: 380 } : null;
  }
  function poof(at, u) {
    const C = pt(at, u);
    return run(1000, [[0, 'poof']], u, [[0, 6]], (b, e, P, t) => { smoke(b, t, 0, C[0], C[1], 26, 4, 200, null, 900); ringE(e, C[0], C[1], 40 + 200 * easeOut(seg(t, 80, 520)), 5 * (1 - seg(t, 80, 520)), ORG, 1 - seg(t, 80, 520)); glowE(e, C[0], C[1], 190, ORG, (1 - seg(t, 80, 460)) * .6); }) ? { hit: 100 } : null;
  }
  // Gamabunta (N-005) and Manda (N-022), Summoning Jutsu: the formula spreads across the ground, then smoke, and the card is standing in it
  function summonSeal(at, u, snake2) {
    const C = pt(at, u), col = snake2 ? PUR : '#ff7a3c', T = 480;
    return run(1700, [[0, 'seal'], [T - 60, 'poof'], [T, 'impact']], u, [[T - 60, 11]], (b, e, P, t) => {
      sealCircle(b, e, C[0], C[1] + 120, 260, seg(t, 0, T - 40), snake2 ? 8 : 5, col, 1 - seg(t, 1100, 1600));
      smoke(b, t, T - 60, C[0], C[1] + 30, 34, 4, 250, snake2 ? 'rgba(150,110,220,.85)' : null, 1050); wv(P, t, T - 60, C[0], C[1], 420, 26, 560);
      if (t >= T) { ringE(e, C[0], C[1], 40 + 200 * easeOut(seg(t, T, T + 420)), 5 * (1 - seg(t, T, T + 420)), col, 1 - seg(t, T, T + 420)); glowE(e, C[0], C[1], 190, col, (1 - seg(t, T, T + 380)) * .6); }
    }) ? { hit: T } : null;
  }
  // Jugo (N-019), Curse Mark: the mark spreads over him, crosses the ground to the deck, and calls the card out
  function curse(b, x, y, w, h, k, seed, a) { const r = rng(seed); b.save(); rr(b, x - w / 2, y - h / 2, w, h, 8); b.clip(); b.globalAlpha = clamp(a, 0, 1); b.fillStyle = '#0a0706'; for (let i = 0; i < 46; i++) { const d = r(), an = r() * TAU, px = x - w / 2 + w * .15 + Math.cos(an) * d * w * .66 + w * .1, py = y - h / 2 + h * .12 + Math.abs(Math.sin(an)) * d * h, s = 7 + r() * 9, rot = r() * 6; if (d > k) continue; b.save(); b.translate(px, py); b.rotate(rot); b.beginPath(); b.arc(0, 0, s * .5, 0, TAU); b.fill(); b.beginPath(); b.moveTo(0, -s * .5); b.quadraticCurveTo(s * 1.2, -s * 1.1, s * 1.7, 0); b.quadraticCurveTo(s * .9, -s * .3, 0, s * .5); b.fill(); b.restore(); } b.restore(); }
  function curseMark(from, size, deck, u) {
    const F = pt(from, u), D = pt(deck, u), w = size.w / u, h = size.h / u, A = toward(F, D, Math.min(w, h) / 2), Bq = toward(D, F, 70), CU = '#ff8a3c', nx = -(D[1] - F[1]), ny = D[0] - F[0], nl = Math.hypot(nx, ny) || 1;
    return run(1500, [[0, 'hidden'], [650, 'chakra']], u, [], (b, e, P, t) => {
      const fade = 1 - seg(t, 1150, 1500); curse(b, F[0], F[1], w, h, seg(t, 0, 470), 4, fade); glowE(e, F[0], F[1], 220, 'rgba(255,110,40,.5)', bell(seg(t, 0, 1300)) * .5);
      for (let j = -1; j <= 1; j++) script(b, e, A[0] + nx / nl * j * 20, A[1] + ny / nl * j * 20, Bq[0] + nx / nl * j * 12, Bq[1] + ny / nl * j * 12, seg(t, 270 + (j + 1) * 60, 670 + (j + 1) * 60), 30 + j, CU, fade);
      if (t >= 650) glowE(e, D[0], D[1], 150, CU, bell(seg(t, 650, 1150)) * .7);
    }) ? { hit: 760 } : null;
  }
  // Minato (N-007), Flying Thunder God: a kunai is thrown, he is at the kunai, and he is back. The UI hides his card while he is away
  function thunderGod(at, to, u) {
    const C = pt(at, u), Kp = pt(to, u), an = Math.atan2(Kp[1] - C[1], Kp[0] - C[0]), OUT = 220, AT = 260, BACK = 480;
    return run(1100, [[0, 'slash'], [OUT, 'whoosh'], [BACK, 'edge']], u, [[BACK, 5]], (b, e, P, t) => {
      const kk = seg(t, 0, 140), kp = L2(toward(C, Kp, 80), Kp, easeOut(kk)); kunai(b, kp[0], kp[1], an + (kk < 1 ? 0 : .05 * Math.sin(t / 30) * (1 - seg(t, 140, 400))), 34, 1 - seg(t, BACK + 200, BACK + 500));
      [[OUT, C], [AT, Kp], [BACK, C]].forEach(([s, p]) => { if (t >= s) { glowE(e, p[0], p[1], 200, YEL, (1 - seg(t, s, s + 240)) * .9); line(e, p[0] - 260, p[1], p[0] + 260, p[1], 3, YEL, 1 - seg(t, s, s + 200)); } });
      if (t >= OUT) beam(e, C[0], C[1], Kp[0], Kp[1], 3, YEL, 1 - seg(t, OUT, BACK + 200));
      if (t >= BACK) { ringE(e, C[0], C[1], 120 + 200 * easeOut(seg(t, BACK, BACK + 480)), 5 * (1 - seg(t, BACK, BACK + 480)), YEL, 1 - seg(t, BACK, BACK + 480)); P.flash = [1, .92, .5, (1 - seg(t, BACK, BACK + 220)) * .2]; }
    }) ? { out: OUT, back: BACK } : null;
  }
  // Ino (N-011), Formation Ino-Shika-Cho: lines join the cards and each is stamped with its sign
  function formation(pts, signs, u) {
    const Q = pts.map(p => pt(p, u)), T = 860, n = Q.length, cx = Q.reduce((s, p) => s + p[0], 0) / n, cy = Q.reduce((s, p) => s + p[1], 0) / n;
    return run(1500, [[0, 'chakra'], [460, 'hit'], [560, 'hit'], [660, 'hit'], [T, 'upgrade']], u, [[560, 4], [660, 4], [760, 4]], (b, e, P, t) => {
      const al = 1 - seg(t, 1150, 1450);
      if (n > 1) Q.forEach((p, i) => { const q = Q[(i + 1) % n], k = easeOut(seg(t, i * 130, 300 + i * 130)), m = L2(p, q, k); if (k > 0) beam(e, p[0], p[1], m[0], m[1], 4, INO, al); if (k > 0 && k < 1) glowE(e, m[0], m[1], 30, '#ffffff', 1); });
      Q.forEach((p, i) => { const st = 460 + i * 100, k = seg(t, st, st + 160); if (k > 0) txtE(b, e, signs[i] || '', p[0], p[1], 96 * (1 + .7 * (1 - easeOut(k))), INO, k * (1 - seg(t, 1100, 1400)), KJ); });
      if (t >= T) ringE(e, cx, cy, 100 + 460 * easeOut(seg(t, T, T + 600)), 6 * (1 - seg(t, T, T + 600)), INO, 1 - seg(t, T, T + 600));
    }) ? { hit: T } : null;
  }

  NS.FXJ = { chidoriStream, rasengan, shadowSnake, airPalm, innerSakura, lightningBlade, chidori, kotoAmatsukami, expansion, waterTransform, biteMe, tsukuyomi, chakraShare, foresight, crossSeal, poof, summonSeal, curseMark, thunderGod, formation };
})();
