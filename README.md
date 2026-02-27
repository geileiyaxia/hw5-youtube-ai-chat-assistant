# YouTube AI Chat Assistant

A React chatbot powered by Google Gemini AI that analyzes YouTube channel data, generates images, creates interactive charts, and more. Built for HW5 of "Generative AI and Social Media" at Yale School of Management.

## Features Added for HW5

### 1. Chat Personalization

- Added **First Name** and **Last Name** fields to the Create Account form.
- Names are saved to MongoDB and returned on login.
- The user's full name is injected into every chat message as context (`[User: First Last]`), so the AI greets and addresses the user by name.

### 2. YouTube Channel Data Download Tab

- A new **"YouTube Channel Download"** tab appears after login.
- Enter any YouTube channel URL (e.g. `https://www.youtube.com/@veritasium`), set a max videos count (default 10, max 100), and click **Download Channel Data**.
- The backend uses the YouTube Data API v3 to fetch video metadata: title, description, transcript, duration, release date, view count, like count, comment count, video URL, and thumbnail.
- A **progress bar** streams real-time updates via Server-Sent Events (SSE) as each video is processed.
- Once complete, a summary table is displayed and users can **download the results as a JSON file**.
- A sample dataset for 10 Veritasium videos is included at `public/veritasium_data.json`.

### 3. JSON Chat Input

- Users can **drag and drop** a `.json` file into the chat area (or use the paperclip attachment button).
- The JSON data is parsed, loaded into the conversation context, and a summary of the dataset (field names, numeric ranges, sample titles) is sent to Gemini with every message.
- A **JSON chip** appears in the input area showing the file name, video count, and number of fields.
- All four chat tools below become available once JSON data is loaded.

### 4. Chat Tool: `generateImage`

- Generates an image from a **text prompt** and an optional **anchor/reference image** that the user drags in.
- Uses the Gemini `gemini-2.5-flash-image` model with native multimodal output (`responseModalities: ['TEXT', 'IMAGE']`).
- The generated image is displayed inline in the chat with:
  - A **download button** to save the image locally.
  - **Click-to-enlarge** lightbox view for full-size inspection.
- Works both with and without JSON data loaded.

### 5. Chat Tool: `plot_metric_vs_time`

- Plots any numeric field (views, likes, comments, duration, etc.) against release date as a **time-series line chart**.
- Rendered as an interactive **Recharts `LineChart`** React component directly in the chat.
- Custom tooltips show video title, metric value, and date on hover.
- **Click the chart** to open an enlarged lightbox view.
- **Download button** exports the chart as a high-resolution PNG.
- Example prompt: *"Plot views over time"*

### 6. Chat Tool: `play_video`

- Displays a **clickable video card** with the video's thumbnail, title, view/like counts, and release date.
- Clicking the card **opens the video on YouTube in a new tab**.
- Users can specify which video by:
  - **Title** (fuzzy match): *"play the asbestos video"*
  - **Ordinal**: *"play the first video"*, *"play the last video"*
  - **Metric**: *"play the most viewed video"*, *"play the longest video"*

### 7. Chat Tool: `compute_stats_json`

- Computes **mean, median, standard deviation, min, max, and count** for any numeric field in the loaded JSON data.
- Supports case-insensitive and flexible field name matching (e.g. "views" resolves to `view_count`).
- Triggered when users ask for statistics, averages, or distributions.
- Example prompt: *"What are the stats for view count?"*

### 8. Prompt Engineering

- The system prompt (`public/prompt_chat.txt`) defines the AI as a **YouTube Analysis Assistant** for the course.
- It documents the expected **JSON data format** with all field names.
- Each of the four tools is described with its **purpose, parameters, and example usage**.
- **Tool routing guidance** tells the AI when to use each tool vs. Python code execution vs. Google Search.

### Existing Features (from base chat app)

- **Google Search grounding** — Cited web sources for factual queries
- **Python code execution** — Gemini writes and runs Python for complex analysis (regression, scatter plots, etc.)
- **CSV analysis tools** — Original CSV tools (stats, value counts, top tweets) still available
- **Streaming chat** — Real-time token-by-token response display
- **Image input** — Drag, paste, or attach images for multimodal chat

## Setup

### Environment Variables

Copy `.env.example` to `.env` and fill in your keys:

```
REACT_APP_GEMINI_API_KEY=your_gemini_api_key
REACT_APP_MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/
YOUTUBE_API_KEY=your_youtube_data_api_v3_key
```

| Variable | Where to get it |
|----------|----------------|
| `REACT_APP_GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) |
| `REACT_APP_MONGODB_URI` | [MongoDB Atlas](https://cloud.mongodb.com/) — create a free cluster |
| `YOUTUBE_API_KEY` | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) — enable YouTube Data API v3 |

### Install & Run

```bash
npm install
npm start
```

This starts both the Express backend (port 3001) and React frontend (port 3000) concurrently.

## How to Use

1. **Create an account** with your first name, last name, username, email, and password.
2. **Log in** and you'll see two tabs: **Chat** and **YouTube Channel Download**.
3. Go to the **YouTube Channel Download** tab, enter a channel URL, and download the data as JSON.
4. Switch to the **Chat** tab and **drag the downloaded JSON file** into the chat area.
5. Once the JSON chip appears, ask the AI anything:
   - *"What are the stats for view count?"* → `compute_stats_json`
   - *"Plot likes over time"* → `plot_metric_vs_time`
   - *"Play the most viewed video"* → `play_video`
   - *"Generate an image of a YouTube thumbnail about physics"* → `generateImage`

## Pre-downloaded Data

`public/veritasium_data.json` contains metadata for 10 videos from the [Veritasium](https://www.youtube.com/@veritasium) YouTube channel, downloaded using the YouTube Channel Download tab.

## Architecture

| Layer | Technology | Responsibility |
|-------|-----------|---------------|
| Frontend | React | Login, chat UI with streaming, drag-and-drop file handling, Recharts charts, video cards, image lightbox |
| Backend | Express.js | REST API for users, sessions, messages, YouTube channel data download (SSE) |
| AI | Google Gemini | Streaming chat (`gemini-2.5-flash`), image generation (`gemini-2.5-flash-image`), function calling for client-side tools, Google Search grounding, Python code execution |
| Storage | MongoDB | Users (with firstName/lastName), chat sessions, messages (including charts, video cards, generated images) |

## Key Files

| File | Purpose |
|------|---------|
| `src/components/Auth.js` | Login and account creation with first/last name |
| `src/components/Chat.js` | Main chat UI, file handling, tool routing |
| `src/components/YouTubeDownload.js` | YouTube Channel Download tab |
| `src/components/MetricChart.js` | Recharts line chart for `plot_metric_vs_time` |
| `src/components/VideoCard.js` | Clickable video card for `play_video` |
| `src/components/ImageLightbox.js` | Full-screen lightbox for images and charts |
| `src/services/gemini.js` | Gemini API integration (streaming, function calling, image generation) |
| `src/services/jsonTools.js` | JSON tool declarations and client-side execution |
| `src/services/mongoApi.js` | Frontend API client for the Express backend |
| `server/index.js` | Express server (auth, sessions, YouTube download endpoint) |
| `public/prompt_chat.txt` | System prompt defining the AI persona and tools |

## Dependencies

### New (added for HW5)

| Package | Purpose |
|---------|---------|
| `googleapis` | YouTube Data API v3 client |
| `youtube-transcript` | Fetch video transcripts |
| `recharts` | Interactive React charts for `plot_metric_vs_time` |

### Existing

| Package | Purpose |
|---------|---------|
| `@google/generative-ai` | Gemini API client |
| `react`, `react-dom` | UI framework |
| `express` | HTTP server |
| `mongodb` | Database driver |
| `bcryptjs` | Password hashing |
| `react-markdown`, `remark-gfm` | Markdown rendering in chat |
