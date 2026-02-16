import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import process from 'node:process'

const X_POST_URL = 'https://api.x.com/2/tweets'
const TOP_N = 3

function mustEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env: ${name}`)
  return value
}

function pctEncode(str) {
  return encodeURIComponent(str)
    .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}

function nonce(size = 16) {
  return crypto.randomBytes(size).toString('hex')
}

function hmacSha1Base64(key, data) {
  return crypto.createHmac('sha1', key).update(data).digest('base64')
}

function buildOAuthHeader({ method, url, consumerKey, consumerSecret, token, tokenSecret }) {
  const oauth = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce(),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: token,
    oauth_version: '1.0',
  }

  const sortedPairs = Object.entries(oauth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${pctEncode(k)}=${pctEncode(v)}`)
    .join('&')

  const baseString = [method.toUpperCase(), pctEncode(url), pctEncode(sortedPairs)].join('&')
  const signingKey = `${pctEncode(consumerSecret)}&${pctEncode(tokenSecret)}`
  oauth.oauth_signature = hmacSha1Base64(signingKey, baseString)

  const header = 'OAuth ' + Object.entries(oauth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${pctEncode(k)}="${pctEncode(v)}"`)
    .join(', ')

  return header
}

function truncate(text, max) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  if (max <= 1) return '…'
  return `${clean.slice(0, max - 1).trim()}…`
}

function readDateNY() {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: '2-digit',
  })
  return fmt.format(new Date())
}

function readTimeNY() {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  return fmt.format(new Date())
}

function buildTweet(items) {
  const dateLabel = readDateNY()
  const timeLabel = readTimeNY()
  const lines = [`🧠 Top 3 AI headlines (${dateLabel} ${timeLabel} ET)`]

  const maxTotal = 280
  const staticOverhead = lines[0].length + 1 + 10 // + hashtags
  const perLineOverhead = 3 + 4 // "1) " + " (S)"
  const remainingForTitles = Math.max(45, maxTotal - staticOverhead - TOP_N * perLineOverhead)
  const perTitle = Math.max(36, Math.floor(remainingForTitles / TOP_N))

  items.slice(0, TOP_N).forEach((item, idx) => {
    const title = truncate(item.title, perTitle)
    const sourceTag = truncate(item.source || 'AI', 10)
    lines.push(`${idx + 1}) ${title} (${sourceTag})`)
  })

  lines.push('#AI #TechNews')

  let text = lines.join('\n')
  if (text.length > maxTotal) {
    text = truncate(text, maxTotal)
  }

  return text
}

async function loadTopNews() {
  const file = path.resolve(process.cwd(), 'public/news.json')
  const raw = await fs.readFile(file, 'utf8')
  const parsed = JSON.parse(raw)

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('public/news.json is empty or invalid.')
  }

  return parsed
    .filter((x) => x?.title && x?.url)
    .slice(0, TOP_N)
}

async function postTweet(text) {
  const consumerKey = mustEnv('X_API_KEY')
  const consumerSecret = mustEnv('X_API_SECRET')
  const accessToken = mustEnv('X_ACCESS_TOKEN')
  const accessTokenSecret = mustEnv('X_ACCESS_TOKEN_SECRET')

  const authHeader = buildOAuthHeader({
    method: 'POST',
    url: X_POST_URL,
    consumerKey,
    consumerSecret,
    token: accessToken,
    tokenSecret: accessTokenSecret,
  })

  const resp = await fetch(X_POST_URL, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  })

  const bodyText = await resp.text()
  if (!resp.ok) {
    throw new Error(`X API error (${resp.status}): ${bodyText}`)
  }

  return bodyText
}

async function main() {
  const manualText = (process.env.X_TEST_TEXT || '').trim()
  let text

  if (manualText) {
    text = truncate(manualText, 280)
    console.log('Using X_TEST_TEXT override.')
  } else {
    const items = await loadTopNews()
    if (items.length < TOP_N) {
      throw new Error(`Need at least ${TOP_N} items in public/news.json, got ${items.length}`)
    }
    text = buildTweet(items)
  }

  if (process.env.DRY_RUN === '1') {
    console.log('DRY_RUN=1 (no post sent)')
    console.log(text)
    return
  }

  const result = await postTweet(text)
  console.log('Posted to X successfully.')
  console.log(result)
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
