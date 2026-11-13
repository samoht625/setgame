# Testing

## The suites

| Suite | Command |
| --- | --- |
| Rails tests | `bin/rails test` |
| TypeScript check | `yarn typecheck` |
| Rules and replay engine (Node) | `yarn test:rules` |
| Daily Deal | `yarn test:daily` |
| Card artwork | `yarn test:cards` |
| Rules demo | `yarn test:demo` |
| Two-card sets | `yarn test:two-card` |
| Rules and replay engine (Ruby, no Rails) | `ruby script/test_rules.rb` |
| Browser specs (Playwright) | see below |

The test database is `storage/test.sqlite3`. Production data is never used.

## Browser specs

The specs in `test/browser` drive a real Chromium against a server in the test environment. They need built assets and Playwright's Chromium (`npx playwright install chromium`).

```sh
yarn build && yarn build:css
RAILS_ENV=test bin/rails db:prepare
RAILS_ENV=test bin/rails server -p 3999 -b 127.0.0.1 &
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3999 yarn test:browser
```

They run one at a time and take about six minutes.

## Everything in one command

```sh
bin/test-nuc            # Rails tests, TypeScript check, Node checks
bin/test-nuc --browser  # also the browser specs, against a throwaway local server
```

The script exists for the production host. Production installs gems with `BUNDLE_WITHOUT=development:test`, so the `debug` gem that the test group requires is missing there and `bin/rails test` fails with `cannot load such file -- debug/prelude`. `bin/test-nuc` uses its own Bundler config (`tmp/test-bundle-config`) and gem path (`~/.cache/setgame-test-bundle`), so the lean production bundle is never touched.

On the host, run it from a separate checkout, not the live tree.
