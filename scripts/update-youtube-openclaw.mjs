import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import Parser from 'rss-parser'

const parser = new Parser({ timeout: 15000 })

const FEEDS = [
  {
    name: 'Google News: OpenClaw YouTube use cases',
    url: 'https://news.google.com/rss/search?q=openclaw+site:youtube.com+use+case&hl=en-US&gl=US&ceid=US:en',
    weight: 4,
  },
  {
    name: 'Google News: OpenClaw YouTube tutorial',
    url: 'https://news.google.com/rss/search?q=openclaw+site:youtube.com+tutorial&hl=en-US&gl=US&ceid=US:en',
    weight: 3,
  },
  {
    name: 'Google News: OpenClaw YouTube automation',
    url: 'https://news.google.com/rss/search?q=openclaw+site:youtube.com+automation&hl=en-US&gl=US&ceid=US:en',
    weight: 3,
  },
]

const MAX_ITEMS_PER_FEED = 20
const TOP_N = 10

function normalizeTitle(title = '') {
  return title
    .toLowerCase()
    .replace(/\s*[-|•·].*$/, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function scoreItem(item, feedWeight) {
  const published = new Date(item.isoDate || item.pubDate || Date.now())
  const ageHours = Math.max(0, (Date.now() - published.getTime()) / (1000 * 60 * 60))
  const recency = Math.max(0, 72 - ageHours) / 72
  const title = item.title || ''

  let relevance = 0
  if (/openclaw/i.test(title)) relevance += 1.2
  if (/use case|workflow|automation|tutorial|guide/i.test(title)) relevance += 0.8

  return feedWeight * 2 + recency * 3 + relevance
}

async function fetchFeed(feed) {
  try {
    const result = await parser.parseURL(feed.url)

    const items = (result.items || []).slice(0, MAX_ITEMS_PER_FEED).map((item) => ({
      source: feed.name,
      feedWeight: feed.weight,
      title: item.title?.trim() || '',
      url: item.link?.trim() || '',
      summary: (item.contentSnippet || item.content || item.summary || 'YouTube video').replace(/\s+/g, ' ').trim(),
      publishedAt: item.isoDate || item.pubDate || new Date().toISOString(),
      author: item.creator || item.author || '',
    }))

    return items.filter((item) => item.title && item.url)
  } catch (error) {
    console.warn(`Feed failed: ${feed.name} (${feed.url}) -> ${error.message}`)
    return []
  }
}

function dedupe(items) {
  const byUrl = new Set()
  const byTitle = new Set()
  const out = []

  for (const item of items) {
    const urlKey = item.url.replace(/&.*$/, '')
    const titleKey = normalizeTitle(item.title)

    if (!urlKey || !titleKey) continue
    if (byUrl.has(urlKey) || byTitle.has(titleKey)) continue

    byUrl.add(urlKey)
    byTitle.add(titleKey)
    out.push(item)
  }

  return out
}

function formatDate(dateLike) {
  const d = new Date(dateLike)
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10)
  return d.toISOString().slice(0, 10)
}

async function main() {
  const all = (await Promise.all(FEEDS.map(fetchFeed))).flat()

  const ranked = dedupe(
    all
      .map((item) => ({ ...item, score: scoreItem(item, item.feedWeight) }))
      .sort((a, b) => b.score - a.score)
  ).slice(0, TOP_N)

  const output = ranked.map((item, idx) => ({
    id: `${formatDate(item.publishedAt)}-${idx + 1}`,
    title: item.title,
    summary: item.author ? `${item.author} · ${item.summary}` : item.summary,
    url: item.url,
    date: formatDate(item.publishedAt),
    source: 'YouTube',
  }))

  const target = path.resolve(process.cwd(), 'public/news-youtube-openclaw.json')
  await fs.writeFile(target, `${JSON.stringify(output, null, 2)}\n`, 'utf8')

  console.log(`Updated ${target} with ${output.length} items.`)

  if (output.length === 0) {
    process.exit(1)
  }

  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
