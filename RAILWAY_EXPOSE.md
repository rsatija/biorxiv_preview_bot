# Railway: How to Generate a Public Domain

If your service shows as "unexposed" in Railway, you need to manually generate a public domain.

## Steps to Generate Public Domain:

1. **Go to Railway Dashboard**
   - Navigate to [railway.app](https://railway.app)
   - Open your project

2. **Select Your Service**
   - Click on the service that's showing as "unexposed"

3. **Go to Settings Tab**
   - Click on the **Settings** tab (or look for **Networking** section)

4. **Generate Domain**
   - Look for **"Generate Domain"** button
   - Click it to create a public URL
   - Railway will assign a URL like: `https://your-project.up.railway.app`

5. **Copy the URL**
   - Once generated, copy the public URL
   - You'll use this in your Slack app configuration

## Alternative: Via Railway CLI

If you have Railway CLI installed:

```bash
railway domain
```

This will generate a domain for your service.

## After Generating Domain:

1. **Update Slack App**
   - Go to your Slack app → **Event Subscriptions**
   - Set **Request URL** to: `https://your-project.up.railway.app/api/slack-events`
   - Slack will verify the URL (should show green checkmark ✅)

2. **Test It**
   - Visit `https://your-project.up.railway.app/` in your browser
   - You should see the health check JSON response

## Troubleshooting

**Still showing as unexposed?**
- Make sure the service is running (check logs)
- Verify the server is listening on the PORT environment variable
- Check that the service is bound to `::` (IPv6) or `0.0.0.0` (IPv4)
- Try redeploying after generating the domain

**Domain not working?**
- Check Railway logs for errors
- Verify environment variables are set correctly
- Make sure the build completed successfully

