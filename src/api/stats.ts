import { getJSON } from './http';

export type StatMap = Record<string, number>;
/** player_id → raw stat categories (pass_yd, rush_att, rec, pts_ppr, …). */
export type WeekStats = Record<string, StatMap>;

/** Unofficial endpoints used by Sleeper's own clients. Shapes vary between the
 *  legacy map form and a newer array form — accept both. */
function normalizeStats(data: unknown): WeekStats {
  if (Array.isArray(data)) {
    const out: WeekStats = {};
    for (const row of data as { player_id?: string; stats?: StatMap }[]) {
      if (row.player_id && row.stats) out[row.player_id] = row.stats;
    }
    return out;
  }
  return (data ?? {}) as WeekStats;
}

const POSITION_PARAMS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']
  .map((p) => `position[]=${p}`)
  .join('&');

/** These endpoints are undocumented and have moved hosts over time. Try each
 *  candidate in order and remember the first that returns data, so the 45s
 *  poll doesn't keep re-probing a dead URL. */
const workingCandidate: Record<string, number> = {};

async function fetchFirst(kind: string, urls: string[]): Promise<WeekStats> {
  const start = workingCandidate[kind] ?? 0;
  let lastError: unknown = new Error(`no ${kind} endpoint available`);
  for (let i = start; i < urls.length; i++) {
    try {
      const result = normalizeStats(await getJSON<unknown>(urls[i]));
      if (Object.keys(result).length > 0) {
        workingCandidate[kind] = i;
        return result;
      }
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

export function fetchWeekStats(season: string, week: number): Promise<WeekStats> {
  return fetchFirst('stats', [
    `https://api.sleeper.com/stats/nfl/${season}/${week}?season_type=regular&${POSITION_PARAMS}&order_by=pts_ppr`,
    `https://api.sleeper.app/stats/nfl/regular/${season}/${week}`,
  ]);
}

export function fetchWeekProjections(season: string, week: number): Promise<WeekStats> {
  return fetchFirst('projections', [
    `https://api.sleeper.com/projections/nfl/${season}/${week}?season_type=regular&${POSITION_PARAMS}&order_by=ppr`,
    `https://api.sleeper.app/projections/nfl/regular/${season}/${week}`,
  ]);
}

/** Season-aggregate stats (one request, all players): player_id → totals. */
export function fetchSeasonStats(season: string): Promise<WeekStats> {
  return fetchFirst('seasonStats', [
    `https://api.sleeper.com/stats/nfl/${season}?season_type=regular&${POSITION_PARAMS}&order_by=pts_ppr`,
    `https://api.sleeper.app/stats/nfl/regular/${season}`,
  ]);
}

/** Season projections carry Sleeper's ADP fields (adp_ppr / adp_half_ppr / …). */
export function fetchSeasonProjections(season: string): Promise<WeekStats> {
  return fetchFirst('seasonProjections', [
    `https://api.sleeper.com/projections/nfl/${season}?season_type=regular&${POSITION_PARAMS}&order_by=adp_half_ppr`,
    `https://api.sleeper.app/projections/nfl/regular/${season}`,
  ]);
}

/** ADP matching the league's reception scoring; undefined = undrafted. */
export function adpValue(stats: StatMap | undefined, recValue: number): number | undefined {
  if (!stats) return undefined;
  const key = recValue >= 1 ? 'adp_ppr' : recValue > 0 ? 'adp_half_ppr' : 'adp_std';
  const v = stats[key] ?? stats.adp_half_ppr ?? stats.adp_ppr ?? stats.adp_std ?? stats.adp_2qb;
  return typeof v === 'number' && v > 0 ? v : undefined;
}

/** Pick the projected fantasy points matching the league's reception scoring. */
export function projectedPoints(stats: StatMap | undefined, recValue: number): number | undefined {
  if (!stats) return undefined;
  const key = recValue >= 1 ? 'pts_ppr' : recValue > 0 ? 'pts_half_ppr' : 'pts_std';
  const v = stats[key] ?? stats.pts_ppr ?? stats.pts_half_ppr ?? stats.pts_std;
  return typeof v === 'number' ? v : undefined;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** Labeled stat tiles for the player card, position-aware, zeros omitted
 *  except the core volume stats that give the line shape. */
export function statPairs(
  position: string | null,
  stats: StatMap | undefined,
): { label: string; value: string }[] {
  if (!stats) return [];
  const out: { label: string; value: string }[] = [];
  const push = (label: string, v: number | undefined, always = false) => {
    if (v === undefined || (!always && v === 0)) return;
    out.push({ label, value: fmt(v) });
  };

  switch (position) {
    case 'QB':
      if (stats.pass_att !== undefined)
        out.push({ label: 'CMP/ATT', value: `${fmt(stats.pass_cmp ?? 0)}/${fmt(stats.pass_att)}` });
      push('PASS YD', stats.pass_yd, true);
      push('PASS TD', stats.pass_td);
      push('INT', stats.pass_int);
      push('RUSH YD', stats.rush_yd);
      push('RUSH TD', stats.rush_td);
      push('FUM', stats.fum_lost);
      break;
    case 'RB':
      push('CAR', stats.rush_att, true);
      push('RUSH YD', stats.rush_yd, true);
      push('RUSH TD', stats.rush_td);
      push('REC', stats.rec);
      push('REC YD', stats.rec_yd);
      push('REC TD', stats.rec_td);
      push('TGT', stats.rec_tgt);
      push('FUM', stats.fum_lost);
      break;
    case 'WR':
    case 'TE':
      push('REC', stats.rec, true);
      push('TGT', stats.rec_tgt);
      push('REC YD', stats.rec_yd, true);
      push('REC TD', stats.rec_td);
      push('RUSH YD', stats.rush_yd);
      push('RUSH TD', stats.rush_td);
      push('FUM', stats.fum_lost);
      break;
    case 'K':
      if (stats.fga !== undefined || stats.fgm !== undefined)
        out.push({ label: 'FG', value: `${fmt(stats.fgm ?? 0)}/${fmt(stats.fga ?? 0)}` });
      push('XP', stats.xpm);
      break;
    case 'DEF':
      push('SACK', stats.sack);
      push('INT', stats.int);
      push('FUM REC', stats.fum_rec);
      push('TD', (stats.def_td ?? 0) + (stats.st_td ?? 0));
      push('PTS ALLOW', stats.pts_allow, true);
      push('YDS ALLOW', stats.yds_allow);
      break;
    default:
      break;
  }
  return out;
}

/** Column spec for the game-log grid: the same categories every week so a
 *  column can be scanned vertically across the season. */
export function gameLogColumns(
  position: string | null,
): { label: string; value: (s: StatMap | undefined) => string }[] {
  const n = (key: string) => (s: StatMap | undefined) => (s ? fmt(s[key] ?? 0) : '');
  const pair = (a: string, b: string) => (s: StatMap | undefined) =>
    s ? `${fmt(s[a] ?? 0)}/${fmt(s[b] ?? 0)}` : '';
  const sum2 = (a: string, b: string) => (s: StatMap | undefined) =>
    s ? fmt((s[a] ?? 0) + (s[b] ?? 0)) : '';

  switch (position) {
    case 'QB':
      return [
        { label: 'C/A', value: pair('pass_cmp', 'pass_att') },
        { label: 'YD', value: n('pass_yd') },
        { label: 'TD', value: n('pass_td') },
        { label: 'INT', value: n('pass_int') },
        { label: 'RUSH', value: n('rush_yd') },
      ];
    case 'RB':
      return [
        { label: 'CAR', value: n('rush_att') },
        { label: 'YD', value: n('rush_yd') },
        { label: 'REC', value: n('rec') },
        { label: 'RECYD', value: n('rec_yd') },
        { label: 'TD', value: sum2('rush_td', 'rec_td') },
      ];
    case 'WR':
    case 'TE':
      return [
        { label: 'TGT', value: n('rec_tgt') },
        { label: 'REC', value: n('rec') },
        { label: 'YD', value: n('rec_yd') },
        { label: 'TD', value: sum2('rec_td', 'rush_td') },
      ];
    case 'K':
      return [
        { label: 'FG', value: pair('fgm', 'fga') },
        { label: 'XP', value: n('xpm') },
      ];
    case 'DEF':
      return [
        { label: 'SCK', value: n('sack') },
        { label: 'INT', value: n('int') },
        { label: 'FR', value: n('fum_rec') },
        { label: 'PA', value: n('pts_allow') },
      ];
    default:
      return [];
  }
}

/** Box-score line like `14/22 · 176YD · 1TD`, position-aware, zeros omitted. */
export function statLine(position: string | null, stats: StatMap | undefined): string {
  if (!stats) return '';
  const t: string[] = [];
  const has = (k: string) => (stats[k] ?? 0) > 0;

  switch (position) {
    case 'QB': {
      if (has('pass_att')) t.push(`${fmt(stats.pass_cmp ?? 0)}/${fmt(stats.pass_att)}`);
      if (has('pass_yd')) t.push(`${fmt(stats.pass_yd)}YD`);
      if (has('pass_td')) t.push(`${fmt(stats.pass_td)}TD`);
      if (has('pass_int')) t.push(`${fmt(stats.pass_int)}INT`);
      if (has('rush_yd')) t.push(`${fmt(stats.rush_yd)}RUSH`);
      if (has('rush_td')) t.push(`${fmt(stats.rush_td)}RTD`);
      break;
    }
    case 'RB': {
      if (has('rush_att')) t.push(`${fmt(stats.rush_att)}CAR`);
      if (has('rush_yd')) t.push(`${fmt(stats.rush_yd)}YD`);
      if (has('rec')) t.push(`${fmt(stats.rec)}REC`);
      if (has('rec_yd')) t.push(`${fmt(stats.rec_yd)}RECYD`);
      const td = (stats.rush_td ?? 0) + (stats.rec_td ?? 0);
      if (td > 0) t.push(`${fmt(td)}TD`);
      break;
    }
    case 'WR':
    case 'TE': {
      if (has('rec')) t.push(`${fmt(stats.rec)}REC`);
      if (has('rec_yd')) t.push(`${fmt(stats.rec_yd)}YD`);
      if (has('rush_yd')) t.push(`${fmt(stats.rush_yd)}RUSH`);
      const td = (stats.rec_td ?? 0) + (stats.rush_td ?? 0);
      if (td > 0) t.push(`${fmt(td)}TD`);
      break;
    }
    case 'K': {
      if ((stats.fga ?? 0) > 0 || (stats.fgm ?? 0) > 0) t.push(`${fmt(stats.fgm ?? 0)}/${fmt(stats.fga ?? 0)}FG`);
      if (has('xpm')) t.push(`${fmt(stats.xpm)}XP`);
      break;
    }
    case 'DEF': {
      if (has('sack')) t.push(`${fmt(stats.sack)}SCK`);
      if (has('int')) t.push(`${fmt(stats.int)}INT`);
      if (has('fum_rec')) t.push(`${fmt(stats.fum_rec)}FR`);
      const td = (stats.def_td ?? 0) + (stats.st_td ?? 0);
      if (td > 0) t.push(`${fmt(td)}TD`);
      if (stats.pts_allow !== undefined) t.push(`${fmt(stats.pts_allow)}PA`);
      break;
    }
    default:
      break;
  }
  return t.join(' · ');
}
