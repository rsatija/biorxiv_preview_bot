# Local Testing Guide

Test your bot locally before deploying to Railway!

## Prerequisites

1. **Node.js** installed (v18 or higher)
2. **ngrok** installed (to expose local server to Slack)
3. Your **Slack app credentials** ready

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Set Up Environment Variables

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Then edit `.env` and add your Slack credentials:

```env
SLACK_SIGNING_SECRET=your_signing_secret_here
SLACK_BOT_TOKEN=xoxb-your-bot-token-here
PAPERS_CHANNEL_ID=your_channel_id_here  # optional
```

**Where to find these:**
- `SLACK_SIGNING_SECRET`: Slack app → Basic Information → App Credentials → Signing Secret
- `SLACK_BOT_TOKEN`: Slack app → OAuth & Permissions → Bot User OAuth Token (starts with `xoxb-`)
- `PAPERS_CHANNEL_ID`: Optional - Right-click channel in Slack → View channel details → Copy Channel ID

## Step 3: Install ngrok

**macOS (Homebrew):**
```bash
brew install ngrok
```

**Or download from:** https://ngrok.com/download

**Sign up for free account** (required for custom domains):
- Go to https://ngrok.com and sign up
- Get your authtoken from the dashboard
- Run: `ngrok config add-authtoken YOUR_AUTH_TOKEN`

## Step 4: Start the Local Server

In one terminal window:

```bash
npm run dev
```

You should see:
```
🚀 Server running on port 3000
Environment check:
  SLACK_SIGNING_SECRET: SET
  SLACK_BOT_TOKEN: SET
  PAPERS_CHANNEL_ID: NOT SET
```

**Test the health endpoint:**
Open http://localhost:3000 in your browser. You should see a JSON response with environment status.

## Step 5: Expose Local Server with ngrok

In a **second terminal window**, start ngrok:

```bash
ngrok http 3000
```

You'll see output like:
```
Forwarding  https://abc123.ngrok.io -> http://localhost:3000
```

**Copy the HTTPS URL** (e.g., `https://abc123.ngrok.io`)

## Step 6: Update Slack Configuration

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → Your app
2. **Event Subscriptions** → Set Request URL to:
   ```
   https://abc123.ngrok.io/api/slack-events
   ```
   (Replace with your actual ngrok URL)
3. Slack will verify the URL (should show green checkmark ✅)
4. Make sure `link_shared` is subscribed under **Subscribe to bot events**
5. Click **Save Changes**

## Step 7: Test It!

1. **Invite your bot to a test channel** in Slack
2. **Share a bioRxiv link** in that channel, for example:
   ```
   https://www.biorxiv.org/content/10.1101/2025.05.12.653376v2
   ```
3. **Watch your terminal** - you should see logs showing:
   - Handler called
   - Link shared event
   - API calls
   - Slack post confirmation

4. **Check Slack** - the bot should post a preview!

## Testing the Test-Fetch Endpoint

You can also test the API directly:

```bash
curl "http://localhost:3000/api/test-fetch?url=https://www.biorxiv.org/content/10.1101/2025.05.12.653376v2"
```

Or visit in browser:
```
http://localhost:3000/api/test-fetch?url=https://www.biorxiv.org/content/10.1101/2025.05.12.653376v2
```

## Troubleshooting

### "Invalid Slack signature"
- Double-check `SLACK_SIGNING_SECRET` in `.env` file
- Make sure there are no extra spaces or quotes
- Restart the server after changing `.env`

### "No events received"
- Make sure ngrok is running and forwarding to port 3000
- Verify the Request URL in Slack matches your ngrok URL exactly
- Check that `link_shared` event is subscribed
- Make sure bot is invited to the channel

### "Cannot find module" errors
- Run `npm install` again
- Make sure `ts-node` is installed: `npm install --save-dev ts-node`

### ngrok URL changes every time
- Free ngrok URLs change on restart
- You'll need to update Slack Request URL each time
- Or use ngrok's paid plan for static domains

### Server won't start
- Check that port 3000 is not already in use
- Try a different port: `PORT=3001 npm run dev`
- Then update ngrok: `ngrok http 3001`

## Next Steps

Once local testing works:
1. Deploy to Railway (see `QUICK_START.md`)
2. Update Slack Request URL to your Railway URL
3. Remove the `.env` file (don't commit it!)

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `SLACK_SIGNING_SECRET` | ✅ Yes | Slack app signing secret for request verification |
| `SLACK_BOT_TOKEN` | ✅ Yes | Bot OAuth token (starts with `xoxb-`) |
| `PAPERS_CHANNEL_ID` | ❌ No | Optional channel ID to restrict bot to one channel |
| `PORT` | ❌ No | Server port (defaults to 3000) |

