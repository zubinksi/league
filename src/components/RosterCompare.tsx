import { useState } from 'react';
import type { MatchupView, StarterView, TeamView } from '../lib/matchup';
import { usePulseOnIncrease } from '../hooks/usePulseOnIncrease';
import { usePlayerCard } from './PlayerCard';

const fmtPts = (n: number) => n.toFixed(1);

function stateClasses(p: StarterView, opposing?: StarterView): string {
  if (p.state === 'pre') return 'pre';
  if (p.state === 'live') return 'live';
  const mine = p.points ?? 0;
  const theirs = opposing?.points ?? 0;
  return mine >= theirs ? 'won' : 'lost';
}

export function PlayerCell({
  player,
  opposing,
  side,
}: {
  player: StarterView;
  opposing?: StarterView;
  side: 'home' | 'away';
}) {
  const pulse = usePulseOnIncrease(player.state === 'live' ? player.points : null);
  const openCard = usePlayerCard();
  const cls = stateClasses(player, opposing);
  const showProj = player.state !== 'final' && player.projected !== undefined;

  const dot = player.state === 'live' ? <span className="live-dot" /> : null;

  return (
    <div className={`pcell ${side}`}>
      <div className="line1">
        <span
          className={`pname clickable ${cls}`}
          role="button"
          tabIndex={0}
          onClick={() => openCard(player.playerId, player)}
          onKeyDown={(e) => e.key === 'Enter' && openCard(player.playerId, player)}
        >
          {player.name}
        </span>
        <span key={pulse} className={`ppts ${cls}${pulse ? ' anim-livetick' : ''}`}>
          {player.points === null ? '—' : fmtPts(player.points)}
        </span>
      </div>
      <div className="line2">
        <span className={`pgame${player.state === 'live' ? ' live' : ''}`}>
          {side === 'home' && dot}
          <span>{player.gameText}</span>
          {side === 'away' && dot}
        </span>
        <span className="pproj">{showProj ? fmtPts(player.projected!) : ''}</span>
      </div>
      <div className="pstat">{player.statLine}</div>
    </div>
  );
}

function StatusGroup({ team }: { team: TeamView }) {
  const parts: React.ReactNode[] = [];
  if (team.liveCount > 0) {
    parts.push(
      <span key="live" className="status-live">
        {team.liveCount} LIVE
      </span>,
    );
  }
  if (team.toPlayCount > 0) {
    if (parts.length) parts.push(<span key="sep" className="status-sep">·</span>);
    parts.push(
      <span key="pre" className="status-toplay">
        {team.toPlayCount} TO PLAY
      </span>,
    );
  }
  return <span className="status-group">{parts}</span>;
}

export function RosterCompare({ view }: { view: MatchupView }) {
  const [benchOpen, setBenchOpen] = useState(false);
  const { home, away } = view;
  const rows = Math.max(home.starters.length, away.starters.length);
  const benchRows = Math.max(home.bench.length, away.bench.length);

  return (
    <section>
      <div className="roster-header">
        <StatusGroup team={home} />
        <StatusGroup team={away} />
      </div>

      {Array.from({ length: rows }, (_, i) => (
        <div className="roster-row" key={home.starters[i]?.playerId ?? away.starters[i]?.playerId ?? i}>
          <div className="roster-grid">
            {home.starters[i] ? (
              <PlayerCell player={home.starters[i]} opposing={away.starters[i]} side="home" />
            ) : (
              <div className="pcell home" />
            )}
            {away.starters[i] ? (
              <PlayerCell player={away.starters[i]} opposing={home.starters[i]} side="away" />
            ) : (
              <div className="pcell away" />
            )}
          </div>
        </div>
      ))}

      {benchOpen &&
        Array.from({ length: benchRows }, (_, i) => (
          <div className="roster-row" key={`bn-${home.bench[i]?.playerId ?? ''}-${away.bench[i]?.playerId ?? i}`}>
            <div className="roster-grid">
              {home.bench[i] ? (
                <PlayerCell player={home.bench[i]} side="home" />
              ) : (
                <div className="pcell home" />
              )}
              {away.bench[i] ? (
                <PlayerCell player={away.bench[i]} side="away" />
              ) : (
                <div className="pcell away" />
              )}
            </div>
          </div>
        ))}

      <div className="bench-btn-wrap">
        <button className={`bench-btn${benchOpen ? ' open' : ''}`} onClick={() => setBenchOpen((v) => !v)}>
          {benchOpen ? 'HIDE BENCH' : 'VIEW BENCH'}
          <svg width="13" height="8" viewBox="0 0 13 8" fill="none">
            <path
              d="M1 1.25 L6.5 6.75 L12 1.25"
              stroke="#e6e6ea"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </section>
  );
}
