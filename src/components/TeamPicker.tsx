import { MY_TEAM_STORAGE_KEY } from '../config';
import { teamLabel, type SleeperRoster, type SleeperUser } from '../api/sleeper';

export function getMyRosterId(): number | null {
  const raw = localStorage.getItem(MY_TEAM_STORAGE_KEY);
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function setMyRosterId(rosterId: number) {
  localStorage.setItem(MY_TEAM_STORAGE_KEY, String(rosterId));
}

/** One-time perspective picker (read-only app, no auth): whose team is "yours". */
export function TeamPicker({
  rosters,
  users,
  onPick,
}: {
  rosters: SleeperRoster[];
  users: SleeperUser[];
  onPick: (rosterId: number) => void;
}) {
  return (
    <section>
      <div className="section-header">
        <span>SELECT YOUR TEAM</span>
      </div>
      {[...rosters]
        .sort((a, b) => a.roster_id - b.roster_id)
        .map((r) => {
          const user = users.find((u) => u.user_id === r.owner_id);
          return (
            <button
              key={r.roster_id}
              className="picker-row"
              onClick={() => {
                setMyRosterId(r.roster_id);
                onPick(r.roster_id);
              }}
            >
              <span className="team">{teamLabel(user, r.roster_id)}</span>
              <span className="sub">
                {r.settings.wins}-{r.settings.losses}
                {r.settings.ties ? `-${r.settings.ties}` : ''}
              </span>
            </button>
          );
        })}
    </section>
  );
}
