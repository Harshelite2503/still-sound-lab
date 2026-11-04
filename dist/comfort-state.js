/**
 * One place for the comfort profile's playback rules, shared by every page that plays sound:
 * output level = min(normal-day level, contour cap) + state offset + state trim (trims only lower),
 * fade-in = state fade + 0.75 s per point of "sudden sounds bother me" (never under 3 s).
 */
import { MODES, CONTOUR_BANDS, contourCeilingDb, clamp } from './comfort-engine.js';

export const PROFILE_KEY = 'still-profile-v1';
export const CONTOUR_CAP_DB = 6, LEVEL_MIN_DB = -40;

export const modeOf = p => (MODES[p?.mode] ? p.mode : 'normal');
export const capDb = p => {
  const contour = (p?.contour || []).filter(b => CONTOUR_BANDS.includes(b?.hz) && Number.isFinite(b.ceilingDb));
  return Math.min(CONTOUR_CAP_DB, contour.length >= 3 ? contourCeilingDb(contour) : CONTOUR_CAP_DB);
};
export const baseDb = p => Math.min(clamp(Number.isFinite(p?.baseLevelDb) ? p.baseLevelDb : 0, LEVEL_MIN_DB, CONTOUR_CAP_DB), capDb(p));
export const trimDb = p => clamp(Number(p?.trims?.[modeOf(p)]) || 0, -30, 0);
export const outputLevelDb = p => baseDb(p) + MODES[modeOf(p)].offsetDb + trimDb(p);
export const fadeInSeconds = p => Math.max(3, MODES[modeOf(p)].fadeSeconds + .75 * clamp(Number(p?.answers?.sudden) || 0, 0, 4));

/** The stored comfort profile, or null. Read-only; the profile page owns writing it. */
export function readComfortProfile() {
  try {
    const p = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null');
    return p && typeof p === 'object' && p.schema === PROFILE_KEY ? p : null;
  } catch { return null; }
}
