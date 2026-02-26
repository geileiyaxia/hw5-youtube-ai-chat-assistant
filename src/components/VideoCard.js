export default function VideoCard({ video }) {
  if (!video) return null;

  const handleClick = () => {
    window.open(video.video_url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="video-card" onClick={handleClick}>
      {video.thumbnail && (
        <div className="video-card-thumb-wrap">
          <img src={video.thumbnail} alt={video.title} className="video-card-thumb" />
          <div className="video-card-play-icon">▶</div>
        </div>
      )}
      <div className="video-card-info">
        <p className="video-card-title">{video.title}</p>
        <div className="video-card-meta">
          {video.view_count != null && (
            <span>{Number(video.view_count).toLocaleString()} views</span>
          )}
          {video.like_count != null && (
            <span>{Number(video.like_count).toLocaleString()} likes</span>
          )}
          {video.release_date && <span>{video.release_date}</span>}
        </div>
      </div>
    </div>
  );
}
