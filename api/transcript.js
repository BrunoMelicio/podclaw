// api/transcript.js
// Fetches YouTube captions via youtubei.js (handles bot detection with Android client)
// No audio download, no third-party transcript APIs, no extra API keys

import { Innertube } from 'youtubei.js';

let yt = null;

async function getClient() {
  if (!yt) {
    yt = await Innertube.create({
      lang: 'en',
      location: 'US',
    });
  }
  return yt;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const input = req.query.url || req.query.v || '';
  const videoId = extractVideoId(input);

  if (!videoId) {
    return res.status(400).json({ error: 'Invalid YouTube URL or video ID.' });
  }

  try {
    console.log(`[transcript] Fetching captions for: ${videoId}`);

    const innertube = await getClient();
    const info = await innertube.getInfo(videoId);

    // Extract caption tracks from the player response
    const captionTracks =
      info.captions?.playerCaptionsTracklistRenderer?.captionTracks;

    if (!captionTracks || captionTracks.length === 0) {
      throw new Error(
        'No captions available for this video. Try a popular podcast — most have auto-generated captions.'
      );
    }

    // Prefer manual English, then auto-generated English, then first available
    const track =
      captionTracks.find((t) => t.languageCode === 'en' && t.kind !== 'asr') ||
      captionTracks.find((t) => t.languageCode.startsWith('en')) ||
      captionTracks[0];

    console.log(
      `[transcript] Caption track: ${track.name?.simpleText || track.languageCode}`
    );

    // Fetch the captions in JSON3 format
    const captionUrl = track.baseUrl + '&fmt=json3';
    const captionRes = await fetch(captionUrl);

    if (!captionRes.ok) {
      throw new Error(`Failed to fetch captions (HTTP ${captionRes.status})`);
    }

    const captionData = await captionRes.json();
    const events = captionData?.events || [];

    // Parse into timestamped transcript
    const lines = [];
    for (const event of events) {
      if (!event.segs) continue;

      const startMs = event.tStartMs || 0;
      const startSec = Math.floor(startMs / 1000);
      const mins = Math.floor(startSec / 60);
      const secs = startSec % 60;
      const timestamp = `${mins}:${secs.toString().padStart(2, '0')}`;

      const text = event.segs
        .map((s) => s.utf8 || '')
        .join('')
        .replace(/\n/g, ' ')
        .trim();

      if (text && text.length > 0) {
        lines.push(`[${timestamp}] ${text}`);
      }
    }

    const transcript = lines.join('\n');

    if (transcript.length < 50) {
      throw new Error('Transcript is empty or too short.');
    }

    const title = info.basic_info?.title || 'Unknown';
    const duration = info.basic_info?.duration || 0;

    console.log(`[transcript] Done! ${transcript.split(/\s+/).length} words`);

    return res.status(200).json({
      videoId,
      title,
      duration,
      youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
      transcript,
      wordCount: transcript.split(/\s+/).length,
    });
  } catch (err) {
    console.error('[transcript] Error:', err.message);

    // Reset client on auth/bot errors so next request gets a fresh session
    if (
      err.message?.includes('Sign in') ||
      err.message?.includes('bot') ||
      err.message?.includes('429')
    ) {
      yt = null;
    }

    return res.status(500).json({
      error: err.message || 'Failed to fetch transcript.',
    });
  }
}

function extractVideoId(input) {
  if (!input) return null;
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.hostname.includes('youtu.be'))
      return url.pathname.slice(1).split('/')[0];
    if (url.hostname.includes('youtube.com'))
      return url.searchParams.get('v');
  } catch {
    // not a URL
  }
  const match = trimmed.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}
