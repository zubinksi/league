import { useEffect, useMemo, useRef, useState } from 'react';
import { NavBar } from '../components/NavBar';
import { TeamPicker, getMyRosterId } from '../components/TeamPicker';
import { usePlayerCard } from '../components/PlayerCard';
import { Sprite } from '../components/Sprite';
import {
  defaultWeek,
  useLeague,
  useNflState,
  usePlayers,
  usePriorSeasonTotals,
  useRosters,
  useWeekData,
  useSeasonTotals,
  useUsers,
} from '../hooks/useLeagueData';
import { useWeeklyStatsAll } from '../hooks/useWeeklyStats';
import { positionRanks } from '../lib/metrics';
import { buildArcadeRosters, sidelined, type ArcadePlayer, type AttrDetail } from '../lib/arcadeRoster';
import { fatigueByPlayer, fatigueLabel } from '../lib/fatigue';
import { loadScores, type ScoreEntry } from '../lib/arcadeScores';
import { teamKit } from '../lib/teamKits';

/** Filter order, which is also the order the roster reads in. */
const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K'];
const TIERS = 5;
/** How far a drag has to travel to turn the card. */
const THRESHOLD = 44;
/** Under this it is still a tap, not a swipe. */
const SLOP = 6;

/** Five rungs. Cleared ones full, the one you're on part-filled, and the rung
 *  just crossed lit — so the bar carries both level and recent movement. */
function Ladder({ a }: { a: AttrDetail }) {
  const filled = a.value * TIERS;
  return (
    <span className="rp-rungs">
      {Array.from({ length: TIERS }, (_, i) => {
        const pct = Math.max(0, Math.min(1, filled - i)) * 100;
        const fresh = a.levelled && i === a.tier;
        return (
          <i key={i} className={fresh ? 'fresh' : ''}>
            <b style={{ width: `${pct}%` }} />
          </i>
        );
      })}
    </span>
  );
}

function Bars({ p }: { p: ArcadePlayer }) {
  return (
    <span className="rp-bars">
      {p.attrs.map((a) => (
        <span className="rp-bar" key={a.label}>
          <span className="rp-blabel">{a.label}</span>
          <Ladder a={a} />
        </span>
      ))}
    </span>
  );
}

/** Rank and availability share the slot opposite the club, because they answer
 *  the same question: where does this player stand this week. */
function Slot({ p, rank }: { p: ArcadePlayer; rank?: number }) {
  const out = sidelined(p.status);
  return (
    <span className="rp-slot">
      <span className="rp-rank">
        {p.position}
        {rank ?? ''}
      </span>
      {p.status && <i className={`rp-status ${out ? 'out' : 'risk'}`}>{p.status}</i>}
      {!out && fatigueLabel(p.fatigue) && (
        <i className="rp-status risk">{fatigueLabel(p.fatigue)}</i>
      )}
    </span>
  );
}

function Trend({ p }: { p: ArcadePlayer }) {
  if (p.trend === 0 || sidelined(p.status)) return null;
  return <i className={`rp-trend ${p.trend > 0 ? 'up' : 'down'}`}>{p.trend > 0 ? '▲' : '▼'}</i>;
}

/** One roster, in filter order, each position keeping its availability-then-
 *  rating sort. The arcade groups by the game's four slots; the page reads by
 *  NFL position, so it is flattened and re-cut here. */
function ordered(built: Record<'run' | 'pass' | 'recv' | 'kick', ArcadePlayer[]>): ArcadePlayer[] {
  const all = [...built.pass, ...built.run, ...built.recv, ...built.kick];
  return POSITIONS.flatMap((pos) => all.filter((p) => p.position === pos));
}

/** Passer and target on the same NFL club. Picking both in the arcade puts the
 *  ball where he is going, so it belongs on both of their cards rather than in
 *  a banner of its own. */
function chemistry(list: ArcadePlayer[]): Map<string, string> {
  const map = new Map<string, string>();
  const playing = list.filter((p) => !sidelined(p.status) && p.team);
  for (const qb of playing.filter((p) => p.position === 'QB')) {
    for (const t of playing.filter((p) => p.position === 'WR' || p.position === 'TE')) {
      if (qb.team !== t.team) continue;
      map.set(qb.id, t.name);
      map.set(t.id, qb.name);
    }
  }
  return map;
}

/**
 * The card, at the size the arcade's pick card wants to be. Swipe turns the
 * deck; a tap that never moved opens the full sheet. A movement threshold is
 * what keeps those two apart, and a gesture that goes vertical first is handed
 * back to the page so the roster still scrolls.
 */
function Deck({
  list,
  chem,
  ranks,
  idx,
  setIdx,
  onOpen,
}: {
  list: ArcadePlayer[];
  chem: Map<string, string>;
  ranks: Map<string, number>;
  idx: number;
  setIdx: (i: number) => void;
  onOpen: (p: ArcadePlayer) => void;
}) {
  const [drag, setDrag] = useState(0);
  const down = useRef<{ x: number; y: number; live: boolean } | null>(null);
  const p = list[idx];
  const kit = teamKit(p.team);
  const partner = chem.get(p.id);
  const go = (d: number) => {
    setIdx(Math.max(0, Math.min(list.length - 1, idx + d)));
    setDrag(0);
  };

  const onDown = (e: React.PointerEvent) => {
    down.current = { x: e.clientX, y: e.clientY, live: false };
  };
  const onMove = (e: React.PointerEvent) => {
    const s = down.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!s.live) {
      // A vertical gesture belongs to the page; the card only claims sideways.
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > SLOP) {
        down.current = null;
        return;
      }
      if (Math.abs(dx) < SLOP) return;
      s.live = true;
    }
    // There is nothing behind the ends, so pulling past them gives way.
    const edge = (dx > 0 && idx === 0) || (dx < 0 && idx === list.length - 1);
    setDrag(dx * (edge ? 0.3 : 1));
  };
  const onUp = (e: React.PointerEvent) => {
    const s = down.current;
    down.current = null;
    if (!s) return;
    if (!s.live) {
      onOpen(p);
      return;
    }
    const dx = e.clientX - s.x;
    if (dx <= -THRESHOLD) go(1);
    else if (dx >= THRESHOLD) go(-1);
    else setDrag(0);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === 'Enter' || e.key === ' ') onOpen(p);
    else return;
    e.preventDefault();
  };

  return (
    <>
      <div className="rp-deck">
        {list.length > 2 && <i className="rp-shell s3" />}
        {list.length > 1 && <i className="rp-shell s2" />}
        <div
          className={`rp-big${sidelined(p.status) ? ' off' : ''}`}
          role="button"
          tabIndex={0}
          aria-label={`${p.name}, open card`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={() => {
            down.current = null;
            setDrag(0);
          }}
          onKeyDown={onKey}
          style={{
            transform: `translateX(${drag}px) rotate(${drag * 0.018}deg)`,
            transition: drag === 0 ? 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
          }}
        >
          <span className="rp-top">
            <span className="rp-team">
              {kit && <i className="rp-kit" style={{ background: kit }} />}
              {p.team || 'FA'}
            </span>
            <Slot p={p} rank={ranks.get(p.id)} />
          </span>
          <span className="rp-line">
            <span className="rp-name lg">{p.name}</span>
            <Trend p={p} />
          </span>
          <span className="rp-season">{p.summary}</span>
          <span className="rp-stage">
            <i className="rp-goal" />
            <i className="rp-forty" />
            <Sprite position={p.position} team={p.team} size={80} />
          </span>
          {partner && (
            <span className="rp-pair">
              Chemistry <b>{partner}</b>
            </span>
          )}
          <Bars p={p} />
        </div>
      </div>
      <div className="rp-nav">
        <button onClick={() => go(-1)} disabled={idx === 0} aria-label="Previous player">
          ◂
        </button>
        <span className="rp-count">
          {idx + 1} / {list.length}
        </span>
        <button onClick={() => go(1)} disabled={idx === list.length - 1} aria-label="Next player">
          ▸
        </button>
      </div>
      <p className="rp-cue">Tap card to open</p>
    </>
  );
}

/** The same card with the stage taken out. What you compare on is the name, the
 *  rank and the three ladders; the field and the full-size sprite are what you
 *  want when looking at one player, so only the deck carries them. */
function GridCard({ p, rank, onPick }: { p: ArcadePlayer; rank?: number; onPick: () => void }) {
  return (
    <button className={`rp-gcard${sidelined(p.status) ? ' off' : ''}`} onClick={onPick}>
      <span className="rp-ghead">
        <Sprite position={p.position} team={p.team} size={20} />
        <span className="rp-gname">
          <span className="rp-line">
            <span className="rp-name">{p.name}</span>
            <Trend p={p} />
          </span>
          <span className="rp-gmeta">
            <span className="rp-team">{p.team || 'FA'}</span>
            <Slot p={p} rank={rank} />
          </span>
        </span>
      </span>
      <span className="rp-season">{p.summary}</span>
      <Bars p={p} />
    </button>
  );
}

export function RosterPage() {
  const league = useLeague();
  const rosters = useRosters();
  const users = useUsers();
  const players = usePlayers();
  const state = useNflState();
  const [picked, setPicked] = useState<number | null>(getMyRosterId());
  const [mode, setMode] = useState<'deck' | 'grid'>('deck');
  const [pos, setPos] = useState('ALL');
  const [idx, setIdx] = useState(0);
  const open = usePlayerCard();

  const week = defaultWeek(league.data, state.data);
  const weekly = useWeeklyStatsAll(league.data?.season, week, picked !== null);
  const prior = usePriorSeasonTotals(league.data?.season);
  // Bye weeks: Sleeper carries injuries but no schedule, so availability
  // needs the board we already fetch for this week.
  const { scoreboard } = useWeekData(league.data?.season, week);
  const season = useSeasonTotals(league.data?.season);

  const ranks = useMemo(
    () =>
      players.data
        ? positionRanks(season.data, players.data, league.data?.scoring_settings?.rec ?? 0)
        : new Map<string, number>(),
    [season.data, players.data, league.data],
  );

  const [scores, setScores] = useState<ScoreEntry[]>([]);
  useEffect(() => {
    let live = true;
    loadScores().then((s) => { if (live) setScores(s); });
    return () => { live = false; };
  }, []);
  const tired = useMemo(
    () => (picked === null ? new Map<string, number>() : fatigueByPlayer(scores, picked, week)),
    [scores, picked, week],
  );

  const all = useMemo(() => {
    if (picked === null || !rosters.data || !players.data) return null;
    const mine = rosters.data.find((r) => r.roster_id === picked);
    if (!mine) return null;
    return ordered(
      buildArcadeRosters(mine.players ?? [], players.data, weekly.weekly, prior.data, scoreboard.data, tired),
    );
  }, [picked, rosters.data, players.data, weekly.weekly, prior.data, scoreboard.data, tired]);

  const chem = useMemo(() => (all ? chemistry(all) : new Map<string, string>()), [all]);
  const tabs = useMemo(
    () => ['ALL', ...POSITIONS.filter((k) => all?.some((p) => p.position === k))],
    [all],
  );
  const list = useMemo(
    () => (all ? (pos === 'ALL' ? all : all.filter((p) => p.position === pos)) : []),
    [all, pos],
  );
  // A filter can shorten the deck under the card you were on.
  const at = Math.min(idx, Math.max(0, list.length - 1));

  return (
    <div className="page roster-page">
      <NavBar title={`Week ${week} Roster`} />
      {picked === null ? (
        rosters.data && users.data ? (
          <TeamPicker rosters={rosters.data} users={users.data} onPick={setPicked} />
        ) : (
          <div className="state-note">Loading</div>
        )
      ) : !all || weekly.loading ? (
        <div className="state-note">Reading the season</div>
      ) : (
        <>
          <div className="rp-controls">
            <div className="rp-filter">
              {tabs.map((k) => (
                <button
                  key={k}
                  className={pos === k ? 'on' : ''}
                  onClick={() => {
                    setPos(k);
                    setIdx(0);
                  }}
                >
                  {k}
                </button>
              ))}
            </div>
            <div className="rp-modes">
              <button className={mode === 'deck' ? 'on' : ''} onClick={() => setMode('deck')}>
                Deck
              </button>
              <i>/</i>
              <button className={mode === 'grid' ? 'on' : ''} onClick={() => setMode('grid')}>
                Grid
              </button>
            </div>
          </div>
          {!list.length ? (
            <div className="state-note">Nobody at that position</div>
          ) : mode === 'deck' ? (
            <div className="rp-deckwrap">
              <Deck
                list={list}
                chem={chem}
                ranks={ranks}
                idx={at}
                setIdx={setIdx}
                onOpen={(p) => open(p.id)}
              />
            </div>
          ) : (
            <div className="rp-grid">
              {list.map((p, i) => (
                <GridCard
                  key={p.id}
                  p={p}
                  rank={ranks.get(p.id)}
                  onPick={() => {
                    setIdx(i);
                    setMode('deck');
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
