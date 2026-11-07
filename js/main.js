/* ============================================================
   MAIN — boot, settings, stage scaling
   ============================================================ */
(function () {
  const NS = window.NTCG = window.NTCG || {};
  const SPEEDS = { slow: 1.5, normal: 1, fast: 0.5, turbo: 0.15 };
  const THINK = { quick: 0.5, normal: 1, long: 2.5, 'very long': 5, extreme: 20 }; // the Hokage bot's thinking time

  const defaults = { music: true, sfx: true, cutins: true, fx: 'full', speed: 'normal', think: 'normal' }; // fx: full | low | off
  const saved = (() => { try { return JSON.parse(localStorage.getItem('ntcg.settings') || '{}'); } catch (e) { return {}; } })();
  if (saved.fx == null && saved.lowfx) saved.fx = 'low'; // the old "Reduced effects" switch
  NS.settings = Object.assign({}, defaults, saved, {
    speedMul() { return SPEEDS[this.speed] || 1; },
    thinkMul() { return THINK[this.think] || 1; },
    save(patch) {
      Object.assign(this, patch);
      const o = {}; Object.keys(defaults).forEach(k => { o[k] = this[k]; });
      try { localStorage.setItem('ntcg.settings', JSON.stringify(o)); } catch (e) { /* storage unavailable */ }
    },
    cycleSpeed() { const ks = Object.keys(SPEEDS); this.save({ speed: ks[(ks.indexOf(this.speed) + 1) % ks.length] }); },
    applyFx() {
      const f = this.fx === 'off' ? 'off' : this.fx === 'low' ? 'low' : 'full';
      document.body.classList.toggle('lowfx', f !== 'full'); document.body.classList.toggle('nofx', f === 'off');
      NS.FX.setQuality(f === 'full' ? 1 : f === 'low' ? 0.4 : 0);
      if (f !== 'full' && NS.FXGL) NS.FXGL.stop();
    },
  });

  // The stage is a fixed-size page scaled to the window. Wide screens get the 1600 x 900 table; tall screens (phones
  // held upright, tablets in portrait) get a 760-wide column whose height follows the screen, whichever shows the
  // game larger. Small stages (phones) get bigger text and buttons through body.tiny.
  function fit() {
    const W = window.innerWidth, H = window.innerHeight;
    const pH = Math.max(1300, Math.min(2000, Math.round(760 * H / W / 20) * 20)); // steps of 20: a phone's address bar sliding in and out moves it less often
    const sL = Math.min(W / 1600, H / 900), sP = Math.min(W / 760, H / pH);
    const portrait = sP > sL * 1.15;
    const sw = portrait ? 760 : 1600, sh = portrait ? pH : 900, s = portrait ? sP : sL;
    const changed = NS.portrait !== portrait || NS.stageH !== sh;
    NS.stageScale = s; NS.stageW = sw; NS.stageH = sh; NS.portrait = portrait;
    const st = document.getElementById('stage');
    st.style.width = sw + 'px'; st.style.height = sh + 'px';
    st.style.transform = `translate(-50%,-50%) scale(${s})`;
    document.body.classList.toggle('portrait', portrait);
    document.body.classList.toggle('tiny', s < 0.62);
    document.body.classList.toggle('narrow', W < 640);
    if (changed && NS.activeUI && NS.activeUI.relayout) NS.activeUI.relayout();
  }

  NS.UIx = {
    toast(msg) {
      const el = document.createElement('div');
      el.className = 'float-text';
      el.style.cssText = 'left:50%;top:14%;font-family:var(--font-ui);font-size:22px;-webkit-text-stroke:0;background:rgba(0,0,0,.8);padding:8px 18px;border-radius:20px;border:1px solid rgba(255,200,120,.4)';
      el.textContent = msg;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 1500);
    },
  };

  // touch screens: no hover and no right-click, so prompts say "tap"
  NS.touch = !!(window.matchMedia && window.matchMedia('(hover: none)').matches);

  window.addEventListener('DOMContentLoaded', () => {
    NS.Cards.build();
    fit();
    window.addEventListener('resize', fit);
    NS.FX.init();
    NS.settings.applyFx();
    NS.Audio.setSfx(NS.settings.sfx);
    if (!NS.settings.music) NS.Audio.setMusic(false);
    NS.Screens.init();
    // browsers need a user gesture before audio
    const kick = () => { NS.Audio.ensure(); if (NS.settings.music) NS.Audio.startMusic(); window.removeEventListener('pointerdown', kick); };
    window.addEventListener('pointerdown', kick);
  });
})();
