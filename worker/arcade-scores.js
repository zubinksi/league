/**
 * League-wide arcade scores. Cloudflare Worker + KV.
 *
 * The app works without this — scores fall back to localStorage on the device.
 * Deploy this and set VITE_ARCADE_API to its URL to share one board.
 *
 *   wrangler kv namespace create ARCADE
 *   # put the returned id in wrangler.toml, then:
 *   wrangler deploy
 *
 * wrangler.toml:
 *   name = "arcade-scores"
 *   main = "worker/arcade-scores.js"
 *   compatibility_date = "2024-11-01"
 *   [[kv_namespaces]]
 *   binding = "ARCADE"
 *   id = "<id from the create command>"
 *
 * There is no auth. Anyone with the URL can post a score, which is the right
 * trade for a private league board — but it does mean the URL is the only
 * thing keeping a stranger off it. Set ALLOW_ORIGIN to your site so a random
 * page cannot post on a visitor's behalf.
 */

const GAMES = ['run', 'pass', 'kick'];
const ALLOW_ORIGIN = '*'; // narrow this to your deployed origin

const cors = {
  'access-control-allow-origin': ALLOW_ORIGIN,
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type',
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...cors },
  });

/** One key per slot, so first write wins and replays cannot overwrite it. */
const slotKey = (e) => `s:${e.week}:${e.rosterId}:${e.game}`;

function clean(raw) {
  const week = Number(raw?.week);
  const rosterId = Number(raw?.rosterId);
  const value = Number(raw?.value);
  if (!Number.isInteger(week) || week < 1 || week > 22) return null;
  if (!Number.isInteger(rosterId) || rosterId < 1 || rosterId > 64) return null;
  if (!GAMES.includes(raw?.game)) return null;
  if (!Number.isFinite(value) || value < 0 || value > 100000) return null;
  const str = (v, n) => String(v ?? '').slice(0, n);
  return {
    week,
    rosterId,
    game: raw.game,
    value: Math.round(value * 10) / 10,
    detail: str(raw.detail, 24),
    player: str(raw.player, 24),
    team: str(raw.team, 4),
    at: Date.now(),
  };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    const url = new URL(request.url);
    if (!url.pathname.endsWith('/scores')) return json({ error: 'not found' }, 404);

    if (request.method === 'GET') {
      const out = [];
      let cursor;
      do {
        const page = await env.ARCADE.list({ prefix: 's:', cursor });
        cursor = page.list_complete ? undefined : page.cursor;
        const values = await Promise.all(page.keys.map((k) => env.ARCADE.get(k.name, 'json')));
        for (const v of values) if (v) out.push(v);
      } while (cursor);
      return json(out);
    }

    if (request.method === 'POST') {
      let raw;
      try {
        raw = await request.json();
      } catch {
        return json({ error: 'bad json' }, 400);
      }
      const entry = clean(raw);
      if (!entry) return json({ error: 'bad entry' }, 400);

      const key = slotKey(entry);
      const existing = await env.ARCADE.get(key, 'json');
      // One scored run per game per week: the first finish stands.
      if (existing) return json({ counted: false, standing: existing });
      await env.ARCADE.put(key, JSON.stringify(entry));
      return json({ counted: true, standing: entry });
    }

    return json({ error: 'method not allowed' }, 405);
  },
};
