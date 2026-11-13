# Security

## What must never be committed

- `config/master.key`
- `deploy/setgame.env` (it holds `RAILS_MASTER_KEY` and `RESEND_API_KEY`)
- `.env` files
- SQLite databases and their backups

All of these are gitignored. `config/credentials.yml.enc` is encrypted and safe to commit **only** with a key that was never public.

## What depends on the app secret

`config/credentials.yml.enc` holds `secret_key_base`, and nothing else the app reads. These all derive from it, so rotating it changes them at once:

- **Signed cookies.** Every browser is signed out, and the cookie that names an anonymous browser's player stops being accepted.
- **Player keys.** The proof a browser keeps that it owns its player id stops matching. With the cookie gone too, an anonymous browser starts over as a new player. Its old games stay in the database but the browser can no longer reach them. A signed-in player signs in again by email and gets their history back.
- **Daily Deal and Puzzle seeds.** A day someone has already played keeps its stored deal. Later days get a different deal than they would have.
- **Shared result links.** Links shared before the rotation stop showing the result and its preview image.
- **Reminder email links.** Play and unsubscribe links in email already sent stop working.

## If the master key leaks

1. **Rotate** the key and `secret_key_base`:

   ```bash
   ./scripts/rotate-rails-credentials.sh
   ```

2. **Deploy the new key** on the server (never commit it):

   ```bash
   # deploy/setgame.env (gitignored)
   RAILS_MASTER_KEY=<contents of config/master.key>
   systemctl --user restart setgame
   ```

3. **Remove the key from all git history**, then force-push. With [git-filter-repo](https://github.com/newren/git-filter-repo):

   ```bash
   git filter-repo --path config/master.key --invert-paths --force
   git push origin --force --all
   ```

   Without it:

   ```bash
   git filter-branch --force --index-filter \
     'git rm --cached --ignore-unmatch config/master.key' \
     --prune-empty --tag-name-filter cat -- --all
   git push origin --force --all
   ```

4. In GitHub, resolve the secret scanning alert.

5. Rotate any other secret that may have been exposed with it, such as `RESEND_API_KEY`.
