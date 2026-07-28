import { Link } from 'react-router-dom';
import type { MatchupView, TeamView } from '../lib/matchup';

export type CardPhase = 'live' | 'final' | 'sched';

interface Props {
  week: number;
  matchupId: number;
  view: MatchupView;
  /** Sleeper's official totals — authoritative over the starter-derived sum. */
  leftScore: number;
  rightScore: number;
  phase: CardPhase;
  /** Kickoff label for an upcoming matchup, e.g. "SUN 1:00". */
  kickoff: string;
  liveCount: number;
  flashLeft: boolean;
  flashRight: boolean;
}

const pts = (n: number) => n.toFixed(1);

function sideClass(phase: CardPhase, won: boolean): string {
  if (phase === 'live') return 'live';
  if (phase === 'sched') return 'sched';
  return won ? 'won' : 'lost';
}

/** `62% · 118.4` — the projection stays dim so the probability reads first. */
function Readout({ team, phase, leading, mirrored }: {
  team: TeamView; phase: CardPhase; leading: boolean; mirrored: boolean;
}) {
  if (phase === 'final') {
    return (
      <span className={`mprob-read ${mirrored ? 'right' : 'left'} ${leading ? 'lead' : 'trail'}`}>
        {leading ? 'WON' : '—'}
      </span>
    );
  }
  const pct = <span className="pct">{team.winPct}%</span>;
  const proj = <span className="proj">{pts(team.projectedFinal)}</span>;
  return (
    <span className={`mprob-read ${mirrored ? 'right' : 'left'} ${leading ? 'lead' : 'trail'}`}>
      {mirrored ? <>{proj} · {pct}</> : <>{pct} · {proj}</>}
    </span>
  );
}

export function LeagueMatchupCard({
  week, matchupId, view, leftScore, rightScore, phase, kickoff, liveCount, flashLeft, flashRight,
}: Props) {
  const { home: left, away: right } = view;
  const leftWon = leftScore >= rightScore;
  // A decided game is 100/0 — the bar must not read as a coin flip next to a
  // FINAL verdict, which it would whenever the lineup never resolved.
  const leftPct = phase === 'final' ? (leftWon ? 100 : 0) : left.winPct;
  const leftLeads = leftPct >= 50;

  const status =
    phase === 'live' ? `${liveCount} LIVE` : phase === 'final' ? 'FINAL' : kickoff;

  const seg = (leading: boolean, flash: boolean, style: React.CSSProperties) => (
    <span className={`mbar-seg ${leading ? 'solid' : 'striped'} ${phase}`} style={style}>
      {flash && <span className={`mbar-flash ${leading ? 'solid' : 'striped'}`} />}
    </span>
  );

  return (
    <Link to={`/matchup/${week}/${matchupId}`} className="mcard">
      <div className="mcard-grid">
        <div className={`mside ${sideClass(phase, leftWon)}`}>
          <span className="mname">{left.label}</span>
          <span className={`mscore ${flashLeft ? 'anim-scoreflash' : ''}`}>
            {phase === 'sched' ? '—' : pts(leftScore)}
          </span>
        </div>

        <div className="mstatus">
          {phase === 'final' && leftWon && <span className="mwin">◀</span>}
          <span className={phase === 'live' ? 'is-live' : ''}>{status}</span>
          {phase === 'final' && !leftWon && <span className="mwin">▶</span>}
        </div>

        <div className={`mside right ${sideClass(phase, !leftWon)}`}>
          <span className="mname">{right.label}</span>
          <span className={`mscore ${flashRight ? 'anim-scoreflash' : ''}`}>
            {phase === 'sched' ? '—' : pts(rightScore)}
          </span>
        </div>
      </div>

      <div className="mprob">
        <Readout team={left} phase={phase} leading={phase === 'final' ? leftWon : leftLeads} mirrored={false} />
        <div className="mbar">
          {seg(leftLeads, flashLeft, { width: `${leftPct}%`, flex: 'none' })}
          {seg(!leftLeads, flashRight, { flex: 1 })}
        </div>
        <Readout team={right} phase={phase} leading={phase === 'final' ? !leftWon : !leftLeads} mirrored />
      </div>
    </Link>
  );
}
