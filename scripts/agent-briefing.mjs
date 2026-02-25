import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import dotenv from 'dotenv';

// Load environment variables from .env
dotenv.config();

// Configuration
const TELEGRAM_USER_ID = '7048412880';

// Helper to call OpenClaw tools via CLI (if available) or fallback
// Note: In this environment, we can use `openclaw` CLI for messaging.
// For LLM generation, we might need a different approach or assume we can use a system prompt if available.
// However, since this script runs independently, we'll implement a simple heuristic or prompt the user to "approve/edit" a richer draft.
//
// For now, we will try to fetch the content using a simple fetch if possible, or just use the summary.
// Since we can't easily call the Agent's "brain" from this script without an API, 
// we will focus on *formatting* the request to the user to ask *them* to refine it, 
// OR we can try to use a local heuristic if possible.
//
// BETTER APPROACH: Use the `openclaw` CLI to invoke the agent? No, that might be complex.
//
// ALTERNATIVE: We can't easily use "web_fetch" from this node script unless we write a wrapper.
// But we *can* ask the agent to do it in the next step.
//
// CURRENT STRATEGY: 
// 1. Pick the top news item.
// 2. Generate a *better* template that asks the user to add insight.
// 3. (Future) If we have an LLM API key in .env, we could use it. 
//    Let's assume we don't for this specific script and stick to better formatting + "Reply Guy" hook.

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
  const topItem = top3[0];

  // --- ENHANCED DRAFTING STRATEGY ---
  
  // 1. Identify the topic (heuristic)
  const isHealthcare = /medic|health|doctor|patient|surger|clinic|biol/i.test(topItem.title + topItem.summary);
  const isCoding = /code|programm|dev|engineer|software|python|javascript/i.test(topItem.title + topItem.summary);
  
  // 2. Draft the hook
  let hook = "";
  if (isHealthcare) {
    hook = "🏥 Healthcare AI Watch:";
  } else if (isCoding) {
    hook = "👨‍💻 Dev Perspective:";
  } else {
    hook = "🤖 AI Update:";
  }

  // 3. Construct the draft
  // We leave a placeholder for the "insight" to encourage the user (or future agent) to fill it.
  // But to be helpful, we provide a "vanilla" version that is still better than just a link.
  
  const dateLabel = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  
  // Try to use the summary if it's better than the title
  const content = (topItem.summary && topItem.summary.length > topItem.title.length) ? topItem.summary : topItem.title;
  // Truncate content for tweet
  const maxLen = 200;
  const safeContent = content.length > maxLen ? content.substring(0, maxLen) + "..." : content;

  let tweetText = `${hook} ${safeContent}\n\nMy take: [INSERT INSIGHT]\n\n🔗 ${topItem.url} #AI #Tech`;

  // If we can't generate an insight, we'll simplify:
  const tags = isHealthcare ? "#AI #HealthTech" : (isCoding ? "#AI #Dev" : "#AI #Tech");
  tweetText = `${hook} ${topItem.title}\n\nKey takeaway: ${topItem.summary ? topItem.summary.substring(0, 100) + "..." : "Important read."}\n\n🔗 ${topItem.url} ${tags}`;

  // --- END ENHANCED DRAFTING ---

  // Format message for Telegram
  let message = "📰 *Daily AI News Brief*\n\n";
  top3.forEach((item, index) => {
    message += `${index + 1}. [${item.title}](${item.url}) - _${item.source}_\n`;
  });

  message += `\n🐦 *Draft Tweet (Enhanced):*\n\`${tweetText}\`\n\nReply "approve" to tweet this.`;

  // Save draft locally
  await fs.writeFile('.last_tweet_draft', tweetText, 'utf-8');
  await fs.writeFile('.last_tweet_url', topItem.url, 'utf-8');

  // Send via OpenClaw CLI
  console.log("Sending message via Telegram...");
  spawnSync('openclaw', ['message', 'send', '--channel', 'telegram', '--target', TELEGRAM_USER_ID, '--message', message]);
}

main().catch(console.error);
