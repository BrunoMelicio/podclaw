# Podclaw

**Grab the best from any YouTube podcast.** Drop a link, get instant summaries, viral clips, key quotes, and interactive Q&A — with an embedded video player that seeks to any moment.

## How it works

1. You paste a YouTube link
2. The backend fetches the transcript via Supadata API (YouTube blocks cloud IPs from direct access)
3. The transcript is sent to Gemini 2.5 Flash for analysis
4. You get: embedded YouTube player, summary, insights, quotes, viral clips, timeline, and Ask AI chat
5. Click any timestamp to seek the video to that exact moment

## Features

- **Embedded YouTube Player** — plays right in the page, seeks to timestamps on click
- **3 Pre-built Demos** — Yuval Noah Harari, DeepSeek (Dylan Patel & Nathan Lambert), and Sam Altman episodes
- **Dark / Light Theme** — toggle with one click, dark by default
- **Guest Info Tooltip** — hover/click the (i) icon next to the guest name
- **6 Content Tabs** — Overview, Insights, Quotes, Viral Clips, Timeline, Ask AI
- **Mobile Responsive** — works on phones with touch-friendly UI

## Deploy to Vercel (Free)

### Step 1: Get API Keys (both free)

1. **Gemini API Key**: Go to [Google AI Studio](https://aistudio.google.com/apikey), sign in, click "Create API Key"
2. **Supadata API Key**: Go to [supadata.ai](https://supadata.ai), sign up, get your key (100 free requests/month)

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
4. In the settings, add your environment variables:
   - `GEMINI_API_KEY` — your Gemini API key
   - `SUPADATA_API_KEY` — your Supadata API key
5. Click "Deploy"

Your site will be live at `your-project.vercel.app` in about 30 seconds.

## Project Structure

```
podclaw/
├── index.html          # Full frontend with embedded YouTube player & 3 demo episodes
├── api/
│   ├── transcript.js   # Fetches YouTube transcript via Supadata API
│   └── analyze.js      # Sends transcript to Gemini 2.5 Flash, returns structured insights
├── package.json        # Dependencies (@google/generative-ai)
├── vercel.json         # Vercel deployment config
├── .env.example        # Template for environment variables
└── .gitignore
```

## Local Development

```bash
npm install
npm install -g vercel   # Install Vercel CLI if you don't have it

# Create .env.local with your API keys
cp .env.example .env.local
# Edit .env.local and add your keys

vercel dev              # Runs locally at http://localhost:3000
```

## Costs

- **Vercel Hobby plan**: Free (100GB bandwidth, serverless functions)
- **Gemini 2.5 Flash**: Free tier (~1500 requests/day)
- **Supadata**: Free tier (100 requests/month)

**Total cost to run: $0/month** for typical usage.

## Limitations

- Works only with YouTube videos that have captions (auto-generated or manual) — covers ~95% of videos
- Gemini has a rate limit on the free tier (~15 requests/minute)
- Supadata free tier is limited to 100 transcript fetches/month
- Very long podcasts (5+ hours) may need transcript truncation
- The "Ask AI" chat currently uses keyword matching; can be upgraded to use Gemini for real-time Q&A
