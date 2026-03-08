#!/bin/bash

# Navigate to the ai-news-app directory
cd /data/.openclaw/workspace/ai-news-app

# Run the Node.js scripts to update the news JSON files
echo "Updating news.json..."
node scripts/update-news.mjs || { echo "Failed to update news.json"; exit 1; }

echo "Updating news-youtube-openclaw.json..."
node scripts/update-youtube-openclaw.mjs || { echo "Failed to update news-youtube-openclaw.json"; exit 1; }

# Configure Git
git config user.name "OpenClaw AI"
git config user.email "openclaw-ai@example.com"

# Add and commit the changes if any
git add public/news.json public/news-youtube-openclaw.json

if ! git diff --cached --exit-code; then
  echo "Committing updated JSON files..."
  git commit -m "feat: Auto-update AI news and YouTube OpenClaw news" || { echo "Failed to commit changes"; exit 1; }
  echo "Pushing changes to remote..."
  git push origin main || { echo "Failed to push changes"; exit 1; }
  echo "Successfully updated and pushed news files."
else
  echo "No changes to commit."
fi
