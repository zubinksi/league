import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { NavBar } from '../components/NavBar';
import {
  defaultWeek,
  useLeague,
  useNflState,
  useRosters,
  useUsers,
  useWeekData,
} from '../hooks/useLeagueData';
import { rosterPoints, teamLabel, type SleeperMatchupEntry } from '../api/sleeper';

const fmtPts = (n: number) => n.toFixed(1);

export function LeaguePage() {
  const league = useLeague();
  const users = useUsers();
  const rosters = useRosters();
  const state = useNflState();

  const [weekOverride, setWeekOverride] = useState<number | null>(null);
  const currentWeek = defaultWeek(league.data, state.data);
  const week = weekOverride ?? currentWeek;
  const { matchups } = useWeekData(league.data?.season, week);

  const labelFor = (rosterId: number) => {
    const roster = rosters.data?.find((r) => r.roster_id === rosterId);
    const user = users.data?.find((u) => u.user_id === roster?.owner_id);
    return teamLabel(user, rosterId);
  };

  const standings = useMemo(() => {
    if (!rosters.data) return [];
    return [...rosters.data].sort((a, b) => {
      const winsDiff = b.settings.wins - a.settings.wins;
      if (winsDiff !== 0) return winsDiff;
      return rosterPoints(b).pf - rosterPoints(a).pf;
    });
  }, [rosters.data]);

  const weekMatchups = useMemo(() => {
    const byId = new Map<number, SleeperMatchupEntry[]>();
    for (const e of matchups.data ?? []) {
      if (e.matchup_id === null) continue;
      byId.set(e.matchup_id, [...(byId.get(e.matchup_id) ?? []), e]);
    }
    return [...byId.entries()]
      .filter(([, pair]) => pair.length === 2)
      .sort(([a], [b]) => a - b);
  }, [matchups.data]);

  return (
    <div className="page">
      <NavBar title={league.data ? league.data.name : 'League'} />

      <div className="section-header">
        <span>MATCHUPS</span>
        <span className="week-nav">
          <button onClick={() => setWeekOverride(Math.max(1, week - 1))} disabled={week <= 1} aria-label="Previous week">
            <svg width="7" height="11" viewBox="0 0 7 11" fill="none">
              <path d="M6 1 L1.5 5.5 L6 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <span className="week-label">WEEK {week}</span>
          <button onClick={() => setWeekOverride(Math.min(18, week + 1))} disabled={week >= 18} aria-label="Next week">
            <svg width="7" height="11" viewBox="0 0 7 11" fill="none">
              <path d="M1 1 L5.5 5.5 L1 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </span>
      </div>
      {weekMatchups.map(([matchupId, pair]) => {
        const [a, b] = pair;
        const aLeads = a.points >= b.points;
        return (
          <Link to={`/matchup/${week}/${matchupId}`} className="matchup-card" key={matchupId}>
            <div className="mrow">
              <span className={`mteam ${aLeads ? 'lead' : 'trail'}`}>{labelFor(a.roster_id)}</span>
              <span className={`mpts ${aLeads ? 'lead' : 'trail'}`}>{fmtPts(a.points)}</span>
            </div>
            <div className="mrow">
              <span className={`mteam ${aLeads ? 'trail' : 'lead'}`}>{labelFor(b.roster_id)}</span>
              <span className={`mpts ${aLeads ? 'trail' : 'lead'}`}>{fmtPts(b.points)}</span>
            </div>
          </Link>
        );
      })}
      {!weekMatchups.length && (
        <div className="state-note">{matchups.isError ? 'Failed to load' : matchups.isLoading ? 'Loading' : 'No matchups'}</div>
      )}
      <div className="section-header">
        <span>STANDINGS</span>
      </div>
      <div className="standings-row standings-head">
        <span className="rank">#</span>
        <span className="team">TEAM</span>
        <span className="num">W-L</span>
        <span className="num">PF</span>
        <span className="num">PA</span>
      </div>
      {standings.map((r, i) => {
        const { pf, pa } = rosterPoints(r);
        return (
          <Link to={`/team/${r.roster_id}`} className="standings-row" key={r.roster_id}>
            <span className="rank">{i + 1}</span>
            <span className="team">{labelFor(r.roster_id)}</span>
            <span className="num rec">
              {r.settings.wins}-{r.settings.losses}
              {r.settings.ties ? `-${r.settings.ties}` : ''}
            </span>
            <span className="num">{fmtPts(pf)}</span>
            <span className="num">{fmtPts(pa)}</span>
          </Link>
        );
      })}
      {!standings.length && <div className="state-note">{rosters.isError ? 'Failed to load' : 'Loading'}</div>}

    </div>
  );
}
