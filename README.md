# 1440

A personal daily quest tracker for iPhone, installed from Safari as a home-screen web app.
There are 1440 minutes in a day; anything not ticked by midnight counts as a miss, permanently.

It plays like a game: XP, levels and ranks, combos, streak shields, cleared sections,
and perfect-day and level-up moments. It comes in ten worlds, each with its own Today
art, layout, words, particles, music and sounds:

| World | Today screen |
| --- | --- |
| Cyberpunk | Neon HUD dial, with ten colour styles (Redline, Overdrive, Neon, Terminal, Hologram, Vapor, Toxic, Arctic, Ronin, Chrome) |
| Bloom | A flower that opens a petal per quest |
| Pixel Quest | A knight walking across the day past treasure chests |
| Cozy Desk | Rainy window, pinned index card, sticky-note quests |
| Deep Sea | A porthole that fills with water |
| Orbit | Quests as moons around a planet |
| Zen | A brush-stroke circle that paints itself in |
| Comic | Pop-art panel, power meter, POW on every tick |
| Notebook | Bullet-journal page with a hand-drawn tracker |
| Pet | Mochi the chick, whose mood follows your day |

New accounts get a short tutorial on first login (pick a world, add quests, try a tick,
pick a board name, turn on reminders).

**Board.** Everyone with an account shows up on one board, ranked by XP for this week
(Monday to Sunday) or all time. It shows only name, level and XP. The database works the
XP out from real ticks, so nobody can type in a number.

**Reminders.** Notifications at 12:00, 17:00 and 23:30 (each person can change or switch
off any of them in Me). Each one says how many quests are left and how many minutes are
left in the day, and nothing is sent once everything is done. The Home Screen icon badge
shows how many quests are left. iPhone only allows this in the Home Screen app (iOS 16.4+).
Music and sounds are synthesized live with Web Audio, with no audio files. All motion is
transform/opacity, a tick patches only what changed, and Calm mode freezes the background.

## What's in here

| Path | What it is |
| --- | --- |
| `index.html`, `styles.css` | The app page and its look |
| `js/logic.js` | Dates, streaks, shields, XP and levels (no network, unit-tested) |
| `js/store.js` | Local-first data: ticks apply instantly and sync in the background |
| `js/backend.js` | Supabase connection, plus a demo backend with fake history |
| `js/views.js`, `js/app.js` | Screens and interactions |
| `js/worlds.js`, `worlds.css` | The ten worlds: Today art, words, backdrops, styles |
| `js/themes.js`, `js/fx.js` | World and colour switching; particles, overlays, haptics |
| `js/tutorial.js` | First-login tutorial |
| `js/audio.js` | Sound effects and the procedural music tracks |
| `fonts/` | Bundled fonts so every look works offline |
| `config.js` | Supabase project URL and publishable key (public by design) |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline support and home-screen install |
| `supabase/1440-setup.sql` | Database tables, row-level security and the midnight rules |
| `supabase/1440-board-reminders.sql` | Board names and XP, the reminder queue, push keys, the every-minute check |
| `supabase/functions/push/index.ts` | The Edge Function that sends notifications (Web Push, no secrets needed) |
| `tests/` | Logic tests (`node tests/logic.test.mjs`) |

## The rules live in the database

- Only today can be ticked (with 15 minutes of grace after midnight for offline ticks to sync).
- A closed or sealed day can't be changed.
- Every hour, a job records each finished day's misses permanently.
- Every row is private to the logged-in user.

## Turning on the board and reminders (once)

1. Supabase → SQL Editor → New query. Paste all of `supabase/1440-board-reminders.sql` and Run.
   It makes the push keys itself, so there is nothing to copy.
2. Supabase → Edge Functions → Deploy a new function → Via Editor. Name it `push`,
   replace the sample code with all of `supabase/functions/push/index.ts`, and deploy.
3. In that function's settings, turn **off** "Enforce JWT verification" and save.
   (The database wakes it with its own token instead.)
4. On the phone, open 1440 from the Home Screen → Me → Reminders → Turn on reminders → Allow,
   then Send a test. A few seconds later the app says whether it was delivered.

If a test says the push sender didn't pick it up, step 2 or 3 is missing.
Supabase → Edge Functions → push → Logs shows each run.

## Adding a friend

Sign-ups are off, so accounts are created by hand:

1. Supabase → Authentication → Users → Add user → Create new user.
2. Enter their email and a temporary password, tick **Auto Confirm User**, and create.
3. Send them the link, email and password. They change the password under Me → Change password.

New accounts start empty, with one-tap quest ideas. Nothing from other accounts is copied.
Every row is locked to its owner, so friends can't see each other's quests or ticks in the app.
The board is the one shared thing, and it shows only name, level and XP.
The project owner can see all data in the Supabase dashboard.

To reset a forgotten password, run this in the SQL editor:

```sql
update auth.users
set encrypted_password = extensions.crypt('NEW-PASSWORD', extensions.gen_salt('bf', 10)), updated_at = now()
where email = 'friend@example.com';
```

## Try it without logging in

Open the site with `?demo` on the end for 45 days of fake history, or `?demo=new` to see what a brand-new account looks like. Add `&world=bloom` (or any world) or `&look=neon` (a Cyberpunk colour) to jump to it.

## Updating

Change files, commit to `main`, and GitHub Pages republishes in about a minute.
The app picks up the new version the next time it opens with a connection.
