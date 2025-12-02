# ngrok Setup

## 1. Install ngrok

**Option A: Using Homebrew (requires password)**
```bash
brew install ngrok
```

**Option B: Direct Download (no password needed)**
1. Go to https://ngrok.com/download
2. Download for macOS
3. Unzip the file
4. Move to a location in your PATH, or run from the download folder:
   ```bash
   ./ngrok http 3001
   ```

## 2. Sign up for free ngrok account

1. Go to https://dashboard.ngrok.com/signup
2. Sign up for a free account
3. Get your authtoken from the dashboard

## 3. Authenticate ngrok

```bash
ngrok config add-authtoken YOUR_AUTH_TOKEN
```

## 4. Start ngrok

Once installed and authenticated:

```bash
ngrok http 3001
```

This will give you a URL like: `https://abc123.ngrok.io`

## 5. Update Slack

Update your Slack app's Request URL to:
```
https://abc123.ngrok.io/api/slack-events
```

---

## Alternative: Use localtunnel (no signup needed)

If you don't want to sign up for ngrok, you can use localtunnel:

```bash
npm install -g localtunnel
lt --port 3001
```

This gives you a URL like: `https://random-name.loca.lt`

Update Slack Request URL to: `https://random-name.loca.lt/api/slack-events`

