# Deployment

Production is one Linux host running Puma as a user systemd service, with SQLite on local disk and a reverse proxy in front for TLS. There are no containers and no hosted platform.

## What the scripts assume

- The checkout is at `~/www/setgame`. The systemd units in `deploy/` use that path.
- Puma listens on `127.0.0.1:7778`. A reverse proxy (Caddy on the live site) terminates TLS and forwards to it, including the `/cable` WebSocket.
- The SQLite file is outside the checkout, at `$DATABASE_PATH` (default `~/www/setgame-data/production.sqlite3`).
- The public hostname is `set.tido.site`. `config/environments/production.rb` allows only that host and Action Cable origin, so hosting under another name means changing both.
- Ruby (rbenv is picked up if present), Node and Yarn are installed for the user that runs the service. The `sqlite3` command is only needed for backups and `script/retention`.

## Redeploy

After `git pull` on the host, always run:

```bash
./scripts/set-prod.sh
```

In order, it:

1. Creates `deploy/setgame.env` from the example if it is missing, and adds any missing `DATABASE_PATH`, `WEB_CONCURRENCY=1`, `RAILS_MAX_THREADS` and `NODE_BINARY`.
2. Creates the data directory, and copies a legacy `storage/production.sqlite3` there once if one exists.
3. Refreshes the user systemd unit from `deploy/setgame.service`.
4. Runs `bundle install` in deployment mode into `vendor/bundle`, without the development and test groups.
5. Runs `rails db:prepare`.
6. Installs and enables the reminder timer.
7. Installs packages, builds JavaScript and CSS, and precompiles Rails assets.
8. Restarts `setgame.service` and checks that it is active.

A bare `systemctl --user restart setgame` skips all of that, so it will not install a new gem or run a migration.

Two environment switches change the run:

- `SETGAME_SKIP_RESTART=1` prepares everything and leaves the service alone.
- `SETGAME_USE_ORCHESTRATOR=1` hands the build and restart to a `scripts/www-restart.sh` beside the checkout, for a host that manages several sites with one script.

## First install

```bash
./scripts/install-setgame-service.sh
```

It runs `set-prod.sh` without the restart, enables and starts `setgame.service`, and turns on lingering for the user (the one step that asks for `sudo`) so the service starts at boot. Set `RAILS_MASTER_KEY` in `deploy/setgame.env` before relying on it.

## Environment

`deploy/setgame.env` is read by systemd and by the scripts. It is gitignored and should be readable only by its owner; `set-prod.sh` sets that. Start from `deploy/setgame.env.example`.

| Variable | Purpose |
| --- | --- |
| `RAILS_MASTER_KEY` | Required. Decrypts `config/credentials.yml.enc`. |
| `DATABASE_PATH` | Absolute path to the SQLite file, outside the checkout. |
| `WEB_CONCURRENCY` | Must stay `1`. One Puma process owns the multiplayer table and the SQLite writes. |
| `RESEND_API_KEY` | Sends sign-in links and reminders through Resend. Without it, sign-in is switched off in production. |
| `SETGAME_MAIL_FROM` | The From address for that email. |
| `SETGAME_SIGN_IN` | Set to `off` to switch sign-in off even with a key. |
| `NODE_BINARY` | Path to `node`, used to render share images. systemd's PATH may not include it. |

## What SQLite holds

Accounts, signed-in sessions and sign-in tokens; Practice and Daily Deal games with their move logs and scores; Puzzle runs; player settings; reminder deliveries; and one snapshot of the multiplayer table, so a restart does not lose the round.

### Backups

Do not `cp` a live SQLite database while the app is running. It uses WAL mode. Use the SQLite backup API:

```bash
sqlite3 "$DATABASE_PATH" ".backup '/path/to/setgame-$(date +%Y%m%d).sqlite3'"
```

## Reminder emails

`deploy/setgame-reminders.timer` runs `rails reminders:send` every five minutes as a one-shot service. It sends each account's reminder at the local time that account chose. To send one to an existing account outside the schedule:

```bash
./scripts/setgame-with-bundle.sh rails "reminders:test[someone@example.com]"
```

## Logs and status

```bash
systemctl --user status setgame
journalctl --user -u setgame -f
journalctl --user -u setgame-reminders -n 50
```

`/up` returns 200 when the app has booted.

## Clocks

- The Daily Deal and the Puzzle roll over at midnight Pacific (`DailyPuzzle::TIME_ZONE`).
- Practice leaderboards use daily, weekly and monthly windows in Eastern time (`config.time_zone`).
- The stats page groups days and hours in Central time (`SetStats::ZONE`).
- Reminders go out in each account's own time zone.

## How scores are checked

- The server issues each game an id and a seed. The browser logs every claim with its time.
- On submit, the server replays the deal from the seed and the claims, and checks the elapsed time against its own clock.
- A log with a pause in it is refused.

## Testing on the host

The production bundle leaves out the test gems, so use `bin/test-nuc` from a separate checkout. See [TESTING.md](TESTING.md).

## Rotating the master key

See [SECURITY.md](SECURITY.md).
