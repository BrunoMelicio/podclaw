# Podclaw

**Never stop listening. Never stop learning.** Paste a podcast link from Spotify, Apple Podcasts, or any RSS feed — get instant summaries, viral clips, key quotes, and interactive Q&A with an audio player that seeks to any moment.

Live at **[podclaw.vercel.app](https://podclaw.vercel.app)**

## How it works

1. Paste a podcast link (Spotify, Apple Podcasts, RSS, or direct MP3)
2. Podclaw resolves the link to find the audio file
3. The audio is sent to Gemini 2.5 Flash for structured analysis
4. You get: embedded audio player, summary, insights, quotes, viral clips, timeline, and Ask AI chat
5. Click any timestamp to seek the audio to that exact moment

**One free API key needed** — just Gemini (analysis).

## Features

- **HTML5 Audio Player** — plays right in the page, seeks to timestamps on click
- **Podcast Link Resolver** — supports Spotify, Apple Podcasts, RSS feeds, and direct MP3 URLs
- **3 Pre-built Demos** — Nick Lane (Lex Fridman), Robert Greene (Huberman Lab), Elon Musk (Joe Rogan)
- **Dark / Light Theme** — toggle with one click, dark by default
- **Guest Info Tooltip** — hover/click the (i) icon next to the guest name
- **6 Content Tabs** — Overview, Insights, Quotes, Viral Clips, Timeline, Ask AI
- **Mobile Responsive** — works on phones with touch-friendly UI

## Deploy to Vercel (Free)

### Step 1: Get API Key (free)

**Gemini**: Go to [Google AI Studio](https://aistudio.google.com/apikey), sign in, click "Create API Key"

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
   - `GEMINI_API_KEY` — your Gemini API key
5. Click "Deploy"

Your site will be live at `your-project.vercel.app` in about 30 seconds.

## Project Structure

```
podclaw/
├── index.html          # Full frontend with audio player & 3 demo episodes
├── api/
│   ├── resolve.js      # Resolves podcast links (Spotify, Apple, RSS) to MP3 URLs
│   └── analyze.js      # Sends audio to Gemini 2.5 Flash, returns structured insights
├── package.json        # Dependencies (@google/generative-ai)
├── vercel.json         # Vercel deployment config
├── .env.example        # Template for environment variables
└── .gitignore
```

## Local Development

```bash
npm install
npm install -g vercel   # Install Vercel CLI if you don't have it

# Create .env.local with your API key
cp .env.example .env.local
# Edit .env.local and add your Gemini key

vercel dev              # Runs locally at http://localhost:3000
```

## Costs

- **Vercel Hobby plan**: Free (100GB bandwidth, serverless functions)
- **Gemini 2.5 Flash**: Free tier (~1500 requests/day)

**Total cost to run: $0/month** for typical usage.

## Supported Podcast Sources

| Source | How it works |
|--------|-------------|
| **Spotify** | Uses oEmbed API + iTunes search to find the RSS feed and MP3 |
| **Apple Podcasts** | Uses iTunes Lookup API to get the RSS feed and episode MP3 |
| **RSS Feeds** | Parses the feed directly to extract the `<enclosure>` MP3 URL |
| **Direct MP3** | Uses the URL as-is |

## Limitations

- Gemini has a rate limit on the free tier (~15 requests/minute)
- Very long episodes (5+ hours) may take longer to analyze
- Some Spotify episodes may not resolve if they're platform-exclusive (no RSS feed)
- The "Ask AI" chat currently uses keyword matching; can be upgraded to use Gemini for real-time Q&A
