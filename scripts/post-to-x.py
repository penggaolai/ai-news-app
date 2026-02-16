import json
import os
from datetime import datetime
from urllib.request import Request, urlopen
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


def resolve_final_url(url: str) -> str:
    if not url:
        return ""
    try:
        req = Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; ai-news-bot/1.0)",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
        )
        with urlopen(req, timeout=12) as resp:
            final = getattr(resp, "geturl", lambda: url)()
            return final or url
    except Exception:
        return url


def build_tweet_from_news(news):
    now_ny = datetime.now(ZoneInfo("America/New_York"))
    date_label = now_ny.strftime("%b %d")

    title = news[0].get("title", "")
    link = resolve_final_url(news[0].get("url", ""))

    # Ensure link is never truncated. If resolved link is too long, fallback to site link.
    if len(link) > 230:
        link = "https://ai-news-app-iota.vercel.app/"

    header = f"AI morning brief ({date_label}):"
    suffix = " #AI"

    # Reserve space for full link line + fixed text.
    reserved = len(header) + len(suffix) + len(link) + 4  # two newlines + bullet
    max_title = max(40, 280 - reserved)
    clean_title = truncate(title, max_title)

    tweet = f"{header}\n{clean_title}\n{link}{suffix}"
    return truncate(tweet, 280), date_label


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

    tweet_text, date_label = build_tweet_from_news(news)

    print("Tweet preview:")
    print(tweet_text)

    # Prevent duplicate daily brief posts + rapid retries.
    try:
        me = client.get_me(user_auth=True)
        uid = me.data.id if getattr(me, "data", None) else None
        if uid:
            recent = client.get_users_tweets(id=uid, max_results=10, user_auth=True, tweet_fields=["created_at"])
            now_utc = datetime.now(ZoneInfo("UTC"))
            for t in (recent.data or []):
                txt = t.text or ""

                if txt.startswith(f"AI morning brief ({date_label}"):
                    print("Skip: today's AI morning brief already posted.")
                    return

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
        resp = client.create_tweet(text=tweet_text)
        tweet_id = resp.data.get("id") if getattr(resp, "data", None) else None
        print("Posted to X successfully.")
        if tweet_id:
            print(f"Tweet ID: {tweet_id}")
    except Forbidden as e:
        fallback = f"AI update test {datetime.now(ZoneInfo('America/New_York')).strftime('%Y-%m-%d %H:%M:%S ET')}"
        print("Primary post forbidden; retrying fallback text...")
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
