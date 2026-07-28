/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Fixture data for mock mode (?mock=1 or VITE_MOCK=1). Shapes mirror the real
 * Sleeper / ESPN responses so the whole data pipeline runs unchanged. The
 * scenario is a mid-Sunday week 15: some games final, some live, some to play.
 */

const SEASON = '2025';
const WEEK = 15;

// Kickoff windows (UTC) for the fixture week.
const THU = '2025-12-12T01:15:00Z';
const EARLY = '2025-12-14T18:00:00Z';
const LATE = '2025-12-14T21:25:00Z';
const SNF = '2025-12-15T01:20:00Z';
const MNF = '2025-12-16T00:15:00Z';

type EspnState = 'pre' | 'in' | 'post';

function espnEvent(
  home: string,
  away: string,
  date: string,
  state: EspnState,
  period = 0,
  clock = '0:00',
) {
  const status = {
    period,
    displayClock: clock,
    type: { state, completed: state === 'post' },
  };
  return {
    date,
    status,
    competitions: [
      {
        date,
        status,
        competitors: [
          { homeAway: 'home', team: { abbreviation: home } },
          { homeAway: 'away', team: { abbreviation: away } },
        ],
      },
    ],
  };
}

const scoreboard = {
  events: [
    espnEvent('GB', 'DET', EARLY, 'post'),
    espnEvent('TB', 'ATL', EARLY, 'post'),
    espnEvent('DEN', 'KC', THU, 'post'),
    espnEvent('PHI', 'DAL', EARLY, 'post'),
    espnEvent('MIN', 'CHI', EARLY, 'post'),
    espnEvent('NO', 'CAR', EARLY, 'post'),
    espnEvent('NE', 'BUF', LATE, 'in', 3, '5:31'),
    espnEvent('JAX', 'HOU', LATE, 'in', 2, '11:05'),
    espnEvent('CIN', 'BAL', LATE, 'in', 4, '2:18'),
    espnEvent('LAR', 'SEA', SNF, 'pre'),
    espnEvent('ARI', 'SF', SNF, 'pre'),
    espnEvent('MIA', 'NYJ', MNF, 'pre'),
  ],
};

interface FixturePlayer {
  id: string;
  first: string;
  last: string;
  pos: string;
  team: string;
  pts?: number;
  proj: number;
  adp?: number;
  stats?: Record<string, number>;
}

const HOME_STARTERS: FixturePlayer[] = [
  { id: 'p_maye', first: 'Drake', last: 'Maye', pos: 'QB', team: 'NE', pts: 18.4, proj: 19.5, adp: 38.2,
    stats: { pass_cmp: 14, pass_att: 22, pass_yd: 176, pass_td: 1, rush_yd: 24 } },
  { id: 'p_gibbs', first: 'Jahmyr', last: 'Gibbs', pos: 'RB', team: 'DET', pts: 21.3, proj: 17.8, adp: 4.1,
    stats: { rush_att: 16, rush_yd: 104, rec: 4, rec_yd: 39, rush_td: 1 } },
  { id: 'p_brobinson', first: 'Bijan', last: 'Robinson', pos: 'RB', team: 'ATL', pts: 9.6, proj: 18.2, adp: 2.3,
    stats: { rush_att: 13, rush_yd: 51, rec: 3, rec_yd: 15 } },
  { id: 'p_nacua', first: 'Puka', last: 'Nacua', pos: 'WR', team: 'LAR', proj: 16.4, adp: 9.8 },
  { id: 'p_collins', first: 'Nico', last: 'Collins', pos: 'WR', team: 'HOU', pts: 8.9, proj: 15.1, adp: 14.5,
    stats: { rec: 4, rec_yd: 49 } },
  // On bye in the fixture week (CLE has no game in the slate).
  { id: 'p_mcbride', first: 'Trey', last: 'McBride', pos: 'TE', team: 'CLE', proj: 12.2, adp: 22.7 },
  { id: 'p_jacobs', first: 'Josh', last: 'Jacobs', pos: 'RB', team: 'GB', pts: 6.7, proj: 14.6, adp: 21.4,
    stats: { rush_att: 14, rush_yd: 47, rec: 2, rec_yd: 10 } },
  { id: 'p_butker', first: 'Harrison', last: 'Butker', pos: 'K', team: 'KC', pts: 5.0, proj: 8.4, adp: 141.0,
    stats: { fgm: 1, fga: 2, xpm: 2 } },
  { id: 'PHI', first: 'Philadelphia', last: 'Eagles', pos: 'DEF', team: 'PHI', pts: 4.0, proj: 6.8, adp: 118.6,
    stats: { sack: 2, int: 1, pts_allow: 20 } },
];

const AWAY_STARTERS: FixturePlayer[] = [
  { id: 'p_allen', first: 'Josh', last: 'Allen', pos: 'QB', team: 'BUF', pts: 22.1, proj: 21.5, adp: 12.9,
    stats: { pass_cmp: 17, pass_att: 25, pass_yd: 221, pass_td: 2, rush_yd: 31 } },
  { id: 'p_achane', first: "De'Von", last: 'Achane', pos: 'RB', team: 'MIA', proj: 16.8, adp: 11.2 },
  { id: 'p_cbrown', first: 'Chase', last: 'Brown', pos: 'RB', team: 'CIN', pts: 12.4, proj: 14.9, adp: 19.8,
    stats: { rush_att: 15, rush_yd: 78, rec: 2, rec_yd: 16 } },
  { id: 'p_chase', first: "Ja'Marr", last: 'Chase', pos: 'WR', team: 'CIN', pts: 15.2, proj: 17.3, adp: 3.0,
    stats: { rec: 6, rec_yd: 92 } },
  { id: 'p_jsn', first: 'Jaxon', last: 'Smith-Njigba', pos: 'WR', team: 'SEA', proj: 13.0, adp: 16.3 },
  { id: 'p_laporta', first: 'Sam', last: 'LaPorta', pos: 'TE', team: 'DET', pts: 7.8, proj: 10.1, adp: 40.5,
    stats: { rec: 4, rec_yd: 38 } },
  { id: 'p_white', first: 'Rachaad', last: 'White', pos: 'RB', team: 'TB', pts: 8.1, proj: 11.0, adp: 71.9,
    stats: { rush_att: 11, rush_yd: 42, rec: 3, rec_yd: 19 } },
  { id: 'p_aubrey', first: 'Brandon', last: 'Aubrey', pos: 'K', team: 'DAL', pts: 12.0, proj: 9.2, adp: 133.2,
    stats: { fgm: 3, fga: 3, xpm: 3 } },
  { id: 'BAL', first: 'Baltimore', last: 'Ravens', pos: 'DEF', team: 'BAL', pts: 3.0, proj: 7.1, adp: 108.4,
    stats: { sack: 1, int: 1, pts_allow: 17 } },
];

const HOME_BENCH: FixturePlayer[] = [
  { id: 'p_downs', first: 'Josh', last: 'Downs', pos: 'WR', team: 'MIN', pts: 7.4, proj: 10.8, adp: 92.1,
    stats: { rec: 5, rec_yd: 44 } },
  { id: 'p_charbonnet', first: 'Zach', last: 'Charbonnet', pos: 'RB', team: 'SEA', proj: 9.4, adp: 96.7 },
  { id: 'p_pitts', first: 'Kyle', last: 'Pitts', pos: 'TE', team: 'ATL', pts: 4.2, proj: 8.6, adp: 61.5,
    stats: { rec: 2, rec_yd: 22 } },
];

const AWAY_BENCH: FixturePlayer[] = [
  { id: 'p_wilson', first: 'Garrett', last: 'Wilson', pos: 'WR', team: 'NYJ', proj: 14.2, adp: 30.6 },
  { id: 'p_warren', first: 'Tyler', last: 'Warren', pos: 'TE', team: 'MIN', pts: 6.1, proj: 7.9, adp: 86.3,
    stats: { rec: 3, rec_yd: 31 } },
  { id: 'p_bigsby', first: 'Tank', last: 'Bigsby', pos: 'RB', team: 'JAX', pts: 3.8, proj: 7.2, adp: 148.9,
    stats: { rush_att: 6, rush_yd: 28 } },
];

/** Unrostered in the mock league — exercise the AVAILABLE pool. */
const FREE_AGENTS: FixturePlayer[] = [
  { id: 'p_dobbins', first: 'J.K.', last: 'Dobbins', pos: 'RB', team: 'DEN', pts: 11.2, proj: 10.4, adp: 55.3,
    stats: { rush_att: 14, rush_yd: 71, rec: 2, rec_yd: 11, rush_td: 1 } },
  { id: 'p_shaheed', first: 'Rashid', last: 'Shaheed', pos: 'WR', team: 'NO', pts: 9.1, proj: 8.8, adp: 112.4,
    stats: { rec: 4, rec_yd: 61 } },
  { id: 'p_kraft', first: 'Tucker', last: 'Kraft', pos: 'TE', team: 'GB', pts: 8.6, proj: 7.5, adp: 99.2,
    stats: { rec: 4, rec_yd: 46 } },
  { id: 'p_wright', first: 'Jaylen', last: 'Wright', pos: 'RB', team: 'MIA', proj: 6.9, adp: 160.8 },
];

const ALL_PLAYERS = [...HOME_STARTERS, ...AWAY_STARTERS, ...HOME_BENCH, ...AWAY_BENCH, ...FREE_AGENTS];

const playersBlob: Record<string, any> = {};
for (const p of ALL_PLAYERS) {
  playersBlob[p.id] = {
    player_id: p.id,
    first_name: p.pos === 'DEF' ? p.first : p.first,
    last_name: p.last,
    position: p.pos,
    team: p.team,
    status: 'Active',
  };
}

const projections: Record<string, any> = {};
const weekStats: Record<string, any> = {};
for (const p of ALL_PLAYERS) {
  projections[p.id] = { pts_ppr: p.proj, pts_half_ppr: p.proj * 0.92, pts_std: p.proj * 0.85 };
  if (p.pts !== undefined) weekStats[p.id] = { ...(p.stats ?? {}), pts_ppr: p.pts };
}

const league = {
  league_id: 'mock',
  name: 'The League',
  season: SEASON,
  status: 'in_season',
  total_rosters: 10,
  roster_positions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF', 'BN', 'BN', 'BN'],
  scoring_settings: { rec: 1 },
  settings: { leg: WEEK, playoff_week_start: 15 },
};

const TEAMS: [string, string, number, number, number][] = [
  // team_name, display_name, wins, losses, fpts
  ['The Zooks', 'zubinksi', 9, 5, 1621],
  ['Big Dawgs', 'dawgpound', 10, 4, 1688],
  ['Bagel Boys', 'bagelboy', 8, 6, 1544],
  ['Turf Burn', 'turfburn', 8, 6, 1512],
  ['Prime Time', 'primetime', 7, 7, 1489],
  ['Waiver Wire Warriors', 'wireking', 7, 7, 1466],
  ['Hail Marys', 'hailmary', 6, 8, 1402],
  ['The Benchwarmers', 'benchguy', 5, 9, 1377],
  ['Garbage Time', 'garbo', 5, 9, 1345],
  ['Zero Point Club', 'zeropoint', 4, 10, 1298],
];

const users = TEAMS.map(([team, display], i) => ({
  user_id: `u${i + 1}`,
  display_name: display,
  metadata: { team_name: team },
}));

const STREAKS = ['3W', '1L', '2W', '1W', '2L', '1L', '4L', '1W', '2L', '5L'];

const rosters = TEAMS.map(([, , wins, losses, fpts], i) => ({
  roster_id: i + 1,
  owner_id: `u${i + 1}`,
  players: [],
  starters: [],
  metadata: { streak: STREAKS[i] },
  settings: {
    wins,
    losses,
    ties: 0,
    fpts,
    fpts_decimal: 40,
    fpts_against: 1500 - i * 12,
    fpts_against_decimal: 10,
    waiver_position: TEAMS.length - i,
  },
}));

rosters[0].players = [...HOME_STARTERS, ...HOME_BENCH].map((p) => p.id) as never[];
rosters[1].players = [...AWAY_STARTERS, ...AWAY_BENCH].map((p) => p.id) as never[];

const sumPts = (list: FixturePlayer[]) => list.reduce((s, p) => s + (p.pts ?? 0), 0);
const pointsMap = (list: FixturePlayer[]) =>
  Object.fromEntries(list.filter((p) => p.pts !== undefined).map((p) => [p.id, p.pts]));

const matchups = [
  {
    roster_id: 1,
    matchup_id: 1,
    points: sumPts([...HOME_STARTERS]),
    starters: HOME_STARTERS.map((p) => p.id),
    players: [...HOME_STARTERS, ...HOME_BENCH].map((p) => p.id),
    players_points: pointsMap([...HOME_STARTERS, ...HOME_BENCH]),
  },
  {
    roster_id: 2,
    matchup_id: 1,
    points: sumPts([...AWAY_STARTERS]),
    starters: AWAY_STARTERS.map((p) => p.id),
    players: [...AWAY_STARTERS, ...AWAY_BENCH].map((p) => p.id),
    players_points: pointsMap([...AWAY_STARTERS, ...AWAY_BENCH]),
  },
  ...[3, 4, 5, 6, 7, 8, 9, 10].map((rosterId, i) => ({
    roster_id: rosterId,
    matchup_id: 2 + Math.floor(i / 2),
    points: [88.4, 76.1, 102.6, 99.8, 54.2, 61.9, 71.3, 45.0][i],
    starters: [],
    players: [],
    players_points: {},
  })),
];

/** Past weeks reuse the slate but shift every score, so season-long derived
 *  columns (all-play expected wins, form) have real variation to chew on. */
function matchupsForWeek(week: number): typeof matchups {
  if (week >= WEEK) return matchups;
  return matchups.map((m, i) => {
    const swing = (((week * 37 + i * 53 + week * i * 11) % 70) - 35) * 0.9;
    return { ...m, points: Math.max(0, Math.round((m.points + swing) * 10) / 10) };
  });
}

const trending = [...FREE_AGENTS, ...HOME_BENCH, ...AWAY_BENCH].map((p, i) => ({
  player_id: p.id,
  count: 900 - i * 90,
}));

const nflState = { season: SEASON, week: WEEK, display_week: WEEK, season_type: 'regular' };

/** Past weeks in mock mode: same slate of games, all final. */
const finalScoreboard = {
  events: scoreboard.events.map((e) => {
    const status = { period: 4, displayClock: '0:00', type: { state: 'post', completed: true } };
    return { ...e, status, competitions: [{ ...e.competitions[0], status }] };
  }),
};

/** Deterministic per-week variation so the season log / bar strip looks real. */
function statsForWeek(week: number): Record<string, any> {
  if (week >= WEEK) return weekStats;
  const out: Record<string, any> = {};
  ALL_PLAYERS.forEach((p, idx) => {
    const factor = 0.45 + (((week * 31 + idx * 17) % 90) / 90) * 1.1;
    const base = p.stats ?? {};
    const scaled: Record<string, number> = {};
    for (const [k, v] of Object.entries(base)) {
      scaled[k] = k.includes('att') || k === 'rec' || k.includes('cmp')
        ? Math.max(1, Math.round(v * factor))
        : Math.round(v * factor * 10) / 10;
    }
    scaled.pts_ppr = Math.round((p.pts ?? p.proj) * factor * 10) / 10;
    out[p.id] = scaled;
  });
  return out;
}

const weekFromUrl = (url: string, re: RegExp): number => {
  const m = url.match(re);
  return m ? parseInt(m[1], 10) : WEEK;
};

/** Season URLs have no week segment: /stats/nfl/2025?... or /stats/nfl/regular/2025 */
const isSeasonUrl = (url: string, kind: 'stats' | 'projections') =>
  new RegExp(`/${kind}/nfl/(?:regular/)?\\d{4}(?:\\?|$)`).test(url);

/** Season totals consistent with the per-week mock stats. */
function seasonStatsFixture(): Record<string, any> {
  const out: Record<string, any> = {};
  ALL_PLAYERS.forEach((p) => {
    out[p.id] = { pts_ppr: 0 };
  });
  for (let w = 1; w <= WEEK; w++) {
    const weekly = statsForWeek(w);
    for (const [id, s] of Object.entries(weekly)) {
      out[id].pts_ppr = Math.round((out[id].pts_ppr + ((s as any).pts_ppr ?? 0)) * 10) / 10;
    }
  }
  return out;
}

const seasonProjectionsFixture: Record<string, any> = Object.fromEntries(
  ALL_PLAYERS.map((p) => [
    p.id,
    { adp_ppr: p.adp, adp_half_ppr: p.adp, adp_std: p.adp, pts_ppr: p.proj * 17 },
  ]),
);

/** Returns fixture data for a recognized URL, undefined to fall through to fetch. */
export function mockFetch(url: string): unknown {
  if (url.includes('site.api.espn.com')) {
    return weekFromUrl(url, /[?&]week=(\d+)/) < WEEK ? finalScoreboard : scoreboard;
  }
  if (url.includes('/v1/state/nfl')) return nflState;
  if (url.includes('/players/nfl/trending')) return trending;
  if (url.endsWith('/v1/players/nfl')) return playersBlob;
  if (url.includes('/projections/nfl/')) {
    return isSeasonUrl(url, 'projections') ? seasonProjectionsFixture : projections;
  }
  if (url.includes('/stats/nfl/')) {
    if (isSeasonUrl(url, 'stats')) {
      const year = Number((url.match(/(\d{4})(?:\?|$)/) || [])[1]);
      // A prior season, scaled per player so opening tiers actually differ.
      if (year && year < Number(SEASON)) {
        const out: Record<string, any> = {};
        for (const [id, st] of Object.entries(seasonStatsFixture())) {
          const f = 0.55 + ((parseInt(id, 36) % 70) / 70) * 0.85;
          out[id] = Object.fromEntries(
            Object.entries(st as Record<string, number>).map(([k, v]) => [k, Math.round(v * f * 10) / 10]),
          );
        }
        return out;
      }
      return seasonStatsFixture();
    }
    return statsForWeek(weekFromUrl(url, /\/stats\/nfl\/(?:regular\/)?\d{4}\/(\d+)/));
  }
  if (url.includes('/users')) return users;
  if (url.includes('/rosters')) return rosters;
  if (url.includes('/matchups/')) {
    return matchupsForWeek(weekFromUrl(url, /\/matchups\/(\d+)/));
  }
  if (/\/v1\/league\/[^/]+$/.test(url)) return league;
  return undefined;
}
