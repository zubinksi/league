/**
 * Team kit colours, shared by the roster page and the arcade.
 *
 * Recognisable rather than accurate: the arcade field is near-black, so real
 * primaries like Raiders black or Ravens #241773 vanish into it. Each club gets
 * one identity colour held in a legible lightness band, clear of the defender
 * grey and of the gold the ball and the live accent own.
 *
 * public/arcade-game.html carries the same table — it is a standalone file and
 * cannot import from here, so the two must be kept in step.
 */
const TEAM_KITS: Record<string, string> = {
  ARI: '#d9455f', ATL: '#e2515a', BAL: '#7b5ce0', BUF: '#4a86ee',
  CAR: '#3fb3e8', CHI: '#e8823f', CIN: '#f26a2e', CLE: '#b0793f',
  DAL: '#6e9ae0', DEN: '#ee6a32', DET: '#4faeee', GB: '#45ae68',
  HOU: '#d8434f', IND: '#4f96ee', JAX: '#34afa6', KC: '#ee4550',
  LAC: '#56c6ee', LAR: '#5a87ee', LV: '#c6c9d0', MIA: '#35c4b8',
  MIN: '#8657e0', NE: '#5a79c8', NO: '#efe1ae', NYG: '#5a7be0',
  NYJ: '#3cb673', PHI: '#35948c', PIT: '#ebd69b', SEA: '#7fd34a',
  SF: '#e2545a', TB: '#dc4a32', TEN: '#46a6e0', WAS: '#b04a55',
};

export const teamKit = (team: string | undefined): string | null =>
  TEAM_KITS[(team || '').toUpperCase()] ?? null;
