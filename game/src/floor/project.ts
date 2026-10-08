// LEMMA WORKS v3 floor — camera + projection. Exported for the HUD (lens anchoring).
//
// Convention (shared with the HUD): grid tile (x, y) covers [x, x+1) × [y, y+1).
// World px = board 2:1 projection P(gx, gy, z) from board/geom. The camera's
// (x, y) is the WORLD px point shown at the centre of the floor element, and
// zoom scales world px to CSS px.
import { P, TH, TW, TZ, type S2 } from '../board/geom';
import type { Camera } from '../state/factoryStore';
import type { Tile } from '../factory/types';

export interface View { w: number; h: number }

export const ZOOM_MIN = 0.3;
export const ZOOM_MAX = 2.6;

/** World px → CSS px inside the floor element. */
export const toScreen = (cam: Camera, v: View, p: S2): S2 => [v.w / 2 + (p[0] - cam.x) * cam.zoom, v.h / 2 + (p[1] - cam.y) * cam.zoom];
/** CSS px inside the floor element → world px. */
export const toWorld = (cam: Camera, v: View, x: number, y: number): S2 => [(x - v.w / 2) / cam.zoom + cam.x, (y - v.h / 2) / cam.zoom + cam.y];
/** World px (ground plane, z = 0) → continuous grid coordinates. */
export const gridOf = (p: S2): S2 => [p[0] / TW + p[1] / TH, p[1] / TH - p[0] / TW];
export const tileOf = (g: S2): Tile => ({ x: Math.floor(g[0]), y: Math.floor(g[1]) });
/** Grid point (continuous) → CSS px. */
export const gridToScreen = (cam: Camera, v: View, gx: number, gy: number, z = 0): S2 => toScreen(cam, v, P(gx, gy, z));

/** Screen-space bounding box (CSS px, relative to the floor element) of a grid rect lifted to height z. */
export function rectToScreen(cam: Camera, v: View, x0: number, y0: number, x1: number, y1: number, z = 0.3): { x: number; y: number; w: number; h: number } {
  const ps = [P(x0, y0, 0), P(x1, y0, 0), P(x1, y1, 0), P(x0, y1, 0), P(x0, y0, z), P(x1, y0, z), P(x0, y1, z)].map((p) => toScreen(cam, v, p));
  const xs = ps.map((p) => p[0]), ys = ps.map((p) => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** Zoom about a CSS-px anchor so the world point under it stays put. */
export function zoomAbout(cam: Camera, v: View, ax: number, ay: number, zoom: number): Camera {
  const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
  const w = toWorld(cam, v, ax, ay);
  return { x: w[0] - (ax - v.w / 2) / z, y: w[1] - (ay - v.h / 2) / z, zoom: z };
}

/** Camera that frames world-px bounds, leaving room for the floating HUD (top chip, bottom hotbar). */
export function fitCamera(b: { x0: number; y0: number; x1: number; y1: number }, v: View, opts: { top?: number; bottom?: number; side?: number; max?: number } = {}): Camera {
  const top = opts.top ?? 90, bottom = opts.bottom ?? 120, side = opts.side ?? 120;
  const aw = Math.max(200, v.w - 2 * side), ah = Math.max(160, v.h - top - bottom);
  const w = Math.max(1, b.x1 - b.x0), h = Math.max(1, b.y1 - b.y0);
  const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.min(aw / w, ah / h, opts.max ?? 1.35)));
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  // shift so the content centre lands in the middle of the free band
  const dy = (bottom - top) / 2 / zoom;
  return { x: cx, y: cy + dy, zoom };
}

export const Z_PX = TZ;
