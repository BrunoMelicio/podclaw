// api/transcript.js
// Fetches YouTube auto-generated captions via YouTube's InnerTube API
// No audio download, no third-party APIs, no extra API keys needed

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
    // Step 1: Call YouTube's InnerTube player endpoint to get caption tracks
    console.log(`[transcript] Fetching captions for: ${videoId}`);

    const playerRes = await fetch(
      'https://www.youtube.com/youtubei/v1/player?prettyPrint=false',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        body: JSON.stringify({
          videoId,
          context: {
            client: {
              clientName: 'WEB',
              clientVersion: '2.20241126.01.00',
              hl: 'en',
              gl: 'US',
            },
          },
        }),
      }
    );

    if (!playerRes.ok) {
      throw new Error(`YouTube player API returned ${playerRes.status}`);
    }

    const playerData = await playerRes.json();

    // Check for playability issues
    const status = playerData?.playabilityStatus;
    if (status?.status !== 'OK') {
      const reason = status?.reason || status?.messages?.[0] || status?.status || 'Video unavailable';
      throw new Error(reason);
    }

    // Extract caption tracks
    const captionTracks =
      playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

    if (!captionTracks || captionTracks.length === 0) {
      throw new Error(
        'No captions available for this video. Try a different podcast — most popular ones have auto-generated captions.'
      );
    }

    // Prefer manual English captions, then auto-generated English, then first available
    const track =
      captionTracks.find((t) => t.languageCode === 'en' && t.kind !== 'asr') ||
      captionTracks.find((t) => t.languageCode === 'en') ||
      captionTracks[0];

    console.log(`[transcript] Using caption track: ${track.name?.simpleText || track.languageCode} (kind: ${track.kind || 'manual'})`);

    // Step 2: Fetch the captions in JSON3 format
    const captionUrl = track.baseUrl + '&fmt=json3';
    const captionRes = await fetch(captionUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      },
    });

    if (!captionRes.ok) {
      throw new Error(`Failed to fetch captions (HTTP ${captionRes.status})`);
    }

    const captionData = await captionRes.json();

    // Step 3: Parse into timestamped transcript
    const transcript = parseCaptionJson3(captionData);

    if (!transcript || transcript.length < 50) {
      throw new Error('Transcript is empty or too short.');
    }

    // Video metadata
    const title = playerData?.videoDetails?.title || 'Unknown';
    const duration = parseInt(playerData?.videoDetails?.lengthSeconds || '0', 10);

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
    return res.status(500).json({
      error: err.message || 'Failed to fetch transcript.',
    });
  }
}

function extractVideoId(input) {
  if (!input) return null;
  const trimmed = input.trim();
  // Direct video ID (11 chars)
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
  // Try regex extraction
  const match = trimmed.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

function parseCaptionJson3(data) {
  const events = data?.events || [];
  const segments = [];

  for (const event of events) {
    if (!event.segs) continue;

    const startMs = event.tStartMs || 0;
    const startSec = Math.floor(startMs / 1000);
    const mins = Math.floor(startSec / 60);
    const secs = startSec % 60;
    const timestamp = `${mins}:${secs.toString().padStart(2, '0')}`;

    // Combine all sub-segments within this event
    const text = event.segs
      .map((s) => s.utf8 || '')
      .join('')
      .replace(/\n/g, ' ')
      .trim();

    if (text && text !== '\n' && text.length > 0) {
      segments.push(`[${timestamp}] ${text}`);
    }
  }

  return segments.join('\n');
}
