import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  useLeague,
  useNflState,
  usePlayers,
  useRosters,
  useSeasonTotals,
  useUsers,
  useWeekData,
  defaultWeek,
} from '../hooks/useLeagueData';
import { useSeasonLog } from '../hooks/useSeasonLog';
import { formatHeight, playerFullName } from '../api/players';
import { teamLabel } from '../api/sleeper';
import { projectedPoints, statPairs } from '../api/stats';
import { computeMetrics, computePointsAllowed, ordinal, type PlayerMetrics } from '../lib/metrics';
import type { StarterView } from '../lib/matchup';

/** Optional context a card is opened from (a roster row) — carries the
 *  league-exact points and game string for the THIS WEEK section. */
export type CardSeed = Pick<StarterView, 'points' | 'projected' | 'gameText' | 'state'>;

interface CardState {
  playerId: string;
  seed?: CardSeed;
}

const PlayerCardContext = createContext<(playerId: string, seed?: CardSeed) => void>(() => {});

export const usePlayerCard = () => useContext(PlayerCardContext);

const fmtPts = (n: number) => n.toFixed(1);

function Sheet({ card, onClose }: { card: CardState; onClose: () => void }) {
  const league = useLeague();
  const players = usePlayers();
  const rosters = useRosters();
  const users = useUsers();
  const state = useNflState();

  const week = defaultWeek(league.data, state.data);
  const season = league.data?.season;
  const recValue = league.data?.scoring_settings?.rec ?? 0;
  const { stats, scoreboard, projections } = useWeekData(season, week);

  const meta = players.data?.[card.playerId];
  const seasonTotals = useSeasonTotals(season);
  const log = useSeasonLog(meta, players.data, season, week, recValue);

  const metrics = useMemo(() => {
    if (!meta || !players.data) return null;
    const weeks = log.entries
      .filter((e) => e.points !== undefined)
      .map((e) => ({
        points: e.points!,
        posRank: e.posRank,
        all: log.weeklyStats[e.week - 1] ?? {},
      }));
    return computeMetrics({
      meta,
      players: players.data,
      recValue,
      weeks,
      seasonTotals: seasonTotals.data,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, players.data, recValue, log.playedWeeks, log.loading, seasonTotals.data]);

  const pointsAllowed = useMemo(() => {
    if (!players.data) return null;
    return computePointsAllowed(log.weeklyStats, log.weeklyScoreboards, players.data, recValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players.data, recValue, log.playedWeeks, log.loading]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const ownedBy = useMemo(() => {
    const roster = rosters.data?.find((r) => r.players?.includes(card.playerId));
    if (!roster) return 'FREE AGENT';
    const user = users.data?.find((u) => u.user_id === roster.owner_id);
    return teamLabel(user, roster.roster_id);
  }, [rosters.data, users.data, card.playerId]);

  // THIS WEEK — prefer the roster-row seed (league-exact points); otherwise
  // derive from the week's stats + scoreboard.
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
  const projected = seed?.projected ?? projectedPoints(projections.data?.[card.playerId], recValue);
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

  const matchupNote =
    pointsAllowed && game && meta?.position
      ? (() => {
          const r = pointsAllowed.rank(game.opponent, meta.position!);
          // Only rank against a reasonably full slate of defenses.
          if (!r || r.teams < 8) return null;
          return `${game.opponent} ALLOWS ${ordinal(r.rank)}-MOST TO ${meta.position}`;
        })()
      : null;

  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const metricTiles = (m: PlayerMetrics): { label: string; value: string }[] => {
    const pos = meta?.position ?? '';
    const t: { label: string; value: string }[] = [
      { label: 'FLOOR', value: m.floor.toFixed(1) },
      { label: 'CEILING', value: m.ceiling.toFixed(1) },
      { label: 'BOOM', value: pct(m.boomRate) },
      { label: 'BUST', value: pct(m.bustRate) },
    ];
    if (m.l4Avg !== undefined) t.push({ label: 'L4 AVG', value: m.l4Avg.toFixed(1) });
    if (m.tier1Weeks || m.tier2Weeks) {
      t.push({ label: `${pos}1 WKS`, value: `${m.tier1Weeks}/${m.gamesPlayed}` });
      if (pos === 'RB' || pos === 'WR')
        t.push({ label: `${pos}2 WKS`, value: `${m.tier2Weeks}/${m.gamesPlayed}` });
    }
    if (m.targetShare !== undefined) t.push({ label: 'TGT SHARE', value: pct(m.targetShare) });
    if (m.carryShare !== undefined && pos === 'RB')
      t.push({ label: 'CARRY SH', value: pct(m.carryShare) });
    if (m.catchRate !== undefined) t.push({ label: 'CATCH', value: pct(m.catchRate) });
    if (m.snapShare !== undefined) t.push({ label: 'SNAP', value: pct(m.snapShare) });
    return t;
  };

  const bio = meta
    ? [
        meta.age ? `AGE ${meta.age}` : null,
        formatHeight(meta.height),
        meta.weight ? `${meta.weight}LB` : null,
        meta.years_exp != null ? `EXP ${meta.years_exp}` : null,
        meta.college?.toUpperCase() ?? null,
      ].filter(Boolean)
    : [];

  const barMax = Math.max(10, ...log.entries.map((e) => e.points ?? 0));
  const n = Math.max(1, log.entries.length);
  const slot = 340 / n;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grabber" />

        <div className="sheet-header">
          <div className="sheet-name">{playerFullName(meta, card.playerId)}</div>
          <div className="sheet-sub">
            {meta?.position ?? '—'} · {meta?.team ?? 'FA'}
            {meta?.number ? ` · #${meta.number}` : ''}
            {meta?.injury_status ? ` · ${meta.injury_status.toUpperCase()}` : ''}
            <span className="sheet-owner"> · {ownedBy}</span>
          </div>
          {bio.length > 0 && <div className="sheet-bio">{bio.join(' · ')}</div>}
        </div>

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
              {gameState !== 'final' && projected !== undefined && (
                <span className="swproj">PROJ {fmtPts(projected)}</span>
              )}
            </span>
          </div>
          {matchupNote && <div className="sw-matchup">{matchupNote}</div>}
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

        {metrics && (
          <>
            <div className="sheet-section">
              <span>METRICS</span>
              <span>
                {metrics.seasonPosRank !== undefined && meta?.position
                  ? `SEASON ${meta.position}${metrics.seasonPosRank}`
                  : ''}
              </span>
            </div>
            <div className="metrics-wrap">
              <div className="stat-tiles">
                {metricTiles(metrics).map((t) => (
                  <div className="stat-tile" key={t.label}>
                    <div className="stat-tile-label">{t.label}</div>
                    <div className="stat-tile-value">{t.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

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
              <span>PTS</span>
            </div>
            {[...log.entries].reverse().map((e) => (
              <div className="log-row" key={e.week}>
                <span className="log-week">W{e.week}</span>
                <span className="log-main">
                  <span className={`log-opp${e.live ? ' live' : ''}`}>
                    {e.live && <span className="live-dot" />}
                    {e.opponent || (e.loaded ? '—' : '')}
                  </span>
                  {e.statLine && <span className="log-line">{e.statLine}</span>}
                </span>
                <span className="log-right">
                  <span className={`log-pts${e.points === undefined ? ' none' : ''}`}>
                    {e.points !== undefined ? fmtPts(e.points) : '—'}
                  </span>
                  {e.posRank !== undefined && meta?.position && (
                    <span className="log-rank">
                      {meta.position}
                      {e.posRank}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

export function PlayerCardProvider({ children }: { children: React.ReactNode }) {
  const [card, setCard] = useState<CardState | null>(null);
  const open = useCallback((playerId: string, seed?: CardSeed) => setCard({ playerId, seed }), []);
  const close = useCallback(() => setCard(null), []);

  return (
    <PlayerCardContext.Provider value={open}>
      {children}
      {card && <Sheet card={card} onClose={close} />}
    </PlayerCardContext.Provider>
  );
}
