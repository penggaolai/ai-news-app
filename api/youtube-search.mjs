import { web_search } from 'openclaw';

export default async function handler(request, response) {
  const { query } = request.query;

  if (!query) {
    return response.status(400).json({ error: 'Query parameter is required' });
  }

  try {
    const searchResults = await web_search({
      query: `${query} site:youtube.com`,
      count: 10, // Fetch more to filter for YouTube links
    });

    const videos = [];
    for (const result of searchResults.results) {
      if (videos.length >= 3) break; // Limit to top 3
      if (result.url && result.title && /youtube.com\/watch/i.test(result.url)) {
        videos.push({
          title: result.title,
          url: result.url,
          summary: result.description || "YouTube video",
          source: "YouTube Search",
          date: new Date().toISOString().slice(0, 10), // Current date for dynamic search
        });
      }
    }

    return response.status(200).json(videos);

  } catch (error) {
    console.error('Handler error:', error);
    return response.status(500).json({ error: error.message });
  }
}