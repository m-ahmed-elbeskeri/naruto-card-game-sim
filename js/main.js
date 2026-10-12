/* ============================================================
   MAIN — boot, settings, stage scaling
   ============================================================ */
(function () {
  const NS = window.NTCG = window.NTCG || {};
  const SPEEDS = { slow: 1.5, normal: 1, fast: 0.5, turbo: 0.15 };

  const defaults = { music: true, sfx: true, cutins: true, fx: 'full', speed: 'normal' }; // fx: full | low | off
  const saved = (() => { try { return JSON.parse(localStorage.getItem('ntcg.settings') || '{}'); } catch (e) { return {}; } })();
  if (saved.fx == null && saved.lowfx) saved.fx = 'low'; // the old "Reduced effects" switch
  NS.settings = Object.assign({}, defaults, saved, {
    speedMul() { return SPEEDS[this.speed] || 1; },
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

  function fit() {
    const s = Math.min(window.innerWidth / 1600, window.innerHeight / 900);
    NS.stageScale = s;
    document.getElementById('stage').style.transform = `translate(-50%,-50%) scale(${s})`;
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
