# League

A read-only fantasy football UI for a Sleeper league, styled as a premium
financial terminal: near-monochrome, monospaced numerals, hairline dividers,
and gold reserved strictly for live scoring moments.

## Pages

- **Matchup** — head-to-head detail: team scores with leader emphasis, live
  win probability, the cumulative "scoring race" chart, and a mirrored
  starter-by-starter roster comparison with expandable bench.
- **League** — standings plus per-week matchup scores (tap through to any
  matchup, browse weeks with ‹ ›).
- **Team** — a roster's week: starters by slot, bench, record, PF/PA.
- **Players** — search + position filter over the NFL player pool, an
  ALL/AVAILABLE pool toggle (available = unrostered in this league), and
  sorting by season points, weekly points, ADP, or Sleeper's trending adds.

## Running

```sh
npm install
npm run dev
```

The league ID defaults to the one in `src/config.ts`; override with an env
var:

```sh
VITE_LEAGUE_ID=<your_league_id> npm run dev
```

### Mock mode

Append `?mock=1` to any URL (or set `VITE_MOCK=1`) to run against fixture
data — a mid-Sunday week with final, live, and not-yet-started games. Useful
for development in the offseason and for previewing the live states.

## Data sources

All read-only, no auth, fetched directly from the browser:

- **Sleeper public API** (`api.sleeper.app/v1`) — league, users, rosters,
  weekly matchups, player metadata (the ~5MB `/players/nfl` blob is slimmed
  and cached in localStorage for 24h), trending players.
- **Sleeper unofficial endpoints** — weekly projections and box-score stats.
  These power PROJ, win %, and the stat lines. They're used by Sleeper's own
  clients but are undocumented and have moved hosts over time, so the client
  tries each known variant (`api.sleeper.com/stats/nfl/{season}/{week}`,
  then the legacy `api.sleeper.app/stats/nfl/regular/{season}/{week}`; same
  for projections) and sticks with the first that returns data. If all fail,
  the UI degrades gracefully (hides PROJ/stat lines).
- **ESPN public scoreboard** — per-game state (pre/live/final), quarter, and
  clock, keyed by NFL team. Drives the `vs BUF · Q3` strings, live dots, and
  the chart's progress axis.

### Advanced metrics

Player cards include a METRICS section computed client-side from the
season's weekly stat maps, scored with the league's own settings: weekly
positional finishes (with per-week tags in the game log and a season
positional rank), floor/ceiling (25th/75th percentile weeks), boom/bust
rates, last-4 average, opportunities per game, points per opportunity,
catch rate, yards per touch, and target/carry share of the player's NFL
team. Snap share and red-zone usage render automatically when Sleeper's
payload carries those keys. The This Week section adds matchup context —
"BUF allows 5th-most to WR" — derived from the same data.

### Chart scrubbing & the snapshot recorder

Drag on the matchup chart (mouse: drag; touch: short hold, then drag) to
scrub through the week: the hero scores, leader emphasis, and every roster
row re-render to their values at the scrubbed time, with a timestamp shown
in place of the projection/win row. Release to snap back to now.

While games are live, every poll records the per-player points that changed
(delta-encoded per matchup, in localStorage). The scrub timeline uses those
observed values verbatim wherever they exist and falls back to linear
interpolation across each game window elsewhere — so the more the app is
open during games, the more the replay reflects what actually happened.

### Known approximations

- **Win %** is computed, not official: current score plus remaining
  projection for each side, compared under a normal model. Sleeper does not
  expose a win probability.
- **The race chart's intra-game shape** is approximated. Sleeper has no
  play-by-play timeline, so each player's points ramp linearly across their
  game window (kickoff → now/final); the series always ends at the exact
  current totals.

## Live updates

The app polls matchups, stats, and the scoreboard every 45s and diffs
against the previous render: point increases fire the one-shot gold flashes
(player `livetick`, team `scoreflash`, chart `endpulse`), and the chart
paths morph via a 0.6s CSS transition. `prefers-reduced-motion` disables all
of it.

## Stack

Vite · React 18 · TypeScript · TanStack Query · React Router. Geist and
Geist Mono are self-hosted via Fontsource. No component library — the design
tokens in `src/theme.css` and component styles in `src/app.css` carry the
exact values from the design spec.
