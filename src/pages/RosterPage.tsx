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
  useSeasonTotals,
  useUsers,
} from '../hooks/useLeagueData';
import { useWeeklyStatsAll } from '../hooks/useWeeklyStats';
import { positionRanks } from '../lib/metrics';
import { buildArcadeRosters, type ArcadePlayer, type AttrDetail } from '../lib/arcadeRoster';
import { teamKit } from '../lib/teamKits';

const GROUPS: { key: 'run' | 'pass' | 'recv' | 'kick'; label: string }[] = [
  { key: 'pass', label: 'PASSERS' },
  { key: 'recv', label: 'RECEIVERS' },
  { key: 'run', label: 'BACKS' },
  { key: 'kick', label: 'KICKERS' },
];
const TIERS = 5;

/** Five rungs. Cleared ones full, the one you're on part-filled, and the rung
 *  just crossed lit — so the bar carries both level and recent movement. */
function Ladder({ a }: { a: AttrDetail }) {
  const filled = a.value * TIERS;
  return (
    <span className="rp-rungs">
      {Array.from({ length: TIERS }, (_, i) => {
        const pct = Math.max(0, Math.min(1, filled - i)) * 100;
        const fresh = a.levelled && i === a.tier;
        return (
          <i key={i} className={fresh ? 'fresh' : ''}>
            <b style={{ width: `${pct}%` }} />
          </i>
        );
      })}
    </span>
  );
}

function PlayerCard({ p, rank }: { p: ArcadePlayer; rank?: number }) {
  const kit = teamKit(p.team);
  // The nearest rung across all three ladders — the thing you'd actually chase.
  const next = p.attrs
    .filter((a) => a.toNext !== null)
    .sort((x, y) => x.toNext! / (x.stat + x.toNext!) - y.toNext! / (y.stat + y.toNext!))[0];

  return (
    <div className="rp-card">
      <div className="rp-head">
        {kit && <i className="rp-kit" style={{ background: kit }} />}
        <span className="rp-name">{p.name}</span>
        <span className="rp-team">
          {p.team}
          {rank ? ` · ${p.position}${rank}` : ''}
        </span>
        <span className="rp-next">
          {next ? `${next.toNext} ${next.unit} → ${next.nextName}` : 'MAXED'}
        </span>
      </div>
      <div className="rp-season">{p.summary}</div>
      {p.attrs.map((a) => (
        <div className="rp-attr" key={a.label}>
          <span className="rp-label">{a.label}</span>
          <Ladder a={a} />
          <span className="rp-tier">{a.name}</span>
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
  const season = useSeasonTotals(league.data?.season);

  const ranks = useMemo(
    () =>
      players.data
        ? positionRanks(season.data, players.data, league.data?.scoring_settings?.rec ?? 0)
        : new Map<string, number>(),
    [season.data, players.data, league.data],
  );

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
                  <PlayerCard key={p.id} p={p} rank={ranks.get(p.id)} />
                ))}
              </div>
            ) : null,
          )}
        </>
      )}
    </div>
  );
}
