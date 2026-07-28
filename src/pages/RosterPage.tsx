import { useMemo, useState } from 'react';
import { NavBar } from '../components/NavBar';
import { TeamPicker, getMyRosterId } from '../components/TeamPicker';
import {
  defaultWeek,
  useLeague,
  useNflState,
  usePlayers,
  usePriorSeasonTotals,
  useRosters,
  useUsers,
} from '../hooks/useLeagueData';
import { useWeeklyStatsAll } from '../hooks/useWeeklyStats';
import { buildArcadeRosters, type ArcadePlayer } from '../lib/arcadeRoster';
import { teamKit } from '../lib/teamKits';

const GROUPS: { key: 'run' | 'pass' | 'recv' | 'kick'; label: string }[] = [
  { key: 'pass', label: 'PASSERS' },
  { key: 'recv', label: 'RECEIVERS' },
  { key: 'run', label: 'BACKS' },
  { key: 'kick', label: 'KICKERS' },
];

function PlayerCard({ p }: { p: ArcadePlayer }) {
  const kit = teamKit(p.team);
  return (
    <div className="rp-card">
      <div className="rp-head">
        {kit && <i className="rp-kit" style={{ background: kit }} />}
        <span className="rp-name">{p.name}</span>
        <span className="rp-team">{p.team || p.position}</span>
        {p.trend > 0 && <span className="rp-up">▲ LEVELLED</span>}
      </div>
      {p.attrs.map((a) => (
        <div className="rp-attr" key={a.label}>
          <span className="rp-label">{a.label}</span>
          <span className="rp-bar">
            <i style={{ width: `${Math.round(a.value * 100)}%` }} />
          </span>
          <span className="rp-tier">{a.name}</span>
          <span className="rp-next">
            {a.toNext === null ? 'MAX' : `${a.toNext} ${a.unit} → ${a.nextName}`}
          </span>
        </div>
      ))}
    </div>
  );
}

export function RosterPage() {
  const league = useLeague();
  const rosters = useRosters();
  const users = useUsers();
  const players = usePlayers();
  const state = useNflState();
  const [picked, setPicked] = useState<number | null>(getMyRosterId());

  const week = defaultWeek(league.data, state.data);
  const weekly = useWeeklyStatsAll(league.data?.season, week, picked !== null);
  const prior = usePriorSeasonTotals(league.data?.season);

  const built = useMemo(() => {
    if (picked === null || !rosters.data || !players.data) return null;
    const mine = rosters.data.find((r) => r.roster_id === picked);
    if (!mine) return null;
    return buildArcadeRosters(mine.players ?? [], players.data, weekly.weekly, prior.data);
  }, [picked, rosters.data, players.data, weekly.weekly, prior.data]);

  return (
    <div className="page roster-page">
      <NavBar title={`Week ${week} Roster`} />
      {picked === null ? (
        rosters.data && users.data ? (
          <TeamPicker rosters={rosters.data} users={users.data} onPick={setPicked} />
        ) : (
          <div className="state-note">Loading</div>
        )
      ) : !built || weekly.loading ? (
        <div className="state-note">Reading the season</div>
      ) : (
        <>
          <p className="rp-intro">
            Every ladder counts a stat that only goes up, so a player climbs across the season and
            never slides back. Last season sets the opening rung.
          </p>
          {GROUPS.map(({ key, label }) =>
            built[key].length ? (
              <div key={key}>
                <div className="section-header league-head">
                  <span>{label}</span>
                  <span className="week-label">{built[key].length}</span>
                </div>
                {built[key].map((p) => (
                  <PlayerCard key={`${p.name}-${p.team}`} p={p} />
                ))}
              </div>
            ) : null,
          )}
        </>
      )}
    </div>
  );
}
