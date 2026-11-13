# Set

**Play free in your browser:** [set.tido.site](https://set.tido.site/)

The card game Set, for phones and desktops. No signup and no download.

| Mode | Path | What it is |
| --- | --- | --- |
| Daily Deal | `/` | Everyone gets the same deal. Clear the whole deck as fast as you can. One ranked try a day, a new deal at midnight Pacific, streaks, and a result you can share and compare. |
| Puzzle | `/puzzle` | Twelve cards hold exactly six sets. Find all six. One a day, same for everyone. |
| Practice | `/practice` | Timed games against the clock, as many as you like, with daily, weekly and monthly leaderboards. |
| Multiplayer | `/m` | One shared live table. Whoever finds the most sets wins the round. |
| Stats | `/stats` | Site-wide numbers: sets found, games per day, how fast each kind of set is found, and the most active named players. |

Players are anonymous by default. Signing in is optional: enter an email, tap the link it sends, and your history follows you to other browsers. An account can also get a daily reminder email at a time you choose. Each player can switch on two-card sets, where you pick two cards and the game picks the third.

Fan site. Not affiliated with Set Enterprises.

## How it is built

- **Rails 8** serves the pages and a small JSON API, and runs the multiplayer table over Action Cable.
- **React 19 and TypeScript**, bundled by esbuild, with **Tailwind 4** for styles.
- **SQLite** holds accounts, sessions, scores, game replays, player settings and a snapshot of the multiplayer table.
- Email goes through [Resend](https://resend.com). Share images are rendered with Node.

There is no Redis and no background job server. One Puma process owns the multiplayer table in memory, so production runs a single process.

## Run it locally

You need Ruby 3.2 or newer (`.ruby-version` names 3.2.3), Node 22, Yarn 1 and SQLite.

```sh
bin/setup
```

That installs gems and packages, creates the development database, and starts the app at <http://localhost:3000> with JavaScript and CSS watchers. The same steps by hand:

```sh
bundle install
yarn install
bin/rails db:prepare
bin/dev
```

Without `RESEND_API_KEY`, development does not send email. The sign-in link is written to the Rails log instead.

## Test

```sh
bin/rails test     # Rails tests
yarn typecheck     # TypeScript

# Node checks: rules, Daily Deal, card art, rules demo, two-card sets
yarn test:rules && yarn test:daily && yarn test:cards && yarn test:demo && yarn test:two-card
```

Browser tests use Playwright against a server in the test environment. `bin/test-nuc --browser` builds the assets, starts that server and runs every suite above plus the browser specs. See [TESTING.md](TESTING.md).

## Deploy

Production is one Linux host. Puma runs as a user systemd service on a loopback port behind a reverse proxy that terminates TLS, and the SQLite file lives outside the checkout. To deploy, pull on the host and run:

```sh
./scripts/set-prod.sh
```

[DEPLOYMENT.md](DEPLOYMENT.md) covers the environment file, first install, the reminder timer and backups.

## Where things are

| Path | What is there |
| --- | --- |
| `app/services` | Rules, the multiplayer engine, the Daily Deal and Puzzle, replay verification, sign-in, reminders, stats |
| `app/javascript` | The React app |
| `script/` | Development and test tooling, plus the share image renderer |
| `scripts/`, `deploy/` | Production host scripts and systemd units |
| `test/` | Rails tests, and Playwright specs in `test/browser` |

[CARD_MAPPING.md](CARD_MAPPING.md) explains how card ids map to number, color, shape and shading. [SECURITY.md](SECURITY.md) lists what must never be committed.
