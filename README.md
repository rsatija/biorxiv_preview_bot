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

### 3. Enable Events API

1. Go to **Event Subscriptions** (left sidebar)
2. Toggle **Enable Events** to ON
3. Set **Request URL** to your Vercel deployment URL (you'll update this after deployment):
   - Format: `https://your-project.vercel.app/api/slack-events`
4. Under **Subscribe to bot events**, add:
   - `link_shared` - To detect when links are shared
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

### 7. Update Slack Request URL

1. Go back to your Slack app settings → **Event Subscriptions**
2. Update the **Request URL** to: `https://your-project.vercel.app/api/slack-events`
3. Slack will verify the URL (should show a green checkmark)
4. Click **Save Changes**

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

- **Bot not responding**: Check that the bot is invited to the channel
- **Signature verification failed**: Verify `SLACK_SIGNING_SECRET` is correct
- **No preview posted**: Check Vercel function logs for errors
- **URL verification failed**: Ensure the Request URL in Slack matches your Vercel deployment URL exactly

