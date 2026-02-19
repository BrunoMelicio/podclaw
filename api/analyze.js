// /api/analyze.js
// Sends podcast transcript to Gemini Flash and returns structured insights
// Requires GEMINI_API_KEY environment variable

import { GoogleGenerativeAI } from '@google/generative-ai';

const SYSTEM_PROMPT = `You are Podclaw, an expert podcast analyst. You receive a full podcast transcript with timestamps and extract structured, insightful content from it.

Your job is to analyze the transcript and return a JSON object with the following exact structure. Be specific, insightful, and use actual timestamps from the transcript.

CRITICAL RULES:
- Return ONLY valid JSON. No markdown, no code blocks, no explanation — just the JSON object.
- All timestamps must be real timestamps from the transcript (format: "H:MM:SS" or "M:SS").
- Quotes must be actual quotes from the transcript, not paraphrased.
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
      "text": "Exact quote from the transcript",
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

  const { transcript, videoId } = req.body;

  if (!transcript) {
    return res.status(400).json({ error: 'Missing "transcript" in request body.' });
  }

  // Truncate transcript if extremely long (Gemini Flash handles 1M tokens, but let's be safe)
  const maxChars = 800000; // ~200k tokens
  const truncatedTranscript = transcript.length > maxChars
    ? transcript.slice(0, maxChars) + '\n\n[TRANSCRIPT TRUNCATED]'
    : transcript;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash-preview-05-20',
      generationConfig: {
        temperature: 0.4,
        topP: 0.8,
        maxOutputTokens: 16000,
        responseMimeType: 'application/json',
      },
    });

    const prompt = `${SYSTEM_PROMPT}

Here is the full podcast transcript to analyze:

---TRANSCRIPT START---
${truncatedTranscript}
---TRANSCRIPT END---

Now analyze this transcript and return the structured JSON. Remember: ONLY return valid JSON, nothing else.`;

    const result = await model.generateContent(prompt);
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

    // Add YouTube video ID if available
    if (videoId) {
      parsed._videoId = videoId;
      parsed._youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    }

    return res.status(200).json(parsed);

  } catch (error) {
    console.error('Gemini API error:', error);

    if (error.message?.includes('API_KEY')) {
      return res.status(401).json({ error: 'Invalid Gemini API key.' });
    }

    if (error.message?.includes('quota') || error.message?.includes('rate')) {
      return res.status(429).json({ error: 'Gemini API rate limit reached. Wait a moment and try again.' });
    }

    return res.status(500).json({
      error: 'Failed to analyze transcript with Gemini.',
      details: error.message
    });
  }
}
