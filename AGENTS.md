# Agent instructions

## Cursor Cloud specific instructions

This repo is a **Rails 8 + React + Tailwind** app with a **SQLite** database: accounts, sessions, scores, player settings and the multiplayer snapshot. There is no Redis and no job server. See `README.md` for the modes and the stack.

### Environment (required on cloud agents)

The default cloud image has Node but **not Ruby**. Use the committed setup:

- **`.cursor/environment.json`** — builds `.cursor/Dockerfile` (Ruby 3.2.3, Node 22, Yarn), runs `./script/bootstrap-dev.sh` as the `install` step, and starts the `dev` terminal
- **`./script/bootstrap-dev.sh`** — `bundle install`, `yarn install`, `bin/rails db:prepare`, then an asset build. On the default image without the custom Dockerfile it first installs Ruby via apt.

On each agent start, Cursor runs the `install` command from `environment.json`, then starts the `dev` terminal (`bin/dev`).

### Network hosts the environment needs

When the environment's Network Access is restricted, a host missing from this list fails the environment build, and agents start on the default image without Ruby or dependencies.

- **Image** (`.cursor/Dockerfile`): `public.ecr.aws` only. Ruby, Node and Yarn come from its mirror of the Docker official images; the Dockerfile itself has no apt or curl step.
- **Cursor's machine setup** (`apt-get update` and installs on the built image, for the desktop and Chrome): `deb.debian.org`. The image is Debian bookworm, so no Ubuntu mirror is needed.
- **Install** (`bundle install`, `yarn install`): `rubygems.org`, `index.rubygems.org`, `registry.npmjs.org`, `registry.yarnpkg.com`.
- **Browser tests** (`npx playwright install chromium`): `cdn.playwright.dev`.

### Verify the app

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/
```

Expect `200`. Daily Deal: `/`, Puzzle: `/puzzle`, Practice: `/practice`, multiplayer: `/m`, stats: `/stats`.

### Tests

```bash
bin/rails test
yarn typecheck
yarn test:rules && yarn test:daily && yarn test:cards && yarn test:demo && yarn test:two-card
```

Browser specs run against a server in the test environment, with built assets:

```bash
yarn build && yarn build:css
RAILS_ENV=test bin/rails db:prepare
RAILS_ENV=test bin/rails server -p 3999 -b 127.0.0.1 &
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3999 npx playwright test
```

`bin/test-nuc --browser` runs all of the above, but installs its own copy of the gems first.

### UI / assets

After changing TSX or Tailwind, run `yarn build && yarn build:css` or rely on `bin/dev` watchers.

### Screenshots

Start the server, then capture the running app (e.g. Playwright or browser tools). Reference artifacts in PR bodies if needed.
