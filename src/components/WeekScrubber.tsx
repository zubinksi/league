import { useCallback, useRef, useState } from 'react';

interface Props {
  week: number;
  total: number;
  /** The real in-progress week, marked even when another week is selected. */
  currentWeek: number;
  onChange: (week: number) => void;
}

/**
 * One tick per week. Tap a tick to jump; press and drag across the rail to
 * scrub continuously. Height and weight encode past / future / live / selected.
 */
export function WeekScrubber({ week, total, currentWeek, onChange }: Props) {
  const rail = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const weekAt = useCallback(
    (clientX: number) => {
      const el = rail.current;
      if (!el) return week;
      const box = el.getBoundingClientRect();
      const t = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
      return Math.round(t * (total - 1)) + 1;
    },
    [total, week],
  );

  const set = (next: number) => {
    if (next !== week) onChange(next);
  };

  return (
    <div
      ref={rail}
      className="week-scrub"
      role="slider"
      tabIndex={0}
      aria-label="Week"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={week}
      aria-valuetext={`Week ${week}`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
        set(weekAt(e.clientX));
      }}
      onPointerMove={(e) => {
        if (dragging) set(weekAt(e.clientX));
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        setDragging(false);
      }}
      onPointerCancel={() => setDragging(false)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') { e.preventDefault(); set(Math.max(1, week - 1)); }
        if (e.key === 'ArrowRight') { e.preventDefault(); set(Math.min(total, week + 1)); }
        if (e.key === 'Home') { e.preventDefault(); set(1); }
        if (e.key === 'End') { e.preventDefault(); set(total); }
      }}
    >
      {Array.from({ length: total }, (_, i) => i + 1).map((w) => {
        const state =
          w === week ? 'active' : w === currentWeek ? 'live' : w < currentWeek ? 'past' : 'future';
        return (
          <span className="week-tick-cell" key={w}>
            <span className={`week-tick ${state}`} />
          </span>
        );
      })}
    </div>
  );
}
