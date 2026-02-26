import { useState, useRef } from 'react';
import './YouTubeDownload.css';

const API = process.env.REACT_APP_API_URL || '';

export default function YouTubeDownload({ user, onLogout }) {
  const [url, setUrl] = useState('');
  const [maxVideos, setMaxVideos] = useState(10);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState('');
  const [error, setError] = useState('');
  const [results, setResults] = useState(null);
  const [channelTitle, setChannelTitle] = useState('');
  const abortRef = useRef(null);

  const handleDownload = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setProgress(0);
    setStatusMsg('Starting...');
    setError('');
    setResults(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`${API}/api/youtube/channel-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), maxVideos }),
        signal: controller.signal,
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'progress') {
              setProgress(event.percent || 0);
              setStatusMsg(event.message || '');
            } else if (event.type === 'complete') {
              setResults(event.data);
              setChannelTitle(event.channelTitle || '');
              setProgress(100);
              setStatusMsg(`Done! Downloaded ${event.data.length} videos.`);
            } else if (event.type === 'error') {
              setError(event.message);
            }
          } catch {}
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message);
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    setLoading(false);
    setStatusMsg('Cancelled');
  };

  const handleDownloadJson = () => {
    if (!results) return;
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const safeName = (channelTitle || 'channel').replace(/[^a-zA-Z0-9_-]/g, '_');
    a.download = `${safeName}_data.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const formatDuration = (sec) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="yt-download-layout">
      <div className="yt-download-card">
        <h2 className="yt-download-title">YouTube Channel Download</h2>
        <p className="yt-download-desc">
          Enter a YouTube channel URL to download video metadata as JSON.
        </p>

        <div className="yt-form">
          <input
            type="text"
            className="yt-input"
            placeholder="https://www.youtube.com/@channelname"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={loading}
          />
          <div className="yt-form-row">
            <label className="yt-label">
              Max videos:
              <input
                type="number"
                className="yt-input-small"
                min={1}
                max={100}
                value={maxVideos}
                onChange={(e) => setMaxVideos(Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))}
                disabled={loading}
              />
            </label>
            {loading ? (
              <button className="yt-btn yt-btn-cancel" onClick={handleCancel}>Cancel</button>
            ) : (
              <button className="yt-btn" onClick={handleDownload} disabled={!url.trim()}>
                Download Channel Data
              </button>
            )}
          </div>
        </div>

        {loading && (
          <div className="yt-progress-wrap">
            <div className="yt-progress-bar">
              <div className="yt-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="yt-progress-text">{statusMsg} ({progress}%)</span>
          </div>
        )}

        {error && <div className="yt-error">{error}</div>}

        {results && (
          <div className="yt-results">
            <div className="yt-results-header">
              <h3>{channelTitle} — {results.length} videos</h3>
              <button className="yt-btn yt-btn-sm" onClick={handleDownloadJson}>
                Download JSON
              </button>
            </div>
            <div className="yt-table-wrap">
              <table className="yt-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Title</th>
                    <th>Views</th>
                    <th>Likes</th>
                    <th>Comments</th>
                    <th>Duration</th>
                    <th>Date</th>
                    <th>Transcript</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((v, i) => (
                    <tr key={v.video_id}>
                      <td>{i + 1}</td>
                      <td>
                        <a href={v.video_url} target="_blank" rel="noreferrer" className="yt-link">
                          {v.title.slice(0, 60)}{v.title.length > 60 ? '...' : ''}
                        </a>
                      </td>
                      <td>{v.view_count.toLocaleString()}</td>
                      <td>{v.like_count.toLocaleString()}</td>
                      <td>{v.comment_count.toLocaleString()}</td>
                      <td>{formatDuration(v.duration)}</td>
                      <td>{v.release_date}</td>
                      <td>{v.transcript ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
