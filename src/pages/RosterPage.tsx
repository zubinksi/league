import { useMemo, useState } from 'react';
import { NavBar } from '../components/NavBar';
import { TeamPicker, getMyRosterId } from '../components/TeamPicker';
import { usePlayerCard } from '../components/PlayerCard';
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

/** Passer + target on the same NFL club. Picking both in the pass game puts
 *  the ball where he is going, so it is worth knowing you have one. */
function batteries(pass: ArcadePlayer[], recv: ArcadePlayer[]) {
  const out: { key: string; qb: ArcadePlayer; wr: ArcadePlayer }[] = [];
  for (const qb of pass)
    for (const wr of recv)
      if (qb.team && qb.team === wr.team) out.push({ key: `${qb.id}-${wr.id}`, qb, wr });
  return out;
}

/** The same shape as the arcade's own pick card, so choosing a player and
 *  reading about one look like the same act. Tapping opens the full sheet. */
function PlayerCardRow({ p, rank }: { p: ArcadePlayer; rank?: number }) {
  const kit = teamKit(p.team);
  const open = usePlayerCard();
  return (
    <button className="rp-card" onClick={() => open(p.id, undefined, p.attrs)}>
      <span className="rp-left">
        <span className="rp-line">
          <span className="rp-name">{p.name}</span>
          {rank ? (
            <span className="rp-rank">
              {p.position}
              {rank}
            </span>
          ) : null}
          {p.trend !== 0 && (
            <i className={`rp-trend ${p.trend > 0 ? 'up' : 'down'}`}>{p.trend > 0 ? '▲' : '▼'}</i>
          )}
        </span>
        <span className="rp-team">
          {kit && <i className="rp-kit" style={{ background: kit }} />}
          {p.team || 'FA'}
        </span>
        <span className="rp-season">{p.summary}</span>
      </span>
      <span className="rp-bars">
        {p.attrs.map((a) => (
          <span className="rp-bar" key={a.label}>
            <span className="rp-blabel">{a.label}</span>
            <Ladder a={a} />
          </span>
        ))}
      </span>
    </button>
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
            never slides back. Last season sets the opening rung. Tap anyone for the full card.
          </p>
          {batteries(built.pass, built.recv).map(({ key, qb, wr }) => (
            <div className="rp-chem" key={key}>
              <i className="rp-kit" style={{ background: teamKit(qb.team) ?? 'transparent' }} />
              <span className="rp-chem-k">Chemistry</span>
              <span className="rp-chem-v">
                {qb.name} → {wr.name}
              </span>
              <span className="rp-chem-t">{qb.team}</span>
            </div>
          ))}
          {GROUPS.map(({ key, label }) =>
            built[key].length ? (
              <div key={key}>
                <div className="section-header league-head">
                  <span>{label}</span>
                  <span className="week-label">{built[key].length}</span>
                </div>
                <div className="rp-list">
                  {built[key].map((p) => (
                    <PlayerCardRow key={p.id} p={p} rank={ranks.get(p.id)} />
                  ))}
                </div>
              </div>
            ) : null,
          )}
        </>
      )}
    </div>
  );
}
