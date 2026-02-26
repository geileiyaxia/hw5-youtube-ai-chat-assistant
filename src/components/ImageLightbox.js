import { useEffect } from 'react';

export default function ImageLightbox({ src, alt, onClose, onDownload, children }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="lightbox-overlay" onClick={onClose}>
      <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
        <div className="lightbox-toolbar">
          {onDownload && (
            <button className="lightbox-btn" onClick={onDownload} title="Download">
              ⬇ Download
            </button>
          )}
          <button className="lightbox-btn lightbox-close" onClick={onClose}>
            ✕
          </button>
        </div>
        {children || (
          <img src={src} alt={alt || 'Enlarged'} className="lightbox-img" />
        )}
      </div>
    </div>
  );
}
