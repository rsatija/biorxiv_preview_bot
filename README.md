# bioRxiv Preview Bot

A Slack bot that automatically detects and previews bioRxiv and medRxiv preprint links shared in Slack channels.

## Setup Instructions

### 1. Create a Slack App

1. Go to [https://api.slack.com/apps](https://api.slack.com/apps)
2. Click "Create New App" → "From scratch"
3. Name your app (e.g., "bioRxiv Preview Bot") and select your workspace
4. Click "Create App"

### 2. Configure Bot Token Scopes

1. In your app settings, go to **OAuth & Permissions** (left sidebar)
2. Under **Bot Token Scopes**, add:
   - `chat:write` - To post messages
   - `links:read` - To read shared links (if available)
3. Scroll up and click **Install to Workspace**
4. Authorize the app and copy the **Bot User OAuth Token** (starts with `xoxb-`)
   - This is your `SLACK_BOT_TOKEN`

### 3. Enable Events API ⚠️ **CRITICAL STEP**

> **Important**: The bot will NOT work without subscribing to bot events. This step is required!

1. Go to **Event Subscriptions** (left sidebar)
2. Toggle **Enable Events** to ON
3. Set **Request URL** to your Vercel deployment URL (you'll update this after deployment):
   - Format: `https://your-project.vercel.app/api/slack-events`
   - For now, you can use a placeholder or come back after deployment
4. **Subscribe to bot events** (this is required!):
   - Scroll down to **Subscribe to bot events**
   - Click **Add Bot User Event**
   - Add: `link_shared` - This allows the bot to detect when links are shared
   - **Without this event, the bot will not receive notifications about shared links**
5. Click **Save Changes**

### 4. Get Your Signing Secret

1. In your app settings, go to **Basic Information**
2. Under **App Credentials**, copy the **Signing Secret**
   - This is your `SLACK_SIGNING_SECRET`

### 5. Deploy to Vercel

1. Install Vercel CLI (if not already installed):
   ```bash
   npm i -g vercel
   ```

2. Login to Vercel:
   ```bash
   vercel login
   ```

3. Deploy the project:
   ```bash
   vercel
   ```
   - Follow the prompts to link/create your project
   - Note the deployment URL (e.g., `https://your-project.vercel.app`)

### 6. Set Environment Variables in Vercel

1. Go to your project on [vercel.com](https://vercel.com)
2. Navigate to **Settings** → **Environment Variables**
3. Add the following variables:
   - `SLACK_SIGNING_SECRET` - Your Slack app's signing secret
   - `SLACK_BOT_TOKEN` - Your bot's OAuth token (starts with `xoxb-`)
   - `PAPERS_CHANNEL_ID` (optional) - Channel ID to restrict bot to specific channel

4. Redeploy after adding environment variables:
   ```bash
   vercel --prod
   ```

### 7. Update Slack Request URL and Verify Bot Events

1. Go back to your Slack app settings → **Event Subscriptions**
2. Update the **Request URL** to: `https://your-project.vercel.app/api/slack-events`
3. Slack will verify the URL (should show a green checkmark)
4. **Verify bot events subscription**:
   - Scroll down to **Subscribe to bot events**
   - Make sure `link_shared` is listed (if not, add it now)
   - This is required for the bot to work!
5. Click **Save Changes**

### 8. Invite Bot to Channel

1. In Slack, go to the channel where you want the bot to work
2. Type `/invite @YourBotName` or add the bot through channel settings
3. The bot will now respond to bioRxiv/medRxiv links shared in that channel

## Optional: Restrict to Specific Channel

If you want the bot to only work in a specific channel (e.g., `#papers`):

1. Get the channel ID:
   - Right-click the channel → "View channel details" → Copy the Channel ID
   - Or use the Slack API to get it
2. Set the `PAPERS_CHANNEL_ID` environment variable in Vercel to that channel ID
3. Redeploy

## Testing

1. Share a bioRxiv or medRxiv link in your Slack channel
2. The bot should automatically post a preview with title, authors, and abstract

## Local Development

```bash
npm install
vercel dev
```

This will start a local server. You'll need to use a tool like [ngrok](https://ngrok.com) to expose it to Slack for testing.

## Troubleshooting

### No Logs Appearing (Slack Not Calling Your Endpoint)

If you post a link but see **no logs at all** in Vercel, Slack isn't calling your endpoint. Check these in order:

1. **Verify Endpoint is Reachable**
   - Visit `https://your-project.vercel.app/api/slack-events` in your browser
   - You should see a JSON response with environment variable status
   - If you get an error, the deployment may have failed

2. **Check Slack Event Subscriptions Configuration**
   - Go to your Slack app → **Event Subscriptions**
   - Verify **Enable Events** is toggled **ON** (green)
   - Check the **Request URL** shows a green checkmark ✅
   - If there's a red X, click "Reinstall App" or verify the URL is correct
   - The URL must be exactly: `https://your-project.vercel.app/api/slack-events`

3. **Verify Bot Events Subscription**
   - In Event Subscriptions, scroll to **Subscribe to bot events**
   - Ensure `link_shared` is listed (if not, add it and save)
   - This is the #1 reason events don't fire!

4. **Check Bot is in Channel**
   - The bot must be **invited to the channel** where you're posting
   - Type `/invite @YourBotName` in the channel
   - Or add the bot through channel settings → Integrations

5. **Check Slack's Event Delivery Status**
   - In Event Subscriptions, scroll down to see recent event deliveries
   - Look for any failed deliveries or errors
   - If you see failures, check the error message

6. **Verify Bot Token Scopes**
   - Go to **OAuth & Permissions**
   - Ensure `chat:write` scope is added
   - If you added scopes after installation, click **Reinstall to Workspace**

7. **Test with a Direct Message**
   - Try posting a bioRxiv link in a DM with the bot
   - This helps isolate channel permission issues

### Other Issues

- **Bot not responding** (but logs show events): 
  - Check that the bot is invited to the channel
  - Verify `link_shared` event is subscribed
  - Check Vercel logs for API errors

- **Signature verification failed**: 
  - Verify `SLACK_SIGNING_SECRET` environment variable is set correctly in Vercel
  - Make sure there are no extra spaces when copying the secret

- **No preview posted** (but handler is called): 
  - Check Vercel function logs for errors
  - Ensure `link_shared` bot event is subscribed (most common issue!)
  - Verify the link is a valid bioRxiv/medRxiv URL with a DOI

- **URL verification failed**: 
  - Ensure the Request URL in Slack matches your Vercel deployment URL exactly
  - No trailing slashes, correct protocol (https), correct path

