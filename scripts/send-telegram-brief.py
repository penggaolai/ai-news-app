
import sys
import os
import json
from datetime import datetime
from zoneinfo import ZoneInfo

# Add the parent directory to the path to import post-to-x.py
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from post_to_x import read_top_news, build_tweet_from_news, normalize_text, truncate

TOP_N = 3

def get_telegram_brief():
    news = read_top_news("/data/.openclaw/workspace/ai-news-app/public/news.json")
    if len(news) < TOP_N:
        return f"Not enough news items (only {len(news)}), skipping Telegram brief."
    
    tweet_text, _ = build_tweet_from_news(news, news[0].get("source", ""))
    
    # We'll just return the tweet_text, the agent will send it via message tool
    return tweet_text

if __name__ == "__main__":
    brief = get_telegram_brief()
    print(brief)
