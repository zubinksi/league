import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NavBar } from '../components/NavBar';
import {
  defaultWeek,
  useLeague,
  useNflState,
  usePlayers,
  useWeekData,
} from '../hooks/useLeagueData';
import { fetchTrending } from '../api/sleeper';
import { playerFullName, type PlayerMeta } from '../api/players';
import { projectedPoints } from '../api/stats';
import { usePlayerCard } from '../components/PlayerCard';

const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF'] as const;

const fmtPts = (n: number) => n.toFixed(1);

export function PlayersPage() {
  const league = useLeague();
  const state = useNflState();
  const players = usePlayers();
  const week = defaultWeek(league.data, state.data);
  const { stats, projections } = useWeekData(league.data?.season, week);
  const trending = useQuery({
    queryKey: ['trending'],
    queryFn: () => fetchTrending('add'),
    staleTime: 15 * 60 * 1000,
  });

  const [query, setQuery] = useState('');
  const [pos, setPos] = useState<(typeof POSITIONS)[number]>('ALL');
  const openCard = usePlayerCard();

  const recValue = league.data?.scoring_settings?.rec ?? 0;
  const weekPts = (id: string) => projectedPoints(stats.data?.[id], recValue);
  const weekProj = (id: string) => projectedPoints(projections.data?.[id], recValue);

  const rows = useMemo(() => {
    const map = players.data;
    if (!map) return [];
    const matchesPos = (p: PlayerMeta) => pos === 'ALL' || p.position === pos;

    if (query.trim()) {
      const q = query.trim().toLowerCase();
      return Object.values(map)
        .filter((p) => matchesPos(p) && playerFullName(p, p.player_id).toLowerCase().includes(q))
        .sort((a, b) => (weekPts(b.player_id) ?? -1) - (weekPts(a.player_id) ?? -1))
        .slice(0, 40);
    }

    if (pos === 'ALL' && trending.data?.length) {
      return trending.data
        .map((t) => map[t.player_id])
        .filter((p): p is PlayerMeta => !!p);
    }

    // No search: rank by this week's fantasy points.
    return Object.values(map)
      .filter(matchesPos)
      .sort((a, b) => (weekPts(b.player_id) ?? -1) - (weekPts(a.player_id) ?? -1))
      .slice(0, 40);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players.data, query, pos, trending.data, stats.data, recValue]);

  const listTitle = query.trim()
    ? 'RESULTS'
    : pos === 'ALL' && trending.data?.length
      ? 'TRENDING · 24H ADDS'
      : `TOP ${pos === 'ALL' ? 'PLAYERS' : pos} · WEEK ${week}`;

  return (
    <div className="page">
      <NavBar title="Players" />
      <div className="search-wrap">
        <input
          className="search-input"
          placeholder="SEARCH PLAYERS"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          spellCheck={false}
          autoCorrect="off"
        />
      </div>
      <div className="pos-chips">
        {POSITIONS.map((p) => (
          <button key={p} className={`pos-chip${pos === p ? ' active' : ''}`} onClick={() => setPos(p)}>
            {p}
          </button>
        ))}
      </div>

      <div className="section-header">
        <span>{listTitle}</span>
        <span>PTS</span>
      </div>
      {rows.map((p) => {
        const pts = weekPts(p.player_id);
        const proj = weekProj(p.player_id);
        return (
          <div
            className="player-row clickable"
            key={p.player_id}
            role="button"
            tabIndex={0}
            onClick={() => openCard(p.player_id)}
            onKeyDown={(e) => e.key === 'Enter' && openCard(p.player_id)}
          >
            <div className="pmain">
              <div className="pname won">{playerFullName(p, p.player_id)}</div>
              <div className="psub">
                {p.team ?? 'FA'} · {p.position}
                {p.injury_status ? ` · ${p.injury_status}` : ''}
              </div>
            </div>
            {proj !== undefined && pts === undefined && <span className="pval dim">{fmtPts(proj)} PROJ</span>}
            <span className="pval">{pts !== undefined ? fmtPts(pts) : '—'}</span>
          </div>
        );
      })}
      {!rows.length && (
        <div className="state-note">{players.isLoading ? 'Loading' : 'No players found'}</div>
      )}
    </div>
  );
}
