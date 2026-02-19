// /api/transcript.js
// Downloads YouTube audio and transcribes with Groq Whisper
// Requires GROQ_API_KEY environment variable

import ytdl from '@distube/ytdl-core';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    return res.status(500).json({
      error: 'GROQ_API_KEY not configured. Get a free key at https://console.groq.com and add it to Vercel environment variables.'
    });
  }

  const videoInput = req.query.url || req.query.v || '';
  if (!videoInput) {
    return res.status(400).json({ error: 'Missing ?url= parameter.' });
  }

  // Extract video ID
  let videoId = videoInput.trim();
  if (videoId.includes('youtube.com') || videoId.includes('youtu.be')) {
    try {
      const url = new URL(videoId);
      if (url.hostname.includes('youtube.com')) videoId = url.searchParams.get('v') || videoId;
      else if (url.hostname === 'youtu.be') videoId = url.pathname.slice(1).split('/')[0];
    } catch(e) {}
  }

  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    // Step 1: Download audio from YouTube
    console.log(`[transcript] Downloading audio for: ${videoId}`);

    const info = await ytdl.getInfo(youtubeUrl);
    const title = info.videoDetails.title;
    const duration = parseInt(info.videoDetails.lengthSeconds, 10);

    // Pick lowest quality audio-only format to stay under 25MB Whisper limit
    const format = ytdl.chooseFormat(info.formats, {
      quality: 'lowestaudio',
      filter: 'audioonly',
    });

    if (!format) {
      return res.status(400).json({ error: 'No audio format available for this video.' });
    }

    console.log(`[transcript] Format: ${format.mimeType}, bitrate: ${format.audioBitrate}kbps`);

    // Download to buffer
    const audioStream = ytdl.downloadFromInfo(info, { format });
    const chunks = [];
    for await (const chunk of audioStream) {
      chunks.push(chunk);
    }
    const audioBuffer = Buffer.concat(chunks);
    const sizeMB = (audioBuffer.length / 1024 / 1024).toFixed(1);
    console.log(`[transcript] Audio downloaded: ${sizeMB}MB`);

    if (audioBuffer.length > 25 * 1024 * 1024) {
      return res.status(400).json({
        error: `Audio is ${sizeMB}MB — exceeds 25MB Whisper limit. Try a shorter video (under ~2 hours).`
      });
    }

    // Step 2: Send to Groq Whisper
    console.log('[transcript] Sending to Groq Whisper...');

    const boundary = '----PodclawBoundary' + Date.now();
    const ext = format.container || 'webm';
    const mime = format.mimeType?.split(';')[0] || 'audio/webm';

    // Build multipart body
    const parts = [];

    // File part
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.${ext}"\r\nContent-Type: ${mime}\r\n\r\n`
    ));
    parts.push(audioBuffer);

    // Model part
    parts.push(Buffer.from(
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-large-v3-turbo`
    ));

    // Response format part
    parts.push(Buffer.from(
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\nverbose_json`
    ));

    // Language part
    parts.push(Buffer.from(
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\nen`
    ));

    // End boundary
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

    const body = Buffer.concat(parts);

    const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: body,
    });

    if (!groqRes.ok) {
      const errData = await groqRes.json().catch(() => ({}));
      console.error('[transcript] Groq error:', groqRes.status, JSON.stringify(errData));
      return res.status(500).json({
        error: errData.error?.message || `Whisper transcription failed (${groqRes.status}).`,
        details: errData
      });
    }

    const groqData = await groqRes.json();
    console.log('[transcript] Transcription complete!');

    // Build timestamped transcript from segments
    let transcript = '';
    if (groqData.segments && groqData.segments.length > 0) {
      transcript = groqData.segments.map(seg => {
        const totalSec = Math.floor(seg.start);
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = totalSec % 60;
        const ts = h > 0
          ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
          : `${m}:${String(s).padStart(2,'0')}`;
        return `[${ts}] ${seg.text.trim()}`;
      }).join('\n');
    } else {
      transcript = groqData.text || '';
    }

    return res.status(200).json({
      videoId,
      title,
      duration,
      youtubeUrl,
      transcript,
      wordCount: transcript.split(/\s+/).length,
    });

  } catch (error) {
    console.error('[transcript] Error:', error.message);

    if (error.message?.includes('Video unavailable') || error.message?.includes('private')) {
      return res.status(400).json({ error: 'Video is unavailable or private.' });
    }
    if (error.message?.includes('age')) {
      return res.status(400).json({ error: 'Age-restricted videos are not supported.' });
    }
    if (error.message?.includes('Sign in')) {
      return res.status(400).json({ error: 'This video requires sign-in. Try a different video.' });
    }

    return res.status(500).json({
      error: 'Failed to transcribe video.',
      details: error.message
    });
  }
}
