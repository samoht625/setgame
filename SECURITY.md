# Security

## Rails master key leak (GitGuardian / public repo)

If `config/master.key` was ever pushed to GitHub:

1. **Rotate** (invalidates old key and session cookies):

   ```bash
   ./scripts/rotate-rails-credentials.sh
   ```

2. **Deploy the new key** on the server (never commit it):

   ```bash
   # ~/www/setgame/deploy/setgame.env (gitignored)
   RAILS_MASTER_KEY=<contents of config/master.key>
   systemctl --user restart setgame
   ```

3. **Remove the key from all git history**, then force-push:

   ```bash
   git filter-branch --force --index-filter \
     'git rm --cached --ignore-unmatch config/master.key' \
     --prune-empty --tag-name-filter cat -- --all
   git push origin --force --all
   ```

   Prefer [git-filter-repo](https://github.com/newren/git-filter-repo) if installed:

   ```bash
   git filter-repo --path config/master.key --invert-paths --force
   git push origin --force --all
   ```

4. In GitHub: resolve the secret scanning alert; optionally **allow access** only after history rewrite.

5. Optional: rotate any other secrets that lived in `credentials.yml.enc` (this app mainly stores `secret_key_base`).

## What must never be committed

- `config/master.key`
- `deploy/setgame.env`
- `.env` files

`config/credentials.yml.enc` is encrypted and safe to commit **only** with a key that was never public.
