import { useMemo, useState } from 'react';
import { NavBar } from '../components/NavBar';
import { TeamPicker, getMyRosterId } from '../components/TeamPicker';
import {
  defaultWeek,
  useLeague,
  useNflState,
  usePlayers,
  useRosters,
  useUsers,
} from '../hooks/useLeagueData';
import { useWeeklyStatsAll } from '../hooks/useWeeklyStats';
import { arcadeQuery, buildArcadeRosters } from '../lib/arcadeRoster';
import { LEAGUE_ID } from '../config';

export function ArcadePage() {
  const league = useLeague();
  const rosters = useRosters();
  const users = useUsers();
  const players = usePlayers();
  const state = useNflState();
  const [picked, setPicked] = useState<number | null>(getMyRosterId());

  const week = defaultWeek(league.data, state.data);
  const weekly = useWeeklyStatsAll(league.data?.season, week, picked !== null);

  const src = useMemo(() => {
    if (picked === null || !rosters.data || !players.data || weekly.loading) return null;
    const mine = rosters.data.find((r) => r.roster_id === picked);
    if (!mine) return null;
    const built = buildArcadeRosters(mine.players ?? [], players.data, weekly.weekly);
    // Everyone in the league gets the same defense, coverage and wind each week.
    const seed = `${LEAGUE_ID}-W${week}`;
    return `/arcade-game.html?${arcadeQuery(built, seed)}`;
  }, [picked, rosters.data, players.data, weekly.loading, weekly.weekly, week]);

  return (
    <div className="page arcade-page">
      <NavBar title={`Week ${week} Arcade`} />
      {picked === null ? (
        rosters.data && users.data ? (
          <TeamPicker rosters={rosters.data} users={users.data} onPick={setPicked} />
        ) : (
          <div className="state-note">Loading</div>
        )
      ) : src ? (
        <iframe className="arcade-frame" src={src} title="Arcade" />
      ) : (
        <div className="state-note">Building your roster</div>
      )}
    </div>
  );
}
