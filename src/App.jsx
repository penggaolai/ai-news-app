import { useEffect, useState } from 'react'

function App() {
  const [news, setNews] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    const loadNews = async ({ silent = false } = {}) => {
      if (!silent && isMounted) {
        setIsLoading(true)
      }

      try {
        const response = await fetch(`./news.json?t=${Date.now()}`, { cache: 'no-store' })
        if (!response.ok) {
          throw new Error('Failed to load news')
        }
        const data = await response.json()
        if (isMounted) {
          setNews(Array.isArray(data) ? data : [])
        }
      } catch (error) {
        if (isMounted) {
          setNews([])
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    const refreshOnFocus = () => {
      if (document.visibilityState === 'visible') {
        loadNews({ silent: true })
      }
    }

    loadNews()
    window.addEventListener('focus', refreshOnFocus)
    document.addEventListener('visibilitychange', refreshOnFocus)

    return () => {
      isMounted = false
      window.removeEventListener('focus', refreshOnFocus)
      document.removeEventListener('visibilitychange', refreshOnFocus)
    }
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#050816] via-[#0a1230] to-[#03040f] text-white">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <header className="mb-10 flex flex-col items-start gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-4xl font-extrabold tracking-[0.35em] text-white drop-shadow-[0_0_18px_rgba(99,102,241,0.8)] sm:text-5xl">
              AI NEWS
            </h1>
            <span className="text-xs uppercase tracking-[0.3em] text-indigo-200/80">
              {new Date().toLocaleString()}
            </span>
          </div>
          <p className="max-w-2xl text-sm text-gray-300 sm:text-base">
            Curated headlines and insights from the fast-moving world of artificial intelligence.
          </p>
        </header>

        {isLoading ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-gray-300 backdrop-blur-md">
            Loading the latest headlines...
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
