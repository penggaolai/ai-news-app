import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import Parser from 'rss-parser'

const parser = new Parser({ timeout: 15000 })

const FEEDS = [
  { name: 'Google News (AI)', url: 'https://news.google.com/rss/search?q=artificial+intelligence&hl=en-US&gl=US&ceid=US:en', weight: 1 },
  { name: 'TechCrunch AI', url: 'https://techcrunch.com/tag/artificial-intelligence/feed/', weight: 3 },
  { name: 'The Verge AI', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', weight: 3 },
  { name: 'VentureBeat AI', url: 'https://venturebeat.com/category/ai/feed/', weight: 3 },
  { name: 'OpenAI News', url: 'https://openai.com/news/rss.xml', weight: 4 },
  { name: 'Google DeepMind Blog', url: 'https://deepmind.google/blog/rss.xml', weight: 4 },
  { name: 'Google AI Blog', url: 'https://blog.google/technology/ai/rss/', weight: 4 },
  { name: 'MIT Technology Review AI', url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed/', weight: 3 },
  { name: 'Ars Technica AI', url: 'https://feeds.arstechnica.com/arstechnica/technology-lab', weight: 2 },
]

const MAX_ITEMS_PER_FEED = 20
const TOP_N = 10
const MAX_PER_SOURCE = 2
const FINANCE_NOISE_PATTERNS = [
  /\bstock(s)?\b/i,
  /\bnasdaq\b/i,
  /\byahoo finance\b/i,
  /\bbuy\b/i,
  /\bmillionaire\b/i,
  /\bwall street\b/i,
  /\bprice target\b/i,
]

function normalizeTitle(title = '') {
  return title
    .toLowerCase()
    .replace(/\s*[-|•·].*$/, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripHtml(text = '') {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function short(text = '', max = 220) {
  const clean = stripHtml(text)
  if (clean.length <= max) return clean
  return `${clean.slice(0, max - 1).trim()}…`
}

function scoreItem(item, feedWeight) {
  const published = new Date(item.isoDate || item.pubDate || Date.now())
  const ageHours = Math.max(0, (Date.now() - published.getTime()) / (1000 * 60 * 60))

  // Recency bonus (newer is better), source weight and title quality
  const recency = Math.max(0, 48 - ageHours) / 48
  const titleQuality = Math.min((item.title || '').length / 80, 1)

  const title = item.title || ''
  const financePenalty = FINANCE_NOISE_PATTERNS.some((re) => re.test(title)) ? 2.2 : 0
  const policyResearchBonus = /\b(research|policy|model|release|launch|safety|benchmark|open source)\b/i.test(title) ? 0.8 : 0

  return feedWeight * 2 + recency * 3 + titleQuality + policyResearchBonus - financePenalty
}

async function fetchFeed(feed) {
  try {
    const result = await parser.parseURL(feed.url)
    const items = (result.items || []).slice(0, MAX_ITEMS_PER_FEED).map((item) => ({
      source: feed.name,
      feedWeight: feed.weight,
      title: item.title?.trim() || '',
      url: item.link?.trim() || '',
      summary: short(item.contentSnippet || item.content || item.summary || ''),
      publishedAt: item.isoDate || item.pubDate || new Date().toISOString(),
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
    const urlKey = item.url.replace(/\?.*$/, '')
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

function applySourceDiversity(items) {
  const sourceCounts = new Map()
  const out = []

  for (const item of items) {
    const n = sourceCounts.get(item.source) || 0
    if (n >= MAX_PER_SOURCE) continue
    out.push(item)
    sourceCounts.set(item.source, n + 1)
    if (out.length >= TOP_N) break
  }

  return out
}

async function main() {
  const all = (await Promise.all(FEEDS.map(fetchFeed))).flat()

  const scored = dedupe(
    all
      .map((item) => ({ ...item, score: scoreItem(item, item.feedWeight) }))
      .sort((a, b) => b.score - a.score)
  )

  const ranked = applySourceDiversity(scored)

  const output = ranked.map((item, idx) => ({
    id: `${formatDate(item.publishedAt)}-${idx + 1}`,
    title: item.title,
    summary: item.summary || `${item.source} update`,
    url: item.url,
    date: formatDate(item.publishedAt),
    source: item.source,
  }))

  const target = path.resolve(process.cwd(), 'public/news.json')
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
