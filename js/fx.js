/* ============================================================
   FX — full-screen canvas particle system + DOM spectacle helpers
   ============================================================ */
(function () {
  const NS = window.NTCG = window.NTCG || {};
  let canvas, ctx, W = 0, H = 0, dpr = 1;
  const parts = [];
  const rings = [];
  const bolts = [];
  let ambient = [];
  let running = false;
  let quality = 1;

  function init() {
    canvas = document.getElementById('fx');
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    for (let i = 0; i < 16; i++) ambient.push(newLeaf(true));
    if (!running) { running = true; requestAnimationFrame(loop); }
  }
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function newLeaf(anywhere) {
    return {
      x: Math.random() * W, y: anywhere ? Math.random() * H : -20,
      vx: 0.2 + Math.random() * 0.6, vy: 0.3 + Math.random() * 0.6,
      rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.04,
      s: 4 + Math.random() * 6, hue: 20 + Math.random() * 20, a: 0.25 + Math.random() * 0.35,
      sway: Math.random() * 6.28,
    };
  }

  function add(p) { if (parts.length < 500 * quality) parts.push(p); }
  // cached radial glow sprites (much cheaper than shadowBlur)
  const spriteCache = new Map();
  function glowSprite(color, soft) {
    const key = color + (soft ? 's' : '');
    let c = spriteCache.get(key);
    if (c) return c;
    c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    if (soft) { g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)'); }
    else { g.addColorStop(0, '#fff'); g.addColorStop(0.18, color); g.addColorStop(0.45, color.length === 7 ? color + '55' : color); g.addColorStop(1, 'rgba(0,0,0,0)'); }
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    spriteCache.set(key, c);
    return c;
  }

  // ---- emitters ------------------------------------------------
  function burst(x, y, opts) {
    opts = opts || {};
    const n = Math.round((opts.count || 40) * quality);
    const colors = opts.colors || ['#ffd23a', '#ff8a1a', '#fff3b0'];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (opts.speed || 6) * (0.3 + Math.random());
      add({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (opts.lift || 0),
        life: 1, decay: 0.012 + Math.random() * 0.02, size: (opts.size || 4) * (0.5 + Math.random()),
        color: colors[i % colors.length], g: opts.gravity ?? 0.12, drag: 0.96, glow: opts.glow !== false,
        shape: opts.shape || 'dot',
      });
    }
  }

  function smoke(x, y, opts) {
    opts = opts || {};
    const n = Math.round((opts.count || 26) * quality);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1 + Math.random() * 3.2;
      add({
        x: x + Math.cos(a) * 10, y: y + Math.sin(a) * 10, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.6,
        life: 1, decay: 0.012 + Math.random() * 0.012, size: 18 + Math.random() * 26, grow: 1.018,
        color: opts.color || '#e8e8f0', g: -0.01, drag: 0.94, shape: 'smoke', glow: false,
      });
    }
  }

  function chakra(x, y, opts) {
    opts = opts || {};
    const col = opts.color || '#4ab8ff';
    const n = Math.round((opts.count || 50) * quality);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = 20 + Math.random() * 60;
      add({
        x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, vx: -Math.sin(a) * 3, vy: Math.cos(a) * 3 - 1.5,
        life: 1, decay: 0.015 + Math.random() * 0.02, size: 3 + Math.random() * 4, color: col, g: -0.05,
        drag: 0.95, glow: true, shape: 'dot', swirl: { cx: x, cy: y, k: 0.06 },
      });
    }
    ring(x, y, { color: col, max: 120 });
  }

  function ring(x, y, opts) {
    opts = opts || {};
    rings.push({ x, y, r: opts.r0 || 8, max: opts.max || 160, w: opts.width || 6, color: opts.color || '#fff', life: 1 });
  }

  function lightning(x1, y1, x2, y2, opts) {
    opts = opts || {};
    const pts = [[x1, y1]];
    const seg = 14;
    for (let i = 1; i < seg; i++) {
      const t = i / seg;
      pts.push([x1 + (x2 - x1) * t + (Math.random() - 0.5) * 40, y1 + (y2 - y1) * t + (Math.random() - 0.5) * 40]);
    }
    pts.push([x2, y2]);
    bolts.push({ pts, life: 1, color: opts.color || '#bfe6ff' });
  }

  function fire(x, y, opts) {
    opts = opts || {};
    const n = Math.round((opts.count || 60) * quality);
    for (let i = 0; i < n; i++) {
      add({
        x: x + (Math.random() - 0.5) * (opts.spread || 60), y: y + (Math.random() - 0.5) * 20,
        vx: (Math.random() - 0.5) * 2, vy: -2 - Math.random() * 4, life: 1, decay: 0.02 + Math.random() * 0.02,
        size: 8 + Math.random() * 12, grow: 0.97, color: ['#fff3a0', '#ffb31a', '#ff5a1a', '#c21a0a'][i % 4], g: -0.04, drag: 0.97, glow: true, shape: 'dot',
      });
    }
  }

  function petals(x, y, opts) {
    opts = opts || {};
    const n = Math.round((opts.count || 30) * quality);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, sp = 3 + Math.random() * 6;
      add({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, decay: 0.008 + Math.random() * 0.008,
        size: 5 + Math.random() * 5, color: opts.color || `hsl(${95 + Math.random() * 40},70%,45%)`, g: 0.06, drag: 0.98,
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, shape: 'leaf', glow: false,
      });
    }
  }

  function shuriken(x1, y1, x2, y2) {
    const steps = 30;
    add({
      x: x1, y: y1, vx: (x2 - x1) / steps, vy: (y2 - y1) / steps, life: 1, decay: 1 / steps, size: 12,
      color: '#cfd6e0', g: 0, drag: 1, rot: 0, vr: 0.6, shape: 'shuriken', glow: false,
      onDie: () => { burst(x2, y2, { count: 18, colors: ['#fff', '#cfd6e0'], speed: 5, size: 2 }); },
    });
  }

  function confetti(opts) {
    opts = opts || {};
    for (let i = 0; i < 160 * quality; i++) {
      add({
        x: Math.random() * W, y: -20 - Math.random() * 200, vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 3,
        life: 1, decay: 0.004, size: 6 + Math.random() * 6, color: (opts.colors || ['#ff8a1a', '#ffd23a', '#4ab8ff', '#ff4a6a', '#6aff8a'])[i % 5],
        g: 0.03, drag: 0.995, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, shape: 'rect', glow: false,
      });
    }
  }

  // ---- main loop ------------------------------------------------
  function loop() {
    requestAnimationFrame(loop);
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);

    const lowfx = document.body.classList.contains('lowfx');
    // ambient embers (the title screen has its own particle layer)
    if (!lowfx && !document.body.classList.contains('on-title')) for (const l of ambient) {
      l.sway += 0.02;
      l.x += l.vx + Math.sin(l.sway) * 0.5; l.y += l.vy; l.rot += l.vr;
      if (l.y > H + 20 || l.x > W + 20) Object.assign(l, newLeaf(false), { x: Math.random() * W * 0.8 - 40 });
      drawLeaf(l.x, l.y, l.s * .8, l.rot, `hsla(${l.hue},70%,55%,${l.a * .5})`);
    }

    // rings
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.r += (r.max - r.r) * 0.12; r.life -= 0.035;
      if (r.life <= 0) { rings.splice(i, 1); continue; }
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = r.color; ctx.globalAlpha = r.life * 0.35; ctx.lineWidth = r.w * r.life * 3;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = r.life; ctx.lineWidth = r.w * r.life; ctx.stroke();
      ctx.restore();
    }

    // lightning
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      b.life -= 0.06;
      if (b.life <= 0) { bolts.splice(i, 1); continue; }
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = b.color;
      ctx.globalAlpha = b.life * 0.4; ctx.lineWidth = 9;
      ctx.beginPath();
      b.pts.forEach((p, j) => { const jx = p[0] + (Math.random() - 0.5) * 6, jy = p[1] + (Math.random() - 0.5) * 6; j ? ctx.lineTo(jx, jy) : ctx.moveTo(jx, jy); });
      ctx.stroke();
      ctx.globalAlpha = b.life; ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.restore();
    }

    // scripted specials
    const now = performance.now(), dt = Math.min(50, now - lastT); lastT = now;
    for (let i = specials.length - 1; i >= 0; i--) {
      const sp = specials[i];
      sp.t += dt / Math.max(0.15, NS.settings ? NS.settings.speedMul() : 1);
      const k = Math.min(1, sp.t / sp.dur);
      ctx.save(); try { sp.draw(ctx, k, sp.t); } catch (e) { /* decorative */ } ctx.restore();
      if (k >= 1) { specials.splice(i, 1); if (sp.onEnd) sp.onEnd(); }
    }
    // particles
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      if (p.swirl) {
        const dx = p.swirl.cx - p.x, dy = p.swirl.cy - p.y;
        p.vx += dx * p.swirl.k * 0.1; p.vy += dy * p.swirl.k * 0.1;
      }
      p.vx *= p.drag; p.vy *= p.drag; p.vy += p.g;
      p.x += p.vx; p.y += p.vy;
      if (p.grow) p.size *= p.grow;
      if (p.vr) p.rot += p.vr;
      p.life -= p.decay;
      if (p.life <= 0) { parts.splice(i, 1); if (p.onDie) p.onDie(); continue; }
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      if (p.shape === 'cloud') {
        ctx.globalAlpha = Math.min(1, p.life * 1.2) * 0.55;
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.drawImage(cloud(p.tint === 'dark'), -p.size, -p.size, p.size * 2, p.size * 2);
      } else if (p.shape === 'streak') {
        ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = p.color; ctx.lineCap = 'round';
        ctx.lineWidth = p.size * (0.5 + p.life); ctx.globalAlpha = Math.min(1, p.life * 1.5);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 2.2, p.y - p.vy * 2.2); ctx.stroke();
      } else if (p.shape === 'smoke') {
        ctx.globalAlpha = p.life * 0.55;
        ctx.drawImage(glowSprite(p.color, true), p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
      } else if (p.shape === 'leaf') {
        drawLeaf(p.x, p.y, p.size, p.rot, p.color);
      } else if (p.shape === 'rect') {
        ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color; ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      } else if (p.shape === 'shuriken') {
        drawShuriken(p.x, p.y, p.size, p.rot);
      } else {
        const r = Math.max(0.5, p.size * (0.4 + p.life * 0.6));
        if (p.glow) { ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(glowSprite(p.color), p.x - r * 3, p.y - r * 3, r * 6, r * 6); }
        else { ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.restore();
    }
  }

  function drawLeaf(x, y, s, rot, color) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-s, 0); ctx.quadraticCurveTo(0, -s * 0.7, s, 0); ctx.quadraticCurveTo(0, s * 0.7, -s, 0);
    ctx.fill();
    ctx.restore();
  }
  function drawShuriken(x, y, s, rot) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot);
    ctx.fillStyle = '#cfd6e0'; ctx.strokeStyle = '#4a5260'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s);
      ctx.lineTo(Math.cos(a + Math.PI / 4) * s * 0.28, Math.sin(a + Math.PI / 4) * s * 0.28);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(0, 0, s * 0.15, 0, 6.28); ctx.fill();
    ctx.restore();
  }

  // ---- DOM spectacle -----------------------------------------------
  function shake(power) {
    const el = document.getElementById('app');
    if (!el) return;
    el.style.setProperty('--shake', (power || 8) + 'px');
    el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
  }

  function flash(color) {
    const f = document.createElement('div');
    f.className = 'screen-flash';
    f.style.background = color || '#fff';
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 600);
  }

  // anime cut-in: slanted banner with portrait & jutsu name
  function cutIn(opts) {
    return new Promise(res => {
      const el = document.createElement('div');
      el.className = 'cutin ' + (opts.side === 'right' ? 'right' : 'left');
      el.style.setProperty('--cut', opts.color || '#ff7a1a');
      el.innerHTML = `
        <div class="cutin-band"><div class="cutin-lines"></div></div>
        <div class="cutin-portrait" style="${opts.artStyle || ''}"></div>
        <div class="cutin-text"><div class="cutin-sub">${opts.sub || ''}</div><div class="cutin-title">${opts.title || opts.name}</div></div>`;
      document.body.appendChild(el);
      NS.Audio && NS.Audio.play('cutin');
      speedLines((opts.hold || 1100) + 200, opts.color);
      setTimeout(() => el.classList.add('out'), (opts.hold || 1100));
      setTimeout(() => { el.remove(); res(); }, (opts.hold || 1100) + 380);
    });
  }

  function banner(text, sub, opts) {
    opts = opts || {};
    return new Promise(res => {
      const el = document.createElement('div');
      el.className = 'phase-banner ' + (opts.cls || '');
      el.innerHTML = `<div class="pb-scroll"><div class="pb-text">${text}</div>${sub ? `<div class="pb-sub">${sub}</div>` : ''}</div>`;
      document.body.appendChild(el);
      setTimeout(() => el.classList.add('out'), opts.hold || 1100);
      setTimeout(() => { el.remove(); res(); }, (opts.hold || 1100) + 450);
    });
  }

  function floatText(x, y, text, color, size) {
    const el = document.createElement('div');
    el.className = 'float-text';
    el.textContent = text;
    el.style.left = x + 'px'; el.style.top = y + 'px';
    el.style.color = color || '#fff';
    if (size) el.style.fontSize = size + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }

  function centerOf(el) {
    if (!el) return { x: W / 2, y: H / 2 };
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  // Themed jutsu effect based on keywords/names in the card
  function jutsuFor(card, el) {
    const c = centerOf(el);
    const text = ((card.name || '') + ' ' + (card.title || '') + ' ' + (card.keywords || []).join(' ') + ' ' + (card.text || '')).toLowerCase();
    if (/fire|katon|fireball|flame|amaterasu/.test(text)) { fire(c.x, c.y + 20); ring(c.x, c.y, { color: '#ff8a1a' }); }
    else if (/lightning|chidori|raikiri|raiton/.test(text)) { for (let i = 0; i < 4; i++) lightning(c.x + (Math.random() - 0.5) * 60, c.y - 160, c.x, c.y); burst(c.x, c.y, { colors: ['#bfe6ff', '#fff', '#6ab8ff'], count: 50 }); }
    else if (/rasengan|wind|fuuton|air/.test(text)) { chakra(c.x, c.y, { color: '#6ac8ff', count: 80 }); }
    else if (/sand|gaara|shukaku/.test(text)) { burst(c.x, c.y, { colors: ['#d8b878', '#b8944a', '#f0dca8'], count: 70, gravity: 0.2, glow: false }); }
    else if (/water|mist|suiton|ice|haku/.test(text)) { burst(c.x, c.y, { colors: ['#9fe0ff', '#4ab8ff', '#e8fbff'], count: 60, speed: 7 }); ring(c.x, c.y, { color: '#9fe0ff' }); }
    else if (/snake|orochimaru|curse|sound/.test(text)) { chakra(c.x, c.y, { color: '#b86aff', count: 60 }); }
    else if (/leaf|konoha|hokage|youth|gate/.test(text)) { petals(c.x, c.y, { count: 40 }); ring(c.x, c.y, { color: '#6aff8a' }); }
    else if (/sharingan|genjutsu|uchiha/.test(text)) { ring(c.x, c.y, { color: '#ff2a2a', max: 200, width: 10 }); burst(c.x, c.y, { colors: ['#ff2a2a', '#1a0000', '#ff8a8a'], count: 40 }); }
    else if (/byakugan|hyuga|gentle|rotation|palm/.test(text)) { ring(c.x, c.y, { color: '#e8e4ff', max: 150 }); ring(c.x, c.y, { color: '#8a8aff', max: 110 }); chakra(c.x, c.y, { color: '#c8c4ff', count: 40 }); }
    else if (/summon|toad|slug|kuchiyose/.test(text)) { smoke(c.x, c.y, { count: 40 }); ring(c.x, c.y, { color: '#ffd23a', max: 220 }); }
    else chakra(c.x, c.y, { color: '#4ab8ff' });
  }



  // ================= PREMIUM VFX =================
  const specials = [];   // scripted effects: { t, dur, draw(ctx, k, t) } — k = progress 0..1
  let lastT = performance.now();
  function special(dur, draw, onEnd) { specials.push({ t: 0, dur, draw, onEnd }); }
  // soft cloud texture for smoke (built once)
  const cloudTex = {};
  function cloud(dark) {
    const key = dark ? 'd' : 'l';
    if (cloudTex[key]) return cloudTex[key];
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    for (let i = 0; i < 14; i++) {
      const px = 34 + Math.random() * 60, py = 34 + Math.random() * 60, r = 18 + Math.random() * 30;
      const g = x.createRadialGradient(px, py, 0, px, py, r);
      const col = dark ? '60,52,48' : '228,226,232';
      g.addColorStop(0, `rgba(${col},.3)`); g.addColorStop(1, `rgba(${col},0)`);
      x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, 6.28); x.fill();
    }
    cloudTex[key] = c; return c;
  }
  // billowing ninja smoke puff (summons / vanish)
  function puff(x, y, opts) {
    opts = opts || {};
    const n = Math.round((opts.count || 14) * quality * 0.8), tint = opts.tint || null;
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 + Math.random() * .3, sp = 2.2 + Math.random() * 2.5;
      add({ x: x + Math.cos(a) * 10, y: y + Math.sin(a) * 6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * .6 - .5, life: 1, decay: .018 + Math.random() * .01, size: 26 + Math.random() * 22, grow: 1.025, rot: Math.random() * 6, vr: (Math.random() - .5) * .04, g: -0.02, drag: .92, shape: 'cloud', tint });
    }
  }
  // velocity-aligned spark streaks
  function sparks(x, y, opts) {
    opts = opts || {};
    const n = Math.round((opts.count || 26) * quality), cols = opts.colors || ['#fff4c0', '#ffb347', '#ff6a2a'];
    for (let i = 0; i < n; i++) {
      const a = (opts.dir != null ? opts.dir + (Math.random() - .5) * (opts.spread || 1.2) : Math.random() * 6.28), sp = (opts.speed || 9) * (.4 + Math.random());
      add({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, decay: .035 + Math.random() * .03, size: 1.5 + Math.random() * 1.5, color: cols[i % cols.length], g: .18, drag: .94, shape: 'streak' });
    }
  }
  // soft gradient shockwave
  function shock(x, y, opts) {
    opts = opts || {};
    const col = opts.color || '255,255,255', max = opts.max || 180, w = opts.width || 26;
    special(opts.dur || 520, (c, k) => {
      const r = 10 + (max - 10) * (1 - Math.pow(1 - k, 3));
      const g = c.createRadialGradient(x, y, Math.max(0, r - w), x, y, r);
      g.addColorStop(0, `rgba(${col},0)`); g.addColorStop(.75, `rgba(${col},${.55 * (1 - k)})`); g.addColorStop(1, `rgba(${col},0)`);
      c.globalCompositeOperation = 'lighter'; c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 6.28); c.fill();
    });
  }
  function glowAt(c, x, y, r, color, a) { c.globalAlpha = a; c.globalCompositeOperation = 'lighter'; c.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2); c.globalAlpha = 1; }
  // brief chromatic split on the stage
  function chroma(ms) {
    const st = document.getElementById('stage'); if (!st || document.body.classList.contains('lowfx')) return;
    st.classList.add('chroma'); setTimeout(() => st.classList.remove('chroma'), ms || 140);
  }
  function whiteout(color) {
    const el = document.createElement('div'); el.className = 'whiteout'; if (color) el.style.background = color;
    document.body.appendChild(el); setTimeout(() => el.remove(), 900);
  }
  // ---------- signature jutsu ----------
  function rasengan(x, y, dur) {
    dur = dur || 1100;
    special(dur, (c, k, t) => {
      const grow = Math.min(1, k * 3), R = 46 * grow * (1 + Math.sin(t / 60) * .05);
      glowAt(c, x, y, R * 3.2, '#3aa0ff', .55);
      glowAt(c, x, y, R * 1.6, '#bfe8ff', .9);
      c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        c.strokeStyle = `rgba(${170 + i * 15},${225 + i * 5},255,${.7 - i * .1})`; c.lineWidth = 3 - i * .4;
        c.beginPath(); c.ellipse(x, y, R * (1 - i * .12), R * (.45 + i * .1), t / (90 - i * 12) + i, 0, Math.PI * 1.4); c.stroke();
      }
      if (Math.random() < .6) add({ x: x + (Math.random() - .5) * R * 2, y: y + (Math.random() - .5) * R * 2, vx: 0, vy: 0, life: 1, decay: .06, size: 2 + Math.random() * 2, color: '#bfe8ff', g: 0, drag: 1, glow: true, swirl: { cx: x, cy: y, k: .5 } });
    }, () => { shock(x, y, { color: '140,210,255', max: 260 }); sparks(x, y, { colors: ['#fff', '#bfe8ff', '#3aa0ff'], count: 60, speed: 12 }); });
  }
  function boltPath(x1, y1, x2, y2, disp) {
    const pts = [[x1, y1], [x2, y2]];
    let d = disp;
    for (let it = 0; it < 5; it++) {
      for (let i = pts.length - 1; i > 0; i--) {
        const a = pts[i - 1], b = pts[i];
        pts.splice(i, 0, [(a[0] + b[0]) / 2 + (Math.random() - .5) * d, (a[1] + b[1]) / 2 + (Math.random() - .5) * d]);
      }
      d *= .55;
    }
    return pts;
  }
  function strokePath(c, pts, w, col, a) { c.globalAlpha = a; c.strokeStyle = col; c.lineWidth = w; c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.stroke(); }
  function chidori(x1, y1, x2, y2, dur) {
    dur = dur || 800;
    let pts = null, branches = [], next = 0;
    special(dur, (c, k, t) => {
      if (t > next) {
        next = t + 45;
        pts = boltPath(x1, y1, x2, y2, Math.hypot(x2 - x1, y2 - y1) * .35);
        branches = [];
        for (let b = 0; b < 3; b++) { const p = pts[5 + Math.floor(Math.random() * (pts.length - 10))]; branches.push(boltPath(p[0], p[1], p[0] + (Math.random() - .5) * 160, p[1] + (Math.random() - .5) * 160, 50)); }
      }
      c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'; c.lineJoin = 'round';
      const f = .6 + Math.random() * .4;
      strokePath(c, pts, 14, '#2a7fff', .25 * f); strokePath(c, pts, 6, '#8fd0ff', .7 * f); strokePath(c, pts, 2, '#ffffff', f);
      branches.forEach(b => { strokePath(c, b, 4, '#8fd0ff', .5 * f); strokePath(c, b, 1.2, '#fff', .8 * f); });
      c.globalAlpha = 1;
      glowAt(c, x1, y1, 70, '#8fd0ff', .8 * f); glowAt(c, x2, y2, 90, '#bfe8ff', .9 * f);
    }, () => { sparks(x2, y2, { colors: ['#fff', '#8fd0ff'], count: 50, speed: 13 }); shock(x2, y2, { color: '150,210,255', max: 200 }); });
  }
  function fireball(x1, y1, x2, y2, dur) {
    dur = dur || 650;
    special(dur, (c, k) => {
      const e = k * k * (3 - 2 * k), x = x1 + (x2 - x1) * e, y = y1 + (y2 - y1) * e - Math.sin(k * Math.PI) * 60;
      glowAt(c, x, y, 90, '#ff7a1a', .8); glowAt(c, x, y, 40, '#fff1b0', 1);
      for (let i = 0; i < 3; i++) add({ x: x + (Math.random() - .5) * 20, y: y + (Math.random() - .5) * 20, vx: (Math.random() - .5) * 2, vy: -1 - Math.random() * 2, life: 1, decay: .04, size: 10 + Math.random() * 10, grow: .96, color: ['#fff3a0', '#ffb31a', '#ff5a1a'][i], g: -.05, drag: .96, glow: true });
    }, () => { fire(x2, y2, { count: 70, spread: 90 }); puff(x2, y2, { count: 12, tint: 'dark' }); shock(x2, y2, { color: '255,150,60', max: 230 }); sparks(x2, y2, { count: 40 }); chroma(); });
  }
  // dark ink blob sprite for shadows
  let inkTex = null;
  function ink() {
    if (inkTex) return inkTex;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(6,2,14,.95)'); g.addColorStop(.55, 'rgba(10,4,22,.75)'); g.addColorStop(1, 'rgba(10,4,22,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    inkTex = c; return c;
  }
  // Shadow Possession: an ink shadow crawls across the floor, branches, then coils around the target
  function shadowBind(x1, y1, x2, y2, dur) {
    dur = dur || 1500;
    whiteout('rgba(10,2,24,.45)');
    const mx = (x1 + x2) / 2 + (y2 - y1) * .18, my = (y1 + y2) / 2 - (x2 - x1) * .18;
    const bez = (t, ox, oy) => { const u = 1 - t; return [u * u * x1 + 2 * u * t * (mx + (ox || 0)) + t * t * x2, u * u * y1 + 2 * u * t * (my + (oy || 0)) + t * t * y2]; };
    const tendrils = [{ ox: 0, oy: 0, w: 1 }, { ox: 70, oy: -40, w: .45 }, { ox: -80, oy: 50, w: .4 }, { ox: 30, oy: 90, w: .3 }];
    const seed = Math.random() * 100;
    special(dur, (c, k, t) => {
      const reach = Math.min(1, k / .55);            // crawl phase
      const bind = Math.max(0, (k - .45) / .55);     // coil phase
      const fade = k > .85 ? (1 - k) / .15 : 1;
      c.globalCompositeOperation = 'source-over';
      tendrils.forEach((td, ti) => {
        const len = reach * (ti ? .92 : 1), steps = Math.floor(110 * len);
        for (let i = 0; i <= steps; i++) {
          const q = i / 110, [px, py] = bez(q, td.ox * Math.sin(q * 3.14), td.oy * Math.sin(q * 3.14));
          const wob = Math.sin(q * 22 + t / 70 + seed + ti) * 5 + Math.sin(q * 9 - t / 110) * 3;
          const r = (14 + 10 * Math.sin(q * 3.14)) * td.w * (1 + .25 * Math.sin(t / 90 + q * 12));
          c.globalAlpha = .9 * fade;
          c.drawImage(ink(), px - r * 1.6 + wob, py - r * 1.6 - wob * .5, r * 3.2, r * 3.2);
        }
        // purple rim light at the crawling tip
        if (reach < 1 || ti === 0) { const [tx, ty] = bez(len, td.ox * Math.sin(len * 3.14), td.oy * Math.sin(len * 3.14)); glowAt(c, tx, ty, 26 * td.w + 10, '#7a3cff', .55 * fade); }
      });
      // coiling ring that tightens around the target
      if (bind > 0) {
        const R = 95 - 40 * Math.min(1, bind * 1.4);
        for (let arm = 0; arm < 3; arm++) {
          for (let i = 0; i < 40; i++) {
            const a = arm * 2.094 + i / 40 * 4.6 * Math.min(1, bind * 1.6) + t / 260;
            const rr = R * (1 - i / 40 * .25);
            const px = x2 + Math.cos(a) * rr, py = y2 + Math.sin(a) * rr * .72;
            const r = 9 * (1 - i / 48);
            c.globalAlpha = .85 * fade;
            c.drawImage(ink(), px - r * 1.6, py - r * 1.6, r * 3.2, r * 3.2);
          }
        }
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = .5 * fade; c.strokeStyle = '#8a4cff'; c.lineWidth = 2;
        c.beginPath(); c.ellipse(x2, y2, R + 6, (R + 6) * .72, 0, 0, 6.28); c.stroke();
      }
    }, () => { shock(x2, y2, { color: '120,60,220', max: 170 }); sparks(x2, y2, { colors: ['#b48cff', '#5a2aa8', '#fff'], count: 26, speed: 7 }); });
  }
  function serpents(x1, y1, x2, y2, dur) {
    dur = dur || 800;
    special(dur, (c, k, t) => {
      c.globalCompositeOperation = 'lighter';
      for (let s = 0; s < 2; s++) for (let i = 0; i < 18; i++) {
        const q = Math.max(0, Math.min(1, k * 1.3 - i * .02)), x = x1 + (x2 - x1) * q, y = y1 + (y2 - y1) * q;
        const nx = -(y2 - y1), ny = x2 - x1, L = Math.hypot(nx, ny) || 1, w = Math.sin(q * 14 + t / 80 + s * 3) * 26 * (s ? -1 : 1);
        glowAt(c, x + nx / L * w, y + ny / L * w, 14 - i * .5, '#b86aff', .8 - i * .03);
      }
    }, () => { sparks(x2, y2, { colors: ['#e0b0ff', '#b86aff'], count: 36 }); shock(x2, y2, { color: '184,106,255', max: 170 }); });
  }
  function heal(x, y) {
    for (let i = 0; i < 40 * quality; i++) add({ x: x + (Math.random() - .5) * 90, y: y + 30 + Math.random() * 40, vx: (Math.random() - .5) * .6, vy: -1.5 - Math.random() * 2.5, life: 1, decay: .015 + Math.random() * .01, size: 2 + Math.random() * 3, color: ['#b6ffcf', '#4ade80', '#fff'][i % 3], g: -.01, drag: .99, glow: true });
    shock(x, y, { color: '90,255,150', max: 150 });
  }
  function sharingan(x, y, dur) {
    dur = dur || 900;
    special(dur, (c, k, t) => {
      const R = 70 * Math.min(1, k * 3), rot = t / 90;
      glowAt(c, x, y, R * 2.4, '#ff2a2a', .5 * (1 - k * .5));
      c.globalCompositeOperation = 'source-over';
      c.fillStyle = 'rgba(200,10,20,.85)'; c.beginPath(); c.arc(x, y, R, 0, 6.28); c.fill();
      c.strokeStyle = 'rgba(20,0,0,.9)'; c.lineWidth = 4; c.beginPath(); c.arc(x, y, R * .62, 0, 6.28); c.stroke();
      c.fillStyle = '#100'; c.beginPath(); c.arc(x, y, R * .2, 0, 6.28); c.fill();
      for (let i = 0; i < 3; i++) {
        const a = rot + i * 2.094, px = x + Math.cos(a) * R * .62, py = y + Math.sin(a) * R * .62;
        c.beginPath(); c.arc(px, py, R * .13, 0, 6.28); c.fill();
        c.beginPath(); c.moveTo(px, py); c.quadraticCurveTo(px + Math.cos(a + 1.2) * R * .3, py + Math.sin(a + 1.2) * R * .3, px + Math.cos(a + 1.9) * R * .28, py + Math.sin(a + 1.9) * R * .28); c.lineWidth = R * .07; c.strokeStyle = '#100'; c.stroke();
      }
    }, () => { shock(x, y, { color: '255,40,40', max: 190 }); sparks(x, y, { colors: ['#ff4a4a', '#fff'], count: 30 }); });
  }
  function airPalm(x1, y1, x2, y2) {
    for (let i = 0; i < 4; i++) setTimeout(() => {
      const k = i / 3, x = x1 + (x2 - x1) * k, y = y1 + (y2 - y1) * k;
      shock(x, y, { color: '220,210,255', max: 60 + i * 30, width: 14, dur: 380 });
    }, i * 70);
    setTimeout(() => sparks(x2, y2, { colors: ['#fff', '#d8d0ff'], count: 40, dir: Math.atan2(y2 - y1, x2 - x1), spread: 1.4, speed: 12 }), 260);
  }
  function crater(x, y) {
    shock(x, y, { color: '255,120,200', max: 240, width: 34 }); shock(x, y, { color: '255,255,255', max: 140, dur: 300 });
    for (let i = 0; i < 26 * quality; i++) { const a = Math.random() * 6.28, sp = 4 + Math.random() * 8; add({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 4, life: 1, decay: .02, size: 3 + Math.random() * 5, color: ['#6b5a4a', '#8a7a66', '#4a3a2a'][i % 3], g: .35, drag: .97, rot: Math.random() * 6, vr: .2, shape: 'rect' }); }
    puff(x, y, { count: 10, tint: 'dark' }); chroma(180);
  }
  function splash(x, y) {
    for (let i = 0; i < 50 * quality; i++) { const a = -Math.PI / 2 + (Math.random() - .5) * 2.6, sp = 4 + Math.random() * 8; add({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, decay: .02 + Math.random() * .015, size: 2 + Math.random() * 3, color: ['#e8fbff', '#8fd8ff', '#3aa0ff'][i % 3], g: .3, drag: .98, glow: true }); }
    shock(x, y, { color: '120,200,255', max: 160 });
  }
  function expand(x, y) {
    special(700, (c, k) => { const r = 30 + k * 150; glowAt(c, x, y, r * 1.4, '#ff9a2a', .6 * (1 - k)); }, () => sparks(x, y, { count: 30 }));
    shock(x, y, { color: '255,160,60', max: 200, width: 40, dur: 700 });
  }
  // map a Support card to its signature effect
  function jutsuFX(cardId, from, to) {
    const a = from, b = to || from;
    switch (cardId) {
      case 'N-004': rasengan(a.x, a.y - 20, 1100); setTimeout(() => { whiteout('rgba(170,220,255,.9)'); chroma(220); }, 1000 * (NS.settings ? NS.settings.speedMul() : 1)); return 1200;
      case 'N-015': chidori(a.x, a.y, b.x, b.y, 800); setTimeout(() => { whiteout('rgba(200,230,255,.9)'); chroma(220); }, 700 * (NS.settings ? NS.settings.speedMul() : 1)); return 900;
      case 'N-006': fireball(a.x, a.y, b.x, b.y); return 700;
      case 'N-017': serpents(a.x, a.y, b.x, b.y); return 800;
      case 'N-008': shadowBind(a.x, a.y, b.x, b.y, 1500); return 1350;
      case 'N-010': heal(a.x, a.y); return 500;
      case 'N-009': sharingan(a.x, a.y, 700); chidori(a.x - 60, a.y - 120, a.x, a.y, 450); return 750;
      case 'N-016': sharingan(a.x, a.y, 900); return 900;
      case 'N-018': airPalm(a.x, a.y, b.x, b.y); return 500;
      case 'N-020': crater(b.x, b.y); return 450;
      case 'N-002': expand(b.x, b.y); return 600;
      case 'N-021': splash(a.x, a.y); return 400;
    }
    shock(a.x, a.y, { color: '255,170,80' }); return 300;
  }


  // ================= Summoning Jutsu seal (Kuchiyose-style ink formula) =================
  const SCRIPT = '口寄之術封印契約忍血臨兵闘者皆陣列在前火風水雷土影';
  function emblemFor(traits) {
    const t = traits || [];
    if (t.includes('Uchiha Clan')) return { kind: 'uchiha', glow: '#ff3a3a' };
    if (t.includes('Toad') || t.includes('Mount Myoboku')) return { kind: 'kanji', ch: '蝦', glow: '#ff9a2a' };
    if (t.includes('Snake')) return { kind: 'kanji', ch: '蛇', glow: '#b86aff' };
    if (t.includes('The Taka')) return { kind: 'kanji', ch: '鷹', glow: '#3fb3e0' };
    if (t.includes('Hidden Sound Village')) return { kind: 'kanji', ch: '音', glow: '#b86aff' };
    if (t.includes('Hyuga Clan')) return { kind: 'kanji', ch: '日向', glow: '#c8c4ff' };
    if (t.includes('Hidden Leaf Village')) return { kind: 'leaf', glow: '#ffb347' };
    return { kind: 'kanji', ch: '忍', glow: '#ffb347' };
  }
  function drawLeafSymbol(c, x, y, r) {
    c.beginPath();
    // spiral
    for (let a = 0; a < Math.PI * 3.2; a += .12) { const rr = r * .12 + a / (Math.PI * 3.2) * r * .55; const px = x + Math.cos(a + 1.2) * rr, py = y + Math.sin(a + 1.2) * rr; a ? c.lineTo(px, py) : c.moveTo(px, py); }
    c.stroke();
    // leaf tip
    c.beginPath(); c.moveTo(x + r * .55, y - r * .15); c.lineTo(x + r * .95, y - r * .75); c.lineTo(x + r * .2, y - r * .6); c.stroke();
  }
  function drawUchiha(c, x, y, r) {
    c.fillStyle = 'rgba(200,20,30,.95)'; c.beginPath(); c.arc(x, y - r * .1, r * .55, Math.PI, 0); c.fill();
    c.fillStyle = 'rgba(245,240,235,.95)'; c.beginPath(); c.arc(x, y - r * .1, r * .55, 0, Math.PI); c.fill();
    c.fillStyle = 'rgba(30,20,20,.95)'; c.fillRect(x - r * .08, y + r * .42, r * .16, r * .5);
    c.strokeStyle = 'rgba(20,10,10,.9)'; c.lineWidth = 2; c.beginPath(); c.arc(x, y - r * .1, r * .55, 0, 6.28); c.stroke();
  }
  function summonSeal(x, y, opts) {
    opts = opts || {};
    const em = emblemFor(opts.traits), glow = opts.gold ? '#ffd23a' : em.glow;
    const lines = Array.from({ length: 10 }, (_, i) => ({ a: i / 10 * 6.283 + (Math.random() - .5) * .25, len: 140 + Math.random() * 90, chars: Array.from({ length: 5 }, () => SCRIPT[Math.floor(Math.random() * SCRIPT.length)]) }));
    const dur = opts.gold ? 1500 : 1200;
    special(dur, (c, k, t) => {
      const spread = Math.min(1, k / .35), fade = k > .7 ? (1 - k) / .3 : 1;
      c.save(); c.translate(x, y); c.scale(1, .42); // lay the seal flat on the floor
      c.globalCompositeOperation = 'source-over';
      // glow underneath
      c.globalAlpha = .55 * fade; c.drawImage(glowSprite(glow), -170, -170, 340, 340);
      // outer rings
      c.strokeStyle = `rgba(12,8,6,${.85 * fade})`; c.lineWidth = 5;
      c.beginPath(); c.arc(0, 0, 118 * spread, 0, 6.28); c.stroke();
      c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 100 * spread, 0, 6.28); c.stroke();
      // rotating ring of script
      c.fillStyle = `rgba(12,8,6,${.9 * fade})`; c.font = '900 15px "Zen Kaku Gothic New", "Yu Gothic", serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      for (let i = 0; i < 16; i++) { const a = i / 16 * 6.283 + t / 900; c.save(); c.translate(Math.cos(a) * 109 * spread, Math.sin(a) * 109 * spread); c.rotate(a + 1.571); c.fillText(SCRIPT[i % SCRIPT.length], 0, 0); c.restore(); }
      // radiating formula lines with kanji along them
      lines.forEach(L => {
        const len = L.len * spread;
        c.strokeStyle = `rgba(12,8,6,${.85 * fade})`; c.lineWidth = 3;
        c.beginPath(); c.moveTo(Math.cos(L.a) * 40, Math.sin(L.a) * 40); c.lineTo(Math.cos(L.a) * len, Math.sin(L.a) * len); c.stroke();
        L.chars.forEach((ch, j) => {
          const d = 130 + j * 22; if (d > len) return;
          c.save(); c.translate(Math.cos(L.a) * d, Math.sin(L.a) * d); c.rotate(L.a + 1.571); c.font = '900 13px "Zen Kaku Gothic New", "Yu Gothic", serif'; c.fillText(ch, 0, 0); c.restore();
        });
      });
      c.restore();
      // emblem stands upright over the seal
      const er = 34 * Math.min(1, k / .25) * (1 + Math.sin(t / 120) * .03);
      c.save(); c.globalAlpha = fade;
      glowAt(c, x, y, er * 2.6, glow, .6 * fade);
      c.globalAlpha = fade;
      if (em.kind === 'uchiha') drawUchiha(c, x, y, er);
      else if (em.kind === 'leaf') { c.strokeStyle = 'rgba(14,10,8,.95)'; c.lineWidth = 5; c.lineCap = 'round'; drawLeafSymbol(c, x, y, er * 1.3); c.strokeStyle = glow; c.lineWidth = 1.5; drawLeafSymbol(c, x, y, er * 1.3); }
      else { c.font = `900 ${Math.round(er * (em.ch.length > 1 ? 0.95 : 1.5))}px "Zen Kaku Gothic New", "Yu Gothic", serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 5; c.strokeStyle = 'rgba(10,8,6,.95)'; c.strokeText(em.ch, x, y); c.fillStyle = glow; c.fillText(em.ch, x, y); }
      c.restore();
    });
    // the classic "poof" once the seal is drawn
    setTimeout(() => { puff(x, y - 30, { count: opts.gold ? 26 : 18 }); shock(x, y - 20, { color: opts.gold ? '255,210,60' : '255,255,255', max: opts.gold ? 220 : 150 }); }, dur * .3 * (NS.settings ? NS.settings.speedMul() : 1));
  }

  // ================= AAA spectacle helpers =================
  const Sx = () => (NS.settings ? NS.settings.speedMul() : 1);
  // anime speed lines overlay
  function speedLines(ms, color) {
    const el = document.createElement('div');
    el.className = 'speedlines';
    if (color) el.style.setProperty('--sl', color);
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('out'), (ms || 600) * Sx());
    setTimeout(() => el.remove(), (ms || 600) * Sx() + 300);
  }
  // one-frame manga "impact frame": inverted flash + radial burst lines, then hit-stop
  function impactFrame(x, y, strong) {
    const el = document.createElement('div');
    el.className = 'impact-frame' + (strong ? ' strong' : '');
    el.style.setProperty('--x', x + 'px'); el.style.setProperty('--y', y + 'px');
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 260);
    const app = document.getElementById('app');
    app.classList.add('hitstop');
    return new Promise(r => setTimeout(() => { app.classList.remove('hitstop'); r(); }, (strong ? 140 : 90)));
  }
  // camera punch toward a point
  function punch(x, y, amt) {
    const st = document.getElementById('stage');
    if (!st || !st.animate) return;
    const base = st.style.transform || '';
    const r = st.getBoundingClientRect();
    const ox = ((x - r.left) / r.width * 100).toFixed(1), oy = ((y - r.top) / r.height * 100).toFixed(1);
    st.style.transformOrigin = `${ox}% ${oy}%`;
    st.animate([{ transform: base }, { transform: base + ` scale(${1 + (amt || 0.04)})` }, { transform: base }], { duration: 380 * Sx(), easing: 'cubic-bezier(.2,.9,.3,1)' }).finished.then(() => { st.style.transformOrigin = '50% 50%'; }).catch(() => { });
  }
  // shatter an element into shards
  function shatter(el) {
    if (!el) return;
    const r = el.getBoundingClientRect();
    const html = el.innerHTML;
    const N = 9;
    for (let i = 0; i < N; i++) {
      const sh = document.createElement('div');
      sh.className = 'shard';
      sh.innerHTML = html;
      sh.style.left = r.left + 'px'; sh.style.top = r.top + 'px'; sh.style.width = r.width + 'px'; sh.style.height = r.height + 'px';
      const cx = (i % 3) / 3 * 100, cy = Math.floor(i / 3) / 3 * 100;
      const j = () => (Math.random() * 12 - 6);
      sh.style.clipPath = `polygon(${cx + j()}% ${cy + j()}%, ${cx + 33 + j()}% ${cy + j()}%, ${cx + 33 + j()}% ${cy + 33 + j()}%, ${cx + j()}% ${cy + 33 + j()}%)`;
      document.body.appendChild(sh);
      const dx = (cx - 33) * 3 + (Math.random() - .5) * 80, dy = (cy - 33) * 2 + Math.random() * 120 + 40;
      sh.animate([{ transform: 'translate(0,0) rotate(0)', opacity: 1, filter: 'brightness(2)' }, { transform: `translate(${dx}px, ${dy}px) rotate(${(Math.random() - .5) * 140}deg) scale(.8)`, opacity: 0, filter: 'brightness(.6)' }], { duration: 750 * Sx(), easing: 'cubic-bezier(.2,.6,.4,1)', fill: 'forwards' });
      setTimeout(() => sh.remove(), 800 * Sx());
    }
  }
  // rotating summoning seal under a point
  function seal(x, y, opts) {
    opts = opts || {};
    const el = document.createElement('div');
    el.className = 'seal' + (opts.gold ? ' gold' : '');
    el.style.left = x + 'px'; el.style.top = y + 'px';
    el.innerHTML = `<svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="92" fill="none" stroke-width="3"/><circle cx="100" cy="100" r="78" fill="none" stroke-width="1.5" stroke-dasharray="6 5"/><circle cx="100" cy="100" r="40" fill="none" stroke-width="2.5"/>${'臨兵闘者皆陣列在前'.split('').map((k, i) => { const a = i / 9 * Math.PI * 2; return `<text x="${100 + Math.cos(a) * 62}" y="${100 + Math.sin(a) * 62 + 6}" text-anchor="middle" font-size="16" font-weight="900">${k}</text>`; }).join('')}<path d="M100 60 L100 140 M60 100 L140 100" stroke-width="2"/></svg>`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1300 * Sx());
  }
  // vertical pillar of light (EX summon)
  function pillar(x, y, color) {
    const el = document.createElement('div');
    el.className = 'pillar';
    el.style.left = x + 'px'; el.style.top = y + 'px';
    if (color) el.style.setProperty('--pc', color);
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1100 * Sx());
  }
  // chakra stream from a to b
  function stream(a, b, color) {
    const n = 22;
    for (let i = 0; i < n; i++) {
      setTimeout(() => {
        const t0 = { x: a.x + (Math.random() - .5) * 20, y: a.y + (Math.random() - .5) * 20 };
        add({ x: t0.x, y: t0.y, vx: (b.x - t0.x) / 26 + (Math.random() - .5) * 2, vy: (b.y - t0.y) / 26 + (Math.random() - .5) * 2, life: 1, decay: 0.038, size: 4 + Math.random() * 3, color: color || '#ffb347', g: 0, drag: 1, glow: true, shape: 'dot' });
      }, i * 12);
    }
  }
  // big damage number with pop
  function damage(x, y, n, color, isHeal) {
    const el = document.createElement('div');
    el.className = 'dmg-num' + (isHeal ? ' heal' : '');
    el.style.left = x + 'px'; el.style.top = y + 'px';
    el.style.color = color || '#ff4a3a';
    el.textContent = n;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1300);
  }
  // slash streak across a line
  function slashLine(x1, y1, x2, y2, color) {
    const el = document.createElement('div');
    el.className = 'slash';
    const len = Math.hypot(x2 - x1, y2 - y1), ang = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
    el.style.left = x1 + 'px'; el.style.top = y1 + 'px'; el.style.width = len + 'px';
    el.style.transform = `rotate(${ang}deg)`;
    if (color) el.style.setProperty('--sc', color);
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 400);
  }
  NS.FX = { summonSeal, puff, sparks, shock, chroma, whiteout, rasengan, chidori, fireball, shadowBind, serpents, heal, sharingan, jutsuFX, glowSprite, speedLines, impactFrame, punch, shatter, seal, pillar, stream, damage, slashLine, init, burst, smoke, chakra, ring, lightning, fire, petals, shuriken, confetti, shake, flash, cutIn, banner, floatText, centerOf, jutsuFor, setQuality: q => quality = q };
})();
