// Forward passes of the networks trained by train.py, for playing inside the JS search (az.js calls
// net.forward(s, acts, keep, g, pi, D)). Same maths as train.py's MLP (mlp / units) and TF.
const fs = require('fs');
module.exports = NS => {
  const TK = require('./tokens.js')(NS);
  const { T, F, SLOTS, NC } = TK;
  const softmax = l => { let m = -Infinity; for (const x of l) if (x > m) m = x; const e = l.map(x => Math.exp(x - m)); const t = e.reduce((a, b) => a + b, 0); return e.map(x => x / t); };
  // y = W x + b with torch's [out][in] layout; skips zero inputs (most features are one-hot)
  const lin = (P, name, x, relu) => {
    const W = P[name + '.weight'], b = P[name + '.bias'], O = b.length, I = x.length, y = Float32Array.from(b);
    for (let i = 0; i < I; i++) { const xi = x[i]; if (xi === 0) continue; for (let o = 0; o < O; o++) y[o] += xi * W[o * I + i]; }
    if (relu) for (let o = 0; o < O; o++) if (y[o] < 0) y[o] = 0;
    return y;
  };
  // faster when W is pre-transposed to [in][out] (done once at load)
  const linT = (P, name, x, relu) => {
    const W = P[name + '.wT'], b = P[name + '.bias'], O = b.length, I = x.length, y = Float32Array.from(b);
    for (let i = 0; i < I; i++) { const xi = x[i]; if (xi === 0) continue; const r = i * O; for (let o = 0; o < O; o++) y[o] += xi * W[r + o]; }
    if (relu) for (let o = 0; o < O; o++) if (y[o] < 0) y[o] = 0;
    return y;
  };
  const cat = (...xs) => { const n = xs.reduce((t, x) => t + x.length, 0), o = new Float32Array(n); let k = 0; for (const x of xs) { o.set(x, k); k += x.length; } return o; };
  const layerNorm = (P, name, x) => {
    const g = P[name + '.weight'], b = P[name + '.bias'], n = x.length;
    let m = 0; for (const v of x) m += v; m /= n;
    let s = 0; for (const v of x) s += (v - m) * (v - m); s = 1 / Math.sqrt(s / n + 1e-5);
    const y = new Float32Array(n); for (let i = 0; i < n; i++) y[i] = (x[i] - m) * s * g[i] + b[i];
    return y;
  };

  function load(path) {
    const j = JSON.parse(fs.readFileSync(path, 'utf8')), P = {};
    for (const k in j.p) { const b = Buffer.from(j.p[k].b64, 'base64'); P[k] = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); P[k].shape = j.p[k].shape; }
    for (const k in P) if (k.endsWith('.weight') && P[k].shape.length === 2) { // transpose Linear weights for linT
      const [O, I] = P[k].shape, W = P[k], WT = new Float32Array(I * O);
      for (let o = 0; o < O; o++) for (let i = 0; i < I; i++) WT[i * O + o] = W[o * I + i];
      P[k.replace('.weight', '.wT')] = WT;
    }
    const cfg = j.cfg, U = F + NC + 1;
    const slot = (tok, card, i) => { const u = new Float32Array(U); u.set(tok.subarray(i * F, (i + 1) * F)); u[F + card[i]] = 1; return u; };

    function mlp(s, acts, keep, g, pi, D) {
      let x = s, extra = null;
      if (cfg.kind === 'units') {
        extra = TK.tokens(g, pi, D);
        const slots = []; for (let i = 0; i < SLOTS; i++) slots.push(slot(extra.tok, extra.card, i));
        x = cat(s, ...slots);
      }
      const h = linT(P, 'W2', linT(P, 'W1', x, true), true);
      const v = Math.tanh(linT(P, 'Wv2', linT(P, 'Wv1', h, true), false)[0]);
      const ph = linT(P, 'Wph', h, false), zero = new Float32Array(U);
      const logits = acts.map((a, k) => {
        if (extra) { const [p0, p1] = extra.ptr[k]; a = cat(a, p0 >= 0 ? slot(extra.tok, extra.card, p0) : zero, p1 >= 0 ? slot(extra.tok, extra.card, p1) : zero); }
        const z = linT(P, 'Wpa', a, false);
        for (let o = 0; o < z.length; o++) { z[o] += ph[o]; if (z[o] < 0) z[o] = 0; }
        return linT(P, 'Wp2', z, false)[0];
      });
      return { v, logits, priors: softmax(logits) };
    }

    function tf(s, acts, keep, g, pi, D) {
      const d = cfg.d, H = cfg.heads, dh = d / H, { tok, card, ptr } = TK.tokens(g, pi, D);
      // the summary token, then every live token (one that has a type); pos maps token index -> sequence row
      const seq = [linT(P, 'glob', s, false)], pos = new Int32Array(T).fill(-1), E = P['card.weight'];
      for (let t = 0; t < T; t++) {
        let live = false; for (let q = 0; q < 6; q++) if (tok[t * F + q]) live = true;
        if (!live) continue;
        pos[t] = seq.length;
        seq.push(linT(P, 'tok', cat(tok.subarray(t * F, (t + 1) * F), E.subarray(card[t] * 16, card[t] * 16 + 16)), false));
      }
      let x = seq; const L = x.length;
      for (let l = 0; l < cfg.layers; l++) {
        const pre = `enc.layers.${l}.`;
        const n1 = x.map(r => layerNorm(P, pre + 'norm1', r));
        const qkv = n1.map(r => linT(P, pre + 'self_attn.in_proj', r, false)); // [q | k | v]
        const att = x.map(() => new Float32Array(d)), sc = new Float32Array(L), sq = 1 / Math.sqrt(dh);
        for (let h = 0; h < H; h++) for (let i = 0; i < L; i++) {
          let m = -Infinity;
          for (let j2 = 0; j2 < L; j2++) { let t = 0; for (let c = 0; c < dh; c++) t += qkv[i][h * dh + c] * qkv[j2][d + h * dh + c]; sc[j2] = t * sq; if (sc[j2] > m) m = sc[j2]; }
          let tot = 0; for (let j2 = 0; j2 < L; j2++) { sc[j2] = Math.exp(sc[j2] - m); tot += sc[j2]; }
          for (let j2 = 0; j2 < L; j2++) { const w = sc[j2] / tot; for (let c = 0; c < dh; c++) att[i][h * dh + c] += w * qkv[j2][2 * d + h * dh + c]; }
        }
        x = x.map((r, i) => { const o = linT(P, pre + 'self_attn.out_proj', att[i], false); for (let c = 0; c < d; c++) o[c] += r[c]; return o; });
        x = x.map(r => { const f = linT(P, pre + 'linear2', linT(P, pre + 'linear1', layerNorm(P, pre + 'norm2', r), true), false); for (let c = 0; c < d; c++) f[c] += r[c]; return f; });
      }
      x = x.map(r => layerNorm(P, 'norm', r));
      const g0 = x[0], zero = new Float32Array(d);
      const v = Math.tanh(linT(P, 'v.2', linT(P, 'v.0', g0, true), false)[0]);
      const at = t => (t >= 0 && pos[t] >= 0 ? x[pos[t]] : zero);
      const logits = acts.map((a, k) => linT(P, 'p.2', linT(P, 'p.0', cat(linT(P, 'act', a, false), at(ptr[k][0]), at(ptr[k][1]), g0), true), false)[0]);
      return { v, logits, priors: softmax(logits) };
    }
    // torch names the attention input projection in_proj_weight / in_proj_bias
    for (let l = 0; l < (cfg.layers || 0); l++) {
      const pre = `enc.layers.${l}.self_attn.`;
      const W = P[pre + 'in_proj_weight'], [O, I] = P[pre + 'in_proj_weight'].shape, WT = new Float32Array(I * O);
      for (let o = 0; o < O; o++) for (let i = 0; i < I; i++) WT[i * O + o] = W[o * I + i];
      P[pre + 'in_proj.wT'] = WT; P[pre + 'in_proj.bias'] = P[pre + 'in_proj_bias'];
    }
    return { name: j.name, cfg, forward: cfg.kind === 'tf' ? tf : mlp };
  }
  return { load };
};
