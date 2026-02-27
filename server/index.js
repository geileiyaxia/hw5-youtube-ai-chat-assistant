const dns = require("dns");
dns.setServers(["1.1.1.1", "8.8.8.8"]);
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
console.log("YOUTUBE_API_KEY exists?", Boolean(process.env.YOUTUBE_API_KEY));
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const { google } = require('googleapis');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const URI = process.env.REACT_APP_MONGODB_URI || process.env.MONGODB_URI || process.env.REACT_APP_MONGO_URI;
const DB = 'chatapp';

let db;

async function connect() {
  const client = await MongoClient.connect(URI);
  db = client.db(DB);
  console.log('MongoDB connected');
}

app.get('/', (req, res) => {
  res.send(`
    <html>
      <body style="font-family:sans-serif;padding:2rem;background:#00356b;color:white;min-height:100vh;display:flex;align-items:center;justify-content:center;margin:0">
        <div style="text-align:center">
          <h1>Chat API Server</h1>
          <p>Backend is running. Use the React app at <a href="http://localhost:3000" style="color:#ffd700">localhost:3000</a></p>
          <p><a href="/api/status" style="color:#ffd700">Check DB status</a></p>
        </div>
      </body>
    </html>
  `);
});

app.get('/api/status', async (req, res) => {
  try {
    const usersCount = await db.collection('users').countDocuments();
    const sessionsCount = await db.collection('sessions').countDocuments();
    res.json({ usersCount, sessionsCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Users ────────────────────────────────────────────────────────────────────

app.post('/api/users', async (req, res) => {
  try {
    const { username, password, email, firstName, lastName } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Username and password required' });
    const name = String(username).trim().toLowerCase();
    const existing = await db.collection('users').findOne({ username: name });
    if (existing) return res.status(400).json({ error: 'Username already exists' });
    const hashed = await bcrypt.hash(password, 10);
    await db.collection('users').insertOne({
      username: name,
      password: hashed,
      email: email ? String(email).trim().toLowerCase() : null,
      firstName: firstName ? String(firstName).trim() : '',
      lastName: lastName ? String(lastName).trim() : '',
      createdAt: new Date().toISOString(),
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Username and password required' });
    const name = username.trim().toLowerCase();
    const user = await db.collection('users').findOne({ username: name });
    if (!user) return res.status(401).json({ error: 'User not found' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Invalid password' });
    res.json({ ok: true, username: name, firstName: user.firstName || '', lastName: user.lastName || '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/users/:username', async (req, res) => {
  try {
    const user = await db.collection('users').findOne({ username: req.params.username });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ username: user.username, firstName: user.firstName || '', lastName: user.lastName || '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Sessions ─────────────────────────────────────────────────────────────────

app.get('/api/sessions', async (req, res) => {
  try {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: 'username required' });
    const sessions = await db
      .collection('sessions')
      .find({ username })
      .sort({ createdAt: -1 })
      .toArray();
    res.json(
      sessions.map((s) => ({
        id: s._id.toString(),
        agent: s.agent || null,
        title: s.title || null,
        createdAt: s.createdAt,
        messageCount: (s.messages || []).length,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sessions', async (req, res) => {
  try {
    const { username, agent } = req.body;
    if (!username) return res.status(400).json({ error: 'username required' });
    const { title } = req.body;
    const result = await db.collection('sessions').insertOne({
      username,
      agent: agent || null,
      title: title || null,
      createdAt: new Date().toISOString(),
      messages: [],
    });
    res.json({ id: result.insertedId.toString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/sessions/:id', async (req, res) => {
  try {
    await db.collection('sessions').deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/sessions/:id/title', async (req, res) => {
  try {
    const { title } = req.body;
    await db.collection('sessions').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { title } }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Messages ─────────────────────────────────────────────────────────────────

app.post('/api/messages', async (req, res) => {
  try {
    const { session_id, role, content, imageData, charts, toolCalls, videoCards, generatedImages } = req.body;
    if (!session_id || !role || content === undefined)
      return res.status(400).json({ error: 'session_id, role, content required' });
    const msg = {
      role,
      content,
      timestamp: new Date().toISOString(),
      ...(imageData && {
        imageData: Array.isArray(imageData) ? imageData : [imageData],
      }),
      ...(charts?.length && { charts }),
      ...(toolCalls?.length && { toolCalls }),
      ...(videoCards?.length && { videoCards }),
      ...(generatedImages?.length && { generatedImages }),
    };
    await db.collection('sessions').updateOne(
      { _id: new ObjectId(session_id) },
      { $push: { messages: msg } }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/messages', async (req, res) => {
  try {
    const { session_id } = req.query;
    if (!session_id) return res.status(400).json({ error: 'session_id required' });
    const doc = await db
      .collection('sessions')
      .findOne({ _id: new ObjectId(session_id) });
    const raw = doc?.messages || [];
    const msgs = raw.map((m, i) => {
      const arr = m.imageData
        ? Array.isArray(m.imageData)
          ? m.imageData
          : [m.imageData]
        : [];
      return {
        id: `${doc._id}-${i}`,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        images: arr.length
          ? arr.map((img) => ({ data: img.data, mimeType: img.mimeType }))
          : undefined,
        charts: m.charts?.length ? m.charts : undefined,
        toolCalls: m.toolCalls?.length ? m.toolCalls : undefined,
        videoCards: m.videoCards?.length ? m.videoCards : undefined,
        generatedImages: m.generatedImages?.length ? m.generatedImages : undefined,
      };
    });
    res.json(msgs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── YouTube Channel Download ─────────────────────────────────────────────────

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || process.env.REACT_APP_YOUTUBE_API_KEY;

function parseIsoDuration(iso) {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] || 0) * 3600) + (parseInt(m[2] || 0) * 60) + parseInt(m[3] || 0);
}

app.post('/api/youtube/channel-data', async (req, res) => {
  if (!YOUTUBE_API_KEY) {
    return res.status(500).json({ error: 'YOUTUBE_API_KEY not configured on server' });
  }

  const { url, maxVideos = 10 } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });

  const limit = Math.min(Math.max(1, parseInt(maxVideos) || 10), 100);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const youtube = google.youtube({ version: 'v3', auth: YOUTUBE_API_KEY });

    send({ type: 'progress', message: 'Resolving channel...', percent: 5 });

    // Resolve channel handle/URL to channel ID
    let channelId;
    const handleMatch = url.match(/@([\w.-]+)/);
    const channelIdMatch = url.match(/\/channel\/(UC[\w-]+)/);

    if (channelIdMatch) {
      channelId = channelIdMatch[1];
    } else if (handleMatch) {
      const chRes = await youtube.channels.list({ part: 'id,contentDetails', forHandle: handleMatch[1] });
      if (!chRes.data.items?.length) {
        // Try search as fallback
        const searchRes = await youtube.search.list({ part: 'snippet', q: handleMatch[1], type: 'channel', maxResults: 1 });
        if (!searchRes.data.items?.length) {
          send({ type: 'error', message: 'Channel not found' });
          return res.end();
        }
        channelId = searchRes.data.items[0].snippet.channelId;
      } else {
        channelId = chRes.data.items[0].id;
      }
    } else {
      send({ type: 'error', message: 'Invalid YouTube channel URL. Use format: https://www.youtube.com/@channelname' });
      return res.end();
    }

    send({ type: 'progress', message: 'Getting channel uploads...', percent: 10 });

    // Get uploads playlist
    const channelRes = await youtube.channels.list({ part: 'contentDetails,snippet', id: channelId });
    if (!channelRes.data.items?.length) {
      send({ type: 'error', message: 'Channel not found' });
      return res.end();
    }
    const uploadsPlaylistId = channelRes.data.items[0].contentDetails.relatedPlaylists.uploads;
    const channelTitle = channelRes.data.items[0].snippet.title;

    // Collect video IDs from uploads playlist
    let videoIds = [];
    let nextPageToken = null;
    while (videoIds.length < limit) {
      const plRes = await youtube.playlistItems.list({
        part: 'contentDetails',
        playlistId: uploadsPlaylistId,
        maxResults: Math.min(50, limit - videoIds.length),
        pageToken: nextPageToken || undefined,
      });
      for (const item of plRes.data.items || []) {
        videoIds.push(item.contentDetails.videoId);
        if (videoIds.length >= limit) break;
      }
      nextPageToken = plRes.data.nextPageToken;
      if (!nextPageToken) break;
    }

    send({ type: 'progress', message: `Found ${videoIds.length} videos, fetching details...`, percent: 20 });

    // Batch fetch video details (50 at a time)
    const allVideos = [];
    for (let i = 0; i < videoIds.length; i += 50) {
      const batch = videoIds.slice(i, i + 50);
      const vRes = await youtube.videos.list({
        part: 'snippet,statistics,contentDetails',
        id: batch.join(','),
      });
      for (const v of vRes.data.items || []) {
        allVideos.push(v);
      }
    }

    send({ type: 'progress', message: 'Fetching transcripts...', percent: 40 });

    // Dynamically import youtube-transcript (ESM module)
    let fetchTranscript;
    try {
      const ytModule = await import('youtube-transcript');
      fetchTranscript = ytModule.YoutubeTranscript
        ? (id) => ytModule.YoutubeTranscript.fetchTranscript(id)
        : ytModule.fetchTranscript || null;
    } catch {
      fetchTranscript = null;
    }

    // Build result array with transcripts
    const results = [];
    for (let i = 0; i < allVideos.length; i++) {
      const v = allVideos[i];
      const pct = 40 + Math.round((i / allVideos.length) * 50);
      send({ type: 'progress', message: `Processing video ${i + 1}/${allVideos.length}: ${v.snippet.title.slice(0, 50)}...`, percent: pct });

      let transcript = null;
      if (fetchTranscript) {
        try {
          const parts = await fetchTranscript(v.id);
          if (Array.isArray(parts)) {
            transcript = parts.map((p) => p.text).join(' ');
          }
        } catch {
          transcript = null;
        }
      }

      results.push({
        video_id: v.id,
        title: v.snippet.title,
        description: v.snippet.description,
        transcript,
        duration: parseIsoDuration(v.contentDetails.duration),
        duration_iso: v.contentDetails.duration,
        release_date: v.snippet.publishedAt?.split('T')[0] || v.snippet.publishedAt,
        view_count: parseInt(v.statistics.viewCount || '0'),
        like_count: parseInt(v.statistics.likeCount || '0'),
        comment_count: parseInt(v.statistics.commentCount || '0'),
        video_url: `https://www.youtube.com/watch?v=${v.id}`,
        thumbnail: v.snippet.thumbnails?.maxres?.url || v.snippet.thumbnails?.high?.url || v.snippet.thumbnails?.default?.url || '',
      });
    }

    send({ type: 'progress', message: 'Done!', percent: 100 });
    send({ type: 'complete', channelTitle, data: results });
  } catch (err) {
    send({ type: 'error', message: err.message });
  } finally {
    res.end();
  }
});

// ─────────────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;

connect()
  .then(() => {
    app.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });
