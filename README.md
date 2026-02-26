# YouTube AI Chat Assistant

A React chatbot with Gemini AI, YouTube channel data analysis, web search, image generation, and interactive charts. Built for HW5 of "Generative AI and Social Media" at Yale SOM.

## Features

- **User personalization** — First Name and Last Name in account creation, saved to DB, used in AI chat context
- **YouTube Channel Download tab** — Enter a channel URL, download video metadata (title, description, transcript, stats) as JSON
- **JSON chat input** — Drag-and-drop JSON files into chat; loads into Gemini context for analysis
- **generateImage tool** — Generate images from text prompts + anchor images; display with lightbox and download
- **plot_metric_vs_time tool** — Chart any numeric field vs time as interactive Recharts component
- **play_video tool** — Show clickable video cards (thumbnail + title) that open on YouTube
- **compute_stats_json tool** — Mean, median, std, min, max for any numeric field in channel data
- **CSV analysis tools** — Original CSV tools (stats, value counts, top tweets) still available
- **Google Search grounding** — Cited web sources for factual queries
- **Python code execution** — Gemini writes and runs Python for complex analysis

## Setup

### Environment Variables

Create a `.env` file:

```
REACT_APP_GEMINI_API_KEY=your_gemini_api_key
REACT_APP_MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/
YOUTUBE_API_KEY=your_youtube_data_api_v3_key
```

- **REACT_APP_GEMINI_API_KEY** — Get at [Google AI Studio](https://aistudio.google.com/apikey)
- **REACT_APP_MONGODB_URI** — MongoDB Atlas connection string
- **YOUTUBE_API_KEY** — Get at [Google Cloud Console](https://console.cloud.google.com/apis/credentials) (enable YouTube Data API v3)

### Install & Run

```bash
npm install
npm start
```

This starts both the backend (port 3001) and frontend (port 3000).

## Pre-downloaded Data

`public/veritasium_data.json` contains metadata for 10 videos from the Veritasium YouTube channel, downloaded using the YouTube Channel Download tab.

## Architecture

- **Frontend (React)** — Login, chat UI with streaming, drag-and-drop JSON/CSV/images, Recharts charts, video cards, image lightbox
- **Backend (Express)** — REST API for users, sessions, YouTube channel data download
- **AI (Gemini)** — Streaming chat, Google Search grounding, Python code execution, function calling for client-side tools
- **Storage (MongoDB)** — Users (with firstName/lastName) and chat sessions

## Dependencies

### New (added for HW5)
| Package | Purpose |
|---------|---------|
| googleapis | YouTube Data API v3 client |
| youtube-transcript | Fetch video transcripts |

### Existing
| Package | Purpose |
|---------|---------|
| @google/generative-ai | Gemini API client |
| react, react-dom | UI framework |
| recharts | Interactive charts |
| express | HTTP server |
| mongodb | Database driver |
| bcryptjs | Password hashing |
