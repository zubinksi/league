import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  useLeague,
  useNflState,
  usePlayers,
  usePriorSeasonTotals,
  useWeekData,
  defaultWeek,
} from '../hooks/useLeagueData';
import { useSeasonLog } from '../hooks/useSeasonLog';
import { playerFullName } from '../api/players';
import { gameLogColumns, projectedPoints, statPairs } from '../api/stats';
import { Sprite } from './Sprite';
import { ClimbChart, LadderRadar } from './LadderCharts';
import { arcadePlayer, climb, sidelined, type Rise } from '../lib/arcadeRoster';
import type { StarterView } from '../lib/matchup';

/** Optional context a card is opened from (a roster row) — carries the
 *  league-exact points and game string for the THIS WEEK section. */
export type CardSeed = Pick<StarterView, 'points' | 'projected' | 'gameText' | 'state'>;

interface CardState {
  playerId: string;
  seed?: CardSeed;
  /** Open on the short version: who he is and what he can do, nothing else.
   *  The arcade asks for this — you are mid-lineup, not reading a season. */
  brief?: boolean;
}

const PlayerCardContext = createContext<
  (playerId: string, seed?: CardSeed, brief?: boolean) => void
>(() => {});

export const usePlayerCard = () => useContext(PlayerCardContext);

const fmtPts = (n: number) => n.toFixed(1);
const TIERS = 5;

/** Past this, a downward drag is a dismissal rather than a fidget. Capped so a
 *  tall card is not harder to close than a short one. */
const DISMISS = (h: number) => Math.min(120, h * 0.28);
/** px per ms — a flick, not a drag. */
const FLING = 0.5;
/** Velocity over the last of these, not since the last frame: one slow frame at
 *  the end of a real flick is normal, and reading only that frame throws the
 *  gesture away. */
const VWINDOW = 100;
/** Enough movement that the pointer-up was a gesture, not a tap. */
const SLOP = 6;

/**
 * Everything here is one question: how did this arcade character get made.
 *
 * The card used to carry start/sit tooling — boom and bust rates, tier weeks,
 * target share, a projection, what the opponent allows. All of it answered
 * "should I start him", and there is no lineup to set any more. What is left is
 * the ladders, the weeks they were climbed, and the real production underneath
 * them, which were always the same numbers wearing two different hats.
 *
 * The three of those that fit on one screen — the radar, the climb and this
 * week — sit side by side in a pager, because they are peers: three readings of
 * the same player, none of them the parent of the others. Stacked, the second
 * and third were a scroll nobody took. The season strip and the game log are
 * still behind "Full card": the log alone is 633px, four times any page, and
 * paging to a section that tall is a worse deal than scrolling to it.
 */
function Sheet({ card, onClose }: { card: CardState; onClose: () => void }) {
  const league = useLeague();
  const players = usePlayers();
  const state = useNflState();
  // The season and the game log are a lot to hand someone who asked "who is
  // this guy" while picking a lineup. They are one tap away.
  const [full, setFull] = useState(!card.brief);

  const week = defaultWeek(league.data, state.data);
  const season = league.data?.season;
  const recValue = league.data?.scoring_settings?.rec ?? 0;
  const { stats, scoreboard } = useWeekData(season, week);
  const prior = usePriorSeasonTotals(season);

  const meta = players.data?.[card.playerId];
  const log = useSeasonLog(meta, players.data, season, week, recValue);

  // Built here rather than handed in, so a card opened from anywhere in the app
  // is the same card.
  const arc = useMemo(
    () =>
      players.data
        ? arcadePlayer(card.playerId, players.data, log.weeklyStats, prior.data, scoreboard.data)
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [players.data, card.playerId, log.playedWeeks, log.loading, prior.data, scoreboard.data],
  );

  const rises: Rise[] = useMemo(
    () => (meta?.position ? climb(meta.position, card.playerId, log.weeklyStats, prior.data) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [meta?.position, card.playerId, log.playedWeeks, log.loading, prior.data],
  );

  /** The last rung to move, either way — the short card's whole answer to
   *  "is he heating up or cooling off". */
  const lastMove = useMemo(() => {
    let best: { week: number; tier: number; dir: number; label: string } | null = null;
    for (const r of rises)
      for (const s of r.steps)
        if (!best || s.week > best.week) best = { ...s, label: r.label };
    return best;
  }, [rises]);

  /** Rungs crossed, by the week they were crossed in. Named by the ladder that
   *  moved and the rung it reached — which is the useful half of what the tier
   *  names used to say, without a vocabulary to learn. */
  const crossings = useMemo(() => {
    const m = new Map<number, { text: string; dir: number }[]>();
    for (const r of rises)
      for (const s of r.steps)
        m.set(s.week, [
          ...(m.get(s.week) ?? []),
          { text: `${r.label} ${s.tier + 1}`, dir: s.dir },
        ]);
    return m;
  }, [rises]);

  // ---- the pager ----
  // A native scroll-snap track rather than a translated rail: it gets momentum,
  // rubber-banding and the platform's own fling curve for free, and because the
  // pages are equal-width flex children the browser's page maths is the same as
  // ours. They also stretch to the tallest of them, so switching pages never
  // resizes the sheet.
  const trackRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [page, setPage] = useState(0);

  const goTo = useCallback((i: number) => {
    const el = trackRef.current;
    if (!el) return;
    // scrollTo ignores the CSS scroll-behavior override, so ask directly.
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ left: i * el.clientWidth, behavior: still ? 'auto' : 'smooth' });
    setPage(i);
  }, []);

  // ---- drag to dismiss ----
  // Only from the grabber. The card scrolls vertically and pages horizontally,
  // so a third gesture needs its own patch of screen or it steals from one of
  // them; the grabber is that patch, and it sits above both.
  const sheetRef = useRef<HTMLDivElement>(null);
  const grab = useRef<{ y: number; trail: { y: number; t: number }[] } | null>(null);
  const dragged = useRef(false);
  const [drag, setDrag] = useState<number | null>(null);

  /** How fast the finger was moving down, over the trailing window. */
  const speed = (trail: { y: number; t: number }[]) => {
    const now = trail[trail.length - 1];
    const from = trail.find((s) => now.t - s.t <= VWINDOW) ?? trail[0];
    return now.t > from.t ? (now.y - from.y) / (now.t - from.t) : 0;
  };

  const onGrabDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    // Keeps the moves coming when the finger leaves the 26px handle, which it
    // does immediately. Throws if the pointer is already gone; the drag still
    // works, it just ends early.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* no capture, no harm */
    }
    grab.current = { y: e.clientY, trail: [{ y: e.clientY, t: performance.now() }] };
    dragged.current = false;
    setDrag(0);
  };

  const onGrabMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const g = grab.current;
    if (!g) return;
    g.trail.push({ y: e.clientY, t: performance.now() });
    if (g.trail.length > 12) g.trail.shift();
    const dy = e.clientY - g.y;
    if (Math.abs(dy) > SLOP) dragged.current = true;
    // Up is resisted rather than blocked, so the card answers the finger.
    setDrag(dy > 0 ? dy : dy / 4);
  };

  const onGrabUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const g = grab.current;
    if (!g) return;
    grab.current = null;
    g.trail.push({ y: e.clientY, t: performance.now() });
    const dy = e.clientY - g.y;
    const h = sheetRef.current?.offsetHeight ?? 480;
    if (dy > DISMISS(h) || (speed(g.trail) > FLING && dy > SLOP)) onClose();
    else setDrag(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const weekStats = stats.data?.[card.playerId];
  const game = meta?.team ? scoreboard.data?.[meta.team] : undefined;
  const seed = card.seed;
  const gameState = seed?.state ?? game?.state ?? 'pre';
  const points =
    seed !== undefined
      ? seed.points
      : gameState !== 'pre'
        ? projectedPoints(weekStats, recValue) ?? 0
        : null;
  const gameText =
    seed?.gameText ??
    (game
      ? `${game.home ? 'vs' : '@'} ${game.opponent}${
          game.state === 'live' ? ` · ${game.quarter ?? ''}` : game.state === 'final' ? ' · FINAL' : ''
        }`
      : meta?.team
        ? 'BYE'
        : '');

  const pairs = statPairs(meta?.position ?? null, weekStats);
  const logCols = gameLogColumns(meta?.position ?? null);
  const logGridStyle = {
    gridTemplateColumns:
      logCols.length > 0 ? `30px 52px repeat(${logCols.length}, 1fr) 46px` : '30px 1fr 46px',
  };

  // What this week put on the counters — the line between a real Sunday and the
  // character, which the card never used to draw.
  const added = rises.filter((r) => r.added > 0);

  const barMax = Math.max(10, ...log.entries.map((e) => e.points ?? 0));
  const n = Math.max(1, log.entries.length);
  const slot = 340 / n;

  // The pages, in the order they answer "who is this": what he is good at, how
  // he got there, what he did on Sunday. A ladder needs three axes to draw and
  // the climb needs at least one rung crossed, so either can be missing.
  const pages: { key: string; label: string; meta: string; body: React.ReactNode }[] = [];

  if (arc && arc.attrs.length >= 3) {
    pages.push({
      key: 'ladders',
      label: 'LADDERS',
      meta: `RUNG ${arc.attrs.reduce((s, a) => s + a.tier + 1, 0)} / ${arc.attrs.length * TIERS}`,
      body: (
        <>
          <div className="lad-wrap">
            <LadderRadar attrs={arc.attrs} />
          </div>
          <div className="lad-next">
            {arc.attrs.map((a) => (
              <span key={a.label}>
                <b>{a.stat.toLocaleString()}</b> {a.unit} pace ·{' '}
                {a.nextAt === null
                  ? `${a.label} maxed`
                  : `${a.label} ${a.tier + 2} at ${a.nextAt.toLocaleString()}`}
              </span>
            ))}
          </div>
        </>
      ),
    });
  }

  if (rises.length > 0) {
    pages.push({
      key: 'climb',
      label: 'THE CLIMB',
      meta: 'RUNGS BY WEEK',
      body: (
        <div className="lad-wrap">
          <ClimbChart rises={rises} week={week} />
        </div>
      ),
    });
  }

  pages.push({
    key: 'week',
    label: 'THIS WEEK',
    meta: `WEEK ${week}`,
    body: (
      <div className="sheet-week">
        <div className="sheet-week-score">
          <span className={`swpts${gameState === 'live' ? ' live' : ''}`}>
            {points === null || points === undefined ? '—' : fmtPts(points)}
          </span>
          <span className="swmeta">
            {gameState === 'live' && <span className="live-dot" />}
            <span className={gameState === 'live' ? 'swgame live' : 'swgame'}>{gameText}</span>
          </span>
        </div>
        {added.length > 0 && (
          <div className="sw-added">
            {added.map((r) => (
              <span key={r.label}>
                <b>+{Math.round(r.added)}</b> {r.label}
              </span>
            ))}
          </div>
        )}
        {pairs.length > 0 && (
          <div className="stat-tiles">
            {pairs.map((p) => (
              <div className="stat-tile" key={p.label}>
                <div className="stat-tile-label">{p.label}</div>
                <div className="stat-tile-value">{p.value}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    ),
  });

  // A page can disappear between renders (the climb, once the data says no rung
  // ever moved), so the index is clamped rather than trusted.
  const cur = Math.min(page, pages.length - 1);

  const onTabKey = (e: React.KeyboardEvent) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (cur + step + pages.length) % pages.length;
    goTo(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <div
      className="sheet-backdrop"
      onClick={onClose}
      style={drag ? { opacity: Math.max(0.2, 1 - drag / 260) } : undefined}
    >
      <div
        className={`sheet${drag === null ? '' : ' dragging'}`}
        ref={sheetRef}
        onClick={(e) => e.stopPropagation()}
        style={drag === null ? undefined : { transform: `translateY(${drag.toFixed(1)}px)` }}
      >
        <button
          className="sheet-grab"
          aria-label="Close player card"
          onPointerDown={onGrabDown}
          onPointerMove={onGrabMove}
          onPointerUp={onGrabUp}
          onPointerCancel={onGrabUp}
          onClick={() => {
            // A drag that fell short of the threshold ends in a pointerup on
            // this button, which the browser then calls a click.
            if (!dragged.current) onClose();
          }}
        >
          <span className="sheet-grabber" />
        </button>

        <div className="sheet-header">
          <div className="sheet-id">
            {meta?.position && <Sprite position={meta.position} team={meta.team ?? ''} size={40} />}
            <div>
              <div className="sheet-name">{playerFullName(meta, card.playerId)}</div>
              <div className="sheet-sub">
                {meta?.position ?? '—'} · {meta?.team ?? 'FA'}
                {meta?.number ? ` · #${meta.number}` : ''}
                {arc?.status && (
                  <i className={`status-flag ${sidelined(arc.status) ? 'out' : 'risk'}`}>
                    {' '}
                    {arc.status}
                  </i>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="pg-tabs" role="tablist" aria-label="Player sections" onKeyDown={onTabKey}>
          {pages.map((p, i) => (
            <button
              key={p.key}
              role="tab"
              id={`pgt-${p.key}`}
              aria-controls={`pgp-${p.key}`}
              aria-selected={i === cur}
              tabIndex={i === cur ? 0 : -1}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              onClick={() => goTo(i)}
            >
              {p.label}
            </button>
          ))}
          <span className="pg-meta">{pages[cur].meta}</span>
        </div>
        <div
          className="pg-track"
          ref={trackRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            setPage(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
          }}
        >
          {pages.map((p) => (
            <div
              key={p.key}
              className="pg-page"
              role="tabpanel"
              id={`pgp-${p.key}`}
              aria-labelledby={`pgt-${p.key}`}
            >
              {p.body}
            </div>
          ))}
        </div>

        {!full && (
          <div className="lad-brief">
            <span className="lad-move">
              {lastMove ? (
                <>
                  <i className={lastMove.dir < 0 ? 'down' : ''}>{lastMove.dir < 0 ? '▼' : '▲'}</i>{' '}
                  {lastMove.label} {lastMove.tier + 1} in week {lastMove.week}
                </>
              ) : (
                'No rungs moved this season'
              )}
            </span>
            <button className="lad-more" onClick={() => setFull(true)}>
              Full card
            </button>
          </div>
        )}

        {full && (
        <>
        <div className="sheet-section">
          <span>SEASON</span>
          <span>{log.playedWeeks} GP</span>
        </div>
        {log.loading && log.playedWeeks === 0 ? (
          <div className="state-note">Loading</div>
        ) : (
          <>
            <svg className="season-strip" viewBox="0 0 340 64" preserveAspectRatio="none" aria-hidden="true">
              {log.entries.map((e, i) => {
                const h = e.points !== undefined ? Math.max(1.5, (e.points / barMax) * 58) : 1.5;
                return (
                  <rect
                    key={e.week}
                    x={i * slot + slot * 0.225}
                    y={64 - h}
                    width={slot * 0.55}
                    height={h}
                    fill={e.live ? 'var(--accent-live)' : 'rgba(255,255,255,0.28)'}
                  />
                );
              })}
            </svg>
            <div className="season-summary">
              <span>
                <i>TOTAL</i> {fmtPts(log.total)}
              </span>
              <span>
                <i>AVG</i> {fmtPts(log.average)}
              </span>
              <span>
                <i>HIGH</i> {log.high !== undefined ? fmtPts(log.high) : '—'}
              </span>
              <span>
                <i>LOW</i> {log.low !== undefined ? fmtPts(log.low) : '—'}
              </span>
            </div>

            <div className="sheet-section">
              <span>GAME LOG</span>
              <span>{logCols.length === 0 ? 'PTS' : ''}</span>
            </div>
            {logCols.length > 0 && (
              <div className="log-grid log-head" style={logGridStyle}>
                <span />
                <span />
                {logCols.map((c) => (
                  <span key={c.label} className="log-stat">
                    {c.label}
                  </span>
                ))}
                <span className="log-stat">PTS</span>
              </div>
            )}
            {[...log.entries].reverse().map((e) => {
              const weekStatsRow = log.weeklyStats[e.week - 1]?.[card.playerId];
              const gained = crossings.get(e.week);
              return (
                <div key={e.week}>
                  <div className="log-grid" style={logGridStyle}>
                    <span className="log-week">W{e.week}</span>
                    <span className={`log-opp${e.live ? ' live' : ''}`}>
                      {e.live && <span className="live-dot" />}
                      {e.opponent || (e.loaded ? '—' : '')}
                    </span>
                    {logCols.map((c) => (
                      <span key={c.label} className="log-stat">
                        {e.points !== undefined ? c.value(weekStatsRow) : ''}
                      </span>
                    ))}
                    <span className="log-right">
                      <span className={`log-pts${e.points === undefined ? ' none' : ''}`}>
                        {e.points !== undefined ? fmtPts(e.points) : '—'}
                      </span>
                    </span>
                  </div>
                  {gained && (
                    <div className="log-rung">
                      {gained.map((g) => (
                        <span key={g.text} className={g.dir < 0 ? 'down' : ''}>
                          {g.dir < 0 ? '▼' : '▲'} {g.text}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
        </>
        )}
      </div>
    </div>
  );
}

export function PlayerCardProvider({ children }: { children: React.ReactNode }) {
  const [card, setCard] = useState<CardState | null>(null);
  const open = useCallback(
    (playerId: string, seed?: CardSeed, brief?: boolean) => setCard({ playerId, seed, brief }),
    [],
  );
  const close = useCallback(() => setCard(null), []);

  return (
    <PlayerCardContext.Provider value={open}>
      {children}
      {card && <Sheet card={card} onClose={close} />}
    </PlayerCardContext.Provider>
  );
}
