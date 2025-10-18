# Deployment Checklist

## Pre-Deployment

- [x] Rails app created with ActionCable support
- [x] React + TypeScript frontend implemented
- [x] Game engine and rules engine implemented
- [x] Card images copied to public/cards/
- [x] Local testing completed
- [x] render.yaml configuration created

## Render Deployment Steps

### 1. Push to GitHub

```bash
git add .
git commit -m "Initial Set game implementation"
git push origin main
```

### 2. Create Render Web Service

1. Go to https://dashboard.render.com
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Render will auto-detect the `render.yaml` configuration
5. Review the settings:
   - **Name**: setgame (or your preferred name)
   - **Environment**: Ruby
   - **Build Command**: `bin/rails assets:precompile && yarn build && yarn build:css`
   - **Start Command**: `bundle exec puma -C config/puma.rb`

### 3. Configure Environment Variables

Add these environment variables in Render dashboard:

- `RAILS_ENV`: `production`
- `RAILS_LOG_TO_STDOUT`: `enabled`
- `RAILS_MASTER_KEY`: Copy from `config/master.key` (keep secret!)

### 4. Deploy

Click "Create Web Service" to start deployment.

### 5. Post-Deployment Configuration

After deployment completes:

1. Note your app URL (e.g., `https://setgame-xxxx.onrender.com`)

2. Update `config/environments/production.rb`:
   ```ruby
   config.action_cable.allowed_request_origins = [
     "https://setgame-xxxx.onrender.com"
   ]
   ```

3. Commit and push the change:
   ```bash
   git add config/environments/production.rb
   git commit -m "Update ActionCable allowed origins"
   git push origin main
   ```

4. Render will automatically redeploy

### 6. Test Deployment

1. Open your app URL in a browser
2. Open a second browser tab/window
3. Test multiplayer functionality:
   - Both tabs should see the same board
   - Select cards and claim sets
   - Verify scores update in real-time
   - Test round transitions

## Troubleshooting

### ActionCable Connection Issues

If WebSocket connections fail:
1. Verify `allowed_request_origins` includes your Render URL
2. Check Render logs for ActionCable errors
3. Ensure the URL uses `https://` (not `http://`)

### Asset Loading Issues

If CSS/JS don't load:
1. Verify build commands ran successfully
2. Check `app/assets/builds/` directory exists
3. Review Render build logs

### Game State Issues

If game state doesn't sync:
1. Check ActionCable connection in browser console
2. Verify `GAME_ENGINE` is initialized
3. Check server logs for errors

## Monitoring

- **Render Dashboard**: Monitor CPU, memory, and logs
- **Browser Console**: Check for JavaScript errors
- **Network Tab**: Verify WebSocket connection to `/cable`

## Scaling Considerations

Current implementation:
- Single instance (no Redis needed)
- In-memory game state
- Ephemeral player scores

For multi-instance scaling:
1. Add Redis service to Render
2. Configure ActionCable to use Redis adapter
3. Consider persistent storage for game state

## Rollback

If deployment fails:
1. Go to Render dashboard
2. Navigate to "Deploys" tab
3. Find last successful deployment
4. Click "Rollback"

## Support

For issues:
1. Check Render logs
2. Review browser console
3. Test locally with `bin/rails server`
4. Run `ruby test_rules.rb` to verify game logic

