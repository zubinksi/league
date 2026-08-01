import { useCallback, useEffect, useMemo, useState } from 'react';
import { TeamPicker, getMyRosterId } from '../components/TeamPicker';
import { usePlayerCard } from '../components/PlayerCard';
import {
  defaultWeek,
  useLeague,
  useNflState,
  usePlayers,
  usePriorSeasonTotals,
  useRosters,
  useWeekData,
  useUsers,
} from '../hooks/useLeagueData';
import { useWeeklyStatsAll } from '../hooks/useWeeklyStats';
import { arcadeQuery, buildArcadeRosters } from '../lib/arcadeRoster';
import type { ArcadePlayer } from '../lib/arcadeRoster';
import {
  GAMES,
  GAME_LABEL,
  GAME_UNIT,
  isShared,
  loadScores,
  recordScore,
  allTimeBoard,
  weekStatus,
  type GameKey,
  type ScoreEntry,
} from '../lib/arcadeScores';
import { fatigueByPlayer } from '../lib/fatigue';
import { teamLabel } from '../api/sleeper';
import { LEAGUE_ID } from '../config';

export function ArcadePage() {
  const league = useLeague();
  const rosters = useRosters();
  const users = useUsers();
  const players = usePlayers();
  const state = useNflState();
  const [picked, setPicked] = useState<number | null>(getMyRosterId());
  const [scores, setScores] = useState<ScoreEntry[]>([]);
  const [board, setBoard] = useState<GameKey>('run');
  const [boardOpen, setBoardOpen] = useState(false);
  const [flash, setFlash] = useState<string>('');
  const [reportOpen, setReportOpen] = useState(false);
  const [result, setResult] = useState<ScoreEntry | null>(null);
  const openCard = usePlayerCard();

  const week = defaultWeek(league.data, state.data);
  // Local Sunday is the real gate. The explicit preview flag keeps the full
  // ritual testable during development without weakening the production rule.
  const sunday = new Date().getDay() === 0 || new URLSearchParams(window.location.search).get('gameday') === '1';
  const weekly = useWeeklyStatsAll(league.data?.season, week, picked !== null);
  const prior = usePriorSeasonTotals(league.data?.season);
  // Bye weeks: Sleeper carries injuries but no schedule, so availability
  // needs the board we already fetch for this week.
  const { scoreboard, matchups } = useWeekData(league.data?.season, week);

  useEffect(() => {
    let live = true;
    loadScores().then((s) => { if (live) setScores(s); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (picked === null) return;
    const key = `league:minicamp-report:${week}:${picked}`;
    if (localStorage.getItem(key) !== 'seen') setReportOpen(true);
  }, [week, picked]);

  const nameOf = useCallback(
    (rosterId: number) => {
      const r = rosters.data?.find((x) => x.roster_id === rosterId);
      const u = users.data?.find((x) => x.user_id === r?.owner_id);
      return teamLabel(u, rosterId);
    },
    [rosters.data, users.data],
  );

  // The game runs in an iframe and posts its finish up to us.
  useEffect(() => {
    if (picked === null) return;
    const onMessage = async (e: MessageEvent) => {
      const d = e.data;
      if (!d || d.source !== 'arcade') return;
      // The game only knows a player's id, so opening his card is ours to do.
      // Checked before the game guard, which the card message has no reason to
      // satisfy.
      if (d.type === 'card') {
        // Short version: you are mid-lineup, not settling in with a season.
        if (d.id) openCard(String(d.id), undefined, true);
        return;
      }
      if (!GAMES.includes(d.game)) return;
      // The game asks on boot whether this week's one counted run is still
      // there, so it knows whether to offer the Matchup button.
      if (d.type === 'ready') {
        const banked = weekStatus(await loadScores(), week, picked)[d.game as GameKey];
        (e.source as Window | null)?.postMessage(
          { source: 'host', type: 'status', done: !!banked, value: banked?.value ?? 0, open: sunday },
          '*',
        );
        return;
      }
      if (d.type === 'board') { setBoard(d.game as GameKey); setBoardOpen(true); return; }
      if (d.type !== 'score') return;
      const game = d.game as GameKey;
      const { counted } = await recordScore({
        week,
        rosterId: picked,
        game,
        value: Number(d.value) || 0,
        tie: Number(d.tie) || 0,
        detail: String(d.detail ?? ''),
        player: String(d.player ?? ''),
        team: String(d.team ?? ''),
        lineup: Array.isArray(d.lineup) ? d.lineup.map(String) : undefined,
      });
      const fresh = await loadScores();
      setScores(fresh);
      // Tell the game the slot is spent, so the button reads what was banked
      // rather than offering a second go at it.
      const banked = weekStatus(fresh, week, picked)[game];
      (e.source as Window | null)?.postMessage(
        { source: 'host', type: 'status', done: !!banked, value: banked?.value ?? 0, open: sunday },
        '*',
      );
      setFlash(
        counted
          ? `${GAME_LABEL[game]} banked — ${d.value} ${GAME_UNIT[game]}`
          : `${GAME_LABEL[game]} already counted this week`,
      );
      if (counted && banked) setResult(banked);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [picked, week, openCard, sunday]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(''), 4500);
    return () => clearTimeout(t);
  }, [flash]);

  // Mileage from every counted run so far this season.
  const tired = useMemo(
    () => (picked === null ? new Map<string, number>() : fatigueByPlayer(scores, picked, week)),
    [scores, picked, week],
  );

  // Who the counted run is played against. The game names him on the button
  // that spends the week, because "matchup" on its own never said against whom.
  const opponent = useMemo(() => {
    if (picked === null || !matchups.data) return '';
    const mine = matchups.data.find((m) => m.roster_id === picked);
    if (!mine || mine.matchup_id == null) return '';
    const foe = matchups.data.find(
      (m) => m.matchup_id === mine.matchup_id && m.roster_id !== picked,
    );
    return foe ? nameOf(foe.roster_id) : '';
  }, [matchups.data, picked, nameOf]);

  const built = useMemo(() => {
    if (picked === null || !rosters.data || !players.data || weekly.loading) return null;
    const mine = rosters.data.find((r) => r.roster_id === picked);
    if (!mine) return null;
    return buildArcadeRosters(mine.players ?? [], players.data, weekly.weekly, prior.data, scoreboard.data, tired);
  }, [picked, rosters.data, players.data, weekly.loading, weekly.weekly, prior.data, scoreboard.data, tired]);

  const src = useMemo(() => {
    if (!built) return null;
    // Everyone in the league gets the same defense, coverage and wind each week.
    const seed = `${LEAGUE_ID}-W${week}`;
    return `/arcade-game.html?${arcadeQuery(built, seed, opponent)}`;
  }, [built, week, opponent]);

  const status = useMemo(
    () => (picked === null ? null : weekStatus(scores, week, picked)),
    [scores, week, picked],
  );
  const rows = useMemo(() => allTimeBoard(scores, board), [scores, board]);
  const movers = useMemo(() => progressionMoves(built), [built]);
  const resultContext = useMemo(() => {
    if (!result) return null;
    const weekScores = scores.filter((s) => s.week === week && s.game === result.game);
    const sorted = [...weekScores].sort((a, b) => b.value - a.value || b.tie - a.tie);
    const average = weekScores.length
      ? Math.round((weekScores.reduce((sum, s) => sum + s.value, 0) / weekScores.length) * 10) / 10
      : result.value;
    return { average, leader: sorted[0]?.value ?? result.value, rank: Math.max(1, sorted.findIndex((s) => s.rosterId === picked) + 1) };
  }, [result, scores, week, picked]);

  const dismissReport = () => {
    if (picked !== null) localStorage.setItem(`league:minicamp-report:${week}:${picked}`, 'seen');
    setReportOpen(false);
  };

  const shareResult = async () => {
    if (!result || !resultContext) return;
    const blob = await makeShareCard(week, result, resultContext.rank, nameOf(picked!));
    const file = new File([blob], `mini-camp-week-${week}.png`, { type: 'image/png' });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: `Mini Camp · Week ${week}` });
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="page arcade-page">
      {picked === null ? (
        rosters.data && users.data ? (
          <TeamPicker rosters={rosters.data} users={users.data} onPick={setPicked} />
        ) : (
          <div className="state-note">Loading</div>
        )
      ) : (
        <>
          <div className="arc-stage">
            {src ? (
              <iframe className="arcade-frame" src={src} title="Arcade" />
            ) : (
              <div className="state-note">Building your roster</div>
            )}
            {flash && <div className="arc-flash">{flash}</div>}
            <button className="arc-report-pill" onClick={() => setReportOpen(true)}>W{week} REPORT</button>

            {reportOpen && built && (
              <div className="arc-ritual">
                <div className="arc-ritual-card">
                  <div className="arc-eyebrow">MINI CAMP · WEEK {week}</div>
                  <h1>Your team changed.</h1>
                  <p className="arc-deck">Real Sunday production shapes your roster for the week ahead.</p>
                  <div className="arc-movers">
                    {movers.length ? movers.map((m) => (
                      <div className={`arc-move ${m.up ? 'up' : 'down'}`} key={m.key}>
                        <span className="arrow">{m.up ? '↑' : '↓'}</span>
                        <span><b>{m.player}</b><i>{m.label}</i></span>
                        <strong>{m.delta > 0 ? '+' : ''}{m.delta}</strong>
                      </div>
                    )) : <div className="arc-steady">No tier movement this week. Progress is still building.</div>}
                  </div>
                  <div className="arc-sunday-state">
                    <span>{sunday ? 'SUNDAY RUN IS OPEN' : 'SUNDAY RUN LOCKED'}</span>
                    <i>{sunday ? 'One official attempt. Make it count.' : 'Practice is open all week.'}</i>
                  </div>
                  <button className="arc-primary" onClick={dismissReport}>ENTER MINI CAMP</button>
                </div>
              </div>
            )}

            {result && resultContext && (
              <div className="arc-ritual">
                <div className="arc-ritual-card result">
                  <div className="arc-eyebrow">SUNDAY RUN · FINAL</div>
                  <h1>{result.value} <small>PTS</small></h1>
                  <div className="arc-compare">
                    <div><i>League average</i><b>{resultContext.average}</b></div>
                    <div><i>League leader</i><b>{resultContext.leader}</b></div>
                    <div className="me"><i>Your rank</i><b>#{resultContext.rank}</b></div>
                  </div>
                  <div className="arc-mvp"><i>Your MVP</i><b>{result.player || 'Your lineup'}</b><span>{result.detail}</span></div>
                  <button className="arc-primary" onClick={shareResult}>SHARE STAT CARD</button>
                  <button className="arc-secondary" onClick={() => setResult(null)}>BACK TO PRACTICE</button>
                </div>
              </div>
            )}

            {boardOpen && (
              <div className="arc-panel">
                <div className="arc-panel-head">
                  <span>{GAME_LABEL[board]} · ALL TIME</span>
                  <button className="arc-close" onClick={() => setBoardOpen(false)} aria-label="Close">
                    ×
                  </button>
                </div>
                {status && (
                  <div className="arc-slots">
                    {GAMES.map((g) => (
                      <button
                        key={g}
                        className={`arc-slot${status[g] ? ' done' : ''}${board === g ? ' on' : ''}`}
                        onClick={() => setBoard(g)}
                      >
                        <span className="k">{GAME_LABEL[g]}</span>
                        <span className="v">
                          {status[g] ? `${status[g]!.value} ${GAME_UNIT[g]}` : 'OPEN'}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="arc-board">
                  {rows.length ? (
                    rows.map((r) => (
                      <div key={r.rosterId} className={`arc-row${r.rosterId === picked ? ' me' : ''}`}>
                        <span className="rk">{r.rank}</span>
                        <span className="nm">{nameOf(r.rosterId)}</span>
                        <span className="pl">
                          {r.player}
                          {r.detail ? ` · ${r.detail}` : ''}
                        </span>
                        <span className="vl">
                          {r.value}
                          <i>{GAME_UNIT[board]}</i>
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="state-note">Nothing banked yet</div>
                  )}
                </div>

                {!isShared() && (
                  <p className="arc-note">
                    Scores are saved on this device only. Point VITE_ARCADE_API at a deployment
                    of worker/arcade-scores.js to share one board across the league.
                  </p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function progressionMoves(built: Record<string, ArcadePlayer[]> | null) {
  if (!built) return [];
  return Object.values(built).flat().flatMap((player) => player.attrs
    .filter((attr) => attr.levelled || attr.dropped)
    .map((attr) => ({
      key: `${player.id}:${attr.label}`,
      player: player.name,
      label: attr.levelled ? `${attr.label} reached ${attr.name}` : `${attr.label} slipped to ${attr.name}`,
      delta: Math.round((attr.value - attr.was) * 100),
      up: attr.levelled,
    })))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 5);
}

async function makeShareCard(week: number, result: ScoreEntry, rank: number, team: string): Promise<Blob> {
  const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1350;
  const c = canvas.getContext('2d')!;
  const bg = c.createLinearGradient(0, 0, 1080, 1350); bg.addColorStop(0, '#17140c'); bg.addColorStop(.55, '#090a0c'); bg.addColorStop(1, '#050506');
  c.fillStyle = bg; c.fillRect(0, 0, 1080, 1350);
  c.strokeStyle = '#e8c561'; c.lineWidth = 3; c.strokeRect(55, 55, 970, 1240);
  c.fillStyle = '#e8c561'; c.font = '600 34px monospace'; c.fillText('MINI CAMP', 105, 150);
  c.fillStyle = '#777980'; c.font = '28px monospace'; c.fillText(`WEEK ${week} · SUNDAY RUN`, 105, 205);
  c.fillStyle = '#f3f3f4'; c.font = '700 220px sans-serif'; c.fillText(String(result.value), 90, 520);
  c.fillStyle = '#e8c561'; c.font = '600 45px monospace'; c.fillText('POINTS', 105, 595);
  c.strokeStyle = '#2c2d31'; c.beginPath(); c.moveTo(105, 660); c.lineTo(975, 660); c.stroke();
  c.fillStyle = '#777980'; c.font = '25px monospace'; c.fillText('YOUR MVP', 105, 745);
  c.fillStyle = '#f3f3f4'; c.font = '600 52px sans-serif'; c.fillText(result.player || 'YOUR LINEUP', 105, 815);
  c.fillStyle = '#777980'; c.font = '25px monospace'; c.fillText('LEAGUE RANK', 105, 930);
  c.fillStyle = '#e8c561'; c.font = '700 96px sans-serif'; c.fillText(`#${rank}`, 105, 1030);
  c.fillStyle = '#a5a6aa'; c.font = '30px sans-serif'; c.fillText(team, 105, 1190);
  return new Promise((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error('Card render failed')), 'image/png'));
}
