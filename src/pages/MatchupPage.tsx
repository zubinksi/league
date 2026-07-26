import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { NavBar } from '../components/NavBar';
import { MatchupHero } from '../components/MatchupHero';
import { RosterCompare } from '../components/RosterCompare';
import { TeamPicker, getMyRosterId } from '../components/TeamPicker';
import {
  defaultWeek,
  useLeague,
  useNflState,
  usePlayers,
  useRosters,
  useUsers,
  useWeekData,
} from '../hooks/useLeagueData';
import { buildMatchupView } from '../lib/matchup';
import { buildTimeline } from '../lib/timeline';
import { loadPlayerSeries } from '../lib/snapshots';
import type { SleeperMatchupEntry } from '../api/sleeper';

export function MatchupPage() {
  const params = useParams<{ week?: string; matchupId?: string }>();
  const league = useLeague();
  const users = useUsers();
  const rosters = useRosters();
  const players = usePlayers();
  const state = useNflState();
  const [pickedRoster, setPickedRoster] = useState<number | null>(getMyRosterId());

  const week = params.week ? parseInt(params.week, 10) : defaultWeek(league.data, state.data);
  const { matchups, scoreboard, stats, projections } = useWeekData(league.data?.season, week);

  const pair = useMemo<[SleeperMatchupEntry, SleeperMatchupEntry] | null>(() => {
    const entries = matchups.data;
    if (!entries) return null;

    let matchupId: number | null = null;
    if (params.matchupId) {
      matchupId = parseInt(params.matchupId, 10);
    } else if (pickedRoster !== null) {
      matchupId = entries.find((e) => e.roster_id === pickedRoster)?.matchup_id ?? null;
    }
    if (matchupId === null) return null;

    const two = entries.filter((e) => e.matchup_id === matchupId);
    if (two.length !== 2) return null;

    // Put "my" team on the left when it's in this matchup; else lower roster_id.
    two.sort((a, b) => a.roster_id - b.roster_id);
    if (pickedRoster !== null && two[1].roster_id === pickedRoster) two.reverse();
    return [two[0], two[1]];
  }, [matchups.data, params.matchupId, pickedRoster]);

  const view = useMemo(() => {
    if (!pair || !league.data || !rosters.data || !users.data || !players.data) return null;
    return buildMatchupView({
      week,
      entries: pair,
      league: league.data,
      rosters: rosters.data,
      users: users.data,
      players: players.data,
      scoreboard: scoreboard.data ?? {},
      projections: projections.data ?? {},
      stats: stats.data ?? {},
    });
  }, [pair, league.data, rosters.data, users.data, players.data, scoreboard.data, projections.data, stats.data, week]);

  // Scrub state + the time-indexed scoring model behind the chart. Recorded
  // snapshots are re-read each time the view updates (i.e. every poll) so
  // fresh live samples flow straight into the timeline.
  const [scrubTau, setScrubTau] = useState<number | null>(null);
  const timeline = useMemo(() => {
    if (!view) return null;
    const season = league.data?.season;
    const matchupId = pair?.[0].matchup_id;
    const series = season && matchupId != null ? loadPlayerSeries(season, week, matchupId) : {};
    return buildTimeline(view, series);
  }, [view, league.data?.season, pair, week]);

  // No team chosen and no explicit matchup in the URL → pick a perspective first.
  const needsPicker = !params.matchupId && pickedRoster === null;

  return (
    <div className="page">
      <NavBar title={`WEEK ${week} MATCHUP`} back={!!params.matchupId} />
      {needsPicker ? (
        rosters.data && users.data ? (
          <TeamPicker rosters={rosters.data} users={users.data} onPick={setPickedRoster} />
        ) : (
          <div className="state-note">Loading</div>
        )
      ) : view ? (
        <>
          <MatchupHero view={view} timeline={timeline} scrubTau={scrubTau} onScrub={setScrubTau} />
          <RosterCompare view={view} timeline={timeline} scrubTau={scrubTau} />
        </>
      ) : matchups.isError || league.isError ? (
        <div className="state-note">Failed to load — retrying</div>
      ) : matchups.data && pair === null && !matchups.isLoading ? (
        <div className="state-note">No matchup this week</div>
      ) : (
        <div className="state-note">Loading</div>
      )}
    </div>
  );
}
