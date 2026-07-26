export const LEAGUE_ID: string =
  (import.meta.env.VITE_LEAGUE_ID as string | undefined) || '1257071385973362690';

/** Poll interval for live scoring (ms). */
export const LIVE_POLL_MS = 45_000;

/** Mock mode: serve fixture data instead of hitting the network.
 *  Enable with VITE_MOCK=1 or by adding ?mock=1 to the URL. */
export const MOCK =
  import.meta.env.VITE_MOCK === '1' ||
  (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('mock'));

export const MY_TEAM_STORAGE_KEY = 'league:myRosterId';
