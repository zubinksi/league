import type { MatchupView, TeamView } from '../lib/matchup';
import { usePulseOnIncrease } from '../hooks/usePulseOnIncrease';
import { RaceChart } from './RaceChart';

const fmtScore = (n: number) => n.toFixed(1);
const fmtProj = (n: number) => n.toFixed(1);

function TeamScore({ team, lead, side }: { team: TeamView; lead: boolean; side: 'left' | 'right' }) {
  const pulse = usePulseOnIncrease(team.score);
  const emphasis = lead ? 'lead' : 'trail';
  return (
    <div className={`hero-col ${side}`}>
      <div className={`team-label ${emphasis}`}>{team.label}</div>
      <div key={pulse} className={`team-score tnum ${emphasis}${pulse ? ' anim-scoreflash' : ''}`}>
        {fmtScore(team.score)}
      </div>
    </div>
  );
}

export function MatchupHero({ view }: { view: MatchupView }) {
  const { home, away } = view;
  const homeLeads = home.score >= away.score;
  const homeFav = home.winPct >= away.winPct;

  return (
    <section className="hero">
      <div className="hero-grid">
        <div className="hero-divider" />
        <TeamScore team={home} lead={homeLeads} side="left" />
        <TeamScore team={away} lead={!homeLeads} side="right" />
      </div>

      <div className="win-row">
        <span className="win-group">
          <span className="proj-left">PROJ {fmtProj(home.projectedFinal)}</span>
          <span className="win-sep">·</span>
          <span className={`win-pct ${homeFav ? 'fav' : 'dog'}`}>{home.winPct}% WIN</span>
        </span>
        <span className="win-group">
          <span className={`win-pct ${homeFav ? 'dog' : 'fav'}`}>{away.winPct}% WIN</span>
          <span className="win-sep">·</span>
          <span className="proj-right">PROJ {fmtProj(away.projectedFinal)}</span>
        </span>
      </div>

      <RaceChart view={view} />
    </section>
  );
}
