// /api/transcript.js
// Fetches YouTube transcript using Supadata API
// Supadata handles YouTube's cloud-IP blocking for us
// Free tier: 100 requests/month — https://supadata.ai

/**
 * Extract YouTube video ID from various URL formats
 */
function extractVideoId(input) {
  if (!input) return null;

  // Already a plain video ID (11 chars, alphanumeric + dash/underscore)
  if (/^[a-zA-Z0-9_-]{11}$/.test(input.trim())) {
    return input.trim();
  }

  try {
    const url = new URL(input);

    // youtube.com/watch?v=VIDEO_ID
    if (url.hostname.includes('youtube.com') && url.searchParams.has('v')) {
      return url.searchParams.get('v');
    }

    // youtu.be/VIDEO_ID
    if (url.hostname === 'youtu.be') {
      return url.pathname.slice(1).split('/')[0];
    }

    // youtube.com/embed/VIDEO_ID
    if (url.pathname.startsWith('/embed/')) {
      return url.pathname.split('/')[2];
    }

    // youtube.com/shorts/VIDEO_ID
    if (url.pathname.startsWith('/shorts/')) {
      return url.pathname.split('/')[2];
    }
  } catch (e) {
    // Not a valid URL
  }

  return null;
}

/**
 * Convert milliseconds to human-readable timestamp (H:MM:SS or M:SS)
 */
function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Missing "url" query parameter.' });
  }

  // Check for Supadata API key
  const supadataKey = process.env.SUPADATA_API_KEY;
  if (!supadataKey) {
    return res.status(500).json({
      error: 'SUPADATA_API_KEY not configured. Get a free key at https://supadata.ai and add it to Vercel environment variables.'
    });
  }

  const videoId = extractVideoId(url);
  if (!videoId) {
    return res.status(400).json({ error: 'Could not extract a YouTube video ID from the provided URL.' });
  }

  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    // ── Fetch transcript segments from Supadata ──
    const apiUrl = `https://api.supadata.ai/v1/youtube/transcript?url=${encodeURIComponent(youtubeUrl)}&text=false`;

    const response = await fetch(apiUrl, {
      headers: { 'x-api-key': supadataKey }
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('Supadata error:', response.status, errBody);

      if (response.status === 404) {
        return res.status(404).json({
          error: 'No transcript available for this video. It may not have captions.'
        });
      }
      if (response.status === 401 || response.status === 403) {
        return res.status(401).json({
          error: 'Invalid Supadata API key. Check your SUPADATA_API_KEY environment variable.'
        });
      }
      if (response.status === 429) {
        return res.status(429).json({
          error: 'Supadata rate limit reached. Free tier allows 100 requests/month.'
        });
      }

      throw new Error(`Supadata API returned ${response.status}: ${errBody}`);
    }

    const data = await response.json();

    // data.content is an array of { text, offset, duration, lang }
    const segments = data.content;

    if (!segments || segments.length === 0) {
      return res.status(404).json({
        error: 'Transcript returned empty. The video may not have captions enabled.'
      });
    }

    // Build timestamped segments
    const transcriptSegments = segments.map(seg => ({
      text: seg.text,
      start: seg.offset / 1000,          // ms → seconds
      duration: seg.duration / 1000,
      timestamp: formatTime(seg.offset)
    }));

    // Build plain text with timestamps (for sending to Gemini)
    const plainText = transcriptSegments
      .map(seg => `[${seg.timestamp}] ${seg.text}`)
      .join('\n');

    // Calculate total duration
    const lastSeg = segments[segments.length - 1];
    const totalMs = lastSeg.offset + lastSeg.duration;
    const totalDuration = formatTime(totalMs);

    return res.status(200).json({
      videoId,
      youtubeUrl,
      language: data.lang || 'en',
      totalDuration,
      totalSegments: segments.length,
      totalCharacters: plainText.length,
      transcript: plainText,
      segments: transcriptSegments
    });

  } catch (error) {
    console.error('Transcript fetch error:', error);

    return res.status(500).json({
      error: 'Failed to fetch transcript. The video may be private, age-restricted, or have no captions.',
      details: error.message
    });
  }
}
