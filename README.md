# AI News App

A lightweight AI-news pipeline + web app that:

1. Pulls AI headlines from RSS feeds
2. Ranks + deduplicates them
3. Writes curated results to `public/news.json`
4. Can post a short daily summary to X via GitHub Actions

---

## What it does

- **News ingestion:** fetches from multiple AI-related RSS sources
- **Curation:** scores by recency/source weight, removes duplicates
- **Output:** saves top stories to `public/news.json`
- **Automation:** GitHub Actions runs on schedule and on manual trigger
- **Social posting:** optional X posting using Tweepy user-context auth

---

## Core scripts

### `scripts/update-news.mjs`
- Fetches RSS feeds
- Normalizes, scores, deduplicates
- Writes top items to `public/news.json`

Run locally:

```bash
npm ci
node scripts/update-news.mjs
```

### `scripts/post-to-x.py`
- Reads top stories from `public/news.json`
- Builds a compact “AI morning brief” tweet
- Posts to X via Tweepy (`Client.create_tweet`)
- Supports optional test override via `X_TEST_TEXT`

Run locally:

```bash
pip install tweepy
export X_API_KEY=...
export X_API_SECRET=...
export X_ACCESS_TOKEN=...
export X_ACCESS_TOKEN_SECRET=...
python scripts/post-to-x.py
```

---

## GitHub Actions workflow

### `.github/workflows/daily-ai-news-x.yml`
This workflow can:

1. Gate execution to 07:05 America/New_York (or bypass via `force_run=true`)
2. Refresh `public/news.json`
3. Commit/push updated `news.json` when changed
4. Post to X using `scripts/post-to-x.py`

Manual test trigger (`workflow_dispatch`) supports:
- `force_run`: set `true` to bypass time gate
- `test_text`: optional exact text for posting diagnostics

---

## Required GitHub Secrets

Set these in repo settings:

- `X_API_KEY`
- `X_API_SECRET`
- `X_ACCESS_TOKEN`
- `X_ACCESS_TOKEN_SECRET`

> Security note: if credentials are ever exposed, rotate all 4 immediately.

---

## Data format

`public/news.json` entries look like:

```json
{
  "id": "2026-02-16-1",
  "title": "...",
  "summary": "...",
  "url": "https://...",
  "date": "2026-02-16",
  "source": "Google News (AI)"
}
```

---

## Troubleshooting

- **X post 403 Forbidden:** often account/app/content restrictions.
- Verify auth with a minimal post first.
- Try manual `test_text` run to isolate formatting/content issues.
- Ensure account has required write access and tokens are current.

---

## Stack

- React + Vite (frontend)
- Node.js script for RSS ingestion
- Python + Tweepy for X posting
- GitHub Actions for scheduling/automation
