import { web_search } from 'openclaw';

export default async function handler(request, response) {
  console.log('[DEBUG] youtube-search handler invoked.');
  const { query } = request.query;

  if (!query) {
    console.log('[DEBUG] Query parameter missing.');
    return response.status(400).json({ error: 'Query parameter is required' });
  }

  try {
    console.log(`[DEBUG] Calling web_search with query: "${query} site:youtube.com"`);
    const searchResults = await web_search({
      query: `${query} site:youtube.com`,
      count: 10, // Fetch more to filter for YouTube links
    });
    console.log('[DEBUG] web_search completed. Raw results:', JSON.stringify(searchResults, null, 2));

    const videos = [];
    if (searchResults && searchResults.results) { // Check if searchResults and results array exist
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
    } else {
      console.warn('[DEBUG] web_search results or results array missing/empty.');
    }
    console.log('[DEBUG] Processed videos:', JSON.stringify(videos, null, 2));

    return response.status(200).json(videos);

  } catch (error) {
    console.error('[DEBUG] Handler error during web_search or processing:', error.message, error.stack);
    return response.status(500).json({ error: error.message, stack: error.stack }); // Return stack for more info
  }
}