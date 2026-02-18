import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

const TABS = [
  {
    key: 'ai',
    label: 'AI News',
    file: 'news.json',
    description: 'Curated headlines and insights from the fast-moving world of artificial intelligence.',
  },
  {
    key: 'antiques-cn',
    label: 'Chinese Antiques',
    file: 'news-antiques-cn.json',
    description: '中国古董、文物、考古与拍卖相关新闻精选。',
  },
  {
    key: 'youtube-openclaw',
    label: 'OpenClaw Video Explorer',
    file: 'news-youtube-openclaw.json',
    description: 'Top YouTube videos about OpenClaw use cases, tutorials, and automation (RSS live search).',
  },
]

async function fetchNews(file) {
  const response = await fetch(`./${file}?t=${Date.now()}`, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error('Failed to load news')
  }
  const data = await response.json()
  return Array.isArray(data) ? data : []
}

function toDateString(value) {
  const d = new Date(value || Date.now())
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10)
  return d.toISOString().slice(0, 10)
}

async function searchYoutubeViaRss(query) {
  const q = encodeURIComponent(`${query} site:youtube.com`)
  const rssUrl = encodeURIComponent(
    `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`
  )

  // Public RSS-to-JSON bridge (no key required). If this service rate-limits,
  // we can replace with your own backend endpoint later.
  const url = `https://api.rss2json.com/v1/api.json?rss_url=${rssUrl}&count=20`
  const response = await fetch(url, { cache: 'no-store' })

  if (!response.ok) {
    throw new Error('Failed to fetch search results')
  }

  const data = await response.json()
  const items = Array.isArray(data?.items) ? data.items : []

  const seen = new Set()
  const out = []

  for (const item of items) {
    const link = item.link || ''
    const title = item.title || ''
    if (!link || !title) continue

    // Keep youtube-oriented results only.
    if (!/youtube\.com|youtu\.be/i.test(link)) continue

    const key = link.replace(/\?.*$/, '')
    if (seen.has(key)) continue
    seen.add(key)

    out.push({
      id: item.guid || key,
      title,
      summary: (item.description || item.author || 'YouTube video').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
      url: link,
      date: toDateString(item.pubDate),
      source: 'YouTube',
    })

    if (out.length >= 10) break
  }

  return out
}

function App() {
  const [activeTab, setActiveTab] = useState('youtube-openclaw')
  const [interestInput, setInterestInput] = useState('OpenClaw use cases')
  const [searchQuery, setSearchQuery] = useState('OpenClaw use cases')
  const active = TABS.find((t) => t.key === activeTab) || TABS[0]

  const staticQuery = useQuery({
    queryKey: ['news', active.file],
    queryFn: () => fetchNews(active.file),
    enabled: active.key !== 'youtube-openclaw',
  })

  const youtubeQuery = useQuery({
    queryKey: ['youtube-search', searchQuery],
    queryFn: () => searchYoutubeViaRss(searchQuery),
    enabled: active.key === 'youtube-openclaw',
  })

  const isLoading = active.key === 'youtube-openclaw' ? youtubeQuery.isLoading : staticQuery.isLoading
  const isError = active.key === 'youtube-openclaw' ? youtubeQuery.isError : staticQuery.isError
  const news = active.key === 'youtube-openclaw' ? youtubeQuery.data || [] : staticQuery.data || []

  const onSearch = () => {
    const q = interestInput.trim()
    if (!q) return
    setSearchQuery(q)
  }

  const searchHint = useMemo(() => {
    if (active.key !== 'youtube-openclaw') return null
    return `Showing top 10 for: ${searchQuery}`
  }, [active.key, searchQuery])

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#050816] via-[#0a1230] to-[#03040f] text-white">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <header className="mb-10 flex flex-col items-start gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-4xl font-extrabold tracking-[0.2em] text-white drop-shadow-[0_0_18px_rgba(99,102,241,0.8)] sm:text-5xl">
              {active.label.toUpperCase()}
            </h1>
            <span className="text-xs uppercase tracking-[0.3em] text-indigo-200/80">
              {new Date().toLocaleString()}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {TABS.map((tab) => {
              const selected = tab.key === activeTab
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`rounded-full border px-4 py-2 text-sm transition ${
                    selected
                      ? 'border-indigo-300 bg-indigo-500/25 text-indigo-100'
                      : 'border-white/20 bg-white/5 text-gray-300 hover:border-white/40 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>

          <p className="max-w-2xl text-sm text-gray-300 sm:text-base">{active.description}</p>

          {active.key === 'youtube-openclaw' ? (
            <div className="w-full max-w-2xl">
              <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-indigo-200/80">
                Search interests (RSS)
              </label>
              <div className="flex gap-2">
                <input
                  value={interestInput}
                  onChange={(e) => setInterestInput(e.target.value)}
                  placeholder="e.g. OpenClaw use cases, workflow, automation"
                  className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-gray-400 focus:border-indigo-300"
                />
                <button
                  type="button"
                  onClick={onSearch}
                  className="rounded-xl border border-indigo-300/40 bg-indigo-500/25 px-4 py-3 text-sm text-indigo-100 hover:bg-indigo-500/35"
                >
                  Search
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-400">{searchHint}</p>
            </div>
          ) : null}
        </header>

        {isLoading ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-gray-300 backdrop-blur-md">
            Loading the latest headlines...
          </div>
        ) : isError ? (
          <div className="rounded-2xl border border-red-300/20 bg-red-500/10 p-8 text-center text-red-100 backdrop-blur-md">
            Failed to load headlines. Please refresh and try again.
          </div>
        ) : news.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-gray-300 backdrop-blur-md">
            No results found.
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {news.map((item) => (
              <article
                key={item.id ?? `${item.title}-${item.date}`}
                className="flex h-full flex-col justify-between rounded-2xl border border-white/15 bg-white/10 p-6 shadow-[0_10px_40px_rgba(15,23,42,0.45)] backdrop-blur-xl transition hover:-translate-y-1 hover:border-white/30"
              >
                <div className="space-y-3">
                  <h2 className="text-lg font-bold text-white">{item.title}</h2>
                  <p className="text-sm text-gray-300">{item.summary}</p>
                </div>
                <div className="mt-6 flex items-center justify-between text-xs uppercase tracking-wide text-gray-400">
                  <span>{item.date}</span>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-300 transition hover:text-indigo-100"
                  >
                    Read More
                  </a>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default App
