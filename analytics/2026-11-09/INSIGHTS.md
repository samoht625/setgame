# Set analytics, through 2026-11-09

Source: Umami at `analytics.tido.site` for `set.tido.site` (website `b4235c8a-975d-4920-85d3-0a87a4af920c`). Pulled from the local Postgres at about 01:10 UTC on 2026-11-09. The newest event in the extract is `2026-11-09 01:07:57 UTC`. Aggregates only. No session ids.

Pageviews start `2026-08-22`. Custom events start `2026-10-04`. Every hit is on `set.tido.site`.

## The shape of the audience

Since custom events began, the site has **439 sessions and 2,287 pageviews**. In the six weeks before that it had 68 sessions and 198 pageviews.

Traffic jumped on Monday 2026-10-26 and Tuesday 2026-10-27, 94 sessions each day. Reddit sent the tagged part of that: 33 sessions on the 26th and 17 on the 27th (`reddit.com`, `com.reddit.frontpage`, `out.reddit.com`). The days stayed high after the post. The week of 2026-10-26 had 191 sessions. The week of 2026-11-02 had 147. The quiet weeks before the post were 22 to 47 sessions.

The last 7 days versus the 7 days before that: sessions 148 versus 185, pageviews 835 versus 947, custom events 2,211 versus 1,744. Fewer arrivals, more play per arrival. The last 24 hours had 27 sessions.

Where sessions come from, since 2026-10-04:

| Source | Sessions | Share |
| --- | ---: | ---: |
| Direct, no referrer | 345 | 79% |
| Reddit (all three hostnames) | 64 | 15% |
| English Wikipedia | 23 | 5% |
| tido.site, mail, DuckDuckGo, Facebook | 7 | 2% |

No session has a UTM tag. Wikipedia is a thin steady stream (a few sessions a day around 2026-10-20), separate from the Reddit jump.

Countries, from 467 session rows since 2026-10-04: United States 313 (67%), Netherlands 40, United Kingdom 29, Germany 22, Ireland 14, Canada 12. Languages are mostly `en-US` (334) and `en-GB` (75).

Devices: mobile 357 (76%), laptop 91, desktop 17, tablet 2. Operating systems: iOS 222, Android 137, Mac 53, Windows 46. The common screens are phone-sized (`402x874`, `393x852`, `440x956`, `384x832`). Safari on desktop is 5 sessions. The phone layout is the product.

Hour and weekday charts in `raw/dow_hour.json` count a session once per hour it is present, so long practice sessions stretch the bars. Presence is spread through the US day, highest around 07:00–10:00 Pacific, quiet from midnight to 03:00 Pacific. Monday and Tuesday look biggest because those are the two Reddit days, not because the week has settled into that shape.

## People play

Of 439 sessions since 2026-10-04, **326 started at least one game (74%)**. Another 410 sessions fired some custom event, including the tour and the reminder sheet. Visits look bouncy in Umami because the app is one URL: 505 of 982 visits since 2026-10-04 have a single pageview, and only 133 of 982 have a single pageview and no custom event. Median visit length is 199 seconds. The Umami bounce rate overstates people who leave without playing.

Landing page decides the mode, and most people land on the daily:

| First URL | Sessions | Started a game | Daily | Puzzle | Practice | Multi |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `/` | 323 | 244 | 185 | 104 | 102 | 6 |
| `/puzzle` | 50 | 35 | 18 | 33 | 3 | 0 |
| `/daily` | 45 | 29 | 29 | 6 | 4 | 0 |
| `/practice` | 14 | 13 | 4 | 6 | 11 | 1 |
| `/stats` | 7 | 5 | 4 | 3 | 3 | 0 |

`/m` is never an entry URL. It has 42 pageviews across 22 sessions, all from inside the app. `/stats` has 129 pageviews across 45 sessions, so the global set stats get a real look.

## Daily and puzzle finish. Practice is a few people.

Event totals since 2026-10-04, and the share of **sessions that started that mode** who later hit each step in the same session:

| Mode | Starts (sessions) | Found a set | Reached 10 sets | Finished a game | Quit at least once |
| --- | ---: | ---: | ---: | ---: | ---: |
| Daily | 352 (240) | 96% of sessions | 77% | 71% (170) | 24% |
| Puzzle | 215 (153) | 97% | — | 85% (130) | 7% |
| Practice | 727 (132) | 73% | 48% | 39% (52) | 70% |
| Multiplayer | 13 (7) | 6 of 7 | 3 of 7 | 4 of 7 | 5 of 7 |

The puzzle has 6 sets, so it never emits `set_10`.

Per deal, finishes divided by starts: daily 275/352 (78%), puzzle 193/215 (90%), practice 372/727 (51%), multiplayer 7/13. A few completes have no `game_start` in the same session (daily complete-sessions 177 versus 170 in the funnel).

Practice volume is not broad. The top 5 sessions produced 290 of 727 practice starts (40%). Sessions with 10 or more starts produced 61%. One session started practice 67 times. Daily is the opposite: 240 sessions, 1.5 starts each, and the top 5 sessions are only 43 starts. Puzzle is 1.4 starts per session, top 5 sessions are 29 starts.

By week, starts / completes (sessions that started):

| Week of | Sessions | Daily | Puzzle | Practice | Multi |
| --- | ---: | --- | --- | --- | --- |
| 2026-09-28 (events from Oct 4) | 30 | 8/5 (6) | — | 37/19 (4) | — |
| 2026-10-05 | 47 | 21/21 (15) | — | 106/55 (20) | — |
| 2026-10-12 | 22 | 18/18 (11) | — | 51/39 (10) | — |
| 2026-10-19 | 44 | 25/20 (19) | 4/4 (4) | 93/33 (34) | 3/2 (2) |
| 2026-10-26 | 191 | 148/101 (131) | 91/73 (77) | 180/48 (49) | 8/5 (3) |
| 2026-11-02 | 147 | 131/110 (71) | 119/116 (72) | 257/177 (27) | 2/0 (2) |
| 2026-11-09 (a few hours) | 3 | 1/0 | 1/0 | 3/1 | — |

The Reddit week brought the daily and the puzzle to a wide audience, and both finished at a high rate. The following week, daily sessions fell from 131 to 71 while the finish rate rose (110 completes on 131 starts). Puzzle that week finished 116 of 119 starts. Practice that week was 27 sessions producing 257 starts and 177 finishes. Multiplayer showed up during the spike (8 starts, 3 sessions) and went quiet (2 joins in the last 7 days, against 22 the week before).

Almost every deal is ranked. Unranked play is 6 practice starts, 1 daily start, and 11 practice finishes. Offline play is a rounding error.

## Where games are lost

The first set is fast when it happens. Median time to the first set: puzzle 5 seconds, daily 6 seconds, practice 8 seconds. The p90 is still under about 40 seconds in every mode. People who engage with the board find a set immediately.

Daily quits are all `page_hide` (74). Median progress at quit is 5 sets. 14 of the 74 had found nothing. 17 had found 10 to 19, and 2 had found 20 or more, so some leavers are close to a finished deal (finished dailies have a median of 24 sets).

Puzzle quits are rare and also all `page_hide` (14): 5 at 0 sets, 4 at 1–3, 5 at 4–5.

Practice quits (402) split into `new_game` 164, `idle` 135, and `page_hide` 103. **214 of those 402 quits are at 0 sets** (87 new game, 66 page hide, 61 idle). Combined with the start concentration above, a large share of practice "starts" are deals sitting open: the mode auto-deals, the 15-minute idle reset deals again, and new game deals again. Only 75% of practice starts ever record a first set, against 97% for daily and puzzle.

Among deals that do finish, mistakes are light:

| Mode | Finishes with 0 misses | Median misses |
| --- | ---: | ---: |
| Puzzle | 133 of 193 (69%) | 0 |
| Practice | 196 of 372 (53%) | 0 |
| Daily | 118 of 275 (43%) | 1 |

Daily has a longer tail: 19 finishes had 11 or more misses, and one had 60. Puzzle's worst finish had 10 misses.

## How long a finish takes

Medians, from `seconds` on `game_complete`. Means are not usable. One daily finish is recorded at 76,014 seconds and one puzzle finish at 365,458 seconds. The clock is running across a gap. Practice tops out at 3,380 seconds.

| Mode | p25 | Median | p75 | p90 |
| --- | ---: | ---: | ---: | ---: |
| Puzzle | 60s | 117s (1:57) | 242s | 7:13 |
| Practice | 2:59 | 4:16 | 7:27 | 11:16 |
| Daily | 3:10 | 6:13 | 11:26 | 21:31 |
| Multiplayer (7 rounds) | 2:33 | 3:24 | 4:58 | 7:11 |

About half of puzzle finishes are under 2 minutes (101 of 193). Daily piles up from 2 to 10 minutes (183 of 275) with 32 finishes over 20 minutes. Practice finishes cluster from 2 to 10 minutes (318 of 372). Median time to 10 sets is 100 seconds in practice and 129 seconds on the daily.

Every tracked puzzle start has `resumed=false` (215 of 215). People are solving the puzzle in one sitting. The resume flag has not been observed.

## Tour, reminders, sharing

The tour has started in 215 sessions. Of those, 115 finished it (53%), 65 skipped (30%), and 38 did neither. Skips happen on step 1 (median step 1, max step 2).

That rate got worse this week. Previous 7 days: 135 starts, 80 completes (59%), 37 skips. Last 7 days: 67 starts, 21 completes (31%), 34 skips. Skip is now the common ending. This extract does not say whether the tour changed or the remaining new sessions are less patient.

The reminder sheet has been shown 95 times across 77 sessions, starting 2026-10-27. Closings: Not now 60, tap outside 23, Escape 2, an older `close` action 2, swipe 1. **One of those 77 sessions also sent a sign-in request.** Sign-in overall is 9 requests, every one of them `sent`. Sources: menu 5, result card 2, expired link 2. Two of the nine carried `reminder=true`. None are `source=prompt`. The sheet is being seen, especially this past week (138 reminder events versus 45 the week before), and it is not where accounts come from.

Sharing, among sessions that finished:

| | Finished sessions | Shared | Named on the card |
| --- | ---: | ---: | ---: |
| Daily | 177 | 51 (29%) | 43 (24%) |
| Puzzle | 131 | 44 (34%) | 18 (14%) |

Daily share outcomes: 73 shared, 10 copied, 5 cancelled (88 events, 53 sessions). Puzzle: 51 shared, 20 copied, 5 cancelled. The puzzle falls back to copy more often (26% of its share events, against 11% for the daily). Compare-with-others was used in 21 sessions. The rank on that event has median 1 and p90 3, so the people who open it are at the top of a small board.

Multiplayer `game_complete` includes a place. All 7 recorded places are 1 or 2, median 1. With 7 started sessions, that is a handful of rounds, not a populated table. `multiplayer_join` fired 44 times across 22 sessions. Opening the table and claiming a card are different: 22 sessions saw `/m`, 7 started a round.

## Limits of this extract

`session.distinct_id` is blank on all 467 sessions since 2026-10-04. These numbers cannot say how many are the same person coming back tomorrow. A phone that visits on two days is two sessions. The "top sessions" concentration for practice is a lower bound on how concentrated that mode is.

`game_quit` is not the opposite of `game_complete`. A `page_hide` can fire and the same deal can still be finished later. Practice also emits a quit on New game and on the idle reset, then immediately emits another `game_start`. Adding quits and completes will pass 100% of starts.

Daily and puzzle `seconds` include time the tab was open. Use the medians. The multiplayer `first_set` and `set_10` events follow the shared table's set count after this player has claimed once, so they are round progress, not that player's own finds.

`raw/path_to_start.json` was rewritten after the first query double-counted sessions that started more than one mode. The file on disk is the corrected one.

## Raw files

`raw/*.json` holds the CSV-shaped aggregates behind this note: overview windows, daily and weekly series, paths, referrers, devices, event properties, funnels, quit histograms, and the hour grid. `complete_seconds_buckets.json` uses Postgres `width_bucket` on the edges 0, 30, 60, 90, 120, 180, 300, 600, 1200 seconds. Bucket 1 is 0–30s, bucket 2 is 30–60s, and so on. Bucket 9 is 20 minutes or more.
