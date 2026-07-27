import { useEffect } from 'react';
import { RADAR_SLOTS, type TeamRanks } from '../lib/rosterRanks';
import { ordinal } from '../lib/metrics';

const fmt1 = (n: number | undefined) => (n === undefined ? '—' : n.toFixed(1));

/** Small web glyph for the nav bar action. */
export function RadarIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <polygon
        points="10,2 16.93,6 16.93,14 10,18 3.07,14 3.07,6"
        stroke="#f5f5f7"
        strokeWidth="1.2"
      />
      <polygon
        points="10,6 13.46,8 13.46,12 10,14 6.54,12 6.54,8"
        stroke="#f5f5f7"
        strokeWidth="1"
        opacity="0.55"
      />
      <g stroke="#f5f5f7" strokeWidth="0.8" opacity="0.3">
        <line x1="10" y1="10" x2="10" y2="2" />
        <line x1="10" y1="10" x2="16.93" y2="6" />
        <line x1="10" y1="10" x2="16.93" y2="14" />
        <line x1="10" y1="10" x2="10" y2="18" />
        <line x1="10" y1="10" x2="3.07" y2="14" />
        <line x1="10" y1="10" x2="3.07" y2="6" />
      </g>
    </svg>
  );
}

const CX = 150;
const CY = 136;
const R = 92;

function vertex(i: number, n: number, frac: number): [number, number] {
  const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
  return [CX + R * frac * Math.cos(angle), CY + R * frac * Math.sin(angle)];
}

/** rank 1 → outer edge, rank N → near center; empty slots hug the center. */
function rankFrac(rank: number | undefined, teams: number): number {
  if (!rank) return 0.06;
  return Math.max(0.06, (teams - rank + 1) / teams);
}

function polygonPath(ranks: (number | undefined)[], teams: number): string {
  return (
    ranks
      .map((rank, i) => {
        const [x, y] = vertex(i, ranks.length, rankFrac(rank, teams));
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ') + ' Z'
  );
}

export function RadarWeb({ teams, teamsCount }: { teams: TeamRanks[]; teamsCount: number }) {
  const n = RADAR_SLOTS.length;
  const dual = teams.length === 2;
  const ranksFor = (t: TeamRanks) =>
    RADAR_SLOTS.map((slot) => t.slots.find((s) => s.slot === slot)?.rank);
  const medianFrac = (teamsCount + 1) / (2 * teamsCount);

  // Dual mode keys the teams to purple (home) and blue (away) so the webs
  // read apart; single mode stays monochrome.
  const homeStroke = dual ? 'var(--accent-home)' : 'var(--line-home)';
  const homeFill = dual ? 'rgba(163,124,235,0.10)' : 'var(--gap-fill)';
  const homeDot = dual ? 'var(--accent-home)' : '#ffffff';

  return (
    <svg className="radar" viewBox="0 0 300 280" aria-hidden="true">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <circle key={f} cx={CX} cy={CY} r={R * f} fill="none" stroke="var(--divider-row)" />
      ))}
      {/* league median ring */}
      <circle cx={CX} cy={CY} r={R * medianFrac} fill="none" stroke="var(--divider-hero)" />
      {Array.from({ length: n }, (_, i) => {
        const [x, y] = vertex(i, n, 1);
        return <line key={i} x1={CX} y1={CY} x2={x} y2={y} stroke="var(--divider-row)" />;
      })}

      {/* away (second team) under home */}
      {teams[1] && (
        <path
          d={polygonPath(ranksFor(teams[1]), teamsCount)}
          fill="rgba(108,158,235,0.08)"
          stroke="var(--accent-away)"
          strokeWidth="1"
          strokeLinejoin="round"
        />
      )}
      {teams[1] &&
        ranksFor(teams[1]).map((rank, i) => {
          const [x, y] = vertex(i, n, rankFrac(rank, teamsCount));
          return <circle key={`a${i}`} cx={x} cy={y} r="1.8" fill="var(--accent-away)" />;
        })}
      {teams[0] && (
        <path
          d={polygonPath(ranksFor(teams[0]), teamsCount)}
          fill={homeFill}
          stroke={homeStroke}
          strokeWidth="1"
          strokeLinejoin="round"
        />
      )}
      {teams[0] &&
        ranksFor(teams[0]).map((rank, i) => {
          const [x, y] = vertex(i, n, rankFrac(rank, teamsCount));
          return <circle key={i} cx={x} cy={y} r="2" fill={homeDot} />;
        })}

      {RADAR_SLOTS.map((slot, i) => {
        const [x, y] = vertex(i, n, 1);
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        const lx = CX + (R + 20) * Math.cos(angle);
        const ly = CY + (R + 20) * Math.sin(angle) + 3;
        void x;
        void y;
        return (
          <text key={slot} x={lx} y={ly} textAnchor="middle" className="radar-label">
            {slot}
          </text>
        );
      })}
    </svg>
  );
}

export function RosterAnalysisSheet({
  teams,
  labels,
  teamsCount,
  loading,
  onClose,
}: {
  /** One team (team page) or two (matchup: [home, away]). */
  teams: (TeamRanks | undefined)[];
  labels: string[];
  teamsCount: number;
  loading: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const present = teams.filter((t): t is TeamRanks => !!t);
  const dual = present.length === 2;
  const goldIf1 = (rank?: number) => (rank === 1 ? ' first' : '');

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grabber" />
        <div className="sheet-header">
          <div className="sheet-name">Roster Analysis</div>
          {!dual && <div className="sheet-sub">{labels[0]}</div>}
        </div>

        {loading || present.length === 0 ? (
          <div className="state-note">Loading</div>
        ) : (
          <>
            <RadarWeb teams={present} teamsCount={teamsCount} />

            <div className="sheet-section">
              <span>SLOT RANKS</span>
              <span>{dual ? '' : 'PPG'}</span>
            </div>
            {dual && (
              <div className="ra-name-row">
                <span className="home">{labels[0]}</span>
                <span className="away">{labels[1]}</span>
              </div>
            )}
            {dual
              ? present[0].slots.map((home, i) => {
                  const away = present[1].slots[i];
                  return (
                    <div className="arow dual" key={home.slot}>
                      <span className={`arank${goldIf1(home.rank)}`}>
                        {home.rank ? ordinal(home.rank) : '—'}
                      </span>
                      <span className="appg">{fmt1(home.ppg)}</span>
                      <span className="aslot">{home.slot}</span>
                      <span className="appg right">{fmt1(away.ppg)}</span>
                      <span className={`arank right${goldIf1(away.rank)}`}>
                        {away.rank ? ordinal(away.rank) : '—'}
                      </span>
                    </div>
                  );
                })
              : present[0].slots.map((s) => (
                  <div className="arow" key={s.slot}>
                    <span className="aslot">{s.slot}</span>
                    <span className="aname">{s.name ?? '—'}</span>
                    <span className="appg right">{fmt1(s.ppg)}</span>
                    <span className={`arank right${goldIf1(s.rank)}`}>
                      {s.rank ? ordinal(s.rank) : '—'}
                    </span>
                  </div>
                ))}
            <div className="ra-footnote">
              RANKED BY PPG · BLENDED WITH PROJECTION UNDER 4 GP · LEAGUE SCORING · FULL ROSTER
            </div>
          </>
        )}
      </div>
    </div>
  );
}
