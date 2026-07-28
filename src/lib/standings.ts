import type { SleeperMatchupEntry, SleeperRoster, SleeperUser } from '../api/sleeper';
import { rosterPoints, teamLabel } from '../api/sleeper';

export interface StandingRow {
  rosterId: number;
  rank: number;
  label: string;
  wins: number;
  losses: number;
  ties: number;
  pf: number;
  pa: number;
  /** Points per game played, not per week elapsed. */
  pfg: number;
  waiver: number | null;
  /** All-play expected wins. */
  xw: number;
  /** actual wins − expected wins. Positive = better record than the scoring earned. */
  luck: number;
  /** Last five decided results, oldest first, true = win. */
  form: boolean[];
  playoff: boolean;
}

/** A week counts once anyone has actually scored in it. */
function played(entries: SleeperMatchupEntry[]): boolean {
  return entries.some((e) => e.points > 0);
}

/**
 * Expected wins by the all-play method: each week a team is credited with the
 * fraction of the rest of the league it outscored, so the result is
 * independent of who it happened to be scheduled against. Summed over the
 * season this is the record the team's scoring earned; the gap to its real
 * record is schedule luck.
 */
function expectedWins(weeks: (SleeperMatchupEntry[] | undefined)[]): Map<number, number> {
  const xw = new Map<number, number>();
  for (const week of weeks) {
    const entries = (week ?? []).filter((e) => e.matchup_id !== null);
    if (entries.length < 2 || !played(entries)) continue;
    for (const e of entries) {
      let beat = 0;
      for (const other of entries) {
        if (other.roster_id === e.roster_id) continue;
        if (e.points > other.points) beat += 1;
        else if (e.points === other.points) beat += 0.5;
      }
      xw.set(e.roster_id, (xw.get(e.roster_id) ?? 0) + beat / (entries.length - 1));
    }
  }
  return xw;
}

/** Head-to-head results per roster, oldest first. */
function formByRoster(weeks: (SleeperMatchupEntry[] | undefined)[]): Map<number, boolean[]> {
  const form = new Map<number, boolean[]>();
  for (const week of weeks) {
    const entries = (week ?? []).filter((e) => e.matchup_id !== null);
    if (!entries.length || !played(entries)) continue;
    const byMatchup = new Map<number, SleeperMatchupEntry[]>();
    for (const e of entries) {
      byMatchup.set(e.matchup_id!, [...(byMatchup.get(e.matchup_id!) ?? []), e]);
    }
    for (const pair of byMatchup.values()) {
      if (pair.length !== 2) continue;
      const [a, b] = pair;
      if (a.points === b.points) continue; // a tie is neither mark
      for (const [self, opp] of [[a, b], [b, a]] as const) {
        form.set(self.roster_id, [...(form.get(self.roster_id) ?? []), self.points > opp.points]);
      }
    }
  }
  return form;
}

export function buildStandings(
  rosters: SleeperRoster[],
  users: SleeperUser[],
  weeks: (SleeperMatchupEntry[] | undefined)[],
  playoffTeams: number,
): StandingRow[] {
  const xw = expectedWins(weeks);
  const form = formByRoster(weeks);

  const ordered = [...rosters].sort((a, b) => {
    const byWins = b.settings.wins - a.settings.wins;
    if (byWins !== 0) return byWins;
    return rosterPoints(b).pf - rosterPoints(a).pf;
  });

  return ordered.map((r, i) => {
    const { pf, pa } = rosterPoints(r);
    const { wins, losses, ties } = r.settings;
    const games = wins + losses + ties;
    const expected = xw.get(r.roster_id) ?? 0;
    const user = users.find((u) => u.user_id === r.owner_id);
    return {
      rosterId: r.roster_id,
      rank: i + 1,
      label: teamLabel(user, r.roster_id),
      wins,
      losses,
      ties,
      pf,
      pa,
      pfg: games > 0 ? pf / games : 0,
      // Sleeper's real waiver order when the league exposes it; otherwise the
      // reverse-standings order it would be under rolling waivers.
      waiver: r.settings.waiver_position ?? rosters.length - i,
      xw: expected,
      luck: wins - expected,
      form: (form.get(r.roster_id) ?? []).slice(-5),
      playoff: i < playoffTeams,
    };
  });
}

/** Signed to one decimal with a true minus sign. */
export function formatLuck(luck: number): string {
  const v = Math.abs(luck).toFixed(1);
  return luck < 0 ? `−${v}` : `+${v}`;
}

export function luckClass(luck: number): string {
  if (luck >= 0.5) return 'lucky';
  if (luck <= -0.5) return 'unlucky';
  return 'neutral';
}
