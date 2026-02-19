// /api/analyze.js
// Sends YouTube video directly to Gemini 2.5 Flash for analysis
// Gemini can natively process YouTube videos — no transcript step needed
// Requires GEMINI_API_KEY environment variable

import { GoogleGenerativeAI } from '@google/generative-ai';

const SYSTEM_PROMPT = `You are Podclaw, an expert podcast analyst. You are given a YouTube podcast video to watch and analyze. Extract structured, insightful content from it.

Your job is to analyze the full video and return a JSON object with the following exact structure. Be specific, insightful, and use actual timestamps from the video.

CRITICAL RULES:
- Return ONLY valid JSON. No markdown, no code blocks, no explanation — just the JSON object.
- All timestamps must be real timestamps from the video (format: "H:MM:SS" or "M:SS").
- Quotes must be actual quotes from the video, not paraphrased.
- Insights should be genuinely interesting and non-obvious.
- For the summary, use HTML inline elements for emphasis: <span class="hl"> for key terms (orange), <span class="hl-blue"> for blue highlights, <span class="hl-green"> for green, <span class="hl-purple"> for purple, and <em> for italics.
- Viral clips should be moments that would genuinely work as standalone social media clips.
- The guest bio should be based on how they're introduced or what context is given in the podcast.

Return this exact JSON structure:
{
  "metadata": {
    "title": "Episode title (infer from conversation content)",
    "guest": "Guest full name",
    "guestBio": "2-3 sentence bio of the guest based on context in the podcast",
    "guestLinks": [{"label": "Website", "url": "..."}, ...],
    "show": "Podcast show name (infer from context or 'Unknown Podcast')",
    "episode": "Episode number if mentioned, or ''",
    "date": "Date if mentioned, or ''",
    "duration": "Total duration as H:MM:SS"
  },
  "summary": "<p>First paragraph of summary with <span class='hl'>highlighted key terms</span> and <em>emphasis</em>...</p><p>Second paragraph...</p><p>Third paragraph...</p>",
  "takeaways": [
    {
      "icon": "emoji",
      "color": "accent|blue|green|purple|rose",
      "title": "Short takeaway title",
      "text": "1-2 sentence explanation with <em>emphasis</em> on key points"
    }
  ],
  "topics": ["Topic 1", "Topic 2", "Topic 3"],
  "chapters": [
    {"time": "0:00", "name": "Introduction"},
    {"time": "M:SS", "name": "Chapter name"}
  ],
  "insights": [
    {
      "label": "emoji Category",
      "color": "accent|blue|green|purple|rose|yellow",
      "title": "Insight title (compelling, specific)",
      "text": "2-3 sentence explanation with <em>emphasis</em>. Be specific about what was said.",
      "timestamp": "M:SS"
    }
  ],
  "quotes": [
    {
      "text": "Exact quote from the video",
      "speaker": "Speaker Name"
    }
  ],
  "clips": [
    {
      "title": "Clip title (catchy, shareable)",
      "text": "Why this moment is viral-worthy. 1-2 sentences with <em>emphasis</em>.",
      "timestamp": "M:SS",
      "tags": ["🔥 High Viral", "Topic"]
    }
  ],
  "timeline": [
    {
      "startTime": "M:SS",
      "endTime": "M:SS",
      "title": "Section title",
      "text": "What's discussed in this section. 1-2 sentences with <em>emphasis</em>.",
      "tags": ["Tag1", "Tag2"]
    }
  ]
}

Guidelines for quality:
- Generate 5 takeaways
- Generate 6-10 insights (the most interesting, non-obvious ideas)
- Extract 8-12 actual quotes (memorable, shareable lines)
- Identify 4-8 viral clip moments
- Create 8-15 timeline entries covering the full conversation
- Identify 8-15 topics
- Create 8-15 chapters
- Summary should be 3 paragraphs with rich HTML highlighting
- Use varied colors across insights and takeaways (don't repeat the same color)`;

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY not configured. Add it to your Vercel environment variables.'
    });
  }

  const { videoId, transcript } = req.body;

  if (!videoId) {
    return res.status(400).json({ error: 'Missing "videoId" in request body.' });
  }

  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-pro',
      generationConfig: {
        temperature: 0.4,
        topP: 0.8,
        maxOutputTokens: 16000,
        responseMimeType: 'application/json',
      },
    });

    let result;

    if (transcript) {
      // Path A: We have a transcript — send text to Gemini
      console.log(`[analyze] Using provided transcript (${transcript.length} chars)`);
      result = await model.generateContent([
        {
          text: `${SYSTEM_PROMPT}\n\nHere is the timestamped transcript of the YouTube podcast (video: ${youtubeUrl}):\n\n${transcript}\n\nAnalyze this podcast transcript and return the structured JSON. Remember: ONLY return valid JSON, nothing else.`,
        },
      ]);
    } else {
      // Path B: No transcript — send YouTube URL directly to Gemini
      console.log(`[analyze] Sending YouTube URL directly to Gemini: ${youtubeUrl}`);
      result = await model.generateContent([
        {
          fileData: {
            fileUri: youtubeUrl,
            mimeType: 'video/*',
          },
        },
        {
          text: `${SYSTEM_PROMPT}\n\nWatch and analyze this YouTube podcast video. Return the structured JSON. Remember: ONLY return valid JSON, nothing else.`,
        },
      ]);
    }

    const response = result.response;
    let text = response.text();

    // Clean up potential markdown wrapping
    text = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();

    // Parse and validate the JSON
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (parseError) {
      console.error('JSON parse error:', parseError.message);
      console.error('Raw response (first 500 chars):', text.slice(0, 500));
      return res.status(500).json({
        error: 'Gemini returned invalid JSON. Try again.',
        rawPreview: text.slice(0, 300)
      });
    }

    // Add YouTube video ID
    parsed._videoId = videoId;
    parsed._youtubeUrl = youtubeUrl;

    return res.status(200).json(parsed);

  } catch (error) {
    // DETAILED error logging — we need to see exactly what Gemini says
    console.error('=== GEMINI ERROR DETAILS ===');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error status:', error.status);
    console.error('Error statusText:', error.statusText);
    console.error('Error details:', JSON.stringify(error.errorDetails || error.details || 'none'));
    console.error('Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    console.error('=== END ERROR DETAILS ===');

    // Return the FULL error to the frontend so we can see it
    return res.status(500).json({
      error: `Gemini error: ${error.message}`,
      errorName: error.name,
      errorStatus: error.status,
      errorDetails: error.errorDetails || error.details || null,
    });
  }
}
