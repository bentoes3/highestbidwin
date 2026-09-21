# Basketball rating methodology — local prototype only

Release note (2026-09-21): the user approved publication of this prototype. Ratings remain original, unofficial estimates. `localTestingOnly` records their original development scope; it does not represent official or licensed data. The numeric methodology below is unchanged.

Version: `hbw-local-v1` (2026-09-17). No approved basketball rating source existed in this project. No commercial video-game ratings or proprietary attribute tables were imported or scraped.

## Every numeric rating's source

All 200 records in `dist/basketball/players.js` carry `ratingSource: "hbw-local-v1"` and `localTestingOnly: true`. The source for **every overall rating** is an original editorial playtest value authored for Highest Bid Wins in this task. These are gameplay estimates, not measured statistics, official ratings, or a claim of precise current-season performance. All-Time represents an editorial memorable/peak-era version, not a specific documented season.

Overall bands: 95–99 generational/superstar test cards; 90–94 leading stars; 85–89 prominent starters/All-Stars; 80–84 familiar starters and role players; 77–79 recognizable supporting players. Bands affect ability only, **never draw probability**. Current pool: 100. All-Time pool: 100. IDs are edition/mode scoped; no duplicate identity within either pool.

Six synthetic attributes use the following original primary-position templates, then add `overall − 85` to each value and clamp to 25–99. They are illustrative game values, **not player scouting data**. For example, a C rated 97 has 60/99/71/99/97/78. Overall alone feeds lineup scoring; the six attributes do not secretly modify the result.

| Primary | 3PT | FIN | PAS | REB | DEF | ATH |
|---|---:|---:|---:|---:|---:|---:|
| PG | 82 | 80 | 88 | 48 | 69 | 82 |
| SG | 84 | 83 | 74 | 55 | 72 | 83 |
| SF | 78 | 84 | 70 | 71 | 78 | 82 |
| PF | 68 | 86 | 64 | 84 | 80 | 76 |
| C | 48 | 88 | 59 | 91 | 85 | 66 |

3PT = three-point shooting; FIN = finishing; PAS = passing; REB = rebounding; DEF = defense; ATH = athleticism. The pool dialog and rating dialog explicitly disclose the synthetic methodology.

## Names and positions

Names are factual identifiers selected editorially for recognizability; no team names, affiliations, jersey numbers, portraits, logos or uniform assets were added. Primary/secondary basketball positions are editorial approximations for this game, not official roster positions. The public [NBA player directory](https://www.nba.com/players) was consulted as roster context only; it is **not a source of numeric ratings**, and no images or proprietary ratings were downloaded. Current means the contemporary player pool, not a live injury or roster feed. Active status and positions must be reviewed again before any public release.

## Position model

Each lineup uses PG, SG, SF, PF and C. Listed positions retain 100%. The shortest distance from any listed position along PG → SG → SF → PF → C determines the multiplier: distance 1 = 92%; 2 = 80%; 3 = 62%; 4 = 45%. Round each adjusted overall to a whole number, find the maximum-total assignment, then divide by five. A C-only player in PG therefore keeps 45%; a PG/SG in either listed slot keeps 100%. Exact totals tie. Incomplete lineups include zero-valued empty slots.

## Randomness and free signings

Basketball uses one equal-width RNG interval per eligible player. No tiers, ratings, positions or missing slots affect that choice. Revealed auction players leave the deck; signed players cannot be signed twice. Free signings sample uniformly from all unclaimed players, including previously unsold players, one at a time. Neither mode targets missing positions. Spending $20 early can yield a badly fitting lineup.

## Before release

Review and approve all ratings, synthetic-attribute presentation, active status, positions and name/likeness commercial use separately. This local task does not establish publicity, trademark or other commercial rights. No official league affiliation is implied. Do not publish this prototype without the user's explicit later approval.
