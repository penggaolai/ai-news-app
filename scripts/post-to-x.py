import json
import os
import re
from datetime import datetime
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

import tweepy
from tweepy.errors import Forbidden

TOP_N = 3
COOLDOWN_MINUTES = 120
HEADLINE_REPOST_WINDOW_HOURS = 48


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


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9\s]", " ", (text or "").lower())).strip()


def get_distinct_summary(title: str, summary: str, max_len: int, source: str) -> str:
    norm_title = normalize_text(title)
    norm_summary = normalize_text(summary)

    # If summary is essentially the same as title, try to find a more distinct part
    if norm_summary in norm_title or norm_title in norm_summary or norm_summary == norm_title:
        # Try to get the first sentence of the original summary
        first_sentence_match = re.match(r'^([^.!?]*[.!?])', summary)
        if first_sentence_match:
            distinct_summary = first_sentence_match.group(1).strip()
            if len(distinct_summary) > 10 and normalize_text(distinct_summary) not in norm_title:
                return truncate(distinct_summary, max_len)
        
        # Fallback if no distinct sentence or too short
        return truncate(f"Quick take: {source} update", max_len)
    
    return truncate(summary, max_len)


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


def build_tweet_from_news(news, source: str):
    item = news[0]
    title = item.get("title", "")
    link = resolve_final_url(item.get("url", ""))
    summary = item.get("summary", "")

    # Clean up title: remove source suffix if present (e.g. " - The Verge")
    if " - " in title:
        title = title.rsplit(" - ", 1)[0]

    # Ensure link is never truncated.
    if len(link) > 230:
        link = "https://ai-news-app-iota.vercel.app/"

    # Format:
    # 🤖 AI Update: [Title]
    #
    # Key takeaway: [Summary]
    #
    # 🔗 [Link] #AI #Tech

    header = f"🤖 AI Update: {title}"
    
    # Try to fit summary
    # Max tweet length 280.
    # Reserved: Link (23) + Tags (10) + Newlines/Spacers (10) = ~45 chars
    # We need to truncate summary to fit.
    
    base_len = len(header) + len(link) + 20 # buffer
    remaining = 280 - base_len
    
    if remaining < 50: # If title is huge, skip summary or truncate title
        header = truncate(header, 100) # Force title shorter
        remaining = 280 - len(header) - len(link) - 20
        
    clean_summary = get_distinct_summary(title, summary, remaining, source)
    
    tweet = f"{header}\n\nKey takeaway: {clean_summary}\n\n🔗 {link} #AI #Tech"
    return tweet, item.get("date", "")


def get_tweet_content():
    news = read_top_news("./public/news.json")
    if len(news) < TOP_N:
        raise RuntimeError(f"Need at least {TOP_N} items in public/news.json, got {len(news)}")
    tweet_text, _ = build_tweet_from_news(news, news[0].get("source", ""))
    return tweet_text

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

    tweet_text = get_tweet_content() # Use the new function to get content

    # The rest of the original main() function for posting to X
    # ... (duplicate checking and actual tweet posting logic) ...
    news = read_top_news("./public/news.json") # Re-read news to get date_label for duplicate check
    if len(news) < TOP_N:
        raise RuntimeError(f"Need at least {TOP_N} items in public/news.json, got {len(news)}")
    
    _, date_label = build_tweet_from_news(news, news[0].get("source", "")) # Get date_label for duplicate check
    top_headline_norm = normalize_text(news[0].get("title", ""))

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

                if txt.startswith(f"🤖 AI Update: {date_label}"): # Corrected prefix for duplicate check
                    print("Skip: today's AI morning brief already posted.")
                    return

                created_at = getattr(t, "created_at", None)
                if created_at is not None:
                    age_min = (now_utc - created_at).total_seconds() / 60.0
                    age_hours = age_min / 60.0

                    if age_min < COOLDOWN_MINUTES and (
                        txt.startswith("🤖 AI Update:") # Corrected prefix
                        or txt.startswith("AI update test")
                        or txt.startswith("Links:")
                    ):
                        print(f"Skip: cooldown active ({age_min:.0f} min < {COOLDOWN_MINUTES} min).")
                        return

                    # Skip reposting same headline within 48h.
                    if age_hours < HEADLINE_REPOST_WINDOW_HOURS and top_headline_norm:
                        recent_norm = normalize_text(txt)
                        probe = top_headline_norm[:55]
                        if probe and probe in recent_norm:
                            print(f"Skip: same headline already posted within {HEADLINE_REPOST_WINDOW_HOURS}h.")
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
