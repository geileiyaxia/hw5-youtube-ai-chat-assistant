import { useRef, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import ImageLightbox from './ImageLightbox';

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{
      background: 'rgba(15,15,30,0.95)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 10,
      padding: '0.6rem 0.85rem',
      fontSize: '0.82rem',
      color: '#e2e8f0',
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      maxWidth: 280,
    }}>
      <div style={{ fontWeight: 700, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {d.label || d.date}
      </div>
      <div style={{ color: '#818cf8' }}>
        {payload[0].value?.toLocaleString()}
      </div>
      <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
        {d.date}
      </div>
    </div>
  );
}

export default function MetricChart({ data, metric, title }) {
  const [lightbox, setLightbox] = useState(false);
  const chartRef = useRef(null);

  if (!data?.length) return null;

  const chartTitle = title || `${metric} Over Time`;

  const handleDownload = () => {
    const svg = chartRef.current?.querySelector('svg');
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width * 2;
      canvas.height = img.height * 2;
      ctx.scale(2, 2);
      ctx.fillStyle = '#0d1117';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      const a = document.createElement('a');
      a.download = `${metric}_vs_time.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  const chart = (enlarged) => (
    <div ref={enlarged ? null : chartRef}>
      <ResponsiveContainer width="100%" height={enlarged ? 450 : 260}>
        <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey="date"
            tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
            tickLine={false}
            angle={-30}
            textAnchor="end"
            height={60}
          />
          <YAxis
            tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1e3 ? `${(v/1e3).toFixed(0)}K` : v}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#818cf8"
            strokeWidth={2}
            dot={{ fill: '#818cf8', r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );

  return (
    <>
      <div
        className="metric-chart-wrap"
        onClick={() => setLightbox(true)}
        style={{ cursor: 'pointer' }}
      >
        <div className="metric-chart-header">
          <p className="metric-chart-label">{chartTitle}</p>
          <button
            className="metric-chart-download"
            onClick={(e) => { e.stopPropagation(); handleDownload(); }}
            title="Download as PNG"
          >
            ⬇
          </button>
        </div>
        {chart(false)}
      </div>
      {lightbox && (
        <ImageLightbox onClose={() => setLightbox(false)} onDownload={handleDownload}>
          <div style={{ width: '80vw', maxWidth: 1000 }}>
            <p style={{ color: '#fff', fontWeight: 700, fontSize: '1.1rem', margin: '0 0 0.75rem' }}>
              {chartTitle}
            </p>
            {chart(true)}
          </div>
        </ImageLightbox>
      )}
    </>
  );
}
