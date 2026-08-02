/** Detailed 40×48 Mini Camp hero sprite used by cards and share images. */
import { teamKit } from './teamKits';

export const SPRITE = 48;

const hex2rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a: string, b: string, t: number) => {
  const [ar, ag, ab] = hex2rgb(a), [br, bg, bb] = hex2rgb(b);
  return '#' + [ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t]
    .map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
};

export function drawSprite(ctx: CanvasRenderingContext2D, position: string, team: string): void {
  const base = teamKit(team) ?? '#8f9199';
  const C = base, HI = mix(base, '#ffffff', .38), SH = mix(base, '#17191d', .42);
  const D = '#202228', SKIN = '#b77955', GOLD = '#e8c561';
  const x0 = 4;
  const r = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color; ctx.fillRect(x0 + x, y, w, h);
  };
  ctx.clearRect(0, 0, SPRITE, SPRITE);

  // Helmet, team stripe, face and face mask.
  r(11, 2, 18, 2, D); r(9, 4, 22, 8, D);
  r(11, 4, 18, 7, HI); r(19, 4, 3, 7, GOLD);
  r(12, 10, 16, 7, D); r(14, 10, 12, 6, SKIN);
  r(15, 11, 3, 2, D); r(23, 11, 3, 2, D);
  r(14, 14, 12, 2, D); r(27, 11, 3, 6, HI);

  // Pads, jersey and a compact number mark that survives card scaling.
  r(8, 17, 24, 4, D); r(6, 20, 28, 13, D);
  r(8, 19, 24, 13, C); r(10, 19, 20, 3, HI);
  r(18, 23, 4, 7, '#ffffff'); r(15, 25, 10, 2, '#ffffff');

  // Hero pose: hands on hips, matching the final-score stance.
  r(3, 21, 9, 7, D); r(28, 21, 9, 7, D);
  r(4, 22, 7, 5, SKIN); r(29, 22, 7, 5, SKIN);
  r(9, 27, 5, 4, SKIN); r(26, 27, 5, 4, SKIN);

  // Pants, socks and planted shoes. Position changes the small prop only;
  // the full gameplay file owns the directional animation families.
  r(10, 32, 20, 5, D); r(11, 32, 18, 4, HI);
  r(11, 36, 7, 8, D); r(22, 36, 7, 8, D);
  r(12, 37, 5, 6, SH); r(23, 37, 5, 6, SH);
  r(10, 43, 9, 3, '#ffffff'); r(21, 43, 9, 3, '#ffffff');
  r(9, 46, 10, 2, D); r(21, 46, 10, 2, D);

  if (position.toUpperCase() === 'QB' || position.toUpperCase() === 'RB') {
    r(29, 27, 6, 5, D); r(30, 28, 4, 3, GOLD);
  }
}
