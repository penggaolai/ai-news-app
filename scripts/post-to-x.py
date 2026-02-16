import json
import os
from datetime import datetime
from zoneinfo import ZoneInfo

import tweepy
from tweepy.errors import Forbidden

TOP_N = 3
COOLDOWN_MINUTES = 120


def truncate(text: str, max_len: int) -> str:
    text = " ".join((text or "").split())
    if len(text) <= max_len:
        return text
    if max_len <= 0:
        return ""
    return text[:max_len].rstrip()


def read_top_news(path: str):
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return [x for x in data if x.get("title") and x.get("url")][:TOP_N]


def build_thread_from_news(news):
    now_ny = datetime.now(ZoneInfo("America/New_York"))
    date_label = now_ny.strftime("%b %d")

    # Tweet 1: readable top 3 list
    t1_lines = [
        f"AI morning brief ({date_label})",
        f"1) {truncate(news[0].get('title', ''), 70)}",
        f"2) {truncate(news[1].get('title', ''), 70)}",
        f"3) {truncate(news[2].get('title', ''), 70)}",
        "#AI",
    ]
    tweet1 = truncate("\n".join(t1_lines), 280)

    # Tweet 2: links only (clean and clickable)
    link_lines = [
        "Links:",
        f"1) {news[0].get('url', '')}",
        f"2) {news[1].get('url', '')}",
        f"3) {news[2].get('url', '')}",
        "More: https://ai-news-app-iota.vercel.app/",
    ]
    tweet2 = truncate("\n".join(link_lines), 280)

    return tweet1, tweet2, date_label


def main():
    api_key = os.environ["X_API_KEY"]
    api_secret = os.environ["X_API_SECRET"]
    access_token = os.environ["X_ACCESS_TOKEN"]
    access_token_secret = os.environ["X_ACCESS_TOKEN_SECRET"]

    test_text = os.environ.get("X_TEST_TEXT", "").strip()

    client = tweepy.Client(
        consumer_key=api_key,
        consumer_secret=api_secret,
        access_token=access_token,
        access_token_secret=access_token_secret,
    )

    if test_text:
        tweet_text = truncate(test_text, 280)
        print("Using X_TEST_TEXT override.")
        print("Tweet preview:")
        print(tweet_text)
        resp = client.create_tweet(text=tweet_text)
        tweet_id = resp.data.get("id") if getattr(resp, "data", None) else None
        print("Posted to X successfully.")
        if tweet_id:
            print(f"Tweet ID: {tweet_id}")
        return

    news = read_top_news("public/news.json")
    if len(news) < TOP_N:
        raise RuntimeError(f"Need at least {TOP_N} items in public/news.json, got {len(news)}")

    tweet1, tweet2, date_label = build_thread_from_news(news)

    print("Tweet 1 preview:")
    print(tweet1)
    print("Tweet 2 preview:")
    print(tweet2)

    # Prevent duplicate daily brief root tweets + rapid retries.
    try:
        me = client.get_me(user_auth=True)
        uid = me.data.id if getattr(me, "data", None) else None
        if uid:
            recent = client.get_users_tweets(id=uid, max_results=10, user_auth=True, tweet_fields=["created_at"])
            now_utc = datetime.now(ZoneInfo("UTC"))
            for t in (recent.data or []):
                txt = t.text or ""

                # 1) One root brief per day
                if txt.startswith(f"AI morning brief ({date_label}"):
                    print("Skip: today's AI morning brief already posted.")
                    return

                # 2) Cooldown: skip if any AI/test post in recent window
                created_at = getattr(t, "created_at", None)
                if created_at is not None:
                    age_min = (now_utc - created_at).total_seconds() / 60.0
                    if age_min < COOLDOWN_MINUTES and (
                        txt.startswith("AI morning brief")
                        or txt.startswith("AI update test")
                        or txt.startswith("Links:")
                    ):
                        print(f"Skip: cooldown active ({age_min:.0f} min < {COOLDOWN_MINUTES} min).")
                        return
    except Exception as e:
        print(f"Duplicate/cooldown check skipped due to API read issue: {e}")

    try:
        root = client.create_tweet(text=tweet1)
        root_id = root.data.get("id") if getattr(root, "data", None) else None
        if root_id:
            client.create_tweet(text=tweet2, in_reply_to_tweet_id=root_id)
        print("Posted thread to X successfully.")
        if root_id:
            print(f"Root Tweet ID: {root_id}")
    except Forbidden as e:
        fallback = f"AI update test {datetime.now(ZoneInfo('America/New_York')).strftime('%Y-%m-%d %H:%M:%S ET')}"
        print("Thread post forbidden; retrying fallback text...")
        print(f"Fallback preview: {fallback}")
        try:
            resp = client.create_tweet(text=fallback)
            tweet_id = resp.data.get("id") if getattr(resp, "data", None) else None
            print("Posted fallback to X successfully.")
            if tweet_id:
                print(f"Tweet ID: {tweet_id}")
        except Forbidden:
            raise e


if __name__ == "__main__":
    main()
