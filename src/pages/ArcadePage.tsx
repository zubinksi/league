import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavBar } from '../components/NavBar';
import { TeamPicker, getMyRosterId } from '../components/TeamPicker';
import {
  defaultWeek,
  useLeague,
  useNflState,
  usePlayers,
  useRosters,
  useUsers,
} from '../hooks/useLeagueData';
import { useWeeklyStatsAll } from '../hooks/useWeeklyStats';
import { arcadeQuery, buildArcadeRosters } from '../lib/arcadeRoster';
import {
  GAMES,
  GAME_LABEL,
  GAME_UNIT,
  isShared,
  loadScores,
  recordScore,
  seasonStandings,
  weekBoard,
  weekStatus,
  type GameKey,
  type ScoreEntry,
} from '../lib/arcadeScores';
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

  const week = defaultWeek(league.data, state.data);
  const weekly = useWeeklyStatsAll(league.data?.season, week, picked !== null);

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
      if (!d || d.source !== 'arcade' || !GAMES.includes(d.game)) return;
      if (d.type === 'board') { setBoard(d.game as GameKey); setBoardOpen(true); return; }
      if (d.type !== 'score') return;
      const game = d.game as GameKey;
      const { counted } = await recordScore({
        week,
        rosterId: picked,
        game,
        value: Number(d.value) || 0,
        detail: String(d.detail ?? ''),
        player: String(d.player ?? ''),
        team: String(d.team ?? ''),
      });
      setScores(await loadScores());
      setFlash(
        counted
          ? `${GAME_LABEL[game]} banked — ${d.value} ${GAME_UNIT[game]}`
          : `${GAME_LABEL[game]} already counted this week — that run was practice`,
      );
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [picked, week]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(''), 4500);
    return () => clearTimeout(t);
  }, [flash]);

  const src = useMemo(() => {
    if (picked === null || !rosters.data || !players.data || weekly.loading) return null;
    const mine = rosters.data.find((r) => r.roster_id === picked);
    if (!mine) return null;
    const built = buildArcadeRosters(mine.players ?? [], players.data, weekly.weekly);
    // Everyone in the league gets the same defense, coverage and wind each week.
    const seed = `${LEAGUE_ID}-W${week}`;
    return `/arcade-game.html?${arcadeQuery(built, seed)}`;
  }, [picked, rosters.data, players.data, weekly.loading, weekly.weekly, week]);

  const status = useMemo(
    () => (picked === null ? null : weekStatus(scores, week, picked)),
    [scores, week, picked],
  );
  const rows = useMemo(() => weekBoard(scores, week, board), [scores, week, board]);
  const season = useMemo(
    () => seasonStandings(scores, rosters.data?.length ?? 10),
    [scores, rosters.data],
  );

  return (
    <div className="page arcade-page">
      <NavBar title={`Week ${week} Arcade`} />
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

            {boardOpen && (
              <div className="arc-panel">
                <div className="arc-panel-head">
                  <span>WEEK {week} BOARD</span>
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
                        <span className="pl">{r.player}</span>
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

                <div className="arc-panel-head sub">
                  <span>SEASON</span>
                </div>
                <div className="arc-board">
                  {season.length ? (
                    season.map((r, i) => (
                      <div key={r.rosterId} className={`arc-row${r.rosterId === picked ? ' me' : ''}`}>
                        <span className="rk">{i + 1}</span>
                        <span className="nm">{nameOf(r.rosterId)}</span>
                        <span className="pl">
                          {r.wins} win{r.wins === 1 ? '' : 's'}
                        </span>
                        <span className="vl">
                          {r.points}
                          <i>PTS</i>
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="state-note">No results yet</div>
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
