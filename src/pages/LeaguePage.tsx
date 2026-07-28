import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { NavBar } from '../components/NavBar';
import { WeekScrubber } from '../components/WeekScrubber';
import { LeagueMatchupCard, type CardPhase } from '../components/LeagueMatchupCard';
import {
  defaultWeek,
  useLeague,
  useNflState,
  usePlayers,
  useRosters,
  useUsers,
  useWeekData,
} from '../hooks/useLeagueData';
import { useSeasonMatchups } from '../hooks/useSeasonMatchups';
import { buildMatchupView } from '../lib/matchup';
import { buildStandings, formatLuck, luckClass } from '../lib/standings';
import type { SleeperMatchupEntry } from '../api/sleeper';

const pts = (n: number) => n.toFixed(1);

/** "SUN 1:00" — day and clock, no meridiem, matching the terminal labels. */
function kickoffLabel(ms: number | undefined): string {
  if (!ms) return '';
  const d = new Date(ms);
  const day = d.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase();
  const time = d
    .toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    .replace(/\s?[AP]M/i, '');
  return `${day} ${time}`;
}

export function LeaguePage() {
  const league = useLeague();
  const users = useUsers();
  const rosters = useRosters();
  const players = usePlayers();
  const state = useNflState();

  const currentWeek = defaultWeek(league.data, state.data);
  const [week, setWeek] = useState<number | null>(null);
  const [dir, setDir] = useState<1 | -1>(1);
  const shownWeek = week ?? currentWeek;

  const playoffStart = league.data?.settings.playoff_week_start ?? 15;
  const totalWeeks = Math.min(18, playoffStart + 2);

  const { matchups, scoreboard, stats, projections } = useWeekData(league.data?.season, shownWeek);
  // Standings are a regular-season measure, so the all-play sweep stops at the
  // last regular-season week even once the playoffs are on screen.
  const regularWeeks = Math.max(0, Math.min(currentWeek, playoffStart - 1));
  const season = useSeasonMatchups(regularWeeks, !!league.data);

  const changeWeek = (next: number) => {
    setDir(next >= shownWeek ? 1 : -1);
    setWeek(next);
  };

  const pairs = useMemo(() => {
    const byId = new Map<number, SleeperMatchupEntry[]>();
    for (const e of matchups.data ?? []) {
      if (e.matchup_id === null) continue;
      byId.set(e.matchup_id, [...(byId.get(e.matchup_id) ?? []), e]);
    }
    return [...byId.entries()]
      .filter(([, pair]) => pair.length === 2)
      .sort(([a], [b]) => a - b);
  }, [matchups.data]);

  const cards = useMemo(() => {
    if (!league.data || !rosters.data || !users.data || !players.data) return [];
    return pairs.map(([matchupId, pair]) => {
      const view = buildMatchupView({
        week: shownWeek,
        entries: [pair[0], pair[1]],
        league: league.data!,
        rosters: rosters.data!,
        users: users.data!,
        players: players.data!,
        scoreboard: scoreboard.data ?? {},
        projections: projections.data ?? {},
        stats: stats.data ?? {},
      });
      const starters = [...view.home.starters, ...view.away.starters];
      const leftScore = pair[0].points;
      const rightScore = pair[1].points;
      // An unresolved lineup would make `every` vacuously true and read as
      // upcoming, so fall back to whether the league has posted any points.
      const phase: CardPhase = starters.length
        ? view.phase === 'final'
          ? 'final'
          : starters.every((p) => p.state === 'pre')
            ? 'sched'
            : 'live'
        : leftScore + rightScore > 0
          ? 'final'
          : 'sched';
      const kickoffs = starters.map((p) => p.game?.kickoff).filter((k): k is number => !!k);
      return {
        matchupId,
        view,
        leftScore,
        rightScore,
        phase,
        kickoff: kickoffLabel(kickoffs.length ? Math.min(...kickoffs) : undefined),
        liveCount: view.home.liveCount + view.away.liveCount,
      };
    });
  }, [pairs, league.data, rosters.data, users.data, players.data, scoreboard.data, projections.data, stats.data, shownWeek]);

  // Flash a side gold for a beat whenever its score ticks up. Keys carry the
  // week so changing weeks reads as new data rather than league-wide scoring.
  const seen = useRef(new Map<string, number>());
  const [flash, setFlash] = useState<Set<string>>(new Set());
  useEffect(() => {
    const lit = new Set<string>();
    for (const c of cards) {
      for (const [team, score] of [
        [c.view.home, c.leftScore] as const,
        [c.view.away, c.rightScore] as const,
      ]) {
        const key = `${shownWeek}-${c.matchupId}-${team.rosterId}`;
        const before = seen.current.get(key);
        if (before !== undefined && score > before) lit.add(key);
        seen.current.set(key, score);
      }
    }
    if (!lit.size) return;
    setFlash(lit);
    const t = setTimeout(() => setFlash(new Set()), 1000);
    return () => clearTimeout(t);
  }, [cards, shownWeek]);

  const standings = useMemo(() => {
    if (!rosters.data || !users.data) return [];
    return buildStandings(
      rosters.data,
      users.data,
      season.weekly,
      league.data?.settings.playoff_teams ?? 6,
    );
  }, [rosters.data, users.data, season.weekly, league.data]);

  return (
    <div className="page league-page">
      <NavBar title={league.data ? league.data.name : 'League'} />

      <div className="section-header league-head">
        <span>MATCHUPS</span>
        <span className="week-label">WEEK {shownWeek}</span>
      </div>
      <WeekScrubber week={shownWeek} total={totalWeeks} currentWeek={currentWeek} onChange={changeWeek} />

      <div className={`mlist ${dir === 1 ? 'from-right' : 'from-left'}`} key={shownWeek}>
        {cards.map((c) => (
          <LeagueMatchupCard
            key={c.matchupId}
            week={shownWeek}
            matchupId={c.matchupId}
            view={c.view}
            leftScore={c.leftScore}
            rightScore={c.rightScore}
            phase={c.phase}
            kickoff={c.kickoff}
            liveCount={c.liveCount}
            flashLeft={flash.has(`${shownWeek}-${c.matchupId}-${c.view.home.rosterId}`)}
            flashRight={flash.has(`${shownWeek}-${c.matchupId}-${c.view.away.rosterId}`)}
          />
        ))}
        {!cards.length && (
          <div className="state-note">
            {matchups.isError ? 'Failed to load' : matchups.isLoading ? 'Loading' : 'No matchups'}
          </div>
        )}
      </div>

      <div className="section-header league-head standings-head-label">
        <span>STANDINGS</span>
      </div>

      <div className="standings-scroll">
        <div className="standings-grid">
          <div className="strow sthead">
            <span className="stteam">
              <span className="strank">#</span>
              <span>TEAM</span>
            </span>
            <span className="stnum">W-L</span>
            <span className="stnum">FORM</span>
            <span className="stnum">PF</span>
            <span className="stnum">PA</span>
            <span className="stnum">WVR</span>
            <span className="stnum">PF/G</span>
            <span className="stnum stlast">LUCK</span>
          </div>

          {standings.map((row, i) => (
            <div className="strow-wrap" key={row.rosterId}>
              <Link
                to={`/team/${row.rosterId}`}
                className={`strow ${row.playoff ? 'in' : 'out'} ${
                  i + 1 === (league.data?.settings.playoff_teams ?? 6) ? 'at-cut' : ''
                }`}
              >
                <span className="stteam">
                  <span className="strank">{row.rank}</span>
                  <span className="stname">{row.label}</span>
                </span>
                <span className="stnum strec">
                  {row.wins}-{row.losses}
                  {row.ties ? `-${row.ties}` : ''}
                </span>
                <span className="stnum stform">
                  {row.form.length ? (
                    row.form.map((won, j) => <i className={won ? 'w' : 'l'} key={j} />)
                  ) : (
                    <span className="stmuted">—</span>
                  )}
                </span>
                <span className="stnum stpf">{pts(row.pf)}</span>
                <span className="stnum">{pts(row.pa)}</span>
                <span className="stnum">{row.waiver ?? '—'}</span>
                <span className="stnum">{pts(row.pfg)}</span>
                <span className={`stnum stlast stluck ${luckClass(row.luck)}`}>
                  {season.loading ? '—' : formatLuck(row.luck)}
                </span>
              </Link>
              {i + 1 === (league.data?.settings.playoff_teams ?? 6) && i + 1 < standings.length && (
                <div className="cutline">
                  <span className="cutlabel">PLAYOFF LINE</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      {!standings.length && (
        <div className="state-note">{rosters.isError ? 'Failed to load' : 'Loading'}</div>
      )}
    </div>
  );
}
