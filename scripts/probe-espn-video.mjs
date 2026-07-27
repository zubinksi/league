#!/usr/bin/env node
/**
 * Probe what video ESPN still serves for a given NFL week.
 *
 *   node scripts/probe-espn-video.mjs 2025 17
 *
 * Reports, per game: whether the summary carries a `videos` array, how many
 * clips, whether their MP4 links are actually fetchable from this machine,
 * and whether structured `scoringPlays` text is present. Run it against both
 * an old week and (in season) a recent one — the difference tells us how
 * quickly ESPN's video rights expire off old game summaries.
 */

const [, , seasonArg, weekArg] = process.argv;
const season = seasonArg ?? '2025';
const week = weekArg ?? '17';

const SB = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}&seasontype=2&week=${week}`;
const SUMMARY = (id) =>
  `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${id}`;

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

/** HEAD the clip to see whether the asset is actually still served. */
async function clipReachable(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    return `${res.status}`;
  } catch (err) {
    return `ERR ${err.message.slice(0, 40)}`;
  }
}

function firstMp4(video) {
  const src = video?.links?.source ?? {};
  for (const key of ['HD', 'full', 'mp4', 'hd', 'href']) {
    const v = src[key];
    const href = typeof v === 'string' ? v : v?.href;
    if (typeof href === 'string' && href.includes('.mp4')) return href;
  }
  for (const v of Object.values(src)) {
    const href = typeof v === 'string' ? v : v?.href;
    if (typeof href === 'string' && href.includes('.mp4')) return href;
  }
  return null;
}

const board = await getJSON(SB);
const events = board.events ?? [];
console.log(`\n${season} week ${week} — ${events.length} games\n${'='.repeat(60)}`);

let totalClips = 0;
let gamesWithVideo = 0;
let firstSample = null;

for (const event of events) {
  const name = event.shortName ?? event.name ?? event.id;
  let summary;
  try {
    summary = await getJSON(SUMMARY(event.id));
  } catch (err) {
    console.log(`${name.padEnd(16)} summary failed: ${err.message}`);
    continue;
  }

  const videos = summary.videos ?? [];
  const scoring = summary.scoringPlays ?? [];
  const plays = summary.plays ?? [];
  if (videos.length) {
    gamesWithVideo++;
    totalClips += videos.length;
  }
  if (!firstSample && videos.length) firstSample = { name, video: videos[0] };

  let reach = '';
  const mp4 = videos.length ? firstMp4(videos[0]) : null;
  if (mp4) reach = ` · first clip HTTP ${await clipReachable(mp4)}`;

  console.log(
    `${name.padEnd(16)} videos:${String(videos.length).padStart(3)}` +
      ` · scoringPlays:${String(scoring.length).padStart(3)}` +
      ` · plays:${String(plays.length).padStart(4)}${reach}`,
  );
}

console.log('='.repeat(60));
console.log(`games with video: ${gamesWithVideo}/${events.length} · total clips: ${totalClips}`);

if (firstSample) {
  const v = firstSample.video;
  console.log(`\nSample clip from ${firstSample.name}:`);
  console.log(
    JSON.stringify(
      {
        headline: v.headline,
        description: v.description?.slice(0, 120),
        duration: v.duration,
        thumbnail: v.thumbnail,
        sourceKeys: Object.keys(v.links?.source ?? {}),
        mp4: firstMp4(v),
        web: v.links?.web?.href ?? v.links?.web?.short?.href,
      },
      null,
      2,
    ),
  );
} else {
  console.log('\nNo video assets on any game this week — expected for older seasons.');
}
