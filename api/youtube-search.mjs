import { exec } from 'openclaw';

export default async function handler(request, response) {
  const { query } = request.query;

  if (!query) {
    return response.status(400).json({ error: 'Query parameter is required' });
  }

  try {
    const command = `node scripts/youtube-search.mjs "${query}"`;
    const execResult = await exec({
      command: command,
      workdir: '/data/.openclaw/workspace/ai-news-app', // Ensure it runs in the correct directory
      timeout: 30000, // 30 seconds timeout
    });

    if (execResult.status === 'error') {
      console.error('Exec error:', execResult.error);
      return response.status(500).json({ error: execResult.error });
    }

    const output = execResult.output;
    const parsedOutput = JSON.parse(output);
    return response.status(200).json(parsedOutput);

  } catch (error) {
    console.error('Handler error:', error);
    return response.status(500).json({ error: error.message });
  }
}