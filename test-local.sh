#!/bin/bash

# Quick local testing script

echo "🧪 bioRxiv Preview Bot - Local Testing Setup"
echo "=============================================="
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found!"
    echo ""
    echo "Create a .env file with:"
    echo "  SLACK_SIGNING_SECRET=your_secret"
    echo "  SLACK_BOT_TOKEN=xoxb-your-token"
    echo "  PAPERS_CHANNEL_ID=your_channel_id  # optional"
    echo ""
    echo "Press Ctrl+C to exit, or create .env and run this script again"
    read -p "Press Enter to continue anyway..."
else
    echo "✅ .env file found"
fi

# Check if node_modules exists
if [ ! -d node_modules ]; then
    echo "📦 Installing dependencies..."
    npm install
else
    echo "✅ Dependencies installed"
fi

# Check if ngrok is installed
if ! command -v ngrok &> /dev/null; then
    echo ""
    echo "⚠️  ngrok not found!"
    echo ""
    echo "Install ngrok:"
    echo "  macOS: brew install ngrok"
    echo "  Or download from: https://ngrok.com/download"
    echo ""
    echo "You'll need ngrok to expose your local server to Slack."
    echo ""
fi

echo ""
echo "🚀 Starting server..."
echo ""
echo "In another terminal, run:"
echo "  ngrok http 3000"
echo ""
echo "Then update your Slack app Request URL to the ngrok HTTPS URL"
echo ""

npm run dev

