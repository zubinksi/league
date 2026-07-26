import type { SleeperLeague, SleeperMatchupEntry, SleeperRoster, SleeperUser } from '../api/sleeper';
import { teamLabel } from '../api/sleeper';
import type { PlayerMap } from '../api/players';
import { playerShortName } from '../api/players';
import type { ScoreboardMap, GameState, TeamGame } from '../api/espn';
import type { WeekStats } from '../api/stats';
import { projectedPoints, statLine } from '../api/stats';

export interface StarterView {
  playerId: string;
  slot: string;
  name: string;
  position: string | null;
  nflTeam: string | null;
  state: GameState;
  /** null when the game hasn't started (renders as an em dash). */
  points: number | null;
  projected?: number;
  gameText: string;
  statLine: string;
  game?: TeamGame;
}

export interface TeamView {
  rosterId: number;
  label: string;
  score: number;
  /** Expected final = current + remaining projection. */
  projectedFinal: number;
  winPct: number;
  liveCount: number;
  toPlayCount: number;
  starters: StarterView[];
  bench: StarterView[];
}

export interface MatchupView {
  week: number;
  phase: 'inprogress' | 'final';
  /** 0..1 mean elapsed fraction across the matchup's games. */
  progress: number;
  home: TeamView;
  away: TeamView;
}

const SLOT_LABELS: Record<string, string> = {
  QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', K: 'K', DEF: 'DEF',
  FLEX: 'FLX', WRRB_FLEX: 'FLX', REC_FLEX: 'FLX', SUPER_FLEX: 'SF',
  IDP_FLEX: 'IDP', DL: 'DL', LB: 'LB', DB: 'DB',
};

export function starterSlots(league: SleeperLeague): string[] {
  return league.roster_positions
    .filter((p) => p !== 'BN' && p !== 'IR' && p !== 'TAXI')
    .map((p) => SLOT_LABELS[p] ?? p);
}

function buildPlayerView(
  playerId: string,
  slot: string,
  entry: SleeperMatchupEntry,
  players: PlayerMap,
  scoreboard: ScoreboardMap,
  projections: WeekStats,
  stats: WeekStats,
  recValue: number,
): StarterView {
  const meta = players[playerId];
  const nflTeam = meta?.team ?? (meta?.position === 'DEF' ? playerId : null);
  const game = nflTeam ? scoreboard[nflTeam] : undefined;
  const state: GameState = game?.state ?? 'pre';

  const rawPoints = entry.players_points?.[playerId];
  const points = state === 'pre' ? null : rawPoints ?? 0;

  let gameText: string;
  if (!game) {
    gameText = nflTeam ? 'BYE' : '';
  } else {
    const opp = `${game.home ? 'vs' : '@'} ${game.opponent}`;
    if (state === 'live') gameText = `${opp} · ${game.quarter ?? ''}`.trim();
    else if (state === 'final') gameText = `${opp} · FINAL`;
    else gameText = opp;
  }

  return {
    playerId,
    slot,
    name: playerShortName(meta, playerId),
    position: meta?.position ?? null,
    nflTeam,
    state,
    points,
    projected: projectedPoints(projections[playerId], recValue),
    gameText,
    statLine: state === 'pre' ? '' : statLine(meta?.position ?? null, stats[playerId]),
    game,
  };
}

function remainingProjection(p: StarterView): number {
  const proj = p.projected ?? 0;
  if (p.state === 'final') return 0;
  if (p.state === 'pre') return proj;
  return Math.max(0, proj * (1 - (p.game?.progress ?? 0.5)));
}

/** Standard normal CDF (Abramowitz–Stegun approximation). */
function normCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (z > 0) p = 1 - p;
  return p;
}

function buildTeamView(
  entry: SleeperMatchupEntry,
  user: SleeperUser | undefined,
  slots: string[],
  players: PlayerMap,
  scoreboard: ScoreboardMap,
  projections: WeekStats,
  stats: WeekStats,
  recValue: number,
): Omit<TeamView, 'winPct' | 'projectedFinal'> & { remaining: number } {
  const starters = entry.starters.map((id, i) =>
    buildPlayerView(id, slots[i] ?? '', entry, players, scoreboard, projections, stats, recValue),
  );
  const benchIds = (entry.players ?? []).filter((id) => !entry.starters.includes(id));
  const bench = benchIds.map((id) =>
    buildPlayerView(id, 'BN', entry, players, scoreboard, projections, stats, recValue),
  );

  const score = starters.reduce((sum, p) => sum + (p.points ?? 0), 0);
  return {
    rosterId: entry.roster_id,
    label: teamLabel(user, entry.roster_id),
    score,
    liveCount: starters.filter((p) => p.state === 'live').length,
    toPlayCount: starters.filter((p) => p.state === 'pre').length,
    starters,
    bench,
    remaining: starters.reduce((sum, p) => sum + remainingProjection(p), 0),
  };
}

export function buildMatchupView(args: {
  week: number;
  entries: [SleeperMatchupEntry, SleeperMatchupEntry];
  league: SleeperLeague;
  rosters: SleeperRoster[];
  users: SleeperUser[];
  players: PlayerMap;
  scoreboard: ScoreboardMap;
  projections: WeekStats;
  stats: WeekStats;
}): MatchupView {
  const { week, entries, league, rosters, users, players, scoreboard, projections, stats } = args;
  const recValue = league.scoring_settings?.rec ?? 0;
  const slots = starterSlots(league);

  const [homeEntry, awayEntry] = entries;
  const teamFor = (entry: SleeperMatchupEntry) => {
    const roster = rosters.find((r) => r.roster_id === entry.roster_id);
    const user = users.find((u) => u.user_id === roster?.owner_id);
    return buildTeamView(entry, user, slots, players, scoreboard, projections, stats, recValue);
  };
  const home = teamFor(homeEntry);
  const away = teamFor(awayEntry);

  const allStarters = [...home.starters, ...away.starters];
  const phase: MatchupView['phase'] =
    allStarters.length > 0 && allStarters.every((p) => p.state === 'final') ? 'final' : 'inprogress';

  // Mean progress across the distinct NFL games the starters are in.
  const games = new Map<string, number>();
  for (const p of allStarters) {
    if (p.game) games.set(`${p.game.kickoff}-${[p.game.team, p.game.opponent].sort().join('')}`, p.game.progress);
  }
  const progressValues = [...games.values()];
  const progress =
    phase === 'final'
      ? 1
      : progressValues.length
        ? progressValues.reduce((a, b) => a + b, 0) / progressValues.length
        : 0;

  const expHome = home.score + home.remaining;
  const expAway = away.score + away.remaining;

  let homeWin: number;
  if (phase === 'final') {
    homeWin = home.score >= away.score ? 100 : 0;
  } else {
    const sigma = Math.max(3, 0.24 * (home.remaining + away.remaining) + 0.08 * (home.score + away.score));
    homeWin = Math.round(100 * normCdf((expHome - expAway) / sigma));
    homeWin = Math.min(99, Math.max(1, homeWin));
  }

  const finish = (t: typeof home, winPct: number, expFinal: number): TeamView => {
    const { remaining, ...rest } = t;
    void remaining;
    return { ...rest, winPct, projectedFinal: expFinal };
  };

  return {
    week,
    phase,
    progress,
    home: finish(home, homeWin, expHome),
    away: finish(away, 100 - homeWin, expAway),
  };
}
