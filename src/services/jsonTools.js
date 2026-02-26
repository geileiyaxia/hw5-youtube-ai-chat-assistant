// ── JSON Tool Declarations (sent to Gemini for function calling) ──────────────

const FIELD_NOTE = 'Use the exact field name from the JSON data (e.g. view_count, like_count, comment_count, duration).';

export const JSON_TOOL_DECLARATIONS = [
  {
    name: 'compute_stats_json',
    description:
      'Compute descriptive statistics (mean, median, std, min, max, count) for any numeric field in the loaded YouTube channel JSON data. ' +
      'Call this when the user asks for statistics, average, distribution, or summary of a numeric field. ' + FIELD_NOTE,
    parameters: {
      type: 'OBJECT',
      properties: {
        field: {
          type: 'STRING',
          description: 'Numeric field name from the JSON data. Common fields: view_count, like_count, comment_count, duration.',
        },
      },
      required: ['field'],
    },
  },
  {
    name: 'plot_metric_vs_time',
    description:
      'Plot a numeric field (views, likes, comments, duration, etc.) vs release date for the channel videos. ' +
      'Creates a time-series chart rendered as a React component in the chat. ' + FIELD_NOTE,
    parameters: {
      type: 'OBJECT',
      properties: {
        metric: {
          type: 'STRING',
          description: 'Field name to plot on Y-axis (e.g. view_count, like_count, comment_count, duration).',
        },
        title: {
          type: 'STRING',
          description: 'Chart title (e.g. "Views Over Time").',
        },
      },
      required: ['metric'],
    },
  },
  {
    name: 'play_video',
    description:
      'Play/open a YouTube video from the loaded channel data. Displays a clickable video card with title and thumbnail that opens in a new tab. ' +
      'The user can specify a video by partial title (e.g. "play the asbestos video"), ordinal (e.g. "play the first video"), or by metric (e.g. "play the most viewed video").',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          description: 'Video identifier: partial title match, ordinal like "first"/"second"/"third"/"last", or metric-based like "most viewed"/"least viewed"/"most liked".',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'generateImage',
    description:
      'Generate an image based on a text prompt and an optional anchor/reference image that the user has attached. ' +
      'Use this when the user explicitly asks to generate, create, make, or edit an image. ' +
      'The generated image will be displayed in the chat with download and enlarge options.',
    parameters: {
      type: 'OBJECT',
      properties: {
        prompt: {
          type: 'STRING',
          description: 'Detailed text description of the image to generate or how to modify the anchor image.',
        },
      },
      required: ['prompt'],
    },
  },
];

// ── Math helpers ──────────────────────────────────────────────────────────────

const numericValues = (data, field) =>
  data.map((r) => parseFloat(r[field])).filter((v) => !isNaN(v));

const median = (sorted) =>
  sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];

const fmt = (n) => +n.toFixed(4);

// ── Field resolver (case-insensitive + underscore-tolerant) ──────────────────

const resolveField = (data, name) => {
  if (!data.length || !name) return name;
  const keys = Object.keys(data[0]);
  if (keys.includes(name)) return name;
  const norm = (s) => s.toLowerCase().replace(/[\s_-]+/g, '');
  const target = norm(name);
  return keys.find((k) => norm(k) === target) || name;
};

// ── Ordinal/query resolver for play_video ────────────────────────────────────

const ORDINALS = {
  first: 0, second: 1, third: 2, fourth: 3, fifth: 4,
  sixth: 5, seventh: 6, eighth: 7, ninth: 8, tenth: 9, last: -1,
};

function resolveVideoQuery(query, data) {
  if (!data.length) return null;
  const q = query.toLowerCase().trim();

  // Ordinal match
  for (const [word, idx] of Object.entries(ORDINALS)) {
    if (q.includes(word)) {
      return idx === -1 ? data[data.length - 1] : data[idx] || null;
    }
  }

  // Metric-based match
  if (q.includes('most viewed') || q.includes('highest view')) {
    return [...data].sort((a, b) => (b.view_count || 0) - (a.view_count || 0))[0];
  }
  if (q.includes('least viewed') || q.includes('lowest view')) {
    return [...data].sort((a, b) => (a.view_count || 0) - (b.view_count || 0))[0];
  }
  if (q.includes('most liked') || q.includes('highest like')) {
    return [...data].sort((a, b) => (b.like_count || 0) - (a.like_count || 0))[0];
  }
  if (q.includes('most comment') || q.includes('most discussed')) {
    return [...data].sort((a, b) => (b.comment_count || 0) - (a.comment_count || 0))[0];
  }
  if (q.includes('longest')) {
    return [...data].sort((a, b) => (b.duration || 0) - (a.duration || 0))[0];
  }
  if (q.includes('shortest')) {
    return [...data].sort((a, b) => (a.duration || 0) - (b.duration || 0))[0];
  }
  if (q.includes('latest') || q.includes('newest') || q.includes('recent')) {
    return [...data].sort((a, b) => (b.release_date || '').localeCompare(a.release_date || ''))[0];
  }
  if (q.includes('oldest') || q.includes('earliest')) {
    return [...data].sort((a, b) => (a.release_date || '').localeCompare(b.release_date || ''))[0];
  }

  // Title fuzzy match
  const words = q.replace(/^(play|open|watch|show)\s+(the\s+)?/i, '').replace(/\s+video$/i, '').trim();
  if (words) {
    const scored = data.map((v) => {
      const title = (v.title || '').toLowerCase();
      const matchWords = words.split(/\s+/).filter((w) => title.includes(w));
      return { video: v, score: matchWords.length };
    }).filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
    if (scored.length) return scored[0].video;
  }

  return null;
}

// ── JSON data summary for Gemini context ─────────────────────────────────────

export const computeJsonSummary = (data) => {
  if (!data?.length) return '';
  const fields = Object.keys(data[0]);
  const numericFields = fields.filter((f) => {
    const vals = numericValues(data, f);
    return vals.length >= data.length * 0.5;
  });

  const lines = [
    `**YouTube Channel Data: ${data.length} videos**`,
    `**Fields:** ${fields.join(', ')}`,
    '',
  ];

  if (numericFields.length) {
    lines.push('**Numeric fields** (use these exact names in tool calls):');
    numericFields.forEach((f) => {
      const vals = numericValues(data, f);
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      lines.push(`  • "${f}": mean=${fmt(mean)}, min=${Math.min(...vals)}, max=${Math.max(...vals)}, n=${vals.length}`);
    });
  }

  const titles = data.slice(0, 5).map((v) => `"${(v.title || '').slice(0, 60)}"`).join(', ');
  lines.push(`\n**Sample titles:** ${titles}${data.length > 5 ? '...' : ''}`);

  return lines.join('\n');
};

// ── Tool executor ─────────────────────────────────────────────────────────────

export const executeJsonTool = (toolName, args, jsonData) => {
  const fields = jsonData.length ? Object.keys(jsonData[0]) : [];

  switch (toolName) {
    case 'compute_stats_json': {
      const field = resolveField(jsonData, args.field);
      const vals = numericValues(jsonData, field);
      if (!vals.length)
        return { error: `No numeric values found for field "${field}". Available fields: ${fields.join(', ')}` };
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const sorted = [...vals].sort((a, b) => a - b);
      const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
      return {
        field,
        count: vals.length,
        mean: fmt(mean),
        median: fmt(median(sorted)),
        std: fmt(Math.sqrt(variance)),
        min: Math.min(...vals),
        max: Math.max(...vals),
      };
    }

    case 'plot_metric_vs_time': {
      const metric = resolveField(jsonData, args.metric);
      const title = args.title || `${metric} Over Time`;

      const chartData = jsonData
        .filter((v) => v.release_date && !isNaN(parseFloat(v[metric])))
        .map((v) => ({
          date: v.release_date,
          value: parseFloat(v[metric]),
          label: (v.title || '').slice(0, 40),
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      if (!chartData.length) {
        return { error: `No data found for metric "${metric}" with release dates. Available fields: ${fields.join(', ')}` };
      }

      return {
        _chartType: 'metric_vs_time',
        metric,
        title,
        data: chartData,
      };
    }

    case 'play_video': {
      const video = resolveVideoQuery(args.query, jsonData);
      if (!video) {
        const titles = jsonData.slice(0, 5).map((v) => v.title).join(', ');
        return { error: `Could not find a video matching "${args.query}". Available titles: ${titles}...` };
      }
      return {
        _cardType: 'video',
        title: video.title,
        thumbnail: video.thumbnail,
        video_url: video.video_url,
        video_id: video.video_id,
        view_count: video.view_count,
        like_count: video.like_count,
        release_date: video.release_date,
      };
    }

    case 'generateImage': {
      return {
        _generateImage: true,
        prompt: args.prompt,
      };
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
};
