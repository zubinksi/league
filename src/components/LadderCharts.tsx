import type { AttrDetail, Rise } from '../lib/arcadeRoster';

/**
 * The two charts on a player card.
 *
 * Both lean on the fact that every ladder is measured in the same unit — rungs,
 * 0 to 5 — even though the counters underneath are pass yards, catches and
 * field goals. That shared scale is what lets three ladders sit on one pair of
 * axes without the two-y-axis lie.
 *
 * Both also come in two sizes, and the sizes are real geometry rather than a
 * CSS scale. SVG text scales with the viewBox, so a chart drawn at 340 units
 * and shown at 170px renders its 8px labels at 4px. The compact variants are
 * drawn at roughly their display width instead, which keeps type at type size
 * and is why they drop chrome rather than shrink it.
 *
 * Colour: the app is near-monochrome and reserves gold for live and scoring
 * moments, so identity is carried by labels and the three greys only keep the
 * lines apart. Those greys fail a categorical palette's hue checks by
 * construction — they are grey on purpose — but clear the separation checks
 * that decide whether a reader can tell them apart (worst adjacent pair ΔE 20
 * normal and under all three CVD simulations, against a target of 8), because
 * lightness is the one channel colour blindness leaves alone.
 */

const TIERS = 5;
/** Fixed per attribute slot, never by rank, so a ladder keeps its shade. */
export const SERIES = ['#ececed', '#9a9ca3', '#5f6167'];

/** Radar geometry. The width is set by the labels, not the shape: the widest
 *  ("ACCURACY 2") runs about 49 units from its vertex in the small size. */
const RADAR = {
  full: { w: 240, h: 144, cx: 120, cy: 76, rad: 56, label: 12 },
  compact: { w: 172, h: 136, cx: 86, cy: 60, rad: 34, label: 9 },
};

/** Three axes, starting at twelve o'clock and going clockwise. */
const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / 3;

/**
 * Where a player is strong, as a shape. Three axes is the minimum a radar can
 * carry, and three bars would be easier to read a precise value off — the shape
 * is the point here, and the rung rings plus the count on each label are what
 * keep the value readable anyway.
 *
 * Each axis carries a tick in its ladder's series colour, which makes this the
 * legend for the climb chart beside it as well as a chart in its own right.
 */
export function LadderRadar({ attrs, compact = false }: { attrs: AttrDetail[]; compact?: boolean }) {
  if (attrs.length < 3) return null;
  const g = compact ? RADAR.compact : RADAR.full;
  const at = (i: number, r: number) => [g.cx + Math.cos(angle(i)) * r, g.cy + Math.sin(angle(i)) * r];
  const pts = attrs
    .map((a, i) => at(i, Math.max(0.06, a.value) * g.rad).map((v) => v.toFixed(1)).join(','))
    .join(' ');
  return (
    <svg
      className={`lad-radar${compact ? ' sm' : ''}`}
      viewBox={`0 0 ${g.w} ${g.h}`}
      role="img"
      aria-label={attrs.map((a) => `${a.label} ${a.tier + 1} of ${TIERS}`).join(', ')}
    >
      {/* One ring per rung, so the shape can be counted and not only seen. */}
      {Array.from({ length: TIERS }, (_, r) => (
        <polygon
          key={r}
          className="lad-ring"
          points={Array.from({ length: 3 }, (_, i) =>
            at(i, (g.rad * (r + 1)) / TIERS).map((v) => v.toFixed(1)).join(','),
          ).join(' ')}
        />
      ))}
      {attrs.map((_, i) => {
        const [x, y] = at(i, g.rad);
        return <line key={i} className="lad-spoke" x1={g.cx} y1={g.cy} x2={x} y2={y} />;
      })}
      <polygon className="lad-shape" points={pts} />
      {/* The series tick: this axis is that line over there. */}
      {attrs.map((_, i) => {
        const [x1, y1] = at(i, g.rad - (compact ? 5 : 7));
        const [x2, y2] = at(i, g.rad);
        return (
          <line key={i} className="lad-key" x1={x1} y1={y1} x2={x2} y2={y2} stroke={SERIES[i]} />
        );
      })}
      {attrs.map((a, i) => {
        const [x, y] = at(i, g.rad + g.label);
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

/** Climb geometry. The compact one gives up the rung numbers and the end
 *  labels — the radar beside it names and colours all three — and spends the
 *  room it saves on the plot. */
const CLIMB = {
  full: { w: 340, h: 150, l: 16, r: 62, t: 6, b: 15, ticks: true, names: true },
  compact: { w: 170, h: 136, l: 8, r: 8, t: 6, b: 14, ticks: false, names: false },
};

/**
 * How the rungs were earned. Stepped rather than smoothed because the data only
 * moves once a week — a diagonal between two Sundays would draw progress on
 * days nobody played.
 */
export function ClimbChart({
  rises,
  week,
  compact = false,
}: {
  rises: Rise[];
  week: number;
  compact?: boolean;
}) {
  const g = compact ? CLIMB.compact : CLIMB.full;
  const n = Math.max(2, week);
  const x = (w: number) => g.l + ((w - 1) / (n - 1)) * (g.w - g.l - g.r);
  const y = (v: number) => g.h - g.b - (v / TIERS) * (g.h - g.t - g.b);
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
  if (g.names) {
    const order = [...labels].sort((a, b) => a.y - b.y);
    for (let k = 1; k < order.length; k++) {
      order[k].y = Math.max(order[k].y, order[k - 1].y + MIN);
    }
    const spill = order.length ? order[order.length - 1].y - (g.h - g.b) : 0;
    if (spill > 0) for (const l of order) l.y -= spill;
  }

  return (
    <svg
      className={`lad-climb${compact ? ' sm' : ''}`}
      viewBox={`0 0 ${g.w} ${g.h}`}
      role="img"
      aria-label={`Rungs earned by week: ${rises
        .map((r) => `${r.label} reached ${last(r.series).toFixed(1)} of ${TIERS}`)
        .join(', ')}`}
    >
      {Array.from({ length: TIERS + 1 }, (_, r) => (
        <g key={r}>
          <line className="lad-grid" x1={g.l} y1={y(r)} x2={g.w - g.r} y2={y(r)} />
          {g.ticks && (
            <text className="lad-tick" x={g.l - 5} y={y(r)} textAnchor="end" dominantBaseline="middle">
              {r}
            </text>
          )}
        </g>
      ))}
      <text className="lad-tick" x={g.l} y={g.h - 3}>W1</text>
      <text className="lad-tick" x={g.w - g.r} y={g.h - 3} textAnchor="end">
        W{week}
      </text>
      {rises.map((r, i) => (
        <path key={r.label} className="lad-line" d={path(r.series)} stroke={SERIES[i]} />
      ))}
      {/* Direct-labelled at the end of every line, so identity never rests on
          the shade alone. The compact one hands that job to the radar's axis
          ticks, which carry the same three colours in the same order. */}
      {g.names &&
        labels.map((l) => (
          <text
            key={l.label}
            className="lad-name"
            x={g.w - g.r + 6}
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
