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
    description: 'Top YouTube videos about OpenClaw use cases, tutorials, and automation (feed-based).',
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

function App() {
  const [activeTab, setActiveTab] = useState('youtube-openclaw')
  const [interestInput, setInterestInput] = useState('OpenClaw use cases')
  const active = TABS.find((t) => t.key === activeTab) || TABS[0]

  const {
    data: news = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['news', active.file],
    queryFn: () => fetchNews(active.file),
  })

  const filteredNews = useMemo(() => {
    const q = interestInput.trim().toLowerCase()
    if (!q) return news

    const rawTerms = q
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)

    if (rawTerms.length === 0) return news

    const synonymMap = {
      workflow: ['workflows', 'automation', 'pipeline', 'process', 'agent workflow'],
      workflows: ['workflow', 'automation', 'pipeline', 'process'],
      usecase: ['use case', 'use-case', 'case study', 'example'],
      'use case': ['usecase', 'use-case', 'case study', 'example'],
      tutorial: ['guide', 'walkthrough', 'how to'],
      openclaw: ['open claw', 'openclaw ai', 'agent'],
      automation: ['workflow', 'automate', 'pipeline'],
    }

    const normalize = (s) => s.replace(/\s+/g, ' ').trim()

    const expandedTerms = rawTerms.flatMap((term) => {
      const key = normalize(term)
      const aliases = synonymMap[key] || []
      const stem = key.endsWith('s') ? key.slice(0, -1) : key
      return [...new Set([key, ...aliases, stem])]
    })

    const matched = news.filter((item) => {
      const hay = `${item.title || ''} ${item.summary || ''}`.toLowerCase()
      return expandedTerms.some((term) => term && hay.includes(term))
    })

    // If strict filtering returns nothing, fall back to full list so UX is never blank.
    return matched.length > 0 ? matched : news
  }, [news, interestInput])

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

          <div className="w-full max-w-2xl">
            <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-indigo-200/80">
              Interests (comma-separated)
            </label>
            <input
              value={interestInput}
              onChange={(e) => setInterestInput(e.target.value)}
              placeholder="e.g. OpenClaw use cases, workflow, automation"
              className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-gray-400 focus:border-indigo-300"
            />
            <p className="mt-2 text-xs text-gray-400">
              Feed-based filtering over the latest fetched videos. Like counts require YouTube Data API.
            </p>
          </div>
        </header>

        {isLoading ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-gray-300 backdrop-blur-md">
            Loading the latest headlines...
          </div>
        ) : isError ? (
          <div className="rounded-2xl border border-red-300/20 bg-red-500/10 p-8 text-center text-red-100 backdrop-blur-md">
            Failed to load headlines. Please refresh and try again.
          </div>
        ) : (
          filteredNews.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-gray-300 backdrop-blur-md">
            No matches for your interests yet. Try broader keywords.
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredNews.map((item) => (
              <article
                key={item.id ?? `${item.title}-${item.date}`}
                className="flex h-full flex-col justify-between rounded-2xl border border-white/15 bg-white/10 p-6 shadow-[0_10px_40px_rgba(15,23,42,0.45)] backdrop-blur-xl transition hover:-translate-y-1 hover:border-white/30"
              >
                <div className="space-y-3">
                  <h2 className="text-lg font-bold text-white">{item.title}</h2>
                  <p className="text-sm text-gray-300">{item.summary}</p>

                  <div className="flex flex-wrap gap-2 pt-1 text-[11px] uppercase tracking-wide text-gray-300">
                    {item.channel ? (
                      <span className="rounded-full border border-white/20 bg-white/5 px-2 py-1">Channel: {item.channel}</span>
                    ) : null}
                    <span className="rounded-full border border-white/20 bg-white/5 px-2 py-1">Source: {item.source || 'Unknown'}</span>
                    <span className="rounded-full border border-white/20 bg-white/5 px-2 py-1">
                      Likes: {typeof item.likes === 'number' ? item.likes : 'N/A'}
                    </span>
                  </div>
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
        )
        )}
      </div>
    </div>
  )
}

export default App
