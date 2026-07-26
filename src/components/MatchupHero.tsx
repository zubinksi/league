import type { MatchupView, TeamView } from '../lib/matchup';
import type { MatchupTimeline } from '../lib/timeline';
import { usePulseOnIncrease } from '../hooks/usePulseOnIncrease';
import { RaceChart } from './RaceChart';

const fmtScore = (n: number) => n.toFixed(1);
const fmtProj = (n: number) => n.toFixed(1);

function TeamScore({
  team,
  display,
  lead,
  side,
}: {
  team: TeamView;
  display: number;
  lead: boolean;
  side: 'left' | 'right';
}) {
  const pulse = usePulseOnIncrease(team.score);
  const emphasis = lead ? 'lead' : 'trail';
  return (
    <div className={`hero-col ${side}`}>
      <div className={`team-label ${emphasis}`}>{team.label}</div>
      <div key={pulse} className={`team-score tnum ${emphasis}${pulse ? ' anim-scoreflash' : ''}`}>
        {fmtScore(display)}
      </div>
    </div>
  );
}

function scrubLabel(tau: number): string {
  return new Date(tau)
    .toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
    .toUpperCase();
}

export function MatchupHero({
  view,
  timeline,
  scrubTau,
  onScrub,
}: {
  view: MatchupView;
  timeline: MatchupTimeline | null;
  scrubTau: number | null;
  onScrub: (tau: number | null) => void;
}) {
  const { home, away } = view;
  const scrubbing = scrubTau !== null && timeline !== null;
  const homeDisplay = scrubbing ? timeline.sideAt('home', scrubTau) : home.score;
  const awayDisplay = scrubbing ? timeline.sideAt('away', scrubTau) : away.score;
  const homeLeads = homeDisplay >= awayDisplay;
  const homeFav = home.winPct >= away.winPct;

  return (
    <section className="hero">
      <div className="hero-grid">
        <div className="hero-divider" />
        <TeamScore team={home} display={homeDisplay} lead={homeLeads} side="left" />
        <TeamScore team={away} display={awayDisplay} lead={!homeLeads} side="right" />
      </div>

      {scrubbing ? (
        <div className="win-row scrubbing">
          <span className="scrub-time">{scrubLabel(scrubTau)}</span>
        </div>
      ) : (
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
      )}

      <RaceChart view={view} timeline={timeline} scrubTau={scrubTau} onScrub={onScrub} />
    </section>
  );
}
