// The HUD: DOM panels for health, cash, wanted stars, clock and objective,
// plus a live 2D minimap drawn on a canvas — roads, the player arrow, police
// dots and the gold mission marker.
import { CITY } from './config.js';

export function createHud() {
  const el = (id) => document.getElementById(id);
  const minimap = el('minimap');
  const mctx = minimap.getContext('2d');
  let toastTimer = null;
  let dialogTimer = null;

  function drawMinimap(state) {
    const S = 170;
    const half = CITY.half + 20;
    const toPx = (v) => ((v + half) / (half * 2)) * S;
    mctx.clearRect(0, 0, S, S);
    mctx.fillStyle = '#0d1230';
    mctx.fillRect(0, 0, S, S);
    // Roads.
    mctx.strokeStyle = '#3a3f52';
    mctx.lineWidth = 5;
    for (const l of state.roadLines) {
      mctx.beginPath(); mctx.moveTo(toPx(l), 0); mctx.lineTo(toPx(l), S); mctx.stroke();
      mctx.beginPath(); mctx.moveTo(0, toPx(l)); mctx.lineTo(S, toPx(l)); mctx.stroke();
    }
    // Beach strip at the bottom (south).
    mctx.fillStyle = '#b89a68';
    mctx.fillRect(0, toPx(CITY.half), S, S - toPx(CITY.half));
    mctx.fillStyle = '#1a5a8a';
    mctx.fillRect(0, toPx(CITY.half + 40), S, S - toPx(CITY.half + 40));
    // Park.
    mctx.fillStyle = '#2e6b34';
    const park = state.parkCenter;
    mctx.fillRect(toPx(park.x - 24), toPx(park.z - 24), 48 / (half * 2) * S, 48 / (half * 2) * S);
    // Mission marker: pulsing gold dot.
    if (state.marker) {
      const pulse = 4 + Math.sin(performance.now() / 200) * 1.5;
      mctx.fillStyle = '#ffd23e';
      mctx.beginPath();
      mctx.arc(toPx(state.marker.x), toPx(state.marker.z), pulse + 2, 0, Math.PI * 2);
      mctx.fill();
    }
    // Police cars: red dots.
    mctx.fillStyle = '#ff3a3a';
    for (const p of state.police) {
      mctx.beginPath();
      mctx.arc(toPx(p.x), toPx(p.z), 3.5, 0, Math.PI * 2);
      mctx.fill();
    }
    // Player: white arrow pointing along the heading.
    const px = toPx(state.player.x);
    const pz = toPx(state.player.z);
    mctx.save();
    mctx.translate(px, pz);
    mctx.rotate(state.player.heading);
    mctx.fillStyle = '#ffffff';
    mctx.beginPath();
    mctx.moveTo(0, -7); mctx.lineTo(5, 6); mctx.lineTo(-5, 6); mctx.closePath();
    mctx.fill();
    mctx.restore();
  }

  return {
    show(on) { el('hud').classList.toggle('on', on); },
    setObjective(name, text, timerText) {
      el('mname').textContent = name;
      el('mtext').textContent = text;
      el('mtime').textContent = timerText;
    },
    setStars(n) {
      let html = '';
      for (let i = 0; i < 5; i += 1) {
        html += i < n ? '★' : '<span class="dim">★</span>';
      }
      el('stars').innerHTML = html;
    },
    setCash(cash) { el('cash').textContent = `$${Math.floor(cash).toLocaleString('en-US')}`; },
    setClock(minutes) {
      const h = Math.floor(minutes / 60) % 24;
      const m = Math.floor(minutes % 60);
      el('clock').textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    },
    setHealth(hp) {
      const pct = Math.max(0, Math.min(100, hp));
      el('healthfill').style.width = `${pct}%`;
      el('healthfill').style.background = pct > 50
        ? 'linear-gradient(90deg, #37e05a, #a5ff5e)'
        : pct > 25 ? 'linear-gradient(90deg, #e0a537, #ffd23e)' : 'linear-gradient(90deg, #e03737, #ff7a5e)';
    },
    setWeapon(name, ammo) {
      el('weapon').textContent = ammo === null ? name : `${name} · ${ammo} / 12`;
    },
    setSpeed(mph, driving) {
      const s = el('speed');
      s.style.display = driving ? 'block' : 'none';
      if (driving) s.innerHTML = `${Math.round(Math.abs(mph))}<small> mph</small>`;
    },
    setHint(text) { el('hint').textContent = text; },
    setCrosshair(on) { el('crosshair').style.display = on ? 'block' : 'none'; },
    toast(text) {
      const t = el('toast');
      t.textContent = text;
      t.style.opacity = '1';
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { t.style.opacity = '0'; }, 2200);
    },
    say(who, text) {
      el('dwho').textContent = `${who}:`;
      el('dtext').textContent = text;
      el('dialog').style.display = 'block';
      if (dialogTimer) clearTimeout(dialogTimer);
      dialogTimer = setTimeout(() => { el('dialog').style.display = 'none'; }, 5200);
    },
    drawMinimap,
  };
}
