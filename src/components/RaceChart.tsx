import { useMemo, useRef, type CSSProperties, type PointerEvent } from 'react';
import type { MatchupView } from '../lib/matchup';
import type { MatchupTimeline } from '../lib/timeline';
import { buildChartModel, py, CHART_W, CHART_H } from '../lib/chart';
import { usePulseOnIncrease } from '../hooks/usePulseOnIncrease';

/** Style prop with the CSS `d`/`cy` properties so path morphs animate via the
 *  0.6s transition in browsers that support them (attribute set as fallback). */
const pathStyle = (d: string): CSSProperties => ({ d: `path("${d}")` }) as CSSProperties;

const TOUCH_HOLD_MS = 180;
/** Horizontal movement beyond this activates the scrub immediately. */
const ACTIVATE_DX = 8;
/** Clearly-vertical movement beyond this yields the gesture to page scroll. */
const CANCEL_DY = 16;

export function RaceChart({
  view,
  timeline,
  scrubTau,
  onScrub,
}: {
  view: MatchupView;
  timeline: MatchupTimeline | null;
  scrubTau: number | null;
  onScrub: (tau: number | null) => void;
}) {
  const model = useMemo(() => buildChartModel(view, timeline), [view, timeline]);
  const pulse = usePulseOnIncrease(view.home.score + view.away.score);

  const zoneRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const active = useRef(false);
  const pending = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tauFromClientX = (clientX: number): number => {
    const rect = svgRef.current!.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * CHART_W;
    const frac = Math.min(1, Math.max(0, x / model.nowX));
    return timeline!.fromWarped(frac * timeline!.warpedDuration);
  };

  const activate = (pointerId: number, clientX: number) => {
    active.current = true;
    try {
      zoneRef.current?.setPointerCapture(pointerId);
    } catch {
      /* pointer already gone */
    }
    onScrub(tauFromClientX(clientX));
  };

  const clearPending = () => {
    if (holdTimer.current !== null) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    pending.current = null;
  };

  const end = () => {
    clearPending();
    if (active.current) {
      active.current = false;
      onScrub(null);
    }
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!timeline) return;
    if (e.pointerType === 'mouse') {
      if (e.button !== 0) return;
      activate(e.pointerId, e.clientX);
    } else {
      // Touch: activate on a horizontal slide or a short stationary hold;
      // a clearly vertical move yields the gesture to page scrolling.
      pending.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
      holdTimer.current = setTimeout(() => {
        if (pending.current) {
          activate(pending.current.pointerId, pending.current.x);
          pending.current = null;
        }
      }, TOUCH_HOLD_MS);
    }
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (active.current) {
      onScrub(tauFromClientX(e.clientX));
    } else if (pending.current) {
      // Direction is measured from the original touch point.
      const dx = e.clientX - pending.current.x;
      const dy = e.clientY - pending.current.y;
      if (Math.abs(dx) > ACTIVATE_DX && Math.abs(dx) >= Math.abs(dy)) {
        const { pointerId } = pending.current;
        clearPending();
        activate(pointerId, e.clientX);
      } else if (Math.abs(dy) > CANCEL_DY && Math.abs(dy) > Math.abs(dx)) {
        clearPending();
      }
    }
  };

  const scrub =
    scrubTau !== null && timeline
      ? (() => {
          const frac = timeline.toWarped(scrubTau) / (timeline.warpedDuration || 1);
          return {
            x: Math.min(1, Math.max(0, frac)) * model.nowX,
            homeY: py(timeline.sideAt('home', scrubTau), model.maxY),
            awayY: py(timeline.sideAt('away', scrubTau), model.maxY),
          };
        })()
      : null;

  return (
    <div
      ref={zoneRef}
      className={`scrub-zone${timeline ? ' scrubbable' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onPointerLeave={end}
    >
    <svg
      ref={svgRef}
      className="race-chart"
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {/* lead gap fill */}
      <path className="morph" d={model.gap} style={pathStyle(model.gap)} fill="var(--gap-fill)" />

      {/* away curve */}
      <path
        className="morph"
        d={model.awayPath}
        style={pathStyle(model.awayPath)}
        fill="none"
        stroke="var(--line-away)"
        strokeWidth="1"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {model.awayDash && (
        <path
          className="morph"
          d={model.awayDash}
          style={pathStyle(model.awayDash)}
          fill="none"
          stroke="var(--dash-away)"
          strokeWidth="1"
          strokeDasharray="2 3"
        />
      )}

      {/* home curve */}
      <path
        className="morph"
        d={model.homePath}
        style={pathStyle(model.homePath)}
        fill="none"
        stroke="var(--line-home)"
        strokeWidth="1"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {model.homeDash && (
        <path
          className="morph"
          d={model.homeDash}
          style={pathStyle(model.homeDash)}
          fill="none"
          stroke="var(--dash-home)"
          strokeWidth="1"
          strokeDasharray="2 3"
        />
      )}

      {/* endpoint dot — endpulse on live score change */}
      <circle
        key={pulse}
        className={`end-dot${pulse ? ' anim-endpulse' : ''}`}
        cx={model.dot.cx}
        cy={model.dot.cy}
        style={{ cy: model.dot.cy } as CSSProperties}
        r="2.4"
        fill="#ffffff"
      />

      {/* scrub crosshair — monochrome; gold stays reserved for live */}
      {scrub && (
        <g>
          <line
            x1={scrub.x}
            x2={scrub.x}
            y1={0}
            y2={CHART_H}
            stroke="rgba(255,255,255,0.22)"
            strokeWidth="1"
          />
          <circle cx={scrub.x} cy={scrub.awayY} r="2.2" fill="rgba(235,235,240,0.6)" />
          <circle cx={scrub.x} cy={scrub.homeY} r="2.2" fill="#ffffff" />
        </g>
      )}
    </svg>
    </div>
  );
}
