// api/resolve.js
// Resolves podcast links (Apple Podcasts, Spotify, RSS, direct MP3) to MP3 URLs + metadata
// No API keys needed — uses free iTunes Lookup API and Spotify oEmbed

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });

  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'Missing "url" in request body.' });

  const input = url.trim();

  try {
    let result;

    if (input.includes('podcasts.apple.com')) {
      result = await resolveApplePodcasts(input);
    } else if (input.includes('open.spotify.com')) {
      result = await resolveSpotify(input);
    } else if (input.match(/\.(mp3|m4a|ogg|wav|aac)(\?|$)/i)) {
      result = await resolveDirectAudio(input);
    } else if (input.match(/\.(xml|rss)(\?|$)/i) || input.includes('/feed')) {
      result = await resolveRSSFeed(input);
    } else {
      // Try as RSS feed first, then fail gracefully
      try {
        result = await resolveRSSFeed(input);
      } catch {
        return res.status(400).json({
          error: 'Unrecognized link. Paste a Spotify, Apple Podcasts, or RSS podcast link.',
        });
      }
    }

    if (!result.mp3Url) {
      return res.status(404).json({ error: 'Could not find an audio file for this episode.' });
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error('[resolve] Error:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to resolve podcast link.' });
  }
}

// ============================================================
// APPLE PODCASTS
// ============================================================
async function resolveApplePodcasts(url) {
  // Extract podcast ID and episode ID from URL
  // Format: https://podcasts.apple.com/XX/podcast/NAME/idPODCAST_ID?i=EPISODE_ID
  const podcastIdMatch = url.match(/\/id(\d+)/);
  const episodeIdMatch = url.match(/[?&]i=(\d+)/);

  if (!podcastIdMatch) throw new Error('Could not extract podcast ID from Apple Podcasts link.');

  const podcastId = podcastIdMatch[1];

  // Step 1: Get podcast info + RSS feed URL from iTunes
  const lookupRes = await fetch(`https://itunes.apple.com/lookup?id=${podcastId}&entity=podcast`);
  const lookupData = await lookupRes.json();
  const podcast = lookupData.results?.[0];

  if (!podcast?.feedUrl) throw new Error('Could not find RSS feed for this podcast.');

  const show = podcast.collectionName || podcast.trackName || 'Unknown Podcast';
  const artwork = podcast.artworkUrl600 || podcast.artworkUrl100 || '';

  // Step 2: Fetch and parse the RSS feed
  const episodes = await fetchRSSEpisodes(podcast.feedUrl);

  if (!episodes.length) throw new Error('No episodes found in RSS feed.');

  // Step 3: Find the specific episode
  let episode;
  if (episodeIdMatch) {
    // Try to match by iTunes episode ID — check guid or look up via iTunes
    const episodeId = episodeIdMatch[1];
    const epLookup = await fetch(`https://itunes.apple.com/lookup?id=${episodeId}`);
    const epData = await epLookup.json();
    const epInfo = epData.results?.[0];

    if (epInfo?.trackName) {
      // Match by title (case-insensitive, partial match)
      const searchTitle = epInfo.trackName.toLowerCase();
      episode = episodes.find((e) => e.title.toLowerCase().includes(searchTitle)) ||
        episodes.find((e) => searchTitle.includes(e.title.toLowerCase().substring(0, 30)));
    }

    if (!episode && epInfo?.episodeUrl) {
      // Apple sometimes gives us the audio URL directly
      return {
        mp3Url: epInfo.episodeUrl,
        title: epInfo.trackName || 'Unknown Episode',
        show,
        artwork: epInfo.artworkUrl600 || artwork,
        duration: epInfo.trackTimeMillis ? Math.floor(epInfo.trackTimeMillis / 1000) : 0,
        source: 'apple',
      };
    }
  }

  // Fallback: use the first/latest episode
  if (!episode) episode = episodes[0];

  return {
    mp3Url: episode.mp3Url,
    title: episode.title,
    show,
    artwork: episode.artwork || artwork,
    duration: episode.duration || 0,
    source: 'apple',
  };
}

// ============================================================
// SPOTIFY
// ============================================================
async function resolveSpotify(url) {
  // Step 1: Get episode metadata from Spotify oEmbed
  const oembedRes = await fetch(
    `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`
  );

  if (!oembedRes.ok) throw new Error('Could not fetch Spotify episode info.');
  const oembed = await oembedRes.json();

  // oembed.title is usually "Episode Title - Show Name" or just episode title
  const fullTitle = oembed.title || '';

  // Try to extract show name — Spotify oEmbed sometimes includes it
  // The HTML embed usually has the show name in it
  let showName = '';
  let episodeTitle = fullTitle;

  // The oEmbed response often has the format "Episode - Show" or just "Episode"
  // Let's also check the provider_name or other fields
  if (oembed.provider_name) showName = oembed.provider_name;

  // Step 2: Search iTunes for the podcast
  // Try searching with the full title first
  const searchQuery = encodeURIComponent(fullTitle);
  const searchRes = await fetch(
    `https://itunes.apple.com/search?term=${searchQuery}&media=podcast&entity=podcastEpisode&limit=10`
  );
  const searchData = await searchRes.json();

  if (searchData.results?.length > 0) {
    // Find best match
    const match = searchData.results[0];
    const feedUrl = match.feedUrl;

    if (match.episodeUrl) {
      return {
        mp3Url: match.episodeUrl,
        title: match.trackName || episodeTitle,
        show: match.collectionName || showName || 'Unknown Podcast',
        artwork: match.artworkUrl600 || oembed.thumbnail_url || '',
        duration: match.trackTimeMillis ? Math.floor(match.trackTimeMillis / 1000) : 0,
        source: 'spotify',
        spotifyUrl: url,
      };
    }

    // If no direct episodeUrl, try the RSS feed
    if (feedUrl) {
      const episodes = await fetchRSSEpisodes(feedUrl);
      const titleLower = (match.trackName || episodeTitle).toLowerCase();
      const episode = episodes.find((e) => e.title.toLowerCase().includes(titleLower.substring(0, 30))) || episodes[0];

      if (episode) {
        return {
          mp3Url: episode.mp3Url,
          title: episode.title,
          show: match.collectionName || showName || 'Unknown Podcast',
          artwork: episode.artwork || oembed.thumbnail_url || '',
          duration: episode.duration || 0,
          source: 'spotify',
          spotifyUrl: url,
        };
      }
    }
  }

  throw new Error(
    'Could not find this episode\'s audio. Try pasting the Apple Podcasts or RSS link instead.'
  );
}

// ============================================================
// RSS FEED
// ============================================================
async function resolveRSSFeed(url, episodeIndex = 0) {
  const episodes = await fetchRSSEpisodes(url);
  if (!episodes.length) throw new Error('No episodes found in RSS feed.');

  const episode = episodes[episodeIndex] || episodes[0];
  const show = episode.show || 'Unknown Podcast';

  return {
    mp3Url: episode.mp3Url,
    title: episode.title,
    show,
    artwork: episode.artwork || '',
    duration: episode.duration || 0,
    source: 'rss',
  };
}

// ============================================================
// DIRECT AUDIO URL
// ============================================================
async function resolveDirectAudio(url) {
  // Validate the URL is accessible
  const headRes = await fetch(url, { method: 'HEAD' }).catch(() => null);
  if (!headRes || !headRes.ok) throw new Error('Audio URL is not accessible.');

  const filename = url.split('/').pop()?.split('?')[0] || 'Episode';
  const title = filename.replace(/\.(mp3|m4a|ogg|wav|aac)$/i, '').replace(/[-_]/g, ' ');

  return {
    mp3Url: url,
    title,
    show: 'Unknown Podcast',
    artwork: '',
    duration: 0,
    source: 'direct',
  };
}

// ============================================================
// RSS FEED PARSER (shared)
// ============================================================
async function fetchRSSEpisodes(feedUrl) {
  const feedRes = await fetch(feedUrl, {
    headers: {
      'User-Agent': 'Podclaw/1.0',
      Accept: 'application/rss+xml, application/xml, text/xml, */*',
    },
  });

  if (!feedRes.ok) throw new Error(`RSS feed returned ${feedRes.status}`);

  const xml = await feedRes.text();

  // Extract show-level info
  const showTitle = extractTag(xml, 'title') || 'Unknown Podcast';
  const showArtwork =
    extractAttr(xml.split('<item')[0], 'itunes:image', 'href') ||
    extractTag(xml, 'image>url') ||
    '';

  // Split into items
  const items = xml.split('<item').slice(1);

  return items.slice(0, 50).map((item) => {
    const title = extractTag(item, 'title') || 'Untitled';
    const mp3Url = extractAttr(item, 'enclosure', 'url') || '';
    const artwork = extractAttr(item, 'itunes:image', 'href') || showArtwork;
    const durationStr = extractTag(item, 'itunes:duration') || '0';

    // Parse duration (can be seconds, MM:SS, or HH:MM:SS)
    let duration = 0;
    if (durationStr.includes(':')) {
      const parts = durationStr.split(':').map(Number);
      if (parts.length === 3) duration = parts[0] * 3600 + parts[1] * 60 + parts[2];
      else if (parts.length === 2) duration = parts[0] * 60 + parts[1];
    } else {
      duration = parseInt(durationStr, 10) || 0;
    }

    return { title, mp3Url, artwork, duration, show: showTitle };
  }).filter((e) => e.mp3Url);
}

// Simple XML tag extraction helpers (no dependencies needed)
function extractTag(xml, tag) {
  // Handle CDATA
  const regex = new RegExp(`<${tag}[^>]*>\\s*(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?\\s*</${tag.split('>').pop()}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : '';
}

function extractAttr(xml, tag, attr) {
  const regex = new RegExp(`<${tag}[^>]*${attr}=["']([^"']*)["']`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : '';
}
