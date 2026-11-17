// Autosave: cash, mission progress and the player's last spot, kept in
// localStorage so a session survives a closed tab. Never throws.
import { SAVE_KEY } from './config.js';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeSave(state) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: Math.round(state.cash),
      mission: state.missionIndex,
      missionsDone: state.missionsDone,
      px: state.player.pos.x,
      pz: state.player.pos.z,
      health: Math.round(state.player.health),
      savedAt: Date.now(),
    }));
  } catch {
    // Storage can be off: the game still runs, it just does not persist.
  }
}

export function clearSave() {
  try { window.localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}
