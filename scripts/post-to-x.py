import json
import os
from datetime import datetime
from zoneinfo import ZoneInfo

import tweepy
from tweepy.errors import Forbidden

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
    suffix = f" · {now_ny.strftime('%H:%M')} ET" if force_unique else ""

    # Keep it natural and compact to reduce content-level rejections.
    a = truncate(news[0].get("title", ""), 52)
    b = truncate(news[1].get("title", ""), 52)
    c = truncate(news[2].get("title", ""), 52)

    lines = [
        f"AI morning brief ({date_label}{suffix})",
        f"- {a}",
        f"- {b}",
        f"- {c}",
    ]

    # Add only one short link (first item) to avoid overloading the post.
    first_link = news[0].get("url", "")
    if first_link:
        lines.append(first_link)

    lines.append("#AI")
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

    print("Tweet preview:")
    print(tweet_text)

    client = tweepy.Client(
        consumer_key=api_key,
        consumer_secret=api_secret,
        access_token=access_token,
        access_token_secret=access_token_secret,
    )

    try:
        resp = client.create_tweet(text=tweet_text)
    except Forbidden as e:
        # Retry once with a minimal unique fallback to separate permission issues from content issues.
        fallback = f"AI update test {datetime.now(ZoneInfo('America/New_York')).strftime('%Y-%m-%d %H:%M:%S ET')}"
        print("Primary post forbidden; retrying with minimal fallback text...")
        print(f"Fallback preview: {fallback}")
        try:
            resp = client.create_tweet(text=fallback)
        except Forbidden:
            raise e

    tweet_id = None
    if getattr(resp, "data", None):
        tweet_id = resp.data.get("id")

    print("Posted to X successfully.")
    if tweet_id:
        print(f"Tweet ID: {tweet_id}")


if __name__ == "__main__":
    main()
