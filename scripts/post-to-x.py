import json
import os
import random
import re
import time
from datetime import datetime
from zoneinfo import ZoneInfo

import tweepy
from tweepy.errors import Forbidden, TooManyRequests, TwitterServerError

TOP_N = 3
COOLDOWN_MINUTES = 120
HEADLINE_REPOST_WINDOW_HOURS = 48
MAX_TAKEAWAY_LEN = 120


TOPIC_KEYWORDS = {
    "defense_geopolitics": [
        "military", "defense", "war", "conflict", "china", "us", "u.s", "security", "intelligence", "iran", "critical infrastructure", "cyber"
    ],
    "markets_business": [
        "market", "stock", "earnings", "revenue", "valuation", "nasdaq", "wall street", "investor", "commercial", "enterprise"
    ],
    "research_models": [
        "model", "benchmark", "research", "release", "launch", "paper", "openai", "anthropic", "deepmind", "chatgpt", "agentic"
    ],
    "policy_regulation": [
        "policy", "regulation", "law", "lawsuit", "compliance", "governance", "standards", "safety", "ethics"
    ],
    "infrastructure_ops": [
        "chip", "gpu", "compute", "inference", "datacenter", "cloud", "deployment", "latency", "throughput", "migration"
    ],
}


def truncate(text: str, max_len: int) -> str:
    text = " ".join((text or "").split())
    if len(text) <= max_len:
        return text
    if max_len <= 0:
        return ""
    if max_len <= 1:
        return "…"
    cut = text[: max_len - 1].rstrip()
    if " " in cut:
        cut = cut.rsplit(" ", 1)[0].rstrip()
    return f"{cut}…"


def read_top_news(path: str):
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return [x for x in data if x.get("title") and x.get("url")][:TOP_N]


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9\s]", " ", (text or "").lower())).strip()


def resolve_final_url(url: str) -> str:
    # Product-first linking policy: always route traffic to Gaolai's AI news page.
    return "https://ai-news-app-iota.vercel.app/"


def classify_topic(title: str, summary: str, source: str) -> str:
    text = normalize_text(f"{title} {summary} {source}")
    scores = {k: 0 for k in TOPIC_KEYWORDS.keys()}

    for topic, words in TOPIC_KEYWORDS.items():
        for w in words:
            if w in text:
                scores[topic] += 1

    best_topic = max(scores, key=scores.get)
    return best_topic if scores[best_topic] > 0 else "general"


def sentence_from_summary(summary: str) -> str:
    if not summary:
        return ""
    cleaned = re.sub(r"\s+", " ", summary).strip()
    m = re.match(r"^([^.!?]*[.!?])", cleaned)
    return (m.group(1) if m else cleaned).strip()


def extract_signal_phrase(title: str, summary: str) -> str:
    base = sentence_from_summary(summary)
    if not base:
        base = title
    base = re.sub(r"\s*-\s*[^-]+$", "", base).strip()
    base = re.sub(r"\s+", " ", base)
    return truncate(base, 70)


def topic_takeaway(topic: str, title: str, summary: str, source: str) -> str:
    templates = {
        "defense_geopolitics": f"AI is becoming a strategic security lever, with direct impact on national risk posture.",
        "markets_business": f"AI advantage is shifting to operators who can ship faster while controlling execution risk.",
        "research_models": f"Model progress is compressing product cycles, so integration speed matters more than hype.",
        "policy_regulation": f"Policy pressure is moving from debate to enforcement, raising the cost of weak governance.",
        "infrastructure_ops": f"AI performance is increasingly constrained by infrastructure decisions, not model demos.",
        "general": f"Quick take: {source} reports a notable AI development.",
    }

    takeaway = templates.get(topic, templates["general"])
    return truncate(takeaway, MAX_TAKEAWAY_LEN)


def is_takeaway_too_similar(title: str, takeaway: str) -> bool:
    t1 = normalize_text(title)
    t2 = normalize_text(takeaway)

    if not t2 or len(t2) < 25:
        return True

    title_words = set(t1.split())
    takeaway_words = set(t2.split())
    if not takeaway_words:
        return True

    overlap = len(title_words & takeaway_words) / max(1, len(takeaway_words))
    return overlap > 0.72


def get_distinct_takeaway(title: str, summary: str, source: str):
    topic = classify_topic(title, summary, source)
    takeaway = topic_takeaway(topic, title, summary, source)

    # Fallback if too close to title or too weak.
    if is_takeaway_too_similar(title, takeaway):
        fallback = {
            "defense_geopolitics": "AI competition is now affecting real-world security planning and response timelines.",
            "markets_business": "The winner will be the team that turns AI into reliable business execution, not just pilots.",
            "research_models": "Shipping and iteration speed now matter more than announcing another model milestone.",
            "policy_regulation": "Regulatory momentum is forcing AI teams to operationalize governance, not just discuss it.",
            "infrastructure_ops": "Infrastructure strategy is becoming the hidden moat in practical AI deployment.",
            "general": f"Quick take: {source} reports a high-signal AI development.",
        }
        takeaway = truncate(fallback.get(topic, fallback["general"]), MAX_TAKEAWAY_LEN)

    return takeaway, topic


def build_tweet_from_news(news, source: str):
    item = news[0]
    raw_title = item.get("title", "")
    title = raw_title
    link = resolve_final_url(item.get("url", ""))
    summary = item.get("summary", "")

    # Clean up title: remove source suffix if present (e.g. " - The Verge")
    if " - " in title:
        title = title.rsplit(" - ", 1)[0]

    if len(link) > 230:
        link = "https://ai-news-app-iota.vercel.app/"

    takeaway, topic = get_distinct_takeaway(title, summary, source)

    header = f"🤖 AI Update: {title}"
    tweet = f"{header}\n\nKey takeaway: {takeaway}\n\n🔗 {link} #AI #Tech"

    if len(tweet) > 280:
        allowed_takeaway_len = max(20, MAX_TAKEAWAY_LEN - (len(tweet) - 280))
        takeaway = truncate(takeaway, allowed_takeaway_len)
        tweet = f"{header}\n\nKey takeaway: {takeaway}\n\n🔗 {link} #AI #Tech"

    return tweet, {
        "title_norm": normalize_text(title),
        "raw_title_norm": normalize_text(raw_title),
        "link": link,
        "topic": topic,
        "source_summary": summary,
        "final_takeaway": takeaway,
    }


def _error_details(err: Exception) -> str:
    status = getattr(getattr(err, "response", None), "status_code", None)
    text = getattr(getattr(err, "response", None), "text", None)
    bits = []
    if status is not None:
        bits.append(f"status={status}")
    if text:
        bits.append(f"body={text[:700]}")
    return " | ".join(bits) if bits else str(err)


def create_tweet_with_retry(client: tweepy.Client, text: str, label: str, max_attempts: int = 3):
    for attempt in range(1, max_attempts + 1):
        try:
            return client.create_tweet(text=text)
        except (TooManyRequests, TwitterServerError, Forbidden) as e:
            details = _error_details(e)
            print(f"{label} attempt {attempt}/{max_attempts} failed: {details}")
            if attempt >= max_attempts:
                raise
            sleep_s = min(60, (2 ** attempt) * 3) + random.uniform(0.0, 1.5)
            print(f"Retrying in {sleep_s:.1f}s...")
            time.sleep(sleep_s)


def main():
    api_key = os.environ["X_API_KEY"]
    api_secret = os.environ["X_API_SECRET"]
    access_token = os.environ["X_ACCESS_TOKEN"]
    access_token_secret = os.environ["X_ACCESS_TOKEN_SECRET"]

    test_text = os.environ.get("X_TEST_TEXT", "").strip()
    preview_only = os.environ.get("X_PREVIEW_ONLY", "false").strip().lower() == "true"

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
        resp = create_tweet_with_retry(client, text=tweet_text, label="Test post")
        tweet_id = resp.data.get("id") if getattr(resp, "data", None) else None
        print("Posted to X successfully.")
        if tweet_id:
            print(f"Tweet ID: {tweet_id}")
        return

    news = read_top_news("./public/news.json")
    if len(news) < TOP_N:
        raise RuntimeError(f"Need at least {TOP_N} items in public/news.json, got {len(news)}")

    if preview_only:
        print("Preview mode enabled (no posting).")
        for i, item in enumerate(news[:3], start=1):
            preview_text, preview_meta = build_tweet_from_news([item], item.get("source", ""))
            print(f"\n=== PREVIEW {i} ===")
            print(f"topic: {preview_meta.get('topic', 'n/a')}")
            print(f"takeaway: {preview_meta.get('final_takeaway', '')}")
            print(preview_text)
        return

    tweet_text, meta = build_tweet_from_news(news, news[0].get("source", ""))
    top_headline_norm = meta.get("title_norm", "")
    top_raw_headline_norm = meta.get("raw_title_norm", "")
    top_link = meta.get("link", "")

    print("Debug:")
    print(f"- topic: {meta.get('topic', 'n/a')}")
    print(f"- source summary: {meta.get('source_summary', '')}")
    print(f"- final takeaway: {meta.get('final_takeaway', '')}")
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

                created_at = getattr(t, "created_at", None)
                if created_at is not None:
                    age_min = (now_utc - created_at).total_seconds() / 60.0
                    age_hours = age_min / 60.0

                    if age_min < COOLDOWN_MINUTES and (
                        txt.startswith("🤖 AI Update:")
                        or txt.startswith("AI update test")
                        or txt.startswith("Links:")
                    ):
                        print(f"Skip: cooldown active ({age_min:.0f} min < {COOLDOWN_MINUTES} min).")
                        return

                    if age_hours < HEADLINE_REPOST_WINDOW_HOURS:
                        recent_norm = normalize_text(txt)
                        same_clean_title = bool(top_headline_norm and top_headline_norm in recent_norm)
                        same_raw_title = bool(top_raw_headline_norm and top_raw_headline_norm in recent_norm)
                        same_link = bool(top_link and top_link in txt)
                        if same_clean_title or same_raw_title or same_link:
                            print(f"Skip: same story already posted within {HEADLINE_REPOST_WINDOW_HOURS}h.")
                            return
    except Exception as e:
        print(f"Duplicate/cooldown check skipped due to API read issue: {e}")

    try:
        resp = create_tweet_with_retry(client, text=tweet_text, label="Primary post")
        tweet_id = resp.data.get("id") if getattr(resp, "data", None) else None
        print("Posted to X successfully.")
        if tweet_id:
            print(f"Tweet ID: {tweet_id}")
    except Forbidden as e:
        fallback = f"AI update test {datetime.now(ZoneInfo('America/New_York')).strftime('%Y-%m-%d %H:%M:%S ET')}"
        print("Primary post forbidden after retries; trying fallback text...")
        print(f"Primary error details: {_error_details(e)}")
        print(f"Fallback preview: {fallback}")
        try:
            resp = create_tweet_with_retry(client, text=fallback, label="Fallback post")
            tweet_id = resp.data.get("id") if getattr(resp, "data", None) else None
            print("Posted fallback to X successfully.")
            if tweet_id:
                print(f"Tweet ID: {tweet_id}")
        except Forbidden:
            raise e


if __name__ == "__main__":
    main()
