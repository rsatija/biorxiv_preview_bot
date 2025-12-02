# Quick Start - Deploy to Railway (Recommended)

Railway is the easiest alternative to Vercel and has excellent debugging tools.

## 5-Minute Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Build the Project
```bash
npm run build
```

### 3. Deploy to Railway

**Option A: Via Web (Easiest)**
1. Go to [railway.app](https://railway.app) and sign up/login
2. Click "New Project" → "Deploy from GitHub repo"
3. Select this repository
4. Railway will auto-detect and deploy

**Option B: Via CLI**
```bash
npm i -g @railway/cli
railway login
railway init
railway up
```

### 4. Set Environment Variables

In Railway dashboard:
- Go to your project → Variables
- Add:
  - `SLACK_SIGNING_SECRET` = (your Slack signing secret)
  - `SLACK_BOT_TOKEN` = (your Slack bot token, starts with `xoxb-`)
  - `PAPERS_CHANNEL_ID` = (optional, channel ID if you want to restrict)

### 5. Get Your URL

Railway will give you a URL like: `https://your-project.up.railway.app`

### 6. Update Slack

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → Your app
2. **Event Subscriptions** → Set Request URL to:
   ```
   https://your-project.up.railway.app/api/slack-events
   ```
3. Make sure `link_shared` is subscribed under **Subscribe to bot events**
4. Click **Save Changes**

### 7. Test It!

Share a bioRxiv link in your Slack channel. Check Railway logs to see it working!

---

## View Logs

Railway has excellent real-time logs:
- Go to your project in Railway dashboard
- Click "View Logs"
- You'll see all console output in real-time

This makes debugging much easier than Vercel!

---

## Need Help?

See `DEPLOYMENT.md` for detailed instructions for Railway, Render, and Fly.io.

