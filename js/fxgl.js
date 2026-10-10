/* ============================================================
   FXGL — premium summon effects (WebGL 2 light layer over the board)
   Two 2D layers are drawn per frame — `base` (ink, props; blended normally) and
   `emis` (light; added) — then a shader adds the card burn-in, shockwave
   distortion, lens split and multi-level bloom. The canvas is premultiplied:
   light pixels carry alpha 0, so they add onto the DOM board underneath.
   Only runs while an effect is playing.
   ============================================================ */
(function () {
  const NS = window.NTCG = window.NTCG || {};
  // effects are authored in a 1280x800 space with the card (250 wide) centred at (640, 380)
  const CX = 640, CY = 380, CW = 250, CH = CW * 831 / 600, FLOOR = CY + CH / 2 + 14;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
  const easeOut = k => 1 - Math.pow(1 - k, 3), easeIn = k => k * k * k;
  const bell = k => Math.sin(clamp(k, 0, 1) * Math.PI);
  function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  const VS = `#version 300 es
in vec2 p; out vec2 vUv; void main(){ vUv = p * .5 + .5; gl_Position = vec4(p, 0., 1.); }`;
  const FS_BLUR = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o; uniform sampler2D uTex; uniform vec2 uDir; uniform float uGain;
void main(){ vec4 c = texture(uTex, vUv) * .227;
  c += (texture(uTex, vUv + uDir * 1.385) + texture(uTex, vUv - uDir * 1.385)) * .316;
  c += (texture(uTex, vUv + uDir * 3.231) + texture(uTex, vUv - uDir * 3.231)) * .070;
  o = c * uGain; }`;
  const FS_FINAL = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D uBase, uEmis, uCard, uB1, uB2, uB3, uStreak;
uniform vec2 uRes, uCtr; uniform float uAberr, uExposure, uK;
uniform vec4 uWave[3], uFlash, uCardRect, uCardFx; uniform vec3 uEdge;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.03; a *= .5; } return s; }
vec2 distort(vec2 px){
  for (int i = 0; i < 3; i++) { vec4 w = uWave[i]; if (w.w == 0.) continue; vec2 d = px - w.xy; float dist = length(d) + .001;
    float band = (dist - w.z) / uK; float k = exp(-band * band / 1400.); px -= d / dist * k * w.w; }
  return px; }
// card with a noise burn-in (bottom to top) and a glowing edge; returns straight colour + alpha, glow in g
vec4 cardAt(vec2 px, out vec3 g){
  g = vec3(0.);
  vec2 q = px - uCardRect.xy; q.x /= uCardFx.w; vec2 uv = q / uCardRect.zw + .5;
  if (uv.x < 0. || uv.x > 1. || uv.y < 0. || uv.y > 1. || uCardFx.z <= 0.) return vec4(0.);
  float rad = 11. * uK; vec2 h = uCardRect.zw * .5, c = abs(q) - h + rad; float rd = length(max(c, 0.)) - rad; float mask = smoothstep(.8, -.8, rd);
  vec3 col = texture(uCard, uv).rgb;
  float n = fbm(uv * vec2(5., 7.) + 3.7) * .78 + (1. - uv.y) * .22;
  float d = uCardFx.x * 1.25 - .12; float shown = smoothstep(d, d - .03, n); float edge = smoothstep(d - .13, d - .02, n) * shown;
  col = mix(col, vec3(1.), uCardFx.y);
  g = uEdge * edge * 3.2 * mask * uCardFx.z;
  return vec4(col, mask * shown * uCardFx.z); }
void take(vec2 px, out vec4 surf, out vec3 lit){
  vec2 uv = px / uRes; vec4 b = texture(uBase, uv); vec3 g; vec4 c = cardAt(px, g);
  surf = vec4(b.rgb * (1. - c.a) + c.rgb * c.a, b.a * (1. - c.a) + c.a);
  lit = texture(uEmis, uv).rgb + g; }
void main(){
  vec2 px = distort(vec2(vUv.x, 1. - vUv.y) * uRes); vec2 dir = (px - uCtr) * uAberr;
  vec4 s0, s1, s2; vec3 l0, l1, l2;
  take(px - dir, s0, l0); take(px, s1, l1); take(px + dir, s2, l2);
  vec4 surf = vec4(s0.r, s1.g, s2.b, s1.a); vec3 lit = vec3(l0.r, l1.g, l2.b);
  vec2 ub = px / uRes;
  lit += texture(uB1, ub).rgb * .55 + texture(uB2, ub).rgb * .8 + texture(uB3, ub).rgb * 1.0 + texture(uStreak, ub).rgb * .7;
  lit = 1. - exp(-lit * uExposure);
  vec3 rgb = surf.rgb + lit; float a = surf.a;                         // light is added: alpha stays 0 where there is only light
  rgb = rgb * (1. - uFlash.a) + uFlash.rgb * uFlash.a; a = a * (1. - uFlash.a) + uFlash.a;
  o = vec4(rgb, a); }`;

  // ---------------- GL plumbing ----------------
  let cv = null, gl = null, G = null, base, emis, bc, ec, Wp = 0, Hp = 0, sc = 1, broken = false;
  function ensure() {
    if (broken) return false;
    if (gl) return true;
    try {
      cv = document.createElement('canvas'); cv.id = 'fxgl';
      gl = cv.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false });
      if (!gl) throw new Error('no webgl2');
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      const prog = fs => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; };
      G = { pBlur: prog(FS_BLUR), pFinal: prog(FS_FINAL), loc: new Map() };
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      G.tBase = mkTex(); G.tEmis = mkTex(); G.tCard = mkTex(); G.cardSrc = null;
      base = document.createElement('canvas'); emis = document.createElement('canvas'); bc = base.getContext('2d'); ec = emis.getContext('2d');
      document.body.appendChild(cv);
      return true;
    } catch (e) { broken = true; gl = null; if (cv && cv.parentNode) cv.remove(); console.warn('FXGL disabled:', e.message); return false; }
  }
  function mkTex() { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; }
  function fbo(w, h) { const tex = mkTex(); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0); return { fb, tex, w, h }; }
  function killFbo(f) { gl.deleteFramebuffer(f.fb); gl.deleteTexture(f.tex); }
  function resize() {
    // internal resolution is capped: the layer is light and glow, so it scales up cleanly
    sc = Math.min(1, 1280 / window.innerWidth);
    const w = Math.max(320, Math.round(window.innerWidth * sc)), h = Math.max(200, Math.round(window.innerHeight * sc));
    if (w === Wp && h === Hp) return;
    Wp = w; Hp = h; cv.width = base.width = emis.width = w; cv.height = base.height = emis.height = h;
    if (G.L) { G.L.forEach(l => { killFbo(l.a); killFbo(l.b); }); killFbo(G.streak.a); killFbo(G.streak.b); }
    const q = d => [Math.max(8, Math.round(w / d)), Math.max(8, Math.round(h / d))];
    G.L = [2, 4, 8].map(d => ({ a: fbo(...q(d)), b: fbo(...q(d)) })); G.streak = { a: fbo(...q(8)), b: fbo(...q(8)) };
  }
  const U = (p, n) => { const k = (p === G.pBlur ? 'b' : 'f') + n; if (!G.loc.has(k)) G.loc.set(k, gl.getUniformLocation(p, n)); return G.loc.get(k); };
  function blur(src, dst, dx, dy, gain) { gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb); gl.viewport(0, 0, dst.w, dst.h); gl.useProgram(G.pBlur); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src); gl.uniform1i(U(G.pBlur, 'uTex'), 0); gl.uniform2f(U(G.pBlur, 'uDir'), dx / dst.w, dy / dst.h); gl.uniform1f(U(G.pBlur, 'uGain'), gain || 1); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }
  function render(P, M, img) {
    if (img && img.complete && img.naturalWidth && G.cardSrc !== img) { gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.bindTexture(gl.TEXTURE_2D, G.tCard); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img); G.cardSrc = img; }
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.bindTexture(gl.TEXTURE_2D, G.tBase); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, base);
    gl.bindTexture(gl.TEXTURE_2D, G.tEmis); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, emis);
    gl.disable(gl.BLEND);
    let src = G.tEmis;
    for (const l of G.L) { blur(src, l.a, 1, 0); blur(l.a.tex, l.b, 0, 1); src = l.b.tex; }
    blur(G.L[2].b.tex, G.streak.a, 3.2, 0, 1.25); blur(G.streak.a.tex, G.streak.b, 6.5, 0, 1.2);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, Wp, Hp); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    const p = G.pFinal; gl.useProgram(p);
    [G.tBase, G.tEmis, G.tCard, G.L[0].b.tex, G.L[1].b.tex, G.L[2].b.tex, G.streak.b.tex].forEach((t, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(U(p, ['uBase', 'uEmis', 'uCard', 'uB1', 'uB2', 'uB3', 'uStreak'][i]), i); });
    const wv = new Float32Array(12);
    P.waves.slice(0, 3).forEach((w, i) => { const q = M.pt(w[0], w[1]); wv.set([q[0], q[1], w[2] * M.k, w[3] * M.k], i * 4); });
    gl.uniform4fv(U(p, 'uWave'), wv);
    const c = P.card, cp = M.pt(c.x, c.y), ctr = M.pt(CX, CY);
    gl.uniform2f(U(p, 'uRes'), Wp, Hp); gl.uniform2f(U(p, 'uCtr'), ctr[0], ctr[1]); gl.uniform1f(U(p, 'uK'), M.k);
    gl.uniform1f(U(p, 'uAberr'), P.aberr); gl.uniform1f(U(p, 'uExposure'), P.exposure);
    gl.uniform4f(U(p, 'uFlash'), P.flash[0], P.flash[1], P.flash[2], P.flash[3]);
    gl.uniform4f(U(p, 'uCardRect'), cp[0], cp[1], CW * c.s * M.k, CH * c.s * M.k); gl.uniform4f(U(p, 'uCardFx'), c.burn, c.white, c.a, c.sx);
    gl.uniform3f(U(p, 'uEdge'), P.edge[0], P.edge[1], P.edge[2]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // ---------------- 2D helpers (b = base layer, e = light layer) ----------------
  const glows = {};
  function glowSprite(color) { if (glows[color]) return glows[color]; const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, color); gr.addColorStop(.2, color); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return glows[color] = c; }
  function glow(c, x, y, r, color, a) { if (a <= 0 || r <= 0) return; c.globalAlpha = clamp(a, 0, 1); c.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2); c.globalAlpha = 1; }
  let tintOf = null, tintCv = null;
  function tinted(img, color) { // the card art multiplied by a colour, for afterimages
    const key = img.src + color; if (tintOf === key) return tintCv;
    const c = document.createElement('canvas'); c.width = 300; c.height = Math.round(300 * 831 / 600); const g = c.getContext('2d');
    g.drawImage(img, 0, 0, c.width, c.height); g.globalCompositeOperation = 'multiply'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height); g.globalCompositeOperation = 'destination-in'; g.drawImage(img, 0, 0, c.width, c.height);
    tintOf = key; return tintCv = c;
  }
  function ghost(e, img, x, y, s, color, a) { if (a <= 0 || !img.complete || !img.naturalWidth) return; const w = CW * s, h = CH * s; e.save(); e.globalCompositeOperation = 'lighter'; e.globalAlpha = clamp(a, 0, 1); e.drawImage(tinted(img, color), x - w / 2, y - h / 2, w, h); e.restore(); }
  function line(e, x1, y1, x2, y2, w, color, a) { if (a <= 0) return; e.save(); e.globalCompositeOperation = 'lighter'; e.lineCap = 'round'; e.globalAlpha = clamp(a, 0, 1); e.strokeStyle = color; e.lineWidth = w; e.beginPath(); e.moveTo(x1, y1); e.lineTo(x2, y2); e.stroke(); e.restore(); }
  function beam(e, x1, y1, x2, y2, w, color, a) { line(e, x1, y1, x2, y2, w * 2.6, color, a * .45); line(e, x1, y1, x2, y2, w, '#ffffff', a); }
  function sparks(e, t, o) { // velocity-stretched: each particle is a short streak along its motion
    const r = rng(o.seed); e.save(); e.globalCompositeOperation = 'lighter'; e.lineCap = 'round';
    const a0 = o.a0 || 0, a1 = o.a1 == null ? 6.2832 : o.a1;
    for (let i = 0; i < o.n; i++) {
      const ang = a0 + r() * (a1 - a0), sp = o.speed * (.25 + r() * 1.0), life = (o.life || 700) * (.45 + r() * .9), delay = r() * (o.jit || 70), w = (o.w || 2.2) * (.5 + r() * .9), hot = r() < .3;
      const k = (t - o.t0 - delay) / life; if (k <= 0 || k >= 1) continue;
      const pos = kk => { const d = sp * (1 - Math.pow(1 - kk, 3)) * life / 1000; return [o.x + Math.cos(ang) * d, o.y + Math.sin(ang) * d * (o.sy || 1) + (o.grav || 0) * kk * kk]; };
      const p1 = pos(k), p0 = pos(Math.max(0, k - .07));
      e.globalAlpha = Math.pow(1 - k, 1.3); e.strokeStyle = hot ? '#ffffff' : o.color; e.lineWidth = w * (1 - k * .6);
      e.beginPath(); e.moveTo(p0[0], p0[1]); e.lineTo(p1[0], p1[1]); e.stroke();
    }
    e.restore();
  }
  function motes(e, t, o) { const r = rng(o.seed); e.save(); e.globalCompositeOperation = 'lighter'; for (let i = 0; i < o.n; i++) { const delay = r() * 700, life = 900 + r() * 900, x0 = o.x + (r() - .5) * o.spread, vy = 70 + r() * 150, sway = r() * 6.28, sz = 1.5 + r() * 3; const k = (t - o.t0 - delay) / life; if (k <= 0 || k >= 1) continue; glow(e, x0 + Math.sin(sway + k * 5) * 16, o.y - vy * k * life / 1000 * 1.6, sz * 3.2, o.color, bell(k) * .9); } e.restore(); }
  function boltPts(x1, y1, x2, y2, r, amp, depth) { if (depth === 0) return [[x1, y1], [x2, y2]]; const mx = (x1 + x2) / 2 + (r() - .5) * amp, my = (y1 + y2) / 2 + (r() - .5) * amp; const a = boltPts(x1, y1, mx, my, r, amp / 2, depth - 1), b2 = boltPts(mx, my, x2, y2, r, amp / 2, depth - 1); return a.concat(b2.slice(1)); }
  function bolt(e, x1, y1, x2, y2, seed, amp, color, a, w) {
    if (a <= 0) return; const r = rng(seed), pts = boltPts(x1, y1, x2, y2, r, amp, 5);
    const stroke = (ps, lw, col, al) => { e.save(); e.globalCompositeOperation = 'lighter'; e.lineJoin = 'round'; e.lineCap = 'round'; e.globalAlpha = clamp(al, 0, 1); e.strokeStyle = col; e.lineWidth = lw; e.beginPath(); ps.forEach((p, i) => i ? e.lineTo(p[0], p[1]) : e.moveTo(p[0], p[1])); e.stroke(); e.restore(); };
    stroke(pts, (w || 3) * 3, color, a * .4); stroke(pts, w || 3, '#ffffff', a);
    for (let i = 0; i < 3; i++) { const k = 4 + Math.floor(r() * (pts.length - 8)), p = pts[k], ang = Math.atan2(y2 - y1, x2 - x1) + (r() - .5) * 2.2, len = amp * (.8 + r()); const br = boltPts(p[0], p[1], p[0] + Math.cos(ang) * len, p[1] + Math.sin(ang) * len, r, amp / 2.5, 3); stroke(br, (w || 3) * 1.8, color, a * .3); stroke(br, (w || 3) * .6, '#ffffff', a * .8); }
  }
  function ringE(e, x, y, r, w, color, a, squash) { if (a <= 0 || r <= 0) return; e.save(); e.translate(x, y); e.scale(1, squash || 1); e.globalCompositeOperation = 'lighter'; e.globalAlpha = clamp(a, 0, 1); e.strokeStyle = color; e.lineWidth = w; e.beginPath(); e.arc(0, 0, r, 0, 6.2832); e.stroke(); e.restore(); }
  function speedLines(e, t, seed, pull, color) { const r = rng(seed + Math.floor(t / 34)); e.save(); e.globalCompositeOperation = 'lighter'; e.lineCap = 'round'; for (let i = 0; i < 70; i++) { const a = r() * 6.2832, r1 = 190 + r() * 420, len = 70 + r() * 260; e.globalAlpha = pull * (.25 + r() * .5); e.strokeStyle = i % 4 ? color : '#ffffff'; e.lineWidth = .8 + r() * 2.6; e.beginPath(); e.moveTo(CX + Math.cos(a) * r1, CY + Math.sin(a) * r1 * .8); e.lineTo(CX + Math.cos(a) * (r1 + len), CY + Math.sin(a) * (r1 + len) * .8); e.stroke(); } e.restore(); }
  function kunai(c, x, y, ang, s, a) { // Minato's three-pronged kunai
    c.save(); c.translate(x, y); c.rotate(ang); c.scale(s, s); c.globalAlpha = clamp(a, 0, 1);
    c.fillStyle = '#dfe3ec'; c.strokeStyle = '#2b2e36'; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(30, 0); c.lineTo(7, -6); c.lineTo(2, 0); c.lineTo(7, 6); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(13, -5); c.lineTo(3, -19); c.lineTo(2, -5); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(13, 5); c.lineTo(3, 19); c.lineTo(2, 5); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#efe2b4'; c.fillRect(-24, -3.5, 26, 7); c.strokeRect(-24, -3.5, 26, 7);
    c.fillStyle = '#17120c'; c.font = '900 6px "Zen Kaku Gothic New", serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('忍愛之剣', -11, .5);
    c.strokeStyle = '#dfe3ec'; c.lineWidth = 2; c.beginPath(); c.arc(-30, 0, 5.5, 0, 6.2832); c.stroke(); c.restore();
  }
  const KANJI = '飛雷神之術封印式忍';
  function formula(b, e, x, y, spread, fade, rot, heat) { // ink on the ground + a molten line that blooms
    for (const [c, col, lw, al] of [[b, '#08060a', 6, .92 * fade], [e, '#ffb52e', 2.2, heat * fade]]) {
      if (al <= 0) continue; c.save(); c.translate(x, y); c.scale(1, .32); if (c === e) c.globalCompositeOperation = 'lighter';
      c.globalAlpha = clamp(al, 0, 1); c.strokeStyle = col; c.fillStyle = col; c.lineWidth = lw; c.lineCap = 'round';
      for (let i = 0; i < 10; i++) { const a = i / 10 * 6.2832 + rot, len = 300 * spread; c.beginPath(); c.moveTo(Math.cos(a) * 56, Math.sin(a) * 56); c.lineTo(Math.cos(a) * len, Math.sin(a) * len); c.stroke();
        for (let j = 0; j < 5; j++) { const d = 92 + j * 44; if (d > len) break; c.save(); c.translate(Math.cos(a) * d, Math.sin(a) * d); c.rotate(a + 1.571); c.font = '900 30px "Zen Kaku Gothic New", serif'; c.textAlign = 'center'; c.fillText(KANJI[(i + j) % KANJI.length], 0, 10); c.restore(); } }
      c.beginPath(); c.arc(0, 0, 56, 0, 6.2832 * Math.min(1, spread * 2)); c.stroke(); c.restore();
    }
  }
  const wave = (P, t, t0, x, y, maxR, strength, dur) => { const k = seg(t, t0, t0 + (dur || 650)); if (k <= 0 || k >= 1) return; P.waves.push([x, y, 20 + maxR * easeOut(k), strength * Math.pow(1 - k, 1.4)]); };
  const GOLD = [1.0, .72, .18];

  // ================= Flying Thunder God (Minato) =================
  // A marked kunai strikes, the formula spreads, the field pulls in, and he arrives in one flash.
  const thunderGod = {
    dur: 2800, land: 880, reveal: 1340,
    cues: [[0, 'slash'], [300, 'hit'], [640, 'whoosh'], [880, 'impact'], [880, 'lightning'], [900, 'taiko']],
    draw(b, e, P, t, img) {
      const sx = 1230, sy = -60, tx = CX + 118, ty = FLOOR - 6, ang = Math.atan2(ty - sy, tx - sx);
      const fly = seg(t, 0, 300), kx = sx + (tx - sx) * easeIn(fly), ky = sy + (ty - sy) * easeIn(fly);
      const sp = easeOut(seg(t, 300, 820)), sf = 1 - seg(t, 1900, 2500);
      formula(b, e, CX, FLOOR, sp, sf, .2, .55 * (1 - seg(t, 300, 1500)) + .9 * bell(seg(t, 880, 1150)));
      if (fly < 1) { beam(e, kx - Math.cos(ang) * 420 * fly, ky - Math.sin(ang) * 420 * fly, kx, ky, 4, '#ffc933', .95); kunai(b, kx, ky, ang, 1.7, 1); }
      else { const wob = Math.sin((t - 300) / 26) * .14 * (1 - seg(t, 300, 640)); kunai(b, tx, ty, ang + wob, 1.7, 1 - seg(t, 2000, 2400)); glow(e, tx, ty, 150 * (1 - seg(t, 300, 520)), '#fff3c4', 1 - seg(t, 300, 520)); }
      sparks(e, t, { seed: 3, t0: 300, x: tx, y: ty, n: 70, speed: 900, life: 480, color: '#ffc933', a0: 3.4, a1: 6.0, grav: 120, w: 2.4 });
      wave(P, t, 300, tx, ty, 260, 14, 420);
      const pull = seg(t, 640, 880); if (pull > 0 && pull < 1) speedLines(e, t, 9, pull * .6, '#ffd97a');
      const T = 880;
      if (t >= T) {
        const ap = seg(t, T, T + 420);
        P.flash = [1, .96, .82, (1 - seg(t, T + 55, T + 260)) * .55 * (t >= T + 55 ? 1 : 0)];
        P.aberr = .022 * (1 - seg(t, T, T + 380));
        wave(P, t, T, CX, CY, 760, 46, 700); wave(P, t, T + 90, CX, CY, 520, 26, 620);
        // the layer's own card hands over to the real one on the board once it has burned in
        P.card.a = 1 - seg(t, 1340, 1480); P.card.burn = seg(t, T, T + 300); P.card.white = 1 - seg(t, T + 40, T + 360); P.card.s = 1.14 - .14 * easeOut(ap);
        for (let i = 4; i >= 1; i--) ghost(e, img, CX - i * 110 * (1 - easeOut(ap)) - i * 10, CY, P.card.s, '#ffb52e', .5 * (1 - ap) / i * 1.6);
        beam(e, -80, CY - 20, CX - 60 + 60 * ap, CY - 6, 9 * (1 - ap), '#ffc933', 1 - ap);
        sparks(e, t, { seed: 31, t0: T, x: CX, y: CY, n: 190, speed: 1500, life: 620, color: '#ffc933', w: 2.6 });
        sparks(e, t, { seed: 32, t0: T + 40, x: CX, y: FLOOR, n: 80, speed: 1100, life: 700, color: '#ffe9a3', a0: 3.3, a1: 6.1, grav: 260, sy: .6 });
        ringE(e, CX, FLOOR, 60 + 520 * easeOut(seg(t, T, T + 520)), 9 * (1 - seg(t, T, T + 520)), '#ffc933', 1 - seg(t, T, T + 520), .32);
        for (let i = 0; i < 5; i++) { const a = seg(t, T + i * 46, T + 330 + i * 46); if (a > 0 && a < 1) { const side = i % 2 ? 1 : -1; bolt(e, CX + side * (CW / 2 + 150 + i * 14), CY - 210 + i * 70, CX + side * (CW / 2 - 6), CY + 150 - i * 62, 400 + i * 7 + Math.floor(t / 42), 70, '#ffc933', 1 - a, 2.4); } }
        glow(e, CX, CY, 420 * (1 - seg(t, T, T + 420)), 'rgba(255,201,51,.55)', 1 - seg(t, T, T + 420));
      }
      motes(e, t, { seed: 6, t0: T + 100, x: CX, y: FLOOR, n: 46, spread: 520, color: '#ffc933' });
    },
  };
  const EFFECTS = { 'N-007': thunderGod };

  // ---------------- player ----------------
  const imgs = {};
  function cardImg(card) { const url = card.art && card.art.url; if (!url) return null; if (!imgs[url]) { const i = new Image(); i.src = url; imgs[url] = i; } return imgs[url]; }
  let run = 0;
  const has = card => !!EFFECTS[card.id] && !document.body.classList.contains('lowfx') && !broken;
  // Plays the card's summon effect over the board element `el`. Resolves when the card has landed.
  function summon(card, el) {
    const fx = EFFECTS[card.id];
    if (!fx || !el || !ensure()) return null;
    const img = cardImg(card);
    resize();
    const id = ++run, speed = Math.max(.45, NS.settings ? NS.settings.speedMul() : 1);
    const face = el.querySelector('.nc') || el;
    const r = face.getBoundingClientRect(), ax = r.left + r.width / 2, ay = r.top + r.height / 2, k0 = r.width / CW;
    const M = { k: k0 * sc, pt: (x, y) => [(ax + (x - CX) * k0) * sc, (ay + (y - CY) * k0) * sc] };
    const setT = c => c.setTransform(M.k, 0, 0, M.k, (ax - CX * k0) * sc, (ay - CY * k0) * sc);
    el.style.opacity = '0';
    cv.style.display = 'block';
    const fired = new Set(), stage = document.getElementById('stage');
    let t0 = null, landed = false, done;
    const promise = new Promise(res => { done = res; });
    const reveal = () => { if (el.isConnected) el.style.opacity = ''; done(); };
    const frame = now => {
      if (id !== run) { reveal(); return; }
      if (t0 == null) t0 = now;
      const t = NS.FXGL._freeze != null ? NS.FXGL._freeze : (now - t0) / speed; // _freeze: test hook, pins the effect to one moment
      fx.cues.forEach(([at, name], i) => { if (t >= at && !fired.has(i)) { fired.add(i); NS.Audio.play(name); } });
      if (t >= fx.land && !landed) { // the hit: one negative frame, a camera punch and a lens split on the whole board
        landed = true;
        if (stage) { stage.classList.add('negframe'); setTimeout(() => stage.classList.remove('negframe'), 60); }
        NS.FX.shake(14); NS.FX.punch(ax, ay, 0.05); NS.FX.chroma(170);
      }
      if (t >= fx.reveal && !fired.has('rv')) { fired.add('rv'); reveal(); }
      const P = { waves: [], aberr: 0, exposure: 1.15, flash: [1, 1, 1, 0], edge: GOLD, card: { x: CX, y: CY, s: 1, sx: 1, burn: 1, white: 0, a: 0 } };
      bc.setTransform(1, 0, 0, 1, 0, 0); bc.clearRect(0, 0, Wp, Hp); bc.globalAlpha = 1; bc.globalCompositeOperation = 'source-over'; setT(bc);
      ec.setTransform(1, 0, 0, 1, 0, 0); ec.globalAlpha = 1; ec.globalCompositeOperation = 'source-over'; ec.fillStyle = '#000'; ec.fillRect(0, 0, Wp, Hp); setT(ec);
      try { fx.draw(bc, ec, P, Math.min(t, fx.dur), img); render(P, M, img); } catch (err) { console.warn('FXGL frame failed:', err); run++; }
      if (t >= fx.dur || id !== run) { if (id === run || run === id + 1) { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); cv.style.display = 'none'; } reveal(); return; }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    // never leave the game waiting on the effect (hidden tab, lost context)
    setTimeout(reveal, (fx.reveal + 600) * speed);
    return promise;
  }
  function stop() { run++; if (cv) cv.style.display = 'none'; }

  NS.FXGL = { summon, has, stop };
})();
