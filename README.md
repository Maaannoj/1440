# 1440

A personal daily habit tracker for iPhone, installed from Safari as a home-screen web app.
There are 1440 minutes in a day; anything not ticked by midnight counts as a miss, permanently.

## What's in here

| Path | What it is |
| --- | --- |
| `index.html`, `styles.css` | The app page and its look |
| `js/logic.js` | Dates, streaks, shields, XP and levels (no network, unit-tested) |
| `js/store.js` | Local-first data: ticks apply instantly and sync in the background |
| `js/backend.js` | Supabase connection, plus a demo backend with fake history |
| `js/views.js`, `js/app.js` | Screens and interactions |
| `config.js` | Supabase project URL and publishable key (public by design) |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline support and home-screen install |
| `supabase/1440-setup.sql` | Database tables, row-level security and the midnight rules |
| `tests/` | Logic tests (`node tests/logic.test.mjs`) |

## The rules live in the database

- Only today can be ticked (with 15 minutes of grace after midnight for offline ticks to sync).
- A closed or sealed day can't be changed.
- Every hour, a job records each finished day's misses permanently.
- Every row is private to the logged-in user.

## Try it without logging in

Open the site with `?demo` on the end for 45 days of fake history.

## Updating

Change files, commit to `main`, and GitHub Pages republishes in about a minute.
The app picks up the new version the next time it opens with a connection.
