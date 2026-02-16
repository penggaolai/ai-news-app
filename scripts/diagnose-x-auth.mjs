import crypto from 'node:crypto'
import process from 'node:process'

const ME_URL = 'https://api.x.com/2/users/me'
const LEGACY_VERIFY_URL = 'https://api.x.com/1.1/account/verify_credentials.json'

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

  return 'OAuth ' + Object.entries(oauth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${pctEncode(k)}="${pctEncode(v)}"`)
    .join(', ')
}

function mask(v) {
  if (!v) return '<empty>'
  if (v.length <= 8) return `${v[0] ?? ''}***(${v.length})`
  return `${v.slice(0, 4)}...${v.slice(-4)} (${v.length})`
}

async function probeGet(url, label, authHeader) {
  const resp = await fetch(url, { headers: { Authorization: authHeader } })
  const text = await resp.text()
  console.log(`\n[${label}] status=${resp.status}`)
  console.log(text.slice(0, 500))
  return resp.ok
}

async function main() {
  const consumerKey = mustEnv('X_API_KEY')
  const consumerSecret = mustEnv('X_API_SECRET')
  const accessToken = mustEnv('X_ACCESS_TOKEN')
  const accessTokenSecret = mustEnv('X_ACCESS_TOKEN_SECRET')

  console.log('Loaded credential fingerprints:')
  console.log(`- X_API_KEY: ${mask(consumerKey)}`)
  console.log(`- X_API_SECRET: ${mask(consumerSecret)}`)
  console.log(`- X_ACCESS_TOKEN: ${mask(accessToken)}`)
  console.log(`- X_ACCESS_TOKEN_SECRET: ${mask(accessTokenSecret)}`)

  const authV2 = buildOAuthHeader({
    method: 'GET',
    url: ME_URL,
    consumerKey,
    consumerSecret,
    token: accessToken,
    tokenSecret: accessTokenSecret,
  })

  const authV1 = buildOAuthHeader({
    method: 'GET',
    url: LEGACY_VERIFY_URL,
    consumerKey,
    consumerSecret,
    token: accessToken,
    tokenSecret: accessTokenSecret,
  })

  const okV1 = await probeGet(LEGACY_VERIFY_URL, 'OAuth1 verify_credentials', authV1)
  const okV2 = await probeGet(ME_URL, 'v2 users/me', authV2)

  if (!okV1 && !okV2) {
    throw new Error('Auth diagnostic failed on both probes. Likely bad/mismatched credentials or app permissions.')
  }

  console.log('\nAuth diagnostic passed at least one probe.')
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
