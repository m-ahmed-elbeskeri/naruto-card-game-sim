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
  const easeOut = k => 1 - Math.pow(1 - k, 3), easeIn = k => k * k * k, easeIO = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
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
  function formula(b, e, x, y, spread, fade, rot, heat, script, glowCol) { // ink on the ground + a molten line that blooms
    script = script || KANJI;
    for (const [c, col, lw, al] of [[b, '#08060a', 6, .92 * fade], [e, glowCol || '#ffb52e', 2.2, heat * fade]]) {
      if (al <= 0) continue; c.save(); c.translate(x, y); c.scale(1, .32); if (c === e) c.globalCompositeOperation = 'lighter';
      c.globalAlpha = clamp(al, 0, 1); c.strokeStyle = col; c.fillStyle = col; c.lineWidth = lw; c.lineCap = 'round';
      for (let i = 0; i < 10; i++) { const a = i / 10 * 6.2832 + rot, len = 300 * spread; c.beginPath(); c.moveTo(Math.cos(a) * 56, Math.sin(a) * 56); c.lineTo(Math.cos(a) * len, Math.sin(a) * len); c.stroke();
        for (let j = 0; j < 5; j++) { const d = 92 + j * 44; if (d > len) break; c.save(); c.translate(Math.cos(a) * d, Math.sin(a) * d); c.rotate(a + 1.571); c.font = '900 30px "Zen Kaku Gothic New", serif'; c.textAlign = 'center'; c.fillText(script[(i + j) % script.length], 0, 10); c.restore(); } }
      c.beginPath(); c.arc(0, 0, 56, 0, 6.2832 * Math.min(1, spread * 2)); c.stroke(); c.restore();
    }
  }
  const wave = (P, t, t0, x, y, maxR, strength, dur) => { const k = seg(t, t0, t0 + (dur || 650)); if (k <= 0 || k >= 1) return; P.waves.push([x, y, 20 + maxR * easeOut(k), strength * Math.pow(1 - k, 1.4)]); };
  const GOLD = [1.0, .72, .18];

  // ================= Flying Thunder God (Minato) =================
  // A marked kunai strikes, the formula spreads, the field pulls in, and he arrives in one flash.
  const thunderGod = {
    dur: 2800, land: 880, reveal: 1340, neg: true, shake: 14,
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

  // =====================================================================
  // Shared arrival: the card burns in with a coloured edge, sparks, a ground ring and a shockwave.
  // o: { col, hot, edge:[r,g,b], pow, flash, rise }
  // =====================================================================
  function arrive(e, P, t, T, o) {
    if (t < T) return;
    const pw = o.pow || 1, ap = seg(t, T, T + 420), fl = o.fl || [1, 1, 1];
    P.flash = [fl[0], fl[1], fl[2], t >= T + 40 ? (1 - seg(t, T + 40, T + 260)) * (o.flash == null ? .35 : o.flash) : 0];
    P.aberr = .02 * pw * (1 - seg(t, T, T + 380));
    wave(P, t, T, CX, CY, 620 * pw, 40 * pw, 680); wave(P, t, T + 90, CX, CY, 420 * pw, 22 * pw, 600);
    P.card.a = 1 - seg(t, T + 460, T + 600); P.card.burn = seg(t, T, T + 320); P.card.white = 1 - seg(t, T + 40, T + 360);
    P.card.s = 1 + .12 * pw * (1 - easeOut(ap)); P.card.y = CY + (o.rise || 0) * (1 - easeOut(ap)); P.edge = o.edge;
    sparks(e, t, { seed: 31, t0: T, x: CX, y: CY, n: Math.round(150 * pw), speed: 1300 * pw, life: 620, color: o.col, w: 2.6 });
    sparks(e, t, { seed: 32, t0: T + 40, x: CX, y: FLOOR, n: Math.round(60 * pw), speed: 1000 * pw, life: 700, color: o.hot || o.col, a0: 3.3, a1: 6.1, grav: 260, sy: .6 });
    ringE(e, CX, FLOOR, 60 + 480 * pw * easeOut(seg(t, T, T + 520)), 8 * (1 - seg(t, T, T + 520)), o.col, 1 - seg(t, T, T + 520), .32);
    glow(e, CX, CY, 380 * pw * (1 - seg(t, T, T + 420)), o.col, (1 - seg(t, T, T + 420)) * .6);
    motes(e, t, { seed: 6, t0: T + 100, x: CX, y: FLOOR, n: 40, spread: 480, color: o.col });
  }
  const mk = (T, dur, cues, o, draw) => ({ dur, land: T, reveal: T + 460, neg: !!o.neg, shake: o.shake || Math.round(9 * (o.pow || 1)), cues, draw: (b, e, P, t, img) => draw(b, e, P, t, img, o, T) });

  // ---------- lightning strike (Chidori users) ----------
  const lightning = o => mk(820, 2300, [[120, 'lightning'], [400, 'lightning'], [820, 'impact'], [820, 'lightning']], o, (b, e, P, t, img, o, T) => {
    [[120, -180], [260, 150], [400, -40]].forEach(([t0, dx], i) => {
      const a = seg(t, t0, t0 + 150), gx = CX + dx * .35, gy = FLOOR - 10;
      if (a > 0 && a < 1) { bolt(e, CX + dx * 1.6, -60, gx, gy, 500 + i * 11 + Math.floor(t / 40), 150, o.col, 1 - a, 2.6); glow(e, gx, gy, 120 * (1 - a), o.hot, 1 - a); }
      sparks(e, t, { seed: 60 + i, t0, x: gx, y: gy, n: 26, speed: 700, life: 380, color: o.col, a0: 3.5, a1: 5.9, grav: 160 });
      wave(P, t, t0, gx, gy, 200, 10, 320);
    });
    const ck = seg(t, 420, T);
    if (ck > 0 && t < T) { // crackling core where he will stand
      glow(e, CX, CY, 90 + 160 * ck, o.col, .55 * ck); glow(e, CX, CY, 50 + 60 * ck, '#ffffff', .8 * ck);
      const r = rng(700 + Math.floor(t / 50));
      for (let i = 0; i < 7; i++) { const a = r() * 6.2832, l = 120 + r() * 160 * ck; bolt(e, CX, CY, CX + Math.cos(a) * l, CY + Math.sin(a) * l * .8, 900 + i + Math.floor(t / 50), 50, o.col, .8 * ck, 1.6); }
      speedLines(e, t, 9, ck * .45, o.hot);
    }
    if (t >= T) {
      const a = seg(t, T, T + 420), pw = o.pow || 1;
      bolt(e, CX + 30, -80, CX, CY, 1300 + Math.floor(t / 36), 190, o.col, 1 - a, 5 * pw);
      for (let i = 0; i < 8; i++) { const an = i / 8 * 6.2832 + .3, s2 = seg(t, T + i * 20, T + 340 + i * 20); if (s2 > 0 && s2 < 1) bolt(e, CX, CY, CX + Math.cos(an) * (260 + i * 18) * pw, CY + Math.sin(an) * (210 + i * 10) * pw, 1400 + i * 5 + Math.floor(t / 42), 80, o.col, 1 - s2, 2.2); }
    }
    arrive(e, P, t, T, o);
  });

  // ---------- Rasengan spiral ----------
  const spiral = o => mk(820, 2300, [[0, 'chakra'], [400, 'whoosh'], [820, 'impact']], o, (b, e, P, t, img, o, T) => {
    const charge = seg(t, 0, 740), core = t < T ? 10 + 90 * easeOut(charge) - 28 * seg(t, 740, T) : 0;
    const r = rng(4); e.save(); e.globalCompositeOperation = 'lighter'; e.lineCap = 'round';
    for (let i = 0; i < 260; i++) {
      const a0 = r() * 6.2832, r0 = 240 + r() * 460, d = r() * 500, w = 1 + r() * 2.4, hot = r() < .25, k = (t - d) / 420;
      if (k <= 0 || k >= 1 || t > T) continue;
      const pos = kk => { const rad = r0 * Math.pow(1 - kk, 1.7) + core * .5, a = a0 + kk * 5.2; return [CX + Math.cos(a) * rad, CY + Math.sin(a) * rad * .9]; };
      const p1 = pos(k), p0 = pos(Math.max(0, k - .06));
      e.globalAlpha = bell(k); e.strokeStyle = hot ? '#ffffff' : o.col; e.lineWidth = w; e.beginPath(); e.moveTo(p0[0], p0[1]); e.lineTo(p1[0], p1[1]); e.stroke();
    }
    e.restore();
    if (core > 0) {
      glow(e, CX, CY, core * 3.6, o.col, .55); glow(e, CX, CY, core * 1.7, o.hot, .9); glow(e, CX, CY, core * .9, '#ffffff', 1);
      e.save(); e.translate(CX, CY); e.globalCompositeOperation = 'lighter'; e.lineCap = 'round';
      for (let i = 0; i < 14; i++) { const a = t / 60 + i * .47, rr2 = core * (.3 + (i % 4) * .19); e.strokeStyle = i % 2 ? '#ffffff' : o.hot; e.globalAlpha = .9; e.lineWidth = 2.2; e.beginPath(); e.ellipse(0, 0, rr2, rr2 * (.4 + (i % 5) * .13), a, 0, 2.4); e.stroke(); }
      e.restore();
      P.waves.push([CX, CY, core * 1.5, -16 * charge]); // the sphere bends the air around it
    }
    if (t >= T) {
      e.save(); e.translate(CX, CY); e.globalCompositeOperation = 'lighter'; e.lineCap = 'round';
      for (let i = 0; i < 7; i++) { const k = seg(t, T + 60 + i * 40, T + 900 + i * 40); if (k <= 0 || k >= 1) continue; e.globalAlpha = (1 - k) * .7; e.strokeStyle = o.hot; e.lineWidth = 4 * (1 - k); const rad = 150 + 220 * k + i * 22; e.beginPath(); e.ellipse(0, 0, rad, rad * .5, i * .5, k * 3 + i, k * 3 + i + 1.9); e.stroke(); }
      e.restore();
    }
    arrive(e, P, t, T, o);
  });

  // ---------- crows and Sharingan (Uchiha genjutsu) ----------
  function crow(c, x, y, s, flap, rot, a, col) {
    if (a <= 0) return; c.save(); c.translate(x, y); c.rotate(rot); c.scale(s, s); c.globalAlpha = clamp(a, 0, 1); c.fillStyle = col;
    const w = 15, lift = -7 + flap * 9;
    c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-w * .5, lift - 4, -w, lift); c.quadraticCurveTo(-w * .45, lift + 5, 0, 4); c.quadraticCurveTo(w * .45, lift + 5, w, lift); c.quadraticCurveTo(w * .5, lift - 4, 0, 0); c.fill();
    c.beginPath(); c.ellipse(0, 2, 2.6, 5.5, 0, 0, 6.2832); c.fill(); c.restore();
  }
  const crows = o => mk(860, 2400, [[0, 'whoosh'], [860, 'impact'], [860, 'fire']], o, (b, e, P, t, img, o, T) => {
    // Sharingan opens behind the slot
    const sk = easeOut(seg(t, 200, 700)), sa = bell(seg(t, 200, T + 420));
    if (sa > 0) {
      e.save(); e.translate(CX, CY); e.globalCompositeOperation = 'lighter'; e.globalAlpha = sa * .9; e.strokeStyle = o.col; e.fillStyle = o.col;
      e.lineWidth = 7; e.beginPath(); e.arc(0, 0, 150 * sk, 0, 6.2832); e.stroke(); e.lineWidth = 2.5; e.beginPath(); e.arc(0, 0, 96 * sk, 0, 6.2832); e.stroke();
      for (let i = 0; i < 3; i++) { const a = t / 260 + i * 2.094, x = Math.cos(a) * 96 * sk, y = Math.sin(a) * 96 * sk; e.beginPath(); e.arc(x, y, 15 * sk, 0, 6.2832); e.fill(); e.lineWidth = 8 * sk; e.lineCap = 'round'; e.beginPath(); e.arc(0, 0, 96 * sk, a - .5, a - .08); e.stroke(); }
      e.beginPath(); e.arc(0, 0, 24 * sk, 0, 6.2832); e.fill(); e.restore();
    }
    const r = rng(12);
    for (let i = 0; i < 38; i++) {
      const a0 = r() * 6.2832, r0 = 420 + r() * 320, delay = r() * 420, sz = 1.3 + r() * 1.4, out = 300 + r() * 520, k = seg(t, delay, T), flap = Math.sin(t / 55 + i * 1.7);
      if (t < delay) continue;
      let x, y, al, ang;
      if (t < T) { const rad = r0 * (1 - easeIn(k)) + 50, a = a0 + k * 4.2; x = CX + Math.cos(a) * rad; y = CY + Math.sin(a) * rad * .7 - (1 - k) * 50; al = Math.min(1, k * 4); ang = a + 1.9; }
      else { const k2 = seg(t, T, T + 760), rad = 50 + out * easeOut(k2), a = a0 + 4.2 + k2 * .8; x = CX + Math.cos(a) * rad; y = CY + Math.sin(a) * rad * .7 - k2 * 90; al = 1 - k2; ang = a - 1.2; }
      crow(b, x, y, sz, flap, ang * .25, al, '#07060a'); glow(e, x, y, 16 * sz, o.col, al * .22);
    }
    if (t >= T) sparks(e, t, { seed: 77, t0: T, x: CX, y: FLOOR, n: 110, speed: 620, life: 1100, color: o.col, a0: 3.9, a1: 5.5, grav: -260, jit: 500, w: 2.2 });
    arrive(e, P, t, T, o);
  });

  // ---------- serpents (Orochimaru, Manda) ----------
  const serpent = o => mk(880, 2500, [[0, 'hidden'], [500, 'whoosh'], [880, 'impact']], o, (b, e, P, t, img, o, T) => {
    const pw = o.pow || 1, n = pw > 1.2 ? 5 : 3, fade = 1 - seg(t, T, T + 340);
    const r = rng(9); e.save(); e.globalCompositeOperation = 'lighter';
    for (let j = 0; j < 18; j++) { const d = r() * 900, x = CX + (r() - .5) * 460 * pw, k = (t - d) / 1300; if (k <= 0 || k >= 1) continue; glow(e, x, FLOOR - k * 260, 90 + 60 * k, o.col, bell(k) * .16); }
    e.restore();
    if (fade > 0) for (let i = 0; i < n; i++) {
      const ph = i * 6.2832 / n, grow = easeOut(seg(t, i * 90, 700 + i * 90)), strike = easeIn(seg(t, T - 160, T));
      let px = null, py = null, hx = 0, hy = 0;
      for (let q = 0; q <= 40; q++) {
        const sI = q / 40 * grow, ang = ph + sI * 5.4 + t / 900, rad = (250 - 130 * sI) * pw * (1 - strike * .7 * sI);
        const x = CX + Math.cos(ang) * rad, y = FLOOR - sI * 470 * pw + Math.sin(ang) * rad * .25;
        if (px != null) { const w = (40 - 24 * sI) * pw;
          b.save(); b.globalAlpha = fade; b.lineCap = 'round'; b.strokeStyle = '#150a1c'; b.lineWidth = w; b.beginPath(); b.moveTo(px, py); b.lineTo(x, y); b.stroke(); b.restore();
          if (q % 2) line(e, px, py - w * .25, x, y - w * .25, w * .18, o.col, .5 * fade); }
        px = x; py = y; hx = x; hy = y;
      }
      if (grow > .1) { b.save(); b.globalAlpha = fade; b.fillStyle = '#150a1c'; b.beginPath(); b.ellipse(hx, hy, 26 * pw, 19 * pw, 0, 0, 6.2832); b.fill(); b.restore(); glow(e, hx - 9 * pw, hy - 3, 10 * pw, '#ffe14a', fade); glow(e, hx + 9 * pw, hy - 3, 10 * pw, '#ffe14a', fade); }
    }
    arrive(e, P, t, T, o);
  });

  // ---------- curse mark (Jugo) ----------
  const curse = o => mk(820, 2300, [[0, 'hidden'], [820, 'impact'], [820, 'fire']], o, (b, e, P, t, img, o, T) => {
    const sp = easeOut(seg(t, 0, 700)), cf = 1 - seg(t, 1500, 2200), heat = .35 + .65 * bell(seg(t, 500, T + 500)), rq = rng(21);
    for (const [c, col, mul, al] of [[b, '#050406', 1, cf], [e, o.col, .32, heat * cf]]) {
      c.save(); c.translate(CX, FLOOR); c.scale(1, .34); if (c === e) c.globalCompositeOperation = 'lighter'; c.globalAlpha = clamp(al, 0, 1); c.strokeStyle = col; c.lineJoin = 'round'; c.lineCap = 'round';
      const rr2 = rng(21);
      for (let i = 0; i < 14; i++) { const a = i / 14 * 6.2832 + rr2() * .4, len = (170 + rr2() * 250) * sp; c.lineWidth = (4 + rr2() * 7) * mul; c.beginPath(); c.moveTo(Math.cos(a) * 36, Math.sin(a) * 36); c.lineTo(Math.cos(a + .16) * len * .4, Math.sin(a + .16) * len * .4); c.lineTo(Math.cos(a - .1) * len * .72, Math.sin(a - .1) * len * .72); c.lineTo(Math.cos(a + .05) * len, Math.sin(a + .05) * len); c.stroke(); }
      c.restore();
    }
    void rq;
    // black flame licks climb around the slot
    const fk = seg(t, 260, T), ff = 1 - seg(t, T, T + 300);
    if (fk > 0 && ff > 0) for (const [c, col, grow2] of [[b, '#060407', 1], [e, o.col, .55]]) {
      c.save(); if (c === e) { c.globalCompositeOperation = 'lighter'; c.globalAlpha = .5 * ff; } else c.globalAlpha = ff; c.fillStyle = col;
      for (let i = 0; i < 16; i++) { const x = CX - CW / 2 - 30 + i * (CW + 60) / 15, h = (120 + 150 * Math.abs(Math.sin(i * 1.7 + t / 140))) * fk * grow2, w = 26; c.beginPath(); c.moveTo(x - w, FLOOR + 6); c.quadraticCurveTo(x - w * .2, FLOOR - h * .5, x + Math.sin(t / 90 + i) * 12, FLOOR - h); c.quadraticCurveTo(x + w * .3, FLOOR - h * .45, x + w, FLOOR + 6); c.closePath(); c.fill(); }
      c.restore();
    }
    sparks(e, t, { seed: 91, t0: 200, x: CX, y: FLOOR, n: 80, speed: 420, life: 1200, color: o.col, a0: 3.9, a1: 5.5, grav: -220, jit: 800, w: 2 });
    arrive(e, P, t, T, o);
  });

  // ---------- Summoning Jutsu smoke (toads) ----------
  const SUMMON_SCRIPT = '口寄之術契約蝦蟇亥戌酉申未';
  const smoke = o => mk(560, 2300, [[0, 'seal'], [560, 'poof'], [560, 'hit']].concat(o.pow > 1.2 ? [[560, 'impact']] : []), o, (b, e, P, t, img, o, T) => {
    const pw = o.pow || 1;
    formula(b, e, CX, FLOOR, easeOut(seg(t, 0, 420)), 1 - seg(t, 1100, 1700), .5, .7 * (1 - seg(t, 0, 900)) + .3, SUMMON_SCRIPT, o.col);
    glow(e, CX, FLOOR, 130 * bell(seg(t, 300, 620)), o.hot, bell(seg(t, 300, 620)));
    if (t >= T) {
      const r = rng(15), n = Math.round(34 * pw); e.save(); e.globalCompositeOperation = 'lighter';
      for (let i = 0; i < n; i++) {
        const a = r() * 6.2832, dist = (70 + r() * 230) * pw, life = 900 + r() * 700, d0 = r() * 140, k = (t - T - d0) / life; if (k <= 0 || k >= 1) continue;
        const rad = (70 + (110 + r() * 90) * easeOut(k)) * pw, x = CX + Math.cos(a) * dist * easeOut(k), y = CY + 30 + Math.sin(a) * dist * .55 * easeOut(k) - k * 46;
        glow(e, x, y, rad, i % 3 ? '#6f6a63' : '#8d877e', (k < .12 ? k / .12 : Math.pow(1 - k, 1.5)) * .13);
      }
      e.restore();
      if (pw > 1.2) { wave(P, t, T, CX, FLOOR, 900, 60, 760); ringE(e, CX, FLOOR, 80 + 700 * easeOut(seg(t, T, T + 600)), 16 * (1 - seg(t, T, T + 600)), '#d9c9a8', (1 - seg(t, T, T + 600)) * .8, .3); }
    }
    arrive(e, P, t, T, o);
  });

  // ---------- swirl: leaves, petals, water or shadow ----------
  function leafShape(c, x, y, s, rot, a, fill, vein) { if (a <= 0) return; c.save(); c.translate(x, y); c.rotate(rot); c.globalAlpha = clamp(a, 0, 1); c.fillStyle = fill; c.beginPath(); c.moveTo(-s, 0); c.quadraticCurveTo(0, -s * .75, s, 0); c.quadraticCurveTo(0, s * .75, -s, 0); c.fill(); if (vein) { c.strokeStyle = vein; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-s, 0); c.lineTo(s, 0); c.stroke(); } c.restore(); }
  const swirl = o => mk(780, 2200, [[0, 'whoosh'], [780, 'hit'], [780, 'chakra']], o, (b, e, P, t, img, o, T) => {
    const r = rng(12);
    if (o.kind === 'shadow') { // shadows crawl in along the ground and pool under the slot
      const sp = easeOut(seg(t, 0, 720)), sf = 1 - seg(t, 1300, 1900);
      b.save(); b.translate(CX, FLOOR); b.scale(1, .34); b.globalAlpha = sf * .95; b.fillStyle = '#040306'; b.strokeStyle = '#040306'; b.lineCap = 'round';
      for (let i = 0; i < 11; i++) { const a = i / 11 * 6.2832 + r() * .5, far = 430 + r() * 160, near = far * (1 - sp) + 30; b.lineWidth = 9 + r() * 14; b.beginPath(); b.moveTo(Math.cos(a) * far, Math.sin(a) * far); b.quadraticCurveTo(Math.cos(a + .35) * (far + near) / 2, Math.sin(a + .35) * (far + near) / 2, Math.cos(a) * near, Math.sin(a) * near); b.stroke(); }
      b.beginPath(); b.arc(0, 0, 40 + 150 * sp, 0, 6.2832); b.fill(); b.restore();
      ringE(e, CX, FLOOR, 40 + 150 * sp, 3, o.col, .5 * sp * sf, .34);
    } else {
      for (let i = 0; i < 46; i++) {
        const delay = r() * 520, a0 = r() * 6.2832, rad0 = 110 + r() * 180, sz = 7 + r() * 9, k = (t - delay) / 1300; if (k <= 0 || k >= 1) continue;
        const burst = t >= T ? easeOut(seg(t, T, T + 600)) * 140 : 0, a = a0 + k * 7, rad = rad0 * (1 - .35 * k) + burst, x = CX + Math.cos(a) * rad, y = FLOOR - 20 - k * 470 + Math.sin(a) * 36, al = bell(k);
        if (o.kind === 'drop') { line(e, x, y, x + Math.cos(a) * 3, y + 16, sz * .32, o.col, al * .9); glow(e, x, y, sz * 1.5, o.hot, al * .6); }
        else { leafShape(b, x, y, o.kind === 'petal' ? sz * .7 : sz, a * 2, al, o.item, o.kind === 'petal' ? null : o.vein); glow(e, x, y, sz * 1.6, o.col, al * .2); }
      }
      if (o.kind === 'drop') for (let i = 0; i < 4; i++) { const k = ((t + i * 260) % 1040) / 1040; ringE(e, CX, FLOOR, 30 + 260 * k, 3 * (1 - k), o.col, (1 - k) * .55 * (1 - seg(t, 1500, 2100)), .3); }
      // soft column of light and wind arcs
      const ck = bell(seg(t, 250, T + 520));
      if (ck > 0) { e.save(); e.globalCompositeOperation = 'lighter'; e.translate(CX, CY - 40); e.scale(.55, 1.5); glow(e, 0, 0, 300, o.col, ck * .32); e.restore(); }
      e.save(); e.translate(CX, CY + 40); e.globalCompositeOperation = 'lighter'; e.lineCap = 'round';
      for (let i = 0; i < 5; i++) { const k = seg(t, 120 + i * 110, 900 + i * 110); if (k <= 0 || k >= 1) continue; e.globalAlpha = bell(k) * .45; e.strokeStyle = o.hot; e.lineWidth = 2.5; const rad = 150 + i * 26; e.beginPath(); e.ellipse(0, 60 - k * 220, rad, rad * .3, 0, k * 5 + i, k * 5 + i + 1.6); e.stroke(); }
      e.restore();
    }
    arrive(e, P, t, T, o);
  });


  // ---------- shadow ink (Shikamaru): black shapes with a thin glowing rim ----------
  const RIM = '#b9a8ff', INK = '#030206';
  function inkShape(c, e, path, a, rim) {
    if (a <= 0) return;
    e.save(); e.globalCompositeOperation = 'lighter'; e.globalAlpha = clamp(a * (rim == null ? .55 : rim), 0, 1); e.strokeStyle = RIM; e.lineWidth = 3; e.lineJoin = 'round'; path(e); e.stroke(); e.restore();
    e.save(); e.globalAlpha = clamp(a, 0, 1); e.fillStyle = '#000'; path(e); e.fill(); e.restore();
    c.save(); c.globalAlpha = clamp(a, 0, 1); c.fillStyle = INK; path(c); c.fill(); c.restore();
  }
  // tapered, writhing tendril grown to fraction k of the way from (x1,y1) to (x2,y2)
  function tendril(c, e, x1, y1, x2, y2, k, o) {
    o = o || {}; if (k <= 0) return;
    k = Math.min(1, k); const n = 30, dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, Lp = [], Rp = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n * k, off = Math.sin(u * (o.freq || 9) + (o.ph || 0) - (o.t || 0) / (o.sp || 260)) * (o.amp || 0) * Math.sin(u * Math.PI);
      const px = x1 + dx * u + nx * off, py = y1 + dy * u + ny * off, w = (o.w || 12) * (1 - (i / n) * (o.taper == null ? .85 : o.taper)) / 2;
      Lp.push([px + nx * w, py + ny * w]); Rp.push([px - nx * w, py - ny * w]);
    }
    inkShape(c, e, q => { q.beginPath(); Lp.forEach((p, i) => i ? q.lineTo(p[0], p[1]) : q.moveTo(p[0], p[1])); for (let i = Rp.length - 1; i >= 0; i--) q.lineTo(Rp[i][0], Rp[i][1]); q.closePath(); }, o.a == null ? 1 : o.a, o.rim);
  }
  function inkPool(c, e, x, y, rx, ry, t, a) {
    if (rx <= 1 || ry <= 1) return;
    inkShape(c, e, q => { q.beginPath(); for (let i = 0; i <= 96; i++) { const an = i / 96 * 6.2832, w = 1 + .06 * Math.sin(an * 5 + t / 300) + .035 * Math.sin(an * 8 - t / 210); const px = x + Math.cos(an) * rx * w, py = y + Math.sin(an) * ry * w; i ? q.lineTo(px, py) : q.moveTo(px, py); } q.closePath(); }, a, .5);
  }
  function inkSpikes(c, e, x, y, t, t0, n, len) {
    const r = rng(9);
    for (let i = 0; i < n; i++) { const a = i / n * 6.2832 + r() * .3, l = len * (.5 + r() * .7), g = easeOut(seg(t, t0, t0 + 130)), f = 1 - seg(t, t0 + 200, t0 + 440 + r() * 150), w = 22 * (.6 + r() * .6); if (g <= 0 || f <= 0) continue;
      tendril(c, e, x + Math.cos(a) * 30, y + Math.sin(a) * 12, x + Math.cos(a) * l, y + Math.sin(a) * l * .55, g, { w, taper: 1, a: f, rim: .95 }); }
  }
  function polyPart(pts, f0, f1) {
    const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const tot = L[L.length - 1], at = d => { for (let i = 1; i < pts.length; i++) if (d <= L[i] || i === pts.length - 1) { const u = clamp((d - L[i - 1]) / ((L[i] - L[i - 1]) || 1), 0, 1); return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u]; } };
    const d0 = f0 * tot, d1 = f1 * tot, out = [at(d0)]; for (let i = 1; i < pts.length - 1; i++) if (L[i] > d0 && L[i] < d1) out.push(pts[i]); out.push(at(d1)); return { pts: out, L, tot };
  }
  // ---------- Two Hundred Moves (Shikamaru): lines of play plot themselves across the board and all end on the slot ----------
  const PLAYS = [[[-20, 120], [300, 200], [380, 470]], [[1300, 90], [980, 260], [900, 520]], [[-20, 640], [250, 700], [470, 330]], [[1300, 700], [1010, 640], [820, 300]], [[420, -20], [520, 130], [330, 300]], [[900, -20], [760, 110], [960, 380]], [[640, 820], [560, 700], [640, 620]]];
  const moves = o => mk(1000, 2400, [[0, 'hidden'], [820, 'whoosh'], [1000, 'impact']], o, (b, e, P, t, img, o, T) => {
    const col = easeIn(seg(t, 820, T));
    e.save(); e.globalCompositeOperation = 'lighter'; e.lineJoin = 'round'; e.lineCap = 'round';
    PLAYS.forEach((pl, i) => {
      const pts = pl.concat([[CX, CY]]), k = easeIO(seg(t, i * 70, 620 + i * 70)); if (k <= 0 || t >= T) return;
      const part = polyPart(pts, col, Math.max(col, k)); e.globalAlpha = .55 + .45 * col; e.strokeStyle = col > 0 ? '#ffffff' : RIM; e.lineWidth = 2 + 2.5 * col; e.setLineDash(col > 0 ? [] : [11, 9]);
      e.beginPath(); part.pts.forEach((p, j) => j ? e.lineTo(p[0], p[1]) : e.moveTo(p[0], p[1])); e.stroke(); e.setLineDash([]);
      const head = part.pts[part.pts.length - 1]; glow(e, head[0], head[1], 26, '#ffffff', k < 1 ? 1 : .4);
      for (let j = 1; j < pts.length - 1; j++) { const f = part.L[j] / part.tot; if (k < f || col > f) continue; const p = pts[j], since = seg(k, f, f + .16);
        e.save(); e.translate(p[0], p[1]); e.rotate(.785); e.globalAlpha = 1; e.strokeStyle = RIM; e.lineWidth = 2; e.strokeRect(-7, -7, 14, 14); e.restore();
        e.globalAlpha = (1 - since) * .9; e.strokeStyle = RIM; e.lineWidth = 2; e.beginPath(); e.arc(p[0], p[1], 10 + 34 * since, 0, 6.2832); e.stroke();
        e.globalAlpha = .75; e.fillStyle = RIM; e.font = '900 17px "Zen Kaku Gothic New", serif'; e.textAlign = 'left'; e.fillText('一二三四五六七八九十'[(i + j * 3) % 10], p[0] + 15, p[1] - 10); }
    });
    e.restore();
    if (t >= T) { const pk = easeOut(seg(t, T, T + 220)) * (1 - seg(t, T + 350, T + 680)); inkPool(b, e, CX, FLOOR, 270 * pk, 78 * pk, t, 1); inkSpikes(b, e, CX, FLOOR, t, T + 40, 12, 300); }
    arrive(e, P, t, T, o);
    if (t >= T) { P.card.burn = 1; P.card.s = 1.3 - .3 * easeOut(seg(t, T, T + 170)); P.card.y = CY; } // stamped down, not burned in
  });

  const EFFECTS = {
    'N-007': thunderGod,
    // Chidori users
    'N-015': lightning({ col: '#6fb7ff', hot: '#d6ecff', edge: [.4, .7, 1], pow: 1 }),
    'N-014': lightning({ col: '#a877ff', hot: '#e6d8ff', edge: [.65, .45, 1], pow: 1.35, neg: true, flash: .5 }),
    'N-009': lightning({ col: '#9fd8ff', hot: '#ffffff', edge: [.6, .85, 1], pow: 1 }),
    // Rasengan
    'N-004': spiral({ col: '#6cc4ff', hot: '#cfeeff', edge: [.35, .75, 1], pow: 1 }),
    'N-003': spiral({ col: '#ff9a2a', hot: '#ffe0a8', edge: [1, .6, .15], pow: 1.35, neg: true, flash: .5 }),
    // Uchiha
    'N-013': crows({ col: '#ff3b30', hot: '#ffb0a0', edge: [1, .25, .2], pow: 1 }),
    'N-016': crows({ col: '#4dff9a', hot: '#c9ffe0', edge: [.3, 1, .6], pow: 1 }),
    // snakes and the curse mark
    'N-017': serpent({ col: '#b06cff', hot: '#e3ccff', edge: [.7, .4, 1], pow: 1 }),
    'N-022': serpent({ col: '#b06cff', hot: '#e3ccff', edge: [.7, .4, 1], pow: 1.4, neg: true, flash: .45 }),
    'N-019': curse({ col: '#ff7a1a', hot: '#ffd0a0', edge: [1, .45, .1], pow: 1.05 }),
    // toads
    'N-006': smoke({ col: '#ffb86a', hot: '#fff0d8', edge: [1, .75, .4], pow: .95 }),
    'N-005': smoke({ col: '#ffb86a', hot: '#fff0d8', edge: [1, .8, .3], pow: 1.45, flash: .45 }),
    // swirls
    'N-002': swirl({ kind: 'leaf', col: '#ffa23a', hot: '#ffe0b0', item: '#d9772a', vein: '#7a3c10', edge: [1, .62, .2], pow: .85, flash: .22 }),
    'N-011': swirl({ kind: 'petal', col: '#c58bff', hot: '#ecd9ff', item: '#b47be8', edge: [.75, .5, 1], pow: .85, flash: .22 }),
    'N-018': swirl({ kind: 'petal', col: '#cfc4ff', hot: '#ffffff', item: '#e4dcff', edge: [.8, .76, 1], pow: .85, flash: .22 }),
    'N-020': swirl({ kind: 'petal', col: '#ff8fc0', hot: '#ffe0ee', item: '#ff9cc8', edge: [1, .5, .72], pow: .85, flash: .22 }),
    'N-010': swirl({ kind: 'petal', col: '#ff4d5e', hot: '#ffc2c8', item: '#e23a4c', edge: [1, .3, .35], pow: .85, flash: .22 }),
    'N-021': swirl({ kind: 'drop', col: '#4fc3ff', hot: '#d8f3ff', edge: [.3, .75, 1], pow: .9, flash: .22 }),
    'N-008': moves({ col: RIM, hot: '#ffffff', edge: [.62, .5, 1], pow: 1, neg: true, flash: .4, fl: [.82, .78, 1] }),
  };

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
    cv.style.display = 'block'; cv.style.zIndex = '';
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
        if (stage && fx.neg) { stage.classList.add('negframe'); setTimeout(() => stage.classList.remove('negframe'), 60); }
        NS.FX.shake(fx.shake || 10); NS.FX.punch(ax, ay, fx.neg ? 0.05 : 0.03); if (fx.neg) NS.FX.chroma(170);
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

  // ---------------- board-space effects (not tied to one card): drawn in screen pixels ----------------
  // Runs draw(b, e, P, t) for `dur` ms on the same layer. Returns false when the layer is unavailable.
  function overlay(dur, cues, draw, z) {
    if (document.body.classList.contains('lowfx') || !ensure()) return false;
    resize();
    const id = ++run, speed = Math.max(.45, NS.settings ? NS.settings.speedMul() : 1), M = { k: sc, pt: (x, y) => [x * sc, y * sc] }, fired = new Set();
    cv.style.display = 'block'; cv.style.zIndex = z || ''; // z: lift the layer above a full-screen panel
    let t0 = null;
    const frame = now => {
      if (id !== run) return;
      if (t0 == null) t0 = now;
      const t = NS.FXGL._freeze != null ? NS.FXGL._freeze : (now - t0) / speed;
      cues.forEach(([at, name], i) => { if (t >= at && !fired.has(i)) { fired.add(i); NS.Audio.play(name); } });
      const P = { waves: [], aberr: 0, exposure: 1.15, flash: [1, 1, 1, 0], edge: GOLD, card: { x: 0, y: 0, s: 1, sx: 1, burn: 1, white: 0, a: 0 } };
      bc.setTransform(1, 0, 0, 1, 0, 0); bc.clearRect(0, 0, Wp, Hp); bc.globalAlpha = 1; bc.globalCompositeOperation = 'source-over'; bc.setTransform(sc, 0, 0, sc, 0, 0);
      ec.setTransform(1, 0, 0, 1, 0, 0); ec.globalAlpha = 1; ec.globalCompositeOperation = 'source-over'; ec.fillStyle = '#000'; ec.fillRect(0, 0, Wp, Hp); ec.setTransform(sc, 0, 0, sc, 0, 0);
      try { draw(bc, ec, P, Math.min(t, dur)); render(P, M, null); } catch (err) { console.warn('FXGL frame failed:', err); run++; }
      if (t >= dur || id !== run) { if (id === run || run === id + 1) { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); cv.style.display = 'none'; } return; }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    return true;
  }
  // Chakra use: each spent Chakra card flares and its chakra pours along an arc into the card being paid for.
  // cards: [{x, y, w, h}] in the order they are spent, to: {x, y}. Returns the timings (ms before speed scaling) or null.
  const OR = '#ff9a2e';
  function chakra(cards, to) {
    const GAP = 130, HIT = 340;
    const ok = overlay((cards.length - 1) * GAP + 780, [], (b, e, P, t) => {
      e.globalCompositeOperation = 'lighter'; e.lineCap = 'round';
      cards.forEach((c, i) => {
        const dt = t - i * GAP; if (dt < 0) return;
        const u = c.w / 76, fl = bell(seg(dt, 0, 280));
        glow(e, c.x, c.y, 110 * u, 'rgba(255,150,40,.6)', fl);
        if (fl > 0) { e.globalAlpha = .75 * fl; e.fillStyle = '#fff'; e.fillRect(c.x - c.w / 2, c.y - c.h / 2, c.w, c.h); }
        const dx = to.x - c.x, dy = to.y - c.y, d = Math.hypot(dx, dy) || 1, side = i % 2 ? -1 : 1, mx = (c.x + to.x) / 2 - dy / d * d * .22 * side, my = (c.y + to.y) / 2 + dx / d * d * .22 * side, r = rng(300 + i);
        const bez = (cx, cy, k) => { const m = 1 - k; return [m * m * c.x + 2 * m * k * cx + k * k * to.x, m * m * c.y + 2 * m * k * cy + k * k * to.y]; };
        for (let n = 0; n < 34; n++) {
          const dl = r() * 170, life = 250 + r() * 110, ox = (r() - .5) * 60 * u, oy = (r() - .5) * 60 * u, w = Math.max(1.3, (1.5 + r() * 3) * u), hot = r() < .3, k = (dt - 40 - dl) / life; if (k <= 0 || k >= 1) continue;
          const kk = easeIO(k), p1 = bez(mx + ox, my + oy, kk), p0 = bez(mx + ox, my + oy, Math.max(0, kk - .09));
          e.globalAlpha = bell(k) * .95; e.strokeStyle = hot ? '#ffffff' : OR; e.lineWidth = w; e.beginPath(); e.moveTo(p0[0], p0[1]); e.lineTo(p1[0], p1[1]); e.stroke();
        }
        const h = dt - HIT; if (h < 0) return;
        glow(e, to.x, to.y, 170 * u, 'rgba(255,150,40,.5)', bell(seg(h, 0, 420)) * .7);
        ringE(e, to.x, to.y, (34 + 120 * easeOut(seg(h, 0, 400))) * u, Math.max(1.5, 5 * u) * (1 - seg(h, 0, 400)), OR, 1 - seg(h, 0, 400));
        sparks(e, t, { seed: 80 + i, t0: i * GAP + HIT, x: to.x, y: to.y, n: 22, speed: 460 * u, life: 380, color: OR, w: Math.max(1.3, 2 * u) });
      });
    });
    return ok ? { gap: GAP, hit: HIT } : null;
  }
  // Support activation: a flare, two rings, a lens streak and a spray of sparks around the card as it turns over.
  // u: size relative to a Support Area card; z: optional z-index for the layer.
  function activate(pt, u, z) {
    const x = pt.x, y = pt.y;
    return overlay(820, [], (b, e, P, t) => {
      e.globalCompositeOperation = 'lighter';
      const f = 1 - seg(t, 0, 340);
      glow(e, x, y, 190 * u, 'rgba(255,150,40,.55)', bell(seg(t, 0, 520)) * .8);
      glow(e, x, y, 62 * u, '#fff3d6', f);
      line(e, x - 300 * u * easeOut(seg(t, 0, 220)), y, x + 300 * u * easeOut(seg(t, 0, 220)), y, Math.max(1.5, 4 * u) * f, '#ffd9a0', f);
      line(e, x, y - 130 * u * easeOut(seg(t, 0, 220)), x, y + 130 * u * easeOut(seg(t, 0, 220)), Math.max(1.2, 2.5 * u) * f, '#ffd9a0', f * .8);
      for (const [d, r0, r1, w] of [[0, 40, 150, 5], [90, 30, 105, 2.5]]) { const k = seg(t, d, d + 440); if (t >= d) ringE(e, x, y, (r0 + (r1 - r0) * easeOut(k)) * u, Math.max(1.2, w * u) * (1 - k), OR, 1 - k); }
      sparks(e, t, { seed: 61, t0: 0, x, y, n: 80, speed: 640 * u, life: 480, color: OR, w: Math.max(1.4, 2.2 * u) });
      sparks(e, t, { seed: 62, t0: 60, x, y, n: 26, speed: 300 * u, life: 620, color: '#ffe2b0', a0: 3.6, a1: 5.8, grav: -60 * u, w: Math.max(1.2, 1.6 * u) });
      wave(P, t, 0, x, y, 230 * u, 12 * u, 380);
    }, z);
  }
  // Checkmate (Shadow Possession Jutsu): the board becomes a shogi board and the king lands in the attacker's path.
  // at: attacker, tg: target, from: Shikamaru (optional), all {x, y}; k: board scale (card width / 150). Returns the landing time or 0.
  function shogiPiece(c, x, y, s, a, kan) {
    if (a <= 0 || s <= 0) return; c.save(); c.translate(x, y); c.scale(s, s); c.globalAlpha = clamp(a, 0, 1);
    const g = c.createLinearGradient(0, -74, 0, 70); g.addColorStop(0, '#f1dca6'); g.addColorStop(1, '#c2935a'); c.fillStyle = g; c.strokeStyle = '#3d2710'; c.lineWidth = 3; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(0, -76); c.lineTo(45, -50); c.lineTo(58, 70); c.lineTo(-58, 70); c.lineTo(-45, -50); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#170d05'; c.font = '56px "Yuji Boku", "Zen Kaku Gothic New", serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(kan, 0, 6); c.restore();
  }
  function shogiGrid(b, e, cell, n, t, T1, fade) {
    const reach = easeOut(seg(t, 0, 420)) * (n + .5) * cell; if (reach <= 0 || fade <= 0) return;
    for (const [c, col, lw, al] of [[b, '#000', 3, .5 * fade], [e, RIM, 1.3, .22 * fade]]) {
      c.save(); if (c === e) c.globalCompositeOperation = 'lighter'; c.globalAlpha = al; c.strokeStyle = col; c.lineWidth = lw; c.beginPath();
      for (let i = -n; i <= n + 1; i++) { const d = (i - .5) * cell; if (Math.abs(d) > reach) continue; const h = Math.sqrt(reach * reach - d * d) * .98; c.moveTo(d, -h); c.lineTo(d, h); c.moveTo(-h, d); c.lineTo(h, d); }
      c.stroke(); c.restore();
    }
    e.save(); e.globalCompositeOperation = 'lighter'; e.fillStyle = RIM;
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) { const d = Math.max(Math.abs(i), Math.abs(j)), k = seg(t, T1 + d * 44, T1 + d * 44 + 280); if (k <= 0 || k >= 1) continue; e.globalAlpha = bell(k) * .15 * fade / (1 + d * .25); e.fillRect((i - .5) * cell + 2, (j - .5) * cell + 2, cell - 4, cell - 4); }
    e.restore();
  }
  function checkmate(at, tg, from, k) {
    const mx = (at.x + tg.x) / 2, my = (at.y + tg.y) / 2, T = 300;
    const ok = overlay(1500, [[0, 'whoosh'], [T, 'impact']], (b, e, P, t) => {
      const fade = 1 - seg(t, 1000, 1500), fk = seg(t, 0, T);
      for (const c of [b, e]) { c.translate(mx, my); c.scale(k, k); }
      shogiGrid(b, e, 78, 7, t, T, fade * .9);
      if (from) tendril(b, e, (from.x - mx) / k, (from.y - my) / k, 0, 30, easeOut(fk) * (1 - seg(t, 900, 1200)), { w: 16, taper: .5, amp: 22, freq: 8, t, sp: 170 });
      glow(b, 0, 8, 130 - 50 * easeIn(fk), 'rgba(0,0,0,.6)', .7 * fk * fade);
      shogiPiece(b, 0, t >= T ? 0 : -60 * (1 - easeIn(fk)), t >= T ? 1.25 : 3.4 - 2.15 * easeIn(fk), seg(t, 0, 90) * fade, '玉');
      if (t < T) return;
      const q = seg(t, T, T + 760);
      e.save(); e.globalCompositeOperation = 'lighter'; e.globalAlpha = (1 - q) * .5; e.fillStyle = RIM; e.font = (190 + 90 * easeOut(q)) + 'px "Yuji Boku", "Zen Kaku Gothic New", serif'; e.textAlign = 'center'; e.textBaseline = 'middle'; e.fillText('詰', 0, 0); e.restore();
      wave(P, t, T, mx, my, 640 * k, 44 * k, 620); P.flash = [.9, .86, 1, (1 - seg(t, T, T + 200)) * .14];
      sparks(e, t, { seed: 5, t0: T, x: 0, y: 0, n: 90, speed: 1000, life: 520, color: '#f1dca6', w: 2.2 });
    });
    return ok ? T : 0;
  }

  function stop() { run++; if (cv) cv.style.display = 'none'; }

  NS.FXGL = { summon, has, stop, chakra, checkmate, activate };
})();
