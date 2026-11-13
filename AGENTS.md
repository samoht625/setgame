# Agent instructions

## Cursor Cloud specific instructions

This repo is a **Rails 8 + React + Tailwind** app. There is **no database**.

### Environment (required on cloud agents)

Cloud VMs start with Node but **not Ruby**. Use the committed setup:

- **`.cursor/environment.json`** — Dockerfile base image, `install` deps, and `bin/dev` terminal
- **`./script/bootstrap-dev.sh`** — fallback if you are on the default image without the custom Dockerfile (installs Ruby via apt, then bundle/yarn/build)

On each agent start, Cursor runs the `install` command from `environment.json`, then starts the `dev` terminal (`bin/dev`).

### Network hosts the environment needs

When the environment's Network Access is restricted, a host missing from this list fails the environment build, and agents start on the default image without Ruby or dependencies.

- **Image** (`.cursor/Dockerfile`): `public.ecr.aws` only. Ruby, Node and Yarn come from its mirror of the Docker official images; there is no apt or curl step.
- **Install** (`bundle install`, `yarn install`): `rubygems.org`, `index.rubygems.org`, `registry.npmjs.org`, `registry.yarnpkg.com`.
- **Browser tests** (`npx playwright install chromium`): `cdn.playwright.dev`.

### Verify the app

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/
```

Expect `200`. Solo: `/`, multiplayer: `/m`.

### UI / assets

After changing TSX or Tailwind, run `yarn build && yarn build:css` or rely on `bin/dev` watchers.

### Screenshots

Start the server, then capture the running app (e.g. Playwright or browser tools). Reference artifacts in PR bodies if needed.
