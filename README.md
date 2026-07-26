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
