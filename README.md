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

New accounts get a short tutorial on first login (pick a world, add quests, try a tick).
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
| `tests/` | Logic tests (`node tests/logic.test.mjs`) |

## The rules live in the database

- Only today can be ticked (with 15 minutes of grace after midnight for offline ticks to sync).
- A closed or sealed day can't be changed.
- Every hour, a job records each finished day's misses permanently.
- Every row is private to the logged-in user.

## Adding a friend

Sign-ups are off, so accounts are created by hand:

1. Supabase → Authentication → Users → Add user → Create new user.
2. Enter their email and a temporary password, tick **Auto Confirm User**, and create.
3. Send them the link, email and password. They change the password under Me → Change password.

New accounts start empty, with one-tap quest ideas. Nothing from other accounts is copied.
Every row is locked to its owner, so friends can't see each other's data in the app.
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
