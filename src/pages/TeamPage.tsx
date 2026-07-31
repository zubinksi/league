import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { NavBar } from '../components/NavBar';
import { PlayerCell } from '../components/RosterCompare';
import { TeamPicker, getMyRosterId } from '../components/TeamPicker';
import {
  defaultWeek,
  useLeague,
  useNflState,
  usePlayers,
  useRosters,
  useSeasonAdp,
  useUsers,
  useWeekData,
} from '../hooks/useLeagueData';
import { buildMatchupView, starterSlots, type MatchupView } from '../lib/matchup';
import { rosterPoints, teamLabel } from '../api/sleeper';
import { RadarIcon, RosterAnalysisSheet } from '../components/RosterAnalysis';
import { useWeeklyStatsAll } from '../hooks/useWeeklyStats';
import { computeRosterRanks } from '../lib/rosterRanks';

const fmtPts = (n: number) => n.toFixed(1);

export function TeamPage() {
  const params = useParams<{ rosterId?: string }>();
  const league = useLeague();
  const users = useUsers();
  const rosters = useRosters();
  const players = usePlayers();
  const state = useNflState();
  const [picked, setPicked] = useState<number | null>(getMyRosterId());
  const [analysisOpen, setAnalysisOpen] = useState(false);

  const rosterId = params.rosterId ? parseInt(params.rosterId, 10) : picked;
  const week = defaultWeek(league.data, state.data);
  const { matchups, scoreboard, stats, projections } = useWeekData(league.data?.season, week);

  const recValue = league.data?.scoring_settings?.rec ?? 0;
  const weeklyAll = useWeeklyStatsAll(league.data?.season, week, analysisOpen);
  const seasonProj = useSeasonAdp(analysisOpen ? league.data?.season : undefined);
  const rosterRanks = useMemo(() => {
    if (!analysisOpen || weeklyAll.loading || !rosters.data || !players.data) return null;
    return computeRosterRanks(rosters.data, players.data, weeklyAll.weekly, recValue, seasonProj.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisOpen, weeklyAll.loading, rosters.data, players.data, recValue, seasonProj.data]);

  // Reuse the matchup assembly for this team's side of its current matchup.
  const view: MatchupView | null = useMemo(() => {
    if (rosterId === null || !matchups.data || !league.data || !rosters.data || !users.data || !players.data)
      return null;
    const mine = matchups.data.find((e) => e.roster_id === rosterId);
    if (!mine) return null;
    const opp =
      matchups.data.find((e) => e.matchup_id === mine.matchup_id && e.roster_id !== rosterId) ?? mine;
    return buildMatchupView({
      week,
      entries: [mine, opp],
      league: league.data,
      rosters: rosters.data,
      users: users.data,
      players: players.data,
      scoreboard: scoreboard.data ?? {},
      projections: projections.data ?? {},
      stats: stats.data ?? {},
    });
  }, [rosterId, matchups.data, league.data, rosters.data, users.data, players.data, scoreboard.data, projections.data, stats.data, week]);

  if (rosterId === null) {
    return (
      <div className="page">
        <NavBar title="Team" home />
        {rosters.data && users.data ? (
          <TeamPicker rosters={rosters.data} users={users.data} onPick={setPicked} />
        ) : (
          <div className="state-note">Loading</div>
        )}
      </div>
    );
  }

  const roster = rosters.data?.find((r) => r.roster_id === rosterId);
  const user = users.data?.find((u) => u.user_id === roster?.owner_id);
  const label = roster ? teamLabel(user, rosterId) : '';
  const pts = roster ? rosterPoints(roster) : null;
  const slots = league.data ? starterSlots(league.data) : [];
  const team = view?.home;

  return (
    <div className="page">
      <NavBar
        title="Team"
        back={!!params.rosterId}
        home={!params.rosterId}
        action={
          roster ? (
            <button className="navbar-action" onClick={() => setAnalysisOpen(true)} aria-label="Roster analysis">
              <RadarIcon color="var(--accent-live)" />
            </button>
          ) : undefined
        }
      />
      {analysisOpen && roster && (
        <RosterAnalysisSheet
          teams={[rosterRanks?.byRoster.get(rosterId!) ?? undefined]}
          labels={[label]}
          teamsCount={rosterRanks?.teams ?? rosters.data?.length ?? 0}
          loading={!rosterRanks}
          onClose={() => setAnalysisOpen(false)}
        />
      )}
      {roster ? (
        <>
          <div className="team-hero">
            <div className="tname">{user?.display_name?.toUpperCase() ?? `ROSTER ${rosterId}`}</div>
            <div className="tbig">{label}</div>
            <div className="tmeta">
              <span>
                <b>
                  {roster.settings.wins}-{roster.settings.losses}
                  {roster.settings.ties ? `-${roster.settings.ties}` : ''}
                </b>
              </span>
              <span className="win-sep">·</span>
              <span>PF {pts ? fmtPts(pts.pf) : '—'}</span>
              <span className="win-sep">·</span>
              <span>PA {pts ? fmtPts(pts.pa) : '—'}</span>
            </div>
          </div>

          <div className="section-header">
            <span>STARTERS</span>
            <span>WEEK {week}{team ? ` · ${fmtPts(team.score)} PTS` : ''}</span>
          </div>
          {team
            ? team.starters.map((p, i) => (
                <div className="slot-row" key={`${p.playerId}-${i}`}>
                  <span className="slot-tag">{slots[i] ?? p.slot}</span>
                  <PlayerCell player={p} side="home" />
                </div>
              ))
            : matchups.data && !matchups.isLoading
              ? <div className="state-note">No lineup this week</div>
              : <div className="state-note">Loading</div>}

          {team && team.bench.length > 0 && (
            <>
              <div className="section-header">
                <span>BENCH</span>
              </div>
              {team.bench.map((p) => (
                <div className="slot-row" key={p.playerId}>
                  <span className="slot-tag">BN</span>
                  <PlayerCell player={p} side="home" />
                </div>
              ))}
            </>
          )}
        </>
      ) : (
        <div className="state-note">{rosters.isError ? 'Failed to load' : 'Loading'}</div>
      )}
    </div>
  );
}
