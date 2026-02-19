// /api/transcript.js
// Fetches YouTube transcript given a video ID or URL
// No API key required — uses YouTube's built-in captions

import { YoutubeTranscript } from 'youtube-transcript';

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
 * Convert seconds to human-readable timestamp (H:MM:SS or M:SS)
 */
function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

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
    return res.status(400).json({ error: 'Missing "url" query parameter. Provide a YouTube URL or video ID.' });
  }

  const videoId = extractVideoId(url);

  if (!videoId) {
    return res.status(400).json({ error: 'Could not extract video ID from the provided URL.' });
  }

  try {
    // Fetch transcript segments from YouTube
    const segments = await YoutubeTranscript.fetchTranscript(videoId);

    if (!segments || segments.length === 0) {
      return res.status(404).json({
        error: 'No transcript available for this video. The video may not have captions enabled.'
      });
    }

    // Build full transcript text with timestamps
    const transcriptWithTimestamps = segments.map(seg => ({
      text: seg.text,
      start: seg.offset / 1000, // convert ms to seconds
      duration: seg.duration / 1000,
      timestamp: formatTime(seg.offset / 1000)
    }));

    // Build plain text version (for sending to LLM)
    const plainText = transcriptWithTimestamps
      .map(seg => `[${seg.timestamp}] ${seg.text}`)
      .join('\n');

    // Calculate total duration
    const lastSeg = transcriptWithTimestamps[transcriptWithTimestamps.length - 1];
    const totalSeconds = Math.ceil(lastSeg.start + lastSeg.duration);
    const totalDuration = formatTime(totalSeconds);

    return res.status(200).json({
      videoId,
      youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
      totalDuration,
      totalSegments: segments.length,
      totalCharacters: plainText.length,
      transcript: plainText,
      segments: transcriptWithTimestamps
    });

  } catch (error) {
    console.error('Transcript fetch error:', error);

    if (error.message?.includes('disabled')) {
      return res.status(404).json({
        error: 'Transcripts are disabled for this video.'
      });
    }

    return res.status(500).json({
      error: 'Failed to fetch transcript. The video may be private, age-restricted, or have no captions.',
      details: error.message
    });
  }
}
