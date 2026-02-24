import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import dotenv from 'dotenv';

// Load environment variables from .env
dotenv.config();

// Configuration
const TELEGRAM_USER_ID = '7048412880'; // Hardcoded based on chat history

async function main() {
  console.log("Fetching latest news...");
  
  const updateResult = spawnSync('npm', ['run', 'update:news'], { stdio: 'inherit' });
  if (updateResult.status !== 0) {
    console.error("Failed to update news.");
    spawnSync('openclaw', ['message', 'send', '--channel', 'telegram', '--target', TELEGRAM_USER_ID, '--message', '❌ Failed to fetch daily AI news.']);
    process.exit(1);
  }

  const newsPath = path.resolve(process.cwd(), 'public/news.json');
  let newsData;
  try {
    newsData = JSON.parse(await fs.readFile(newsPath, 'utf-8'));
  } catch (e) {
    console.error("Failed to read news.json");
    process.exit(1);
  }

  // Load tweet history
  let tweetHistory = [];
  try {
    tweetHistory = JSON.parse(await fs.readFile('.tweet_history.json', 'utf-8'));
  } catch (e) {
    // defaults to []
  }

  // Filter out already tweeted items
  const freshNews = newsData.filter(item => !tweetHistory.includes(item.url));

  if (freshNews.length === 0) {
    console.log("No fresh news found (all recent items already tweeted).");
    return;
  }

  const top3 = freshNews.slice(0, 3);


  // Format message for Telegram
  let message = "📰 *Daily AI News Brief*\n\n";
  top3.forEach((item, index) => {
    message += `${index + 1}. [${item.title}](${item.url}) - _${item.source}_\n`;
  });

  // Draft the tweet
  const topItem = top3[0];
  const dateLabel = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const tweetText = `AI morning brief (${dateLabel}): ${topItem.title} (${topItem.source}). Read more: ${topItem.url} #AI`;

  message += `\n🐦 *Draft Tweet:*\n\`${tweetText}\`\n\nReply "approve" to tweet this.`;

  // Save draft locally
  await fs.writeFile('.last_tweet_draft', tweetText, 'utf-8');
  await fs.writeFile('.last_tweet_url', topItem.url, 'utf-8');

  // Send via OpenClaw CLI using spawnSync to avoid shell escaping issues
  console.log("Sending message via Telegram...");
  spawnSync('openclaw', ['message', 'send', '--channel', 'telegram', '--target', TELEGRAM_USER_ID, '--message', message]);
}

main().catch(console.error);
