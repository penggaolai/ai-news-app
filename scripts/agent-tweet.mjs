import fs from 'node:fs/promises';
import process from 'node:process';
import { TwitterApi } from 'twitter-api-v2';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const args = process.argv.slice(2);
  const action = args[0] || 'approve'; // 'approve' or 'edit'

  let tweetText = '';

  if (action === 'edit') {
    tweetText = args.slice(1).join(' '); // "edit new text here"
  } else {
    // Read from last draft
    try {
      tweetText = await fs.readFile('.last_tweet_draft', 'utf-8');
    } catch (e) {
      console.error("No draft tweet found. Run 'npm run briefing' first.");
      process.exit(1);
    }
  }

  if (!tweetText) {
    console.error("Empty tweet text.");
    process.exit(1);
  }

  console.log(`Tweeting: "${tweetText}"`);

  // Initialize Twitter client
  const client = new TwitterApi({
    appKey: process.env.X_API_KEY,
    appSecret: process.env.X_API_SECRET,
    accessToken: process.env.X_ACCESS_TOKEN,
    accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
  });

  try {
    const rwClient = client.readWrite;
    const tweet = await rwClient.v2.tweet(tweetText);
    console.log("Tweet sent successfully! ✅");
    console.log(`Tweet ID: ${tweet.data.id}`);

    // Update history
    try {
      let history = [];
      try {
        history = JSON.parse(await fs.readFile('.tweet_history.json', 'utf-8'));
      } catch (e) {
        history = [];
      }
      
      const lastUrl = await fs.readFile('.last_tweet_url', 'utf-8').catch(() => '');
      if (lastUrl && !history.includes(lastUrl)) {
        history.push(lastUrl);
        // Keep history size reasonable (e.g. 50 items)
        if (history.length > 50) history.shift();
        await fs.writeFile('.tweet_history.json', JSON.stringify(history, null, 2));
      }
    } catch (e) {
      console.error("Failed to update history:", e);
    }
  } catch (e) {
    console.error("Failed to post tweet:", e);
    process.exit(1);
  }
}

main().catch(console.error);
