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
      console.error('Exec error from OpenClaw:', execResult.error);
      console.error('Exec output (if any):', execResult.output);
      return response.status(500).json({ error: execResult.error || 'Unknown exec error' });
    }

    const output = execResult.output;
    console.log('Raw exec output:', output);
    try {
      const parsedOutput = JSON.parse(output);
      return response.status(200).json(parsedOutput);
    } catch (parseError) {
      console.error('Failed to parse JSON output from script:', parseError);
      console.error('Offending output:', output);
      return response.status(500).json({ error: 'Failed to parse script output', details: parseError.message });
    }

  } catch (error) {
    console.error('Handler error:', error);
    return response.status(500).json({ error: error.message });
  }
}