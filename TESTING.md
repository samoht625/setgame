# Testing

Run everything on the NUC (or any Linux box with Ruby 3.3 + Node 22):

```sh
bin/test-nuc            # Rails tests, TypeScript check, node rule/daily/card checks
bin/test-nuc --browser  # also Playwright specs against a throwaway local server
```

Why a script: production installs gems with `BUNDLE_WITHOUT=development:test`
(see `.bundle/config` on the NUC), so the `debug` gem required by the test group
is missing and `bin/rails test` fails with `cannot load such file -- debug/prelude`.
`bin/test-nuc` uses its own bundle config (`tmp/test-bundle-config`) and gem path
(`~/.cache/setgame-test-bundle`), so the lean production bundle is never touched.

Run it from a separate checkout (e.g. `git clone ... /tmp/sg`), not the live
`~/www/setgame` tree. The test database is `storage/test.sqlite3`; production data
is never used. Browser specs need Playwright's Chromium (`npx playwright install
chromium`, done by the script) and a built bundle (`npm run build`).
