/**
 * The arcade player sprite, for the roster card.
 *
 * public/arcade-game.html owns the full animation set. This is the standing
 * frame only, duplicated here because that file is standalone and outside the
 * build — the same arrangement as teamKits.ts, and for the same reason. A
 * standing pose is the part of the sprite least likely to change, so the two
 * copies should not drift.
 */
import { teamKit } from './teamKits';

/** Logical sprite size. Scale it by an integer to keep the pixels square. */
export const SPRITE = 20;

const BODY = [
  '....................', '....................',
  '......DDDDDDDD......', '.....DWWWWWWWWD.....', '.....DWWWWWWWWD.....',
  '.....DWWMMMMWWD.....', '.....DDWWWWWWDD.....', '.......DLLLLD.......',
  '...DDWWWWWWWWWWDD...', '..DWWWWWWWWWWWWWWD..', '..DWWWWWWWWWWWWWWD..',
  '...DWWWWWWWWWWWWD...', '...DWWWWMMMMWWWWD...', '...DWWWWMMMMWWWWD...',
  '....DWWWWWWWWWWD....', '.....DWWWWWWWWD.....',
];

const LEGS = [
  // mid-stride
  ['....DLLD....DLLD....', '....DLLD....DLLD....', '...DLLD......DLLD...', '...DDD........DDD...'],
  // feet set
  ['......DLLDDLLD......', '......DLLDDLLD......', '......DLLDDLLD......', '......DDDDDDD.......'],
  // wide, reads as a follow-through
  ['....DLLD....DLLD....', '...DLLD......DLLD...', '...DLLD......DLLD...', '..DDD..........DDD..'],
];

/** Tucked against the right hip, just outside the torso. At the game's own hip
 *  height it sits between the legs and reads as dropped. */
const BALL: [number, number][] = [
  [17, 11], [18, 11], [17, 12], [18, 12], [17, 13], [18, 13],
];

/**
 * Four silhouettes out of three leg frames and a ball, so the positions read
 * apart without drawing anything new: a passer stands set with it, a back
 * carries it mid-stride, receivers run empty, a kicker is caught wide.
 */
const POSE: Record<string, { legs: number; ball: boolean }> = {
  QB: { legs: 1, ball: true },
  RB: { legs: 0, ball: true },
  WR: { legs: 0, ball: false },
  TE: { legs: 0, ball: false },
  K: { legs: 2, ball: false },
};
const DEFAULT_POSE = POSE.WR;

const hex2rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a: string, b: string, t: number) => {
  const [ar, ag, ab] = hex2rgb(a);
  const [br, bg, bb] = hex2rgb(b);
  return (
    '#' +
    [ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t]
      .map((v) => Math.round(v).toString(16).padStart(2, '0'))
      .join('')
  );
};

/** The same three uniform tones the game derives from a club colour. */
function palette(team: string): Record<string, string | null> {
  const base = teamKit(team);
  return {
    '.': null,
    D: '#26282d',
    O: '#e8c561',
    W: base ? mix(base, '#ffffff', 0.38) : '#ffffff',
    L: base ?? '#c9c9cf',
    M: base ? mix(base, '#191b1f', 0.42) : '#8f9199',
  };
}

/** The rows for one pose, as the '.DWLM' strings above. The brand assets are
 *  generated from this so the logo and the character stay the same drawing. */
export function spriteRows(position: string): string[] {
  const pose = POSE[position.toUpperCase()] ?? DEFAULT_POSE;
  return [...BODY, ...LEGS[pose.legs]];
}

/** One pixel per logical unit, so the canvas is 20×20 and CSS does the scaling. */
export function drawSprite(ctx: CanvasRenderingContext2D, position: string, team: string): void {
  const pose = POSE[position.toUpperCase()] ?? DEFAULT_POSE;
  const rows = [...BODY, ...LEGS[pose.legs]];
  const pal = palette(team);
  ctx.clearRect(0, 0, SPRITE, SPRITE);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = pal[row[x]];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(x, y, 1, 1);
    }
  });
  if (pose.ball) {
    ctx.fillStyle = pal.O as string;
    for (const [x, y] of BALL) ctx.fillRect(x, y, 1, 1);
  }
}
