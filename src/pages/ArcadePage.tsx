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
import { Sprite } from '../components/Sprite';
import { drawSprite, SPRITE } from '../lib/sprites';
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
  const resultContext = useMemo(() => {
    if (!result) return null;
    const weekScores = scores.filter((s) => s.week === week && s.game === result.game);
    const sorted = [...weekScores].sort((a, b) => b.value - a.value || b.tie - a.tie);
    const average = weekScores.length
      ? Math.round((weekScores.reduce((sum, s) => sum + s.value, 0) / weekScores.length) * 10) / 10
      : result.value;
    return { average, leader: sorted[0]?.value ?? result.value, rank: Math.max(1, sorted.findIndex((s) => s.rosterId === picked) + 1) };
  }, [result, scores, week, picked]);

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
            {result && resultContext && (
              <div className="arc-final">
                <div className="arc-final-card">
                  <div className="arc-final-kicker">MINI CAMP <i>·</i> WEEK {week}</div>
                  <div className="arc-final-label">FINAL SCORE</div>
                  <div className="arc-final-score">{result.value}</div>
                  <div className="arc-score-glow" />
                  <div className="arc-final-mode">FINAL <i>·</i> SUNDAY RUN</div>
                  <div className="arc-final-detail">{result.detail || `${result.tie} YARDS`}</div>
                  <div className="arc-final-mvp">
                    <Sprite position="WR" team={result.team} size={72} />
                    <span><i>YOUR MVP</i><b>{result.player || 'YOUR LINEUP'}</b></span>
                  </div>
                  <div className="arc-final-compare">
                    <span><i>AVG</i><b>{resultContext.average}</b></span>
                    <span><i>LEADER</i><b>{resultContext.leader}</b></span>
                    <span className="rank"><i>RANK</i><b>#{resultContext.rank}</b></span>
                  </div>
                  <button className="arc-share" onClick={shareResult}>
                    <span aria-hidden>⇧</span> SHARE SCORE
                  </button>
                  <button className="arc-final-back" onClick={() => setResult(null)}>BACK TO PRACTICE</button>
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

async function makeShareCard(week: number, result: ScoreEntry, rank: number, team: string): Promise<Blob> {
  const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1350;
  const c = canvas.getContext('2d')!;
  const bg = c.createRadialGradient(540, 820, 20, 540, 720, 760); bg.addColorStop(0, '#29200a'); bg.addColorStop(.38, '#0d0c08'); bg.addColorStop(1, '#030405');
  c.fillStyle = bg; c.fillRect(0, 0, 1080, 1350);
  c.strokeStyle = '#5d5f62'; c.lineWidth = 3; roundRect(c, 55, 55, 970, 1240, 30); c.stroke();
  drawCorners(c, 85, 85, 910, 1180);
  c.fillStyle = '#efc72f'; c.font = '600 34px monospace'; c.fillText('MINI CAMP', 110, 155);
  c.textAlign = 'right'; c.fillStyle = '#68696e'; c.fillText(`WEEK ${week}`, 970, 155); c.textAlign = 'center';
  c.fillStyle = '#ececef'; c.font = '500 38px monospace'; c.fillText('SCORE', 540, 265);
  c.shadowColor = '#f3c72a'; c.shadowBlur = 32; c.fillStyle = '#f3c72a'; c.font = '700 250px monospace'; c.fillText(String(result.value), 540, 525); c.shadowBlur = 0;
  const line = c.createLinearGradient(110, 0, 970, 0); line.addColorStop(0, 'transparent'); line.addColorStop(.5, '#efc72f'); line.addColorStop(1, 'transparent'); c.strokeStyle = line; c.lineWidth = 2; c.beginPath(); c.moveTo(110, 590); c.lineTo(970, 590); c.stroke();
  c.fillStyle = '#efc72f'; c.font = '600 28px monospace'; c.fillText('★  YOUR MVP  ★', 540, 670);
  const mvp = (result.player || 'YOUR LINEUP').toUpperCase(); c.fillStyle = '#f4f4f5'; c.font = '700 58px monospace'; wrapCentered(c, mvp, 540, 750, 760, 66);
  const sprite = document.createElement('canvas'); sprite.width = SPRITE; sprite.height = SPRITE; drawSprite(sprite.getContext('2d')!, 'WR', result.team);
  c.imageSmoothingEnabled = false; c.drawImage(sprite, 390, 865, 300, 300);
  c.fillStyle = '#68696e'; c.font = '24px monospace'; c.fillText(`${result.detail || `${result.tie} YARDS`}  ·  LEAGUE RANK #${rank}`, 540, 1220);
  c.fillStyle = '#efc72f'; c.font = '500 24px monospace'; c.fillText(team.toUpperCase(), 540, 1260);
  return new Promise((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error('Card render failed')), 'image/png'));
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath(); c.roundRect(x, y, w, h, r);
}

function drawCorners(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  c.strokeStyle = '#efc72f'; c.lineWidth = 5; const n = 28;
  [[x,y,n,0,0,n],[x+w,y,-n,0,0,n],[x,y+h,n,0,0,-n],[x+w,y+h,-n,0,0,-n]].forEach(([a,b,dx,dy,ex,ey]) => {
    c.beginPath(); c.moveTo(a + dx, b + dy); c.lineTo(a, b); c.lineTo(a + ex, b + ey); c.stroke();
  });
}

function wrapCentered(c: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, line: number) {
  const words = text.split(' '); const lines: string[] = []; let current = '';
  for (const word of words) { const next = current ? `${current} ${word}` : word; if (current && c.measureText(next).width > width) { lines.push(current); current = word; } else current = next; }
  if (current) lines.push(current); lines.forEach((value, i) => c.fillText(value, x, y + i * line));
}
