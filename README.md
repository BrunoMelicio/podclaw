# Podclaw

**Grab the best from any podcast.** Drop a YouTube link, get instant summaries, viral clips, key quotes, and interactive Q&A.

## How it works

1. You paste a YouTube link
2. The backend fetches the transcript (using YouTube's built-in captions — no Whisper needed)
3. The transcript is sent to Gemini 2.0 Flash for analysis
4. You get: summary, insights, quotes, viral clips, timeline, and an Ask AI chat

## Deploy to Vercel (Free)

### Step 1: Get a Gemini API Key (free)

1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the key

### Step 2: Push to GitHub

```bash
cd podclaw
git init
git add .
git commit -m "Initial Podclaw setup"
```

Create a new repository on GitHub, then:

```bash
git remote add origin https://github.com/YOUR_USERNAME/podclaw.git
git push -u origin main
```

### Step 3: Deploy on Vercel

1. Go to [vercel.com](https://vercel.com) and sign up (free) with your GitHub account
2. Click "Add New Project"
3. Import your `podclaw` GitHub repository
4. In the settings, add your environment variable:
   - Key: `GEMINI_API_KEY`
   - Value: (paste your Gemini API key)
5. Click "Deploy"

That's it! Your site will be live at `your-project.vercel.app` in about 30 seconds.

## Project Structure

```
podclaw/
├── index.html          # The full frontend (static, served at /)
├── api/
│   ├── transcript.js   # Fetches YouTube transcript (no API key needed)
│   └── analyze.js      # Sends transcript to Gemini, returns structured insights
├── package.json        # Dependencies (youtube-transcript, @google/generative-ai)
├── vercel.json         # Vercel deployment config
├── .env.example        # Template for environment variables
└── .gitignore
```

## Local Development

```bash
npm install
npm install -g vercel   # Install Vercel CLI if you don't have it

# Create .env.local with your Gemini API key
cp .env.example .env.local
# Edit .env.local and add your key

vercel dev              # Runs locally at http://localhost:3000
```

## Costs

- **Vercel Hobby plan**: Free (100GB bandwidth, serverless functions)
- **Gemini 2.0 Flash**: Free tier is very generous (~1500 requests/day)
- **YouTube transcripts**: Free (no API key needed)

**Total cost to run: $0/month** for typical usage.

## Limitations

- Works only with YouTube videos that have captions (auto-generated or manual) — covers ~95% of videos
- Gemini has a rate limit on the free tier (~15 requests/minute)
- Very long podcasts (5+ hours) may need transcript truncation
- The "Ask AI" chat currently uses keyword matching; can be upgraded to use Gemini for real-time Q&A
