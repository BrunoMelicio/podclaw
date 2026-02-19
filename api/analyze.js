// /api/analyze.js
// Sends podcast audio to Gemini 2.5 Flash for structured analysis
// Accepts MP3 URL (from /api/resolve) or transcript text
// Requires GEMINI_API_KEY environment variable

import { GoogleGenerativeAI } from '@google/generative-ai';

const SYSTEM_PROMPT = `You are Podclaw, an expert podcast analyst. You are given a podcast episode audio to listen to and analyze. Extract structured, insightful content from it.

Your job is to analyze the full podcast episode and return a JSON object with the following exact structure. Be specific, insightful, and use actual timestamps from the episode.

CRITICAL RULES:
- Return ONLY valid JSON. No markdown, no code blocks, no explanation — just the JSON object.
- All timestamps must be real timestamps from the audio (format: "H:MM:SS" or "M:SS").
- Quotes must be actual quotes from the episode, not paraphrased.
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
      "text": "Exact quote from the episode",
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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY not configured. Add it to your Vercel environment variables.',
    });
  }

  const { mp3Url, transcript, title, show } = req.body;

  if (!mp3Url && !transcript) {
    return res.status(400).json({ error: 'Missing "mp3Url" or "transcript" in request body.' });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.4,
        topP: 0.8,
        maxOutputTokens: 16000,
        responseMimeType: 'application/json',
      },
    });

    let result;
    const context = title && show ? `\nPodcast: "${show}" — Episode: "${title}"` : '';

    if (transcript) {
      // Path A: Transcript text provided
      console.log(`[analyze] Using transcript (${transcript.length} chars)`);
      result = await model.generateContent([
        {
          text: `${SYSTEM_PROMPT}${context}\n\nHere is the timestamped transcript of the podcast episode:\n\n${transcript}\n\nAnalyze this podcast and return the structured JSON.`,
        },
      ]);
    } else {
      // Path B: Send MP3 URL directly to Gemini
      console.log(`[analyze] Sending audio to Gemini: ${mp3Url}`);
      result = await model.generateContent([
        {
          fileData: {
            fileUri: mp3Url,
            mimeType: 'audio/mpeg',
          },
        },
        {
          text: `${SYSTEM_PROMPT}${context}\n\nListen to and analyze this podcast episode. Return the structured JSON.`,
        },
      ]);
    }

    const response = result.response;
    let text = response.text();

    // Clean up potential markdown wrapping
    text = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (parseError) {
      console.error('JSON parse error:', parseError.message);
      console.error('Raw (first 500):', text.slice(0, 500));
      return res.status(500).json({
        error: 'Gemini returned invalid JSON. Try again.',
        rawPreview: text.slice(0, 300),
      });
    }

    // Add source info
    if (mp3Url) parsed._mp3Url = mp3Url;

    return res.status(200).json(parsed);
  } catch (error) {
    console.error('=== GEMINI ERROR ===');
    console.error('Message:', error.message);
    console.error('Status:', error.status);
    console.error('Details:', JSON.stringify(error.errorDetails || error.details || 'none'));
    console.error('=== END ===');

    return res.status(500).json({
      error: `Gemini error: ${error.message}`,
      errorStatus: error.status,
      errorDetails: error.errorDetails || error.details || null,
    });
  }
}
