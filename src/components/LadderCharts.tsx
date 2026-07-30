import type { AttrDetail, Rise } from '../lib/arcadeRoster';

/**
 * The two charts on a player card.
 *
 * Both are single-purpose and read-only, and both lean on the fact that every
 * ladder is measured in the same unit — rungs, 0 to 5 — even though the
 * counters underneath are pass yards, catches and field goals. That shared
 * scale is what lets three ladders sit on one pair of axes without the
 * two-y-axis lie.
 *
 * Colour: the app is near-monochrome and reserves gold for live and scoring
 * moments, so identity here is carried by direct labels on every series and
 * the three greys only keep the lines apart. Those greys fail a categorical
 * palette's hue checks by construction — they are grey on purpose — but clear
 * the separation checks that decide whether a reader can tell them apart
 * (worst adjacent pair ΔE 20 normal and under all three CVD simulations,
 * against a target of 8), because lightness is the one channel colour
 * blindness leaves alone.
 */

const TIERS = 5;
/** Fixed per attribute slot, never by rank, so a ladder keeps its shade. */
export const SERIES = ['#ececed', '#9a9ca3', '#5f6167'];

// Sized so the axis labels land inside the box: the widest ("ACCURACY 2") runs
// about 55 units from its vertex, and the bottom pair sit furthest out.
const RAD = 56;
const CX = 120;
const CY = 76;
const LABEL = 12;

/** Three axes, starting at twelve o'clock and going clockwise. */
const angle = (i: number) => (-Math.PI / 2) + (i * 2 * Math.PI) / 3;
const at = (i: number, r: number) => [CX + Math.cos(angle(i)) * r, CY + Math.sin(angle(i)) * r];

/**
 * Where a player is strong, as a shape. Three axes is the minimum a radar can
 * carry, and it is worth saying that three bars would be easier to read a
 * precise value off — the shape is the point here, and the rung rings plus the
 * count on each label are what keep the value readable anyway.
 */
export function LadderRadar({ attrs }: { attrs: AttrDetail[] }) {
  if (attrs.length < 3) return null;
  const pts = attrs
    .map((a, i) => at(i, Math.max(0.06, a.value) * RAD).map((v) => v.toFixed(1)).join(','))
    .join(' ');
  return (
    <svg className="lad-radar" viewBox="0 0 240 144" role="img"
         aria-label={attrs.map((a) => `${a.label} ${a.tier + 1} of ${TIERS}`).join(', ')}>
      {/* One ring per rung, so the shape can be counted and not only seen. */}
      {Array.from({ length: TIERS }, (_, r) => (
        <polygon
          key={r}
          className="lad-ring"
          points={Array.from({ length: 3 }, (_, i) =>
            at(i, (RAD * (r + 1)) / TIERS).map((v) => v.toFixed(1)).join(','),
          ).join(' ')}
        />
      ))}
      {attrs.map((_, i) => {
        const [x, y] = at(i, RAD);
        return <line key={i} className="lad-spoke" x1={CX} y1={CY} x2={x} y2={y} />;
      })}
      <polygon className="lad-shape" points={pts} />
      {attrs.map((a, i) => {
        const [x, y] = at(i, RAD + LABEL);
        return (
          <text
            key={a.label}
            className={`lad-axis${a.levelled ? ' fresh' : a.dropped ? ' fell' : ''}`}
            x={x}
            y={y}
            textAnchor={i === 0 ? 'middle' : i === 1 ? 'start' : 'end'}
            dominantBaseline={i === 0 ? 'auto' : 'hanging'}
          >
            {a.label.toUpperCase()} {a.tier + 1}
          </text>
        );
      })}
    </svg>
  );
}

const W = 340;
// Five rungs need room to be told apart: most players sit inside one rung of
// each other, so a short plot buries all three lines in the same few pixels.
const H = 150;
const PAD_L = 16;
const PAD_R = 62;
const PAD_T = 6;
const PAD_B = 15;

/**
 * How the rungs were earned. Stepped rather than smoothed because the data only
 * moves once a week — a diagonal between two Sundays would draw progress on
 * days nobody played.
 */
export function ClimbChart({ rises, week }: { rises: Rise[]; week: number }) {
  const n = Math.max(2, week);
  const x = (w: number) => PAD_L + ((w - 1) / (n - 1)) * (W - PAD_L - PAD_R);
  const y = (v: number) => H - PAD_B - (v / TIERS) * (H - PAD_T - PAD_B);
  const last = (s: number[]) => (s.length ? s[s.length - 1] : 0);

  const path = (s: number[]) => {
    if (!s.length) return '';
    const d = [`M ${x(1).toFixed(1)} ${y(s[0]).toFixed(1)}`];
    for (let i = 1; i < s.length; i++) {
      d.push(`H ${x(i + 1).toFixed(1)}`, `V ${y(s[i]).toFixed(1)}`);
    }
    return d.join(' ');
  };

  // Two ladders can finish a hair apart, which would stack their labels on top
  // of each other. Nudge them down the gutter until they clear, then lift the
  // whole run back inside the box if the last one has been pushed out.
  const MIN = 11;
  const labels = rises.map((r, i) => ({ i, label: r.label, y: y(last(r.series)) }));
  const order = [...labels].sort((a, b) => a.y - b.y);
  for (let k = 1; k < order.length; k++) {
    order[k].y = Math.max(order[k].y, order[k - 1].y + MIN);
  }
  const spill = order.length ? order[order.length - 1].y - (H - PAD_B) : 0;
  if (spill > 0) for (const l of order) l.y -= spill;

  return (
    <svg className="lad-climb" viewBox={`0 0 ${W} ${H}`} role="img"
         aria-label={`Rungs earned by week: ${rises
           .map((r) => `${r.label} reached ${last(r.series).toFixed(1)} of ${TIERS}`)
           .join(', ')}`}>
      {Array.from({ length: TIERS + 1 }, (_, r) => (
        <g key={r}>
          <line className="lad-grid" x1={PAD_L} y1={y(r)} x2={W - PAD_R} y2={y(r)} />
          <text className="lad-tick" x={PAD_L - 5} y={y(r)} textAnchor="end" dominantBaseline="middle">
            {r}
          </text>
        </g>
      ))}
      <text className="lad-tick" x={PAD_L} y={H - 3}>W1</text>
      <text className="lad-tick" x={W - PAD_R} y={H - 3} textAnchor="end">
        W{week}
      </text>
      {rises.map((r, i) => (
        <path key={r.label} className="lad-line" d={path(r.series)} stroke={SERIES[i]} />
      ))}
      {/* Direct-labelled at the end of every line, so identity never rests on
          the shade alone. */}
      {labels.map((l) => (
        <text
          key={l.label}
          className="lad-name"
          x={W - PAD_R + 6}
          y={l.y}
          fill={SERIES[l.i]}
          dominantBaseline="middle"
        >
          {l.label.toUpperCase()}
        </text>
      ))}
    </svg>
  );
}
