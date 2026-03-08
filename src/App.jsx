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
    key: 'youtube-openclaw',
    label: 'OpenClaw Video Search',
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


function App() {
  const [activeTab, setActiveTab] = useState('ai')
  // Removed: const [interestInput, setInterestInput] = useState('OpenClaw use cases')
  // Removed: const [searchQuery, setSearchQuery] = useState('OpenClaw use cases')
  const active = TABS.find((t) => t.key === activeTab) || TABS[0]

  const { data: rawNews = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['news', active.file],
    queryFn: () => fetchNews(active.file),
    enabled: active.key !== 'youtube-openclaw',
    staleTime: 0,
    refetchOnWindowFocus: true,
  })

  const youtubeQuery = useQuery({
    queryKey: ['youtube-search', active.file],
    queryFn: () => fetchNews(active.file),
    enabled: active.key === 'youtube-openclaw',
  })

  // Normalize data access
  const activeNews = active.key === 'youtube-openclaw' ? youtubeQuery.data || [] : rawNews
  const loading = active.key === 'youtube-openclaw' ? youtubeQuery.isLoading : isLoading
  const error = active.key === 'youtube-openclaw' ? youtubeQuery.isError : isError

  // Sort by date descending (newest first) for all tabs
  const news = useMemo(() => {
    return (activeNews || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [activeNews])

  // Removed: const onSearch = () => { ... }

  // Removed: const searchHint = useMemo(() => { ... })

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

          {/* Removed search input for youtube-openclaw tab */}
        </header>

        {loading ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-gray-300 backdrop-blur-md">
            Loading the latest headlines...
          </div>
        ) : error ? (
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