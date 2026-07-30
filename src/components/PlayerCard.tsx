import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
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

/**
 * Everything here is one question: how did this arcade character get made.
 *
 * The card used to carry start/sit tooling — boom and bust rates, tier weeks,
 * target share, a projection, what the opponent allows. All of it answered
 * "should I start him", and there is no lineup to set any more. What is left is
 * the ladders, the weeks they were climbed, and the real production underneath
 * them, which were always the same numbers wearing two different hats.
 */
function Sheet({ card, onClose }: { card: CardState; onClose: () => void }) {
  const league = useLeague();
  const players = usePlayers();
  const state = useNflState();
  // The season, the game log and the week's box score are a lot to hand someone
  // who asked "who is this guy" while picking a lineup. They are one tap away.
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

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grabber" />

        <div className="sheet-header">
          <div className="sheet-id">
            {meta?.position && <Sprite position={meta.position} team={meta.team ?? ''} size={40} />}
            <div>
              <div className="sheet-name">{playerFullName(meta, card.playerId)}</div>
              <div className="sheet-sub">
                {meta?.position ?? '—'} · {meta?.team ?? 'FA'}
                {meta?.number ? ` · #${meta.number}` : ''}
                {arc?.status && (
                  <i className={`rp-status ${sidelined(arc.status) ? 'out' : 'risk'}`}>
                    {' '}
                    {arc.status}
                  </i>
                )}
              </div>
            </div>
          </div>
        </div>

        {arc && arc.attrs.length >= 3 && (
          <>
            <div className="sheet-section">
              <span>LADDERS</span>
              <span>RUNG {arc.attrs.reduce((s, a) => s + a.tier + 1, 0)} / {arc.attrs.length * TIERS}</span>
            </div>
            {/* Short card: both charts at once, because picking between two
                players is a question about shape and direction together. */}
            <div className={full ? 'lad-wrap' : 'lad-pair'}>
              <LadderRadar attrs={arc.attrs} compact={!full} />
              {!full && rises.length > 0 && <ClimbChart rises={rises} week={week} compact />}
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
        )}

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

        {full && rises.length > 0 && (
          <>
            <div className="sheet-section">
              <span>THE CLIMB</span>
              <span>RUNGS BY WEEK</span>
            </div>
            <div className="lad-wrap">
              <ClimbChart rises={rises} week={week} />
            </div>
          </>
        )}

        {full && (
        <>
        <div className="sheet-section">
          <span>THIS WEEK</span>
          <span>WEEK {week}</span>
        </div>
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
