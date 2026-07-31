import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NavBar } from '../components/NavBar';
import {
  defaultWeek,
  useLeague,
  useNflState,
  usePlayers,
  useRosters,
  useSeasonAdp,
  useSeasonTotals,
  useWeekData,
} from '../hooks/useLeagueData';
import { fetchTrending } from '../api/sleeper';
import { playerFullName, type PlayerMeta } from '../api/players';
import { adpValue, projectedPoints } from '../api/stats';
import { usePlayerCard } from '../components/PlayerCard';

const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF'] as const;
const POOLS = ['ALL', 'AVAILABLE'] as const;
const SORTS = ['SEASON', 'WEEK', 'ADP', 'TRENDING'] as const;
type Pool = (typeof POOLS)[number];
type Sort = (typeof SORTS)[number];

const fmtPts = (n: number) => n.toFixed(1);

export function PlayersPage() {
  const league = useLeague();
  const state = useNflState();
  const players = usePlayers();
  const rosters = useRosters();
  const week = defaultWeek(league.data, state.data);
  const season = league.data?.season;
  const { stats } = useWeekData(season, week);
  const seasonTotals = useSeasonTotals(season);
  const seasonAdp = useSeasonAdp(season);
  const trending = useQuery({
    queryKey: ['trending'],
    queryFn: () => fetchTrending('add'),
    staleTime: 15 * 60 * 1000,
  });

  const [query, setQuery] = useState('');
  const [pos, setPos] = useState<(typeof POSITIONS)[number]>('ALL');
  const [pool, setPool] = useState<Pool>('ALL');
  const [sort, setSort] = useState<Sort>('SEASON');
  const openCard = usePlayerCard();

  const recValue = league.data?.scoring_settings?.rec ?? 0;
  const weekPts = (id: string) => projectedPoints(stats.data?.[id], recValue);
  const seasonPts = (id: string) => projectedPoints(seasonTotals.data?.[id], recValue);
  const adp = (id: string) => adpValue(seasonAdp.data?.[id], recValue);

  const rosteredIds = useMemo(() => {
    const set = new Set<string>();
    for (const r of rosters.data ?? []) for (const id of r.players ?? []) set.add(id);
    return set;
  }, [rosters.data]);

  const trendRank = useMemo(() => {
    const map = new Map<string, number>();
    trending.data?.forEach((t, i) => map.set(t.player_id, i));
    return map;
  }, [trending.data]);

  const rows = useMemo(() => {
    const map = players.data;
    if (!map) return [];
    const q = query.trim().toLowerCase();

    let list = Object.values(map).filter((p) => {
      if (pos !== 'ALL' && p.position !== pos) return false;
      if (pool === 'AVAILABLE' && rosteredIds.has(p.player_id)) return false;
      if (q && !playerFullName(p, p.player_id).toLowerCase().includes(q)) return false;
      return true;
    });

    const desc = (v: (p: PlayerMeta) => number | undefined) => (a: PlayerMeta, b: PlayerMeta) =>
      (v(b) ?? -1) - (v(a) ?? -1);

    switch (sort) {
      case 'SEASON':
        list.sort(desc((p) => seasonPts(p.player_id)));
        break;
      case 'WEEK':
        list.sort(desc((p) => weekPts(p.player_id)));
        break;
      case 'ADP':
        // Ascending: pick 1 first; undrafted players last.
        list.sort(
          (a, b) => (adp(a.player_id) ?? Infinity) - (adp(b.player_id) ?? Infinity),
        );
        break;
      case 'TRENDING':
        list = list.filter((p) => trendRank.has(p.player_id) || q);
        list.sort(
          (a, b) => (trendRank.get(a.player_id) ?? Infinity) - (trendRank.get(b.player_id) ?? Infinity),
        );
        break;
    }
    return list.slice(0, 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players.data, query, pos, pool, sort, rosteredIds, trendRank, stats.data, seasonTotals.data, seasonAdp.data, recValue]);

  const listTitle =
    sort === 'SEASON'
      ? `SEASON PTS${season ? ` · ${season}` : ''}`
      : sort === 'WEEK'
        ? `WEEK ${week} PTS`
        : sort === 'ADP'
          ? 'AVG DRAFT POSITION'
          : 'TRENDING · 24H ADDS';

  const valueTitle = sort === 'ADP' ? 'ADP' : sort === 'TRENDING' ? 'ADDS' : 'PTS';

  const rowValue = (p: PlayerMeta): { main: string; dim?: boolean } => {
    switch (sort) {
      case 'SEASON': {
        const v = seasonPts(p.player_id);
        return { main: v !== undefined ? fmtPts(v) : '—', dim: v === undefined };
      }
      case 'WEEK': {
        const v = weekPts(p.player_id);
        return { main: v !== undefined ? fmtPts(v) : '—', dim: v === undefined };
      }
      case 'ADP': {
        const v = adp(p.player_id);
        return { main: v !== undefined ? v.toFixed(1) : '—', dim: v === undefined };
      }
      case 'TRENDING': {
        const rank = trendRank.get(p.player_id);
        const count = rank !== undefined ? trending.data?.[rank]?.count : undefined;
        return { main: count !== undefined ? `+${count}` : '—', dim: count === undefined };
      }
    }
  };

  return (
    <div className="page">
      <NavBar title="Players" home />
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
      <div className="pos-chips filter-row">
        {POOLS.map((p) => (
          <button key={p} className={`pos-chip${pool === p ? ' active' : ''}`} onClick={() => setPool(p)}>
            {p}
          </button>
        ))}
        <span className="chip-sep" />
        {SORTS.map((s) => (
          <button key={s} className={`pos-chip${sort === s ? ' active' : ''}`} onClick={() => setSort(s)}>
            {s}
          </button>
        ))}
      </div>

      <div className="section-header">
        <span>{listTitle}</span>
        <span>{valueTitle}</span>
      </div>
      {rows.map((p) => {
        const v = rowValue(p);
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
                {pool === 'ALL' && !rosteredIds.has(p.player_id) ? ' · AVAIL' : ''}
              </div>
            </div>
            <span className={`pval${v.dim ? ' dim' : ''}`}>{v.main}</span>
          </div>
        );
      })}
      {!rows.length && (
        <div className="state-note">
          {players.isLoading || seasonTotals.isLoading ? 'Loading' : 'No players found'}
        </div>
      )}
    </div>
  );
}
