/* ============================================================
   AUDIO — original chiptune soundtrack + synthesized SFX
   All melodies are original compositions in a Japanese
   pentatonic / min'yō style (no copyrighted themes).
   Voices: pulse leads (shakuhachi-style bends), triangle bass,
   noise/sine drums with taiko toms, tape-style echo.
   ============================================================ */
(function () {
  const NS = window.NTCG = window.NTCG || {};
  let ac, master, sfxBus, musBus, echo, noiseBuf, pulse25, pulse12;
  let tbus = null, techo = null; // per-track bus + echo so a track can be faded out cleanly
  const MB = () => tbus || musBus;
  let musicOn = true, sfxOn = true;
  let cur = null, timer = null, nextTime = 0, step = 0, wanted = null;

  function ensure() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return true; }
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return false; }
    master = ac.createDynamicsCompressor(); master.threshold.value = -10; master.ratio.value = 4; master.connect(ac.destination);
    sfxBus = ac.createGain(); sfxBus.gain.value = 0.55; sfxBus.connect(master);
    musBus = ac.createGain(); musBus.gain.value = 0.2; musBus.connect(master);
    // echo for the lead
    echo = ac.createDelay(1); echo.delayTime.value = 0.27;
    const fb = ac.createGain(); fb.gain.value = 0.28;
    const ef = ac.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 2400;
    echo.connect(ef); ef.connect(fb); fb.connect(echo); ef.connect(musBus);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    pulse25 = pulseWave(0.25); pulse12 = pulseWave(0.125);
    return true;
  }
  function pulseWave(duty) {
    const n = 64, re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k++) im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty) * 2;
    return ac.createPeriodicWave(re, im, { disableNormalization: false });
  }
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function midi(s) { const m = s.match(/^([A-G])(b|#)?(\d)$/); return 12 * (+m[3] + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); }
  // "D5 4 F5 2 r 2" -> [[midi|null, steps], ...]
  function seq(str) { const t = str.trim().split(/\s+/), out = []; for (let i = 0; i < t.length; i += 2) out.push([t[i] === 'r' ? null : midi(t[i]), +t[i + 1]]); return out; }

  // ---------------- voices ----------------
  function env(g, t, a, peak, hold, rel) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
  }
  function lead(m, t, dur, vol, bend) {
    const o = ac.createOscillator(), g = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
    o.setPeriodicWave(pulse25);
    const f = mtof(m);
    if (bend) { o.frequency.setValueAtTime(f * 0.94, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.06); } else o.frequency.setValueAtTime(f, t);
    lfo.frequency.value = 5.8; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.012, t + Math.min(0.25, dur * 0.6));
    lfo.connect(lg); lg.connect(o.frequency);
    env(g, t, 0.01, vol, Math.max(0.02, dur - 0.08), 0.1);
    o.connect(g); g.connect(MB()); g.connect(techo || echo);
    o.start(t); lfo.start(t); o.stop(t + dur + 0.2); lfo.stop(t + dur + 0.2);
    // breath noise for a shakuhachi-ish attack
    noise(t, 0.05, 0.02, 'bandpass', f * 2, MB());
  }
  function tone(m, t, dur, vol, wave, dest) {
    const o = ac.createOscillator(), g = ac.createGain();
    if (wave === 'p12') o.setPeriodicWave(pulse12); else if (wave === 'p25') o.setPeriodicWave(pulse25); else o.type = wave;
    o.frequency.setValueAtTime(mtof(m), t);
    env(g, t, 0.005, vol, Math.max(0.01, dur - 0.04), 0.05);
    o.connect(g); g.connect(dest || MB());
    o.start(t); o.stop(t + dur + 0.1);
  }
  function noise(t, dur, vol, type, freq, dest, q) {
    const s = ac.createBufferSource(); s.buffer = noiseBuf;
    const f = ac.createBiquadFilter(); f.type = type || 'highpass'; f.frequency.value = freq || 6000; f.Q.value = q || 1;
    const g = ac.createGain(); env(g, t, 0.002, vol, 0.005, dur);
    s.connect(f); f.connect(g); g.connect(dest || MB());
    s.start(t); s.stop(t + dur + 0.05);
  }
  function kick(t, v) { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12); env(g, t, 0.002, v || 0.9, 0.02, 0.16); o.connect(g); g.connect(MB()); o.start(t); o.stop(t + 0.3); }
  function taiko(t, v, f) { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(f || 110, t); o.frequency.exponentialRampToValueAtTime((f || 110) * 0.55, t + 0.25); env(g, t, 0.003, v || 0.7, 0.03, 0.35); o.connect(g); g.connect(MB()); o.start(t); o.stop(t + 0.5); noise(t, 0.05, (v || 0.7) * 0.2, 'lowpass', 900); }
  function snare(t, v) { noise(t, 0.13, v || 0.35, 'bandpass', 1800, MB(), 0.8); tone(50, t, 0.05, (v || 0.35) * 0.4, 'triangle'); }
  function hat(t, v) { noise(t, 0.03, v || 0.09, 'highpass', 8000); }
  // shamisen: bright plucked string with a snappy filter decay and slight pitch settle
  function shamisen(m, t, vol) {
    const f = mtof(m);
    const o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain(), lp = ac.createBiquadFilter();
    o.type = 'sawtooth'; o2.setPeriodicWave(pulse12);
    o.frequency.setValueAtTime(f * 1.025, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.03);
    o2.frequency.setValueAtTime(f * 2.005, t);
    lp.type = 'lowpass'; lp.Q.value = 6; lp.frequency.setValueAtTime(5200, t); lp.frequency.exponentialRampToValueAtTime(700, t + 0.28);
    env(g, t, 0.002, vol, 0.01, 0.34);
    o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(MB());
    o.start(t); o2.start(t); o.stop(t + 0.45); o2.stop(t + 0.45);
    noise(t, 0.02, vol * 0.5, 'highpass', 5000);
  }
  // distorted power chord (root + fifth + octave)
  let shaper = null;
  function dist() {
    if (shaper) return shaper;
    shaper = ac.createWaveShaper();
    const n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i / n * 2 - 1; c[i] = Math.tanh(x * 6); }
    shaper.curve = c;
    return shaper;
  }
  function guitar(root, t, dur, vol) {
    const g = ac.createGain(), lp = ac.createBiquadFilter(), ws = ac.createWaveShaper();
    ws.curve = dist().curve;
    lp.type = 'lowpass'; lp.frequency.value = 2300;
    [0, 7, 12].forEach((iv, k) => {
      const o = ac.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(mtof(root + iv) * (k === 1 ? 1.003 : 1), t);
      const og = ac.createGain(); og.gain.value = 0.33;
      o.connect(og); og.connect(ws);
      o.start(t); o.stop(t + dur + 0.08);
    });
    env(g, t, 0.004, vol, Math.max(0.01, dur - 0.05), 0.06);
    ws.connect(lp); lp.connect(g); g.connect(MB());
  }
  // shakuhachi-style lead: grace note into long notes, trill on held notes
  function flute(m, t, dur, vol) {
    if (dur > 0.35) { lead(m + 2, t, 0.05, vol * 0.8, false); t += 0.05; dur -= 0.05; }
    if (dur > 1.1) {
      const main = dur * 0.7;
      lead(m, t, main, vol, true);
      for (let k = 0, tt = t + main; tt < t + dur - 0.06; k++, tt += 0.07) lead(k % 2 ? m : m + 2, tt, 0.065, vol * 0.75, false);
      return;
    }
    lead(m, t, dur, vol, dur > 0.3);
  }
  function rim(t, v) { noise(t, 0.025, v || 0.2, 'bandpass', 3200, MB(), 6); }
  function crash(t, v) { noise(t, 0.9, v || 0.12, 'highpass', 5000); }

  // ---------------- tracks (original compositions) ----------------
  const CH = { Dm: [50, 53, 57], Bb: [46, 50, 53], C: [48, 52, 55], Am: [45, 48, 52], F: [41, 45, 48], Gm: [43, 46, 50], Em: [40, 43, 47], G: [43, 47, 50], D: [38, 42, 45], Bm: [47, 50, 54], A: [45, 49, 52] };
  const TRACKS = {
    title: { bpm: 140, feel: 'song', chords: ['Dm'], lead: [], song: null, tonic: 2 },
    battle: { bpm: 168, feel: 'song', chords: ['Em'], lead: [], song: null, tonic: 4 },
    tension: {
      bpm: 96, feel: 'sparse',
      chords: ['Am', 'Am', 'F', 'Em', 'Am', 'Am', 'F', 'Em'],
      lead: seq(`A4 6 Bb4 2 A4 8  E5 6 F5 2 E5 4 D5 4  A4 6 Bb4 2 D5 4 E5 4  A4 16
                 D5 6 E5 2 F5 8  E5 4 D5 4 Bb4 8  A4 4 Bb4 4 D5 4 E5 4  A4 16`),
    },
  };
  const JINGLES = {
    victory: { bpm: 150, notes: seq('C5 2 E5 2 G5 2 C6 6 A5 2 C6 2 D6 2 E6 12'), chord: [48, 55, 60, 64] },
    defeat: { bpm: 90, notes: seq('A5 4 G5 4 E5 4 D5 4 C5 4 A4 12'), chord: [45, 48, 52] },
    turn: { bpm: 220, notes: seq('D6 1 A5 1 D6 2'), chord: null },
  };


  // ================= "Will of the Leaf" — original title anthem =================
  // Sections: intro · verse · build · chorus · bridge · final chorus (+2 key change). All melodies original.
  const SONGS = {};
  SONGS.title = [
    { feel: 'intro', chords: ['Dm', 'Bb', 'C', 'Dm'], lead: `A4 6 D5 2 F5 8  E5 4 D5 4 A4 8  G4 4 A4 4 C5 4 D5 4  D5 12 r 4` },
    { feel: 'verse', chords: ['Dm', 'Dm', 'Bb', 'C', 'Dm', 'Dm', 'F', 'C'], lead: `D5 2 r 2 D5 2 F5 2 G5 4 F5 2 D5 2  C5 2 D5 2 F5 4 D5 8  F5 2 r 2 F5 2 G5 2 A5 4 G5 2 F5 2  E5 2 F5 2 G5 4 C5 8
        D5 2 r 2 D5 2 F5 2 G5 4 A5 2 C6 2  A5 4 G5 2 F5 2 D5 8  F5 2 G5 2 A5 2 C6 2 D6 4 C6 2 A5 2  G5 12 r 4` },
    { feel: 'build', chords: ['Bb', 'C', 'Dm', 'C'], lead: `A5 4 G5 4 F5 4 G5 4  A5 4 C6 4 A5 4 G5 4  A5 2 C6 2 D6 4 C6 2 D6 2 F6 4  E6 8 G6 4 r 4` },
    { feel: 'chorus', chords: ['Dm', 'Bb', 'F', 'C', 'Gm', 'Bb', 'C', 'Dm'], lead: `D6 6 C6 2 A5 4 C6 4  D6 4 F6 4 D6 8  C6 6 A5 2 G5 4 A5 4  C6 12 r 4
        D6 6 C6 2 A5 4 G5 4  F5 4 G5 4 A5 4 C6 4  D6 4 C6 2 D6 2 F6 4 E6 4  D6 12 r 4` },
    { feel: 'bridge', chords: ['Bb', 'C', 'Am', 'Dm'], lead: `F5 8 G5 8  A5 8 C6 4 A5 4  G5 8 E5 8  D5 12 r 4` },
    { feel: 'chorus', tr: 2, chords: ['Dm', 'Bb', 'F', 'C', 'Gm', 'Bb', 'C', 'Dm'], lead: `D6 6 C6 2 A5 4 C6 4  D6 4 F6 4 D6 8  C6 6 A5 2 G5 4 A5 4  C6 12 r 4
        D6 6 C6 2 A5 4 G5 4  F5 4 G5 4 A5 4 C6 4  D6 4 C6 2 D6 2 F6 4 E6 4  D6 12 r 4`, final: true },
  ];
  // ================= "Clash of Shinobi" — original battle anthem (E minor, 168 bpm) =================
  SONGS.battle = [
    { feel: 'riff', chords: ['Em', 'Em', 'C', 'D'], lead: `r 16  r 16  r 16  E6 2 D6 2 B5 2 A5 2 G5 2 E5 2 D5 2 E5 2` },
    { feel: 'drive', chords: ['Em', 'Em', 'C', 'D', 'Em', 'Em', 'C', 'Bm'], lead: `E5 2 G5 2 A5 2 B5 4 A5 2 G5 2 E5 2  D5 2 E5 2 G5 4 E5 8  G5 2 A5 2 B5 2 D6 4 B5 2 A5 2 G5 2  A5 4 B5 4 F#5 8
        E5 2 G5 2 A5 2 B5 4 D6 2 E6 2 D6 2  B5 4 A5 2 G5 2 E5 8  G5 2 A5 2 B5 2 D6 2 E6 4 D6 2 B5 2  B5 12 r 4` },
    { feel: 'build', chords: ['C', 'D', 'Em', 'D'], lead: `E6 4 D6 4 B5 4 D6 4  E6 4 G6 4 E6 4 D6 4  E6 2 G6 2 A6 4 G6 2 E6 2 D6 4  B5 8 D6 4 r 4` },
    { feel: 'chorus', chords: ['Em', 'C', 'G', 'D', 'Em', 'C', 'D', 'Em'], lead: `E6 3 E6 3 D6 2 B5 4 D6 4  E6 4 G6 4 E6 8  D6 6 B5 2 A5 4 B5 4  D6 12 r 4
        G6 3 G6 3 A6 2 B6 4 A6 4  G6 4 E6 4 D6 4 E6 4  G6 4 E6 2 G6 2 A6 4 F#6 4  E6 12 r 4` },
    { feel: 'breakdown', chords: ['Am', 'Em', 'C', 'Bm'], lead: `A5 8 B5 8  E6 12 r 4  C6 8 D6 8  B5 12 r 4` },
    { feel: 'chorus', tr: 2, chords: ['Em', 'C', 'G', 'D', 'Em', 'C', 'D', 'Em'], lead: `E6 3 E6 3 D6 2 B5 4 D6 4  E6 4 G6 4 E6 8  D6 6 B5 2 A5 4 B5 4  D6 12 r 4
        G6 3 G6 3 A6 2 B6 4 A6 4  G6 4 E6 4 D6 4 E6 4  G6 4 E6 2 G6 2 A6 4 F#6 4  E6 12 r 4`, final: true },
  ];
  function buildSong(sections) {
    const bars = [], notes = [];
    let stepAt = 0;
    sections.forEach(sec => {
      sec.chords.forEach((c, i) => bars.push({ chord: c, feel: sec.feel, tr: sec.tr || 0, i, n: sec.chords.length, final: !!sec.final }));
      seq(sec.lead).forEach(([m, l]) => { notes.push({ at: stepAt, m: m == null ? null : m + (sec.tr || 0), l, feel: sec.feel }); stepAt += l; });
    });
    const byStep = new Map(); notes.forEach(n => byStep.set(n.at, n));
    return { bars, byStep, total: bars.length * 16 };
  }
  const DORIAN = [0, 2, 3, 5, 7, 9, 10];
  function third(m, root) { // diatonic third below in D dorian (root = pitch class of D + transpose)
    const rel = ((m - root) % 12 + 12) % 12;
    let idx = DORIAN.indexOf(rel);
    if (idx < 0) return m - 3;
    const down = DORIAN[(idx - 2 + 7) % 7];
    let d = rel - down; if (d <= 0) d += 12;
    return m - d;
  }
  function scheduleSong(tr, st, t, sd) {
    const song = tr.song;
    const pos = st % song.total, barIdx = Math.floor(pos / 16), s = pos % 16;
    const B = song.bars[barIdx], feel = B.feel;
    const chord = CH[B.chord].map(x => x + B.tr);
    const root = chord[0];
    const lastBar = B.i === B.n - 1;
    // melody (+ harmony and octave in choruses)
    const n = song.byStep.get(pos);
    if (n && n.m != null) {
      const dur = n.l * sd;
      const vol = feel === 'intro' || feel === 'bridge' || feel === 'breakdown' ? 0.12 : feel === 'chorus' ? 0.11 : 0.1;
      flute(n.m, t, dur, vol);
      if (feel === 'chorus') { lead(third(n.m, (tr.tonic || 2) + B.tr), t, dur, 0.055, dur > 0.3); lead(n.m - 12, t, dur, 0.04, false); }
    }
    const arp = [chord[0], chord[2], chord[0] + 12, chord[1] + 12];
    switch (feel) {
      case 'intro':
        if (s === 0) { tone(root - 12, t, sd * 16, 0.2, 'triangle'); taiko(t, 0.55, 70); }
        if (s === 8) taiko(t, 0.3, 90);
        if (s % 4 === 2) noise(t, 0.3, 0.015, 'bandpass', 2400, MB(), 3);
        if (lastBar && s >= 8) taiko(t, 0.3 + (s - 8) * 0.05, 100 + (s - 8) * 10);
        break;
      case 'verse':
        if (s % 2 === 0) tone(root - 12 + (s % 4 === 2 ? 12 : 0), t, sd * 1.7, 0.26, 'triangle');
        if (s % 4 === 2) shamisen(arp[(s >> 2) % 4] + 12, t, 0.07);
        if (s === 0 || s === 8) kick(t, 0.75);
        if (s === 4 || s === 12) rim(t, 0.2);
        if (s % 2 === 0) hat(t, 0.045);
        break;
      case 'build': {
        const k = (B.i * 16 + s) / (B.n * 16);
        if (s % 2 === 0) guitar(root - 12, t, sd * 0.9, 0.03 + k * 0.05);
        if (s % 2 === 0) tone(root - 12, t, sd * 1.6, 0.26, 'triangle');
        if (s % 4 === 0) snare(t, 0.12 + k * 0.2);
        if (s % 4 === 0) kick(t, 0.7);
        if (lastBar) { snare(t, 0.1 + s * 0.02); if (s === 0) sweepUp(t, sd * 16); }
        if (B.i === B.n - 2 && s % 4 === 0) taiko(t, 0.5, 110);
        break;
      }
      case 'chorus':
        if (s === 0 && (B.i % 4 === 0)) crash(t, 0.16);
        if (s === 0 || s === 8) guitar(root - 12, t, sd * 7.5, 0.085);
        else if (s % 2 === 0) guitar(root - 12, t, sd * 0.8, 0.045);
        if (s % 2 === 0) tone(root - 24 + (s % 4 === 2 ? 12 : 0), t, sd * 1.7, 0.28, 'triangle');
        if (s === 0 || s === 6 || s === 8 || s === 10) kick(t, 0.85);
        if (s === 4 || s === 12) snare(t, 0.34);
        if (s % 2 === 1) hat(t, 0.07);
        if (s >= 12) shamisen(arp[s % 4] + 24, t, 0.055);
        if (lastBar && s >= 8 && s % 2 === 0) taiko(t, 0.55, 90 + (s - 8) * 14);
        if (B.final && lastBar && s === 15) crash(t, 0.14);
        break;
      case 'riff': {
        const hits = [0, 3, 6, 8, 11, 14];
        if (hits.includes(s)) { guitar(root - 12 + (s === 14 ? 2 : 0), t, sd * (s === 8 ? 2.5 : 1.6), s === 0 || s === 8 ? 0.09 : 0.06); tone(root - 24, t, sd * 1.6, 0.3, 'triangle'); }
        if (s === 0 || s === 8) taiko(t, 0.7, 85);
        if (s === 12) snare(t, 0.3);
        if (s === 0 && B.i === 0) crash(t, 0.14);
        if (s % 2 === 1) hat(t, 0.05);
        if (lastBar) { if (s % 2 === 0) snare(t, 0.12 + s * 0.015); if (s === 0) sweepUp(t, sd * 16); }
        break;
      }
      case 'drive':
        if (s % 2 === 0) guitar(root - 12, t, sd * (s % 8 === 0 ? 1.8 : 0.85), s % 8 === 0 ? 0.075 : 0.045);
        if (s % 2 === 0) tone(root - 24 + (s % 4 === 2 ? 12 : 0), t, sd * 1.6, 0.27, 'triangle');
        if (s === 0 || s === 7 || s === 10) kick(t, 0.85);
        if (s === 4 || s === 12) snare(t, 0.32);
        hat(t, s % 2 ? 0.07 : 0.035);
        if (s === 0 && B.i % 4 === 0) crash(t, 0.12);
        if (B.i % 4 === 3 && s >= 12) shamisen(arp[s % 4] + 24, t, 0.06);
        break;
      case 'breakdown':
        if (s === 0) { guitar(root - 12, t, sd * 14, 0.1); tone(root - 24, t, sd * 14, 0.3, 'triangle'); crash(t, 0.1); }
        if (s === 0 || s === 3 || s === 10) kick(t, 0.95);
        if (s === 8) snare(t, 0.4);
        if (s === 6 || s === 14) taiko(t, 0.5, 75);
        if (s % 4 === 2) shamisen(arp[(s >> 2) % 4] + 12, t, 0.06);
        if (lastBar && s >= 8) { snare(t, 0.1 + (s - 8) * 0.04); if (s === 8) sweepUp(t, sd * 8); }
        break;
      case 'bridge':
        if (s === 0) tone(root - 12, t, sd * 16, 0.2, 'triangle');
        if (s % 2 === 0) shamisen(arp[(s >> 1) % 4] + 12, t, 0.06);
        if (s === 0 || s === 3) taiko(t, s ? 0.35 : 0.6, 65);
        if (lastBar && s >= 12) snare(t, 0.08 + (s - 12) * 0.05);
        break;
    }
  }
  // whoosh that rises into the chorus
  function sweepUp(t, dur) {
    const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(6000, t + dur);
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + dur * 0.95); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(MB()); src.start(t); src.stop(t + dur + 0.05);
  }
  function scheduleStep(tr, st, t, spb) {
    if (tr.song) return scheduleSong(tr, st, t, spb);
    const bar = Math.floor(st / 16) % tr.chords.length, s = st % 16;
    const chord = CH[tr.chords[bar]];
    const sd = spb;
    const half = bar >= tr.chords.length / 2;
    // lead melody (shakuhachi style)
    let acc = 0, idx = 0;
    const loopLen = tr.lead.reduce((x, n) => x + n[1], 0);
    const pos = st % loopLen;
    for (; idx < tr.lead.length; idx++) { if (acc === pos) break; if (acc > pos) { idx = -1; break; } acc += tr.lead[idx][1]; }
    if (idx >= 0 && idx < tr.lead.length && tr.lead[idx][0] != null) flute(tr.lead[idx][0], t, tr.lead[idx][1] * sd, tr.feel === 'sparse' ? 0.12 : 0.1);
    const arp = [chord[0], chord[2], chord[0] + 12, chord[1] + 12];
    if (tr.feel === 'march') {
      // title: shamisen arpeggios, walking bass, taiko ensemble, guitars join in the second half
      if (s % 2 === 0) shamisen(arp[(s >> 1) % 4] + 12, t, 0.07);
      if (s % 4 === 0) tone(chord[0] - 12, t, sd * 3, 0.3, 'triangle');
      if (s % 4 === 2) tone(chord[2] - 12, t, sd * 1.5, 0.2, 'triangle');
      if (s === 0 || s === 8) taiko(t, 0.7, 95);
      if (s === 6 || s === 14) taiko(t, 0.35, 130);
      if (s % 4 === 2) rim(t, 0.12);
      if (s === 4 || s === 12) snare(t, 0.2);
      if (half && (s === 0 || s === 8)) guitar(chord[0] - 12, t, sd * 6, 0.06);
      if (half && s === 0 && bar % 4 === 0) crash(t, 0.1);
      if (bar % 8 === 7 && s >= 8) taiko(t, 0.45, 110 + (s - 8) * 12);
    } else if (tr.feel === 'drive') {
      // battle: palm-muted guitar chugs, rock kit, shamisen runs and taiko fills
      if (s % 2 === 0) guitar(chord[0] - 12, t, sd * (s % 8 === 0 ? 1.8 : 0.9), s % 8 === 0 ? 0.08 : 0.05);
      if (s % 2 === 0) tone(chord[0] - 24 + (s % 4 === 2 ? 12 : 0), t, sd * 1.6, 0.26, 'triangle');
      if (s === 0 || s === 7 || s === 10) kick(t, 0.85);
      if (s === 4 || s === 12) snare(t, 0.32);
      if (s % 2 === 1) hat(t, 0.07);
      if (s === 0 && bar % 4 === 0) crash(t, 0.13);
      if (s >= 12) shamisen(arp[s % 4] + 24, t, 0.06);
      if (bar % 4 === 3 && s >= 8 && s % 2 === 0) taiko(t, 0.55, 90 + (s - 8) * 15);
    } else {
      // tension: sparse plucks, drone, heartbeat taiko and breathy flute
      if (s === 0) tone(chord[0] - 12, t, sd * 15, 0.22, 'triangle');
      if (s === 0 || s === 6 || s === 11) shamisen(arp[((s / 3) | 0) % 4] + 12, t, 0.06);
      if (s === 0) taiko(t, 0.65, 65);
      if (s === 3) taiko(t, 0.4, 70);
      if (s % 4 === 2) noise(t, 0.25, 0.018, 'bandpass', 2600, MB(), 4);
    }
  }
  function tick() {
    if (!cur || !ac) return;
    const spb = 60 / cur.bpm / 4;
    while (nextTime < ac.currentTime + 0.15) {
      scheduleStep(cur, step, nextTime, spb);
      nextTime += spb; step++;
    }
  }
  function newBus() {
    const b = ac.createGain();
    b.gain.setValueAtTime(0.0001, ac.currentTime);
    b.gain.exponentialRampToValueAtTime(1, ac.currentTime + 0.5);
    b.connect(musBus);
    const e = ac.createDelay(1); e.delayTime.value = 0.27;
    const fb = ac.createGain(); fb.gain.value = 0.28;
    const ef = ac.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 2400;
    e.connect(ef); ef.connect(fb); fb.connect(e); ef.connect(b);
    tbus = b; techo = e;
  }
  function fadeOutBus() {
    if (!tbus) return;
    const b = tbus, t = ac.currentTime;
    b.gain.cancelScheduledValues(t);
    b.gain.setValueAtTime(Math.max(0.0001, b.gain.value), t);
    b.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    setTimeout(() => { try { b.disconnect(); } catch (e) { /* already gone */ } }, 600);
    tbus = null; techo = null;
  }
  const custom = {};   // name -> HTMLAudioElement when music/<name>.(mp3|ogg) exists
  let curCustom = null;
  function probeCustom() {
    ['title', 'battle', 'tension', 'victory', 'defeat'].forEach(n => {
      const exts = ['mp3', 'ogg'];
      const tryNext = () => {
        const e = exts.shift(); if (!e) return;
        const a = new Audio(); a.preload = 'auto'; a.loop = n !== 'victory' && n !== 'defeat';
        a.addEventListener('canplaythrough', () => { custom[n] = a; }, { once: true });
        a.addEventListener('error', tryNext, { once: true });
        a.src = `music/${n}.${e}`;
      };
      tryNext();
    });
  }
  probeCustom();
  function fadeEl(a, to, ms, done) {
    const from = a.volume, t0 = performance.now();
    const step = () => { const k = Math.min(1, (performance.now() - t0) / ms); a.volume = Math.max(0, Math.min(1, from + (to - from) * k)); if (k < 1) requestAnimationFrame(step); else if (done) done(); };
    step();
  }
  function stopCustom() {
    if (!curCustom) return;
    const a = curCustom; curCustom = null;
    fadeEl(a, 0, 400, () => { a.pause(); a.currentTime = 0; });
  }
  function playCustom(name) {
    const a = custom[name];
    if (curCustom === a) return;
    stopCustom();
    a.volume = 0; a.currentTime = 0; a.play().catch(() => { });
    fadeEl(a, 0.55, 600);
    curCustom = a;
  }
  function playTrack(name) {
    wanted = name;
    if (!musicOn || !ensure()) return;
    if (custom[name]) { if (cur) { clearInterval(timer); timer = null; cur = null; fadeOutBus(); } playCustom(name); return; }
    if (cur && cur.name === name) return;
    stopTrack();
    newBus();
    if (SONGS[name] && !TRACKS[name].song) TRACKS[name].song = buildSong(SONGS[name]);
    cur = Object.assign({ name }, TRACKS[name]);
    step = 0; nextTime = ac.currentTime + 0.08;
    timer = setInterval(tick, 30);
  }
  function stopTrack() { clearInterval(timer); timer = null; cur = null; if (ac) fadeOutBus(); stopCustom(); }
  function jingle(name) {
    if (!musicOn || !ensure()) return;
    if (custom[name]) { stopTrack(); playCustom(name); return; }
    const j = JINGLES[name]; if (!j) return;
    const spb = 60 / j.bpm / 4;
    let t = ac.currentTime + 0.05;
    if (name !== 'turn') { stopTrack(); newBus(); }
    j.notes.forEach(([m, l]) => { if (m != null) flute(m, t, l * spb, 0.14); t += l * spb; });
    if (name === 'victory') { let tt = ac.currentTime + 0.05; j.notes.forEach(([m, l]) => { if (m != null) shamisen(m - 12, tt, 0.08); tt += l * spb; }); }
    if (j.chord) j.chord.forEach(m => tone(m, ac.currentTime + 0.05 + (j.notes.slice(0, -1).reduce((a, n) => a + n[1], 0)) * spb, j.notes[j.notes.length - 1][1] * spb, 0.05, 'p25'));
    if (name === 'victory') { [0, 4, 8].forEach(k => taiko(ac.currentTime + 0.05 + k * spb, 0.6, 110)); }
  }

  // ---------------- SFX ----------------
  function sweep(f0, f1, dur, vol, type) {
    const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, 0.004, vol, 0.01, dur); o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + dur + 0.1);
  }
  const nz = (dur, vol, type, freq, q) => noise(ac.currentTime, dur, vol, type, freq, sfxBus, q);
  const SFX = {
    click: () => sweep(1400, 900, 0.05, 0.12, 'triangle'),
    draw: () => nz(0.12, 0.25, 'highpass', 4000),
    card: () => { nz(0.08, 0.3, 'bandpass', 2500, 0.8); sweep(300, 180, 0.08, 0.12); },
    hidden: () => { nz(0.35, 0.35, 'lowpass', 1400); sweep(120, 70, 0.2, 0.25); },
    poof: () => nz(0.45, 0.5, 'bandpass', 900, 0.6),
    reveal: () => { nz(0.3, 0.4, 'highpass', 3000); sweep(600, 1400, 0.15, 0.12, 'square'); },
    chakra: () => { sweep(300, 900, 0.35, 0.15); sweep(450, 1350, 0.35, 0.08); },
    power: () => { sweep(520, 780, 0.12, 0.18, 'triangle'); setTimeout(() => sweep(780, 1170, 0.18, 0.15, 'triangle'), 70); },
    upgrade: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => sweep(f, f, 0.22, 0.13, 'square'), i * 55)),
    slash: () => nz(0.18, 0.55, 'highpass', 5000),
    whoosh: () => { const t = ac.currentTime, s = ac.createBufferSource(); s.buffer = noiseBuf; const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(4000, t + 0.25); const g = ac.createGain(); env(g, t, 0.05, 0.4, 0.05, 0.2); s.connect(f); f.connect(g); g.connect(sfxBus); s.start(t); s.stop(t + 0.4); },
    hit: () => { sweep(160, 40, 0.25, 0.8); nz(0.15, 0.5, 'lowpass', 1200); },
    impact: () => { sweep(220, 30, 0.45, 1); nz(0.3, 0.7, 'lowpass', 2500); nz(0.08, 0.5, 'highpass', 6000); },
    shatter: () => { for (let i = 0; i < 6; i++) setTimeout(() => sweep(2000 + Math.random() * 3000, 800, 0.08, 0.08, 'square'), i * 25); nz(0.3, 0.4, 'highpass', 5000); },
    defeat: () => { sweep(200, 50, 0.5, 0.3, 'sawtooth'); nz(0.4, 0.4, 'lowpass', 600); },
    seal: () => { sweep(80, 160, 0.6, 0.35); [0, 90, 180].forEach(d => setTimeout(() => sweep(900, 1800, 0.12, 0.07, 'triangle'), d)); },
    cutin: () => { nz(0.35, 0.5, 'highpass', 2000); sweep(90, 45, 0.4, 0.5); },
    taiko: () => { const t = ac.currentTime; taikoS(t, 0.9); },
    win: () => [392, 523, 659, 784].forEach((f, i) => setTimeout(() => sweep(f, f, 0.3, 0.14, 'square'), i * 90)),
    lose: () => [392, 349, 311, 262].forEach((f, i) => setTimeout(() => sweep(f, f * 0.98, 0.4, 0.14, 'square'), i * 160)),
    pass: () => { sweep(500, 330, 0.15, 0.15, 'triangle'); },
    error: () => sweep(180, 160, 0.15, 0.15, 'square'),
    edge: () => { sweep(1200, 1200, 0.25, 0.1); setTimeout(() => sweep(1800, 1800, 0.3, 0.07), 60); },
    lightning: () => { nz(0.5, 0.6, 'highpass', 2500); for (let i = 0; i < 5; i++) setTimeout(() => nz(0.05, 0.4, 'bandpass', 3000 + Math.random() * 4000, 3), i * 40); },
    fire: () => nz(0.8, 0.45, 'lowpass', 900),
    mission: () => { sweep(660, 660, 0.08, 0.1, 'square'); setTimeout(() => sweep(990, 990, 0.18, 0.1, 'square'), 80); },
  };
  function taikoS(t, v) { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.3); env(g, t, 0.003, v, 0.03, 0.4); o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.5); }

  function play(name) {
    if (!sfxOn || !ensure()) return;
    try { SFX[name] && SFX[name](); } catch (e) { /* audio is decorative */ }
  }
  function setMusic(on) { musicOn = on; if (!on) stopTrack(); else if (wanted) playTrack(wanted); }
  function setSfx(on) { sfxOn = on; }

  NS.Audio = {
    play, ensure, playTrack, stopTrack, jingle, setMusic, setSfx,
    startMusic() { playTrack(wanted || 'title'); }, stopMusic: stopTrack,
    get musicOn() { return musicOn; }, get sfxOn() { return sfxOn; }, get track() { return cur && cur.name; },
  };
})();
