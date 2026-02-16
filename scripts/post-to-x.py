import json
import os
from datetime import datetime
from zoneinfo import ZoneInfo

import tweepy

TOP_N = 3


def truncate(text: str, max_len: int) -> str:
    text = " ".join((text or "").split())
    if len(text) <= max_len:
        return text
    if max_len <= 1:
        return "…"
    return text[: max_len - 1].rstrip() + "…"


def read_top_news(path: str):
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return [x for x in data if x.get("title") and x.get("url")][:TOP_N]


def build_tweet_from_news(news):
    now_ny = datetime.now(ZoneInfo("America/New_York"))
    date_label = now_ny.strftime("%b %d")
    force_unique = os.environ.get("X_FORCE_UNIQUE", "false").lower() == "true"
    suffix = f" {now_ny.strftime('%H:%M')} ET" if force_unique else ""

    lines = [f"🧠 Top 3 AI headlines ({date_label}{suffix})"]
    max_total = 280
    static_overhead = len(lines[0]) + 1 + 10  # + hashtags
    per_line_overhead = 3 + 4  # "1) " + " (S)"
    remaining_for_titles = max(45, max_total - static_overhead - TOP_N * per_line_overhead)
    per_title = max(36, remaining_for_titles // TOP_N)

    for idx, item in enumerate(news[:TOP_N], 1):
        title = truncate(item.get("title", ""), per_title)
        source = truncate(item.get("source", "AI"), 10)
        lines.append(f"{idx}) {title} ({source})")

    lines.append("#AI #TechNews")
    text = "\n".join(lines)
    return truncate(text, 280)


def main():
    api_key = os.environ["X_API_KEY"]
    api_secret = os.environ["X_API_SECRET"]
    access_token = os.environ["X_ACCESS_TOKEN"]
    access_token_secret = os.environ["X_ACCESS_TOKEN_SECRET"]

    test_text = os.environ.get("X_TEST_TEXT", "").strip()
    if test_text:
        tweet_text = truncate(test_text, 280)
        print("Using X_TEST_TEXT override.")
    else:
        news = read_top_news("public/news.json")
        if len(news) < TOP_N:
            raise RuntimeError(f"Need at least {TOP_N} items in public/news.json, got {len(news)}")
        tweet_text = build_tweet_from_news(news)

    client = tweepy.Client(
        consumer_key=api_key,
        consumer_secret=api_secret,
        access_token=access_token,
        access_token_secret=access_token_secret,
    )

    resp = client.create_tweet(text=tweet_text)
    tweet_id = None
    if getattr(resp, "data", None):
        tweet_id = resp.data.get("id")

    print("Posted to X successfully.")
    if tweet_id:
        print(f"Tweet ID: {tweet_id}")


if __name__ == "__main__":
    main()
