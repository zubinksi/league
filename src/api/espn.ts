import { getJSON } from './http';

export type GameState = 'pre' | 'live' | 'final';

export interface TeamGame {
  /** Sleeper-style team code this entry is keyed by. */
  team: string;
  opponent: string;
  home: boolean;
  state: GameState;
  /** e.g. "Q3" while live; undefined otherwise. */
  quarter?: string;
  clock?: string;
  kickoff: number; // epoch ms
  /** 0..1 elapsed fraction of the game. pre=0, final=1. */
  progress: number;
}

/** team code → game info for the week. Teams on bye are absent. */
export type ScoreboardMap = Record<string, TeamGame>;

// ESPN and Sleeper team codes agree except for a couple of entries.
const ESPN_TO_SLEEPER: Record<string, string> = { WSH: 'WAS', JAC: 'JAX', OAK: 'LV', LA: 'LAR' };
const normalize = (abbr: string) => ESPN_TO_SLEEPER[abbr] ?? abbr;

interface EspnScoreboard {
  events?: EspnEvent[];
}
interface EspnEvent {
  date: string;
  status?: EspnStatus;
  competitions?: {
    date?: string;
    status?: EspnStatus;
    competitors?: { homeAway?: string; team?: { abbreviation?: string } }[];
  }[];
}
interface EspnStatus {
  period?: number;
  displayClock?: string;
  type?: { state?: string; completed?: boolean };
}

function parseClockSeconds(clock: string | undefined): number {
  if (!clock) return 0;
  const m = clock.match(/(\d+):(\d+)/);
  if (!m) return 0;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function gameProgress(state: GameState, period: number, clock: string | undefined): number {
  if (state === 'pre') return 0;
  if (state === 'final') return 1;
  const q = Math.max(1, period);
  const remaining = parseClockSeconds(clock) / 900; // fraction of quarter left
  if (q > 4) return Math.min(0.99, 0.92 + 0.07 * (1 - remaining)); // overtime
  return Math.min(0.99, (q - 1) / 4 + (1 - remaining) / 4);
}

function quarterLabel(period: number): string {
  if (period > 4) return period === 5 ? 'OT' : `${period - 4}OT`;
  return `Q${period}`;
}

export async function fetchScoreboard(season: string, week: number): Promise<ScoreboardMap> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}&seasontype=2&week=${week}`;
  const data = await getJSON<EspnScoreboard>(url);
  const map: ScoreboardMap = {};
  for (const event of data.events ?? []) {
    const comp = event.competitions?.[0];
    const status = comp?.status ?? event.status;
    const competitors = comp?.competitors ?? [];
    const home = competitors.find((c) => c.homeAway === 'home');
    const away = competitors.find((c) => c.homeAway === 'away');
    const homeAbbr = normalize(home?.team?.abbreviation ?? '');
    const awayAbbr = normalize(away?.team?.abbreviation ?? '');
    if (!homeAbbr || !awayAbbr) continue;

    const rawState = status?.type?.state ?? 'pre';
    const state: GameState = rawState === 'in' ? 'live' : rawState === 'post' ? 'final' : 'pre';
    const period = status?.period ?? 0;
    const clock = status?.displayClock;
    const kickoff = Date.parse(comp?.date ?? event.date);
    const progress = gameProgress(state, period, clock);
    const quarter = state === 'live' ? quarterLabel(period) : undefined;

    map[homeAbbr] = { team: homeAbbr, opponent: awayAbbr, home: true, state, quarter, clock, kickoff, progress };
    map[awayAbbr] = { team: awayAbbr, opponent: homeAbbr, home: false, state, quarter, clock, kickoff, progress };
  }
  return map;
}
