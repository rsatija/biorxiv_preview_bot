# Deployment Options

This bot can be deployed to multiple platforms. Choose the one that works best for you.

## Option 1: Railway (Recommended - Easiest)

Railway is very simple to use and has excellent logging/debugging.

### Setup Steps:

1. **Install Railway CLI** (optional, but helpful):
   ```bash
   npm i -g @railway/cli
   railway login
   ```

2. **Deploy from GitHub** (easiest method):
   - Go to [railway.app](https://railway.app)
   - Click "New Project" → "Deploy from GitHub repo"
   - Select this repository
   - Railway will auto-detect it's a Node.js project

3. **Or deploy via CLI**:
   ```bash
   railway init
   railway up
   ```

4. **Set Environment Variables**:
   - In Railway dashboard, go to your project → Variables
   - Add:
     - `SLACK_SIGNING_SECRET` - Your Slack app's signing secret
     - `SLACK_BOT_TOKEN` - Your bot's OAuth token (starts with `xoxb-`)
     - `PAPERS_CHANNEL_ID` (optional) - Channel ID to restrict bot to specific channel
   - Railway will auto-redeploy when you add variables

5. **Get Your Deployment URL**:
   - Railway will give you a URL like: `https://your-project.up.railway.app`
   - Copy this URL

6. **Update Slack Configuration**:
   - Go to your Slack app → **Event Subscriptions**
   - Set **Request URL** to: `https://your-project.up.railway.app/api/slack-events`
   - Slack will verify the URL (should show green checkmark ✅)
   - Make sure `link_shared` is subscribed under **Subscribe to bot events**

7. **View Logs**:
   - Railway dashboard has excellent real-time logs
   - Click on your deployment → "View Logs"
   - You'll see all console.log output in real-time

### Railway Advantages:
- ✅ Excellent logging/debugging interface
- ✅ Auto-deploys on git push
- ✅ Free tier available
- ✅ Simple configuration
- ✅ No timeout issues (unlike Vercel)

---

## Option 2: Render

Render is similar to Vercel but often more reliable for webhooks.

### Setup Steps:

1. **Create a Render Account**:
   - Go to [render.com](https://render.com) and sign up

2. **Create a New Web Service**:
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Or use "Public Git repository" and paste your repo URL

3. **Configure the Service**:
   - **Name**: `biorxiv-preview-bot` (or whatever you want)
   - **Environment**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Plan**: Free (or paid if you prefer)

4. **Set Environment Variables**:
   - In the service settings, go to "Environment"
   - Add:
     - `SLACK_SIGNING_SECRET` - Your Slack app's signing secret
     - `SLACK_BOT_TOKEN` - Your bot's OAuth token (starts with `xoxb-`)
     - `PAPERS_CHANNEL_ID` (optional) - Channel ID to restrict bot to specific channel

5. **Deploy**:
   - Click "Create Web Service"
   - Render will build and deploy your app
   - You'll get a URL like: `https://your-service.onrender.com`

6. **Update Slack Configuration**:
   - Go to your Slack app → **Event Subscriptions**
   - Set **Request URL** to: `https://your-service.onrender.com/api/slack-events`
   - Slack will verify the URL
   - Make sure `link_shared` is subscribed under **Subscribe to bot events**

7. **View Logs**:
   - Click "Logs" tab in Render dashboard
   - Real-time logs are available

### Render Advantages:
- ✅ Good free tier
- ✅ Reliable webhook handling
- ✅ Easy to use
- ✅ Good logging

### Render Notes:
- Free tier services "spin down" after 15 minutes of inactivity
- First request after spin-down may take ~30 seconds
- Paid plans don't have this limitation

---

## Option 3: Fly.io

Fly.io is great for serverless functions and has a generous free tier.

### Setup Steps:

1. **Install Fly CLI**:
   ```bash
   curl -L https://fly.io/install.sh | sh
   fly auth login
   ```

2. **Initialize Fly**:
   ```bash
   fly launch
   ```
   - Follow prompts to create app
   - Don't deploy yet (we need to configure first)

3. **Create `fly.toml`** (if not auto-generated):
   ```toml
   app = "your-app-name"
   primary_region = "iad"

   [build]

   [http_service]
     internal_port = 3000
     force_https = true
     auto_stop_machines = false
     auto_start_machines = true
     min_machines_running = 1
     processes = ["app"]

   [[services]]
     protocol = "tcp"
     internal_port = 3000
   ```

4. **Set Secrets**:
   ```bash
   fly secrets set SLACK_SIGNING_SECRET=your-secret
   fly secrets set SLACK_BOT_TOKEN=your-token
   fly secrets set PAPERS_CHANNEL_ID=your-channel-id  # optional
   ```

5. **Deploy**:
   ```bash
   fly deploy
   ```

6. **Get URL**:
   - Your app will be at: `https://your-app-name.fly.dev`

7. **Update Slack Configuration**:
   - Set Request URL to: `https://your-app-name.fly.dev/api/slack-events`

### Fly.io Advantages:
- ✅ Generous free tier
- ✅ Global edge network
- ✅ No cold starts on free tier
- ✅ Good performance

---

## Local Development

For any platform, you can test locally:

```bash
npm install
npm run dev
```

This starts the Express server on `http://localhost:3000`.

To test with Slack, use a tool like [ngrok](https://ngrok.com):
```bash
ngrok http 3000
```

Then use the ngrok URL in Slack's Event Subscriptions.

---

## Troubleshooting

### Common Issues:

1. **"Invalid Slack signature"**:
   - Double-check `SLACK_SIGNING_SECRET` is set correctly
   - No extra spaces or quotes

2. **"No events received"**:
   - Verify bot is invited to the channel
   - Check `link_shared` event is subscribed
   - Verify Request URL is correct

3. **"Request timeout"**:
   - Check platform logs for errors
   - Verify bioRxiv API is reachable
   - Check network connectivity

4. **"Bot not responding"**:
   - Check logs in your platform's dashboard
   - Verify environment variables are set
   - Test the health endpoint: `GET https://your-url.com/`

---

## Which Platform Should I Choose?

- **Railway**: Best for debugging, easiest setup, excellent logs
- **Render**: Good free tier, reliable, simple
- **Fly.io**: Best performance, global edge, no cold starts
- **Vercel**: (Original) - If you want to stick with it, but you're having issues

For most users, **Railway** is the best choice due to its excellent debugging capabilities.

