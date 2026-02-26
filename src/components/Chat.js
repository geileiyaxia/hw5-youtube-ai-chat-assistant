import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { streamChat, chatWithCsvTools, chatWithJsonTools, generateImageWithGemini, CODE_KEYWORDS } from '../services/gemini';
import { parseCsvToRows, executeTool, computeDatasetSummary, enrichWithEngagement, buildSlimCsv } from '../services/csvTools';
import { executeJsonTool, computeJsonSummary } from '../services/jsonTools';
import {
  getSessions,
  createSession,
  deleteSession,
  saveMessage,
  loadMessages,
} from '../services/mongoApi';
import EngagementChart from './EngagementChart';
import MetricChart from './MetricChart';
import VideoCard from './VideoCard';
import ImageLightbox from './ImageLightbox';
import './Chat.css';

// ── Helpers ───────────────────────────────────────────────────────────────────

const chatTitle = () => {
  const d = new Date();
  return `Chat · ${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};

const toBase64 = (str) => {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
};

const parseCSV = (text) => {
  const lines = text.split('\n').filter((l) => l.trim());
  if (!lines.length) return null;
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const rowCount = lines.length - 1;
  const preview = lines.slice(0, 6).join('\n');
  const raw = text.length > 500000 ? text.slice(0, 500000) : text;
  const base64 = toBase64(raw);
  const truncated = text.length > 500000;
  return { headers, rowCount, preview, base64, truncated };
};

const messageText = (m) => {
  if (m.parts) return m.parts.filter((p) => p.type === 'text').map((p) => p.text).join('\n');
  return m.content || '';
};

// ── Structured part renderer (code execution responses) ───────────────────────

function StructuredParts({ parts }) {
  return (
    <>
      {parts.map((part, i) => {
        if (part.type === 'text' && part.text?.trim()) {
          return (
            <div key={i} className="part-text">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.text}</ReactMarkdown>
            </div>
          );
        }
        if (part.type === 'code') {
          return (
            <div key={i} className="part-code">
              <div className="part-code-header">
                <span className="part-code-lang">
                  {part.language === 'PYTHON' ? 'Python' : part.language}
                </span>
              </div>
              <pre className="part-code-body">
                <code>{part.code}</code>
              </pre>
            </div>
          );
        }
        if (part.type === 'result') {
          const ok = part.outcome === 'OUTCOME_OK';
          return (
            <div key={i} className="part-result">
              <div className="part-result-header">
                <span className={`part-result-badge ${ok ? 'ok' : 'err'}`}>
                  {ok ? '✓ Output' : '✗ Error'}
                </span>
              </div>
              <pre className="part-result-body">{part.output}</pre>
            </div>
          );
        }
        if (part.type === 'image') {
          return (
            <img
              key={i}
              src={`data:${part.mimeType};base64,${part.data}`}
              alt="Generated plot"
              className="part-image"
            />
          );
        }
        return null;
      })}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Chat({ user, onLogout }) {
  const username = user?.username || user;
  const userFirstName = user?.firstName || '';
  const userLastName = user?.lastName || '';
  const userFullName = [userFirstName, userLastName].filter(Boolean).join(' ');

  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [images, setImages] = useState([]);
  const [csvContext, setCsvContext] = useState(null);
  const [sessionCsvRows, setSessionCsvRows] = useState(null);
  const [sessionCsvHeaders, setSessionCsvHeaders] = useState(null);
  const [csvDataSummary, setCsvDataSummary] = useState(null);
  const [sessionSlimCsv, setSessionSlimCsv] = useState(null);
  // JSON state
  const [jsonContext, setJsonContext] = useState(null);     // { name, data, fields }
  const [sessionJsonData, setSessionJsonData] = useState(null);  // raw array
  const [jsonSummary, setJsonSummary] = useState(null);
  const [streaming, setStreaming] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [openMenuId, setOpenMenuId] = useState(null);
  // Lightbox state
  const [lightboxImage, setLightboxImage] = useState(null);

  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(false);
  const fileInputRef = useRef(null);
  const justCreatedSessionRef = useRef(false);

  useEffect(() => {
    const init = async () => {
      const list = await getSessions(username);
      setSessions(list);
      setActiveSessionId('new');
    };
    init();
  }, [username]);

  useEffect(() => {
    if (!activeSessionId || activeSessionId === 'new') {
      setMessages([]);
      return;
    }
    if (justCreatedSessionRef.current) {
      justCreatedSessionRef.current = false;
      return;
    }
    setMessages([]);
    loadMessages(activeSessionId).then(setMessages);
  }, [activeSessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!openMenuId) return;
    const handler = () => setOpenMenuId(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [openMenuId]);

  // ── Session management ──────────────────────────────────────────────────────

  const handleNewChat = () => {
    setActiveSessionId('new');
    setMessages([]);
    setInput('');
    setImages([]);
    setCsvContext(null);
    setSessionCsvRows(null);
    setSessionCsvHeaders(null);
    setJsonContext(null);
    setSessionJsonData(null);
    setJsonSummary(null);
  };

  const handleSelectSession = (sessionId) => {
    if (sessionId === activeSessionId) return;
    setActiveSessionId(sessionId);
    setInput('');
    setImages([]);
    setCsvContext(null);
    setSessionCsvRows(null);
    setSessionCsvHeaders(null);
    setJsonContext(null);
    setSessionJsonData(null);
    setJsonSummary(null);
  };

  const handleDeleteSession = async (sessionId, e) => {
    e.stopPropagation();
    setOpenMenuId(null);
    await deleteSession(sessionId);
    const remaining = sessions.filter((s) => s.id !== sessionId);
    setSessions(remaining);
    if (activeSessionId === sessionId) {
      setActiveSessionId(remaining.length > 0 ? remaining[0].id : 'new');
      setMessages([]);
    }
  };

  // ── File handling ───────────────────────────────────────────────────────────

  const fileToBase64 = (file) =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result.split(',')[1]);
      r.onerror = reject;
      r.readAsDataURL(file);
    });

  const fileToText = (file) =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsText(file);
    });

  const handleJsonFile = async (file) => {
    try {
      const text = await fileToText(file);
      const data = JSON.parse(text);
      const arr = Array.isArray(data) ? data : [data];
      if (!arr.length) return;
      const fields = Object.keys(arr[0]);
      setJsonContext({ name: file.name, count: arr.length, fields });
      setSessionJsonData(arr);
      setJsonSummary(computeJsonSummary(arr));
    } catch (err) {
      console.error('Failed to parse JSON:', err);
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setDragOver(false);
    const files = [...e.dataTransfer.files];

    const csvFiles = files.filter((f) => f.name.endsWith('.csv') || f.type === 'text/csv');
    const jsonFiles = files.filter((f) => f.name.endsWith('.json') || f.type === 'application/json');
    const imageFiles = files.filter((f) => f.type.startsWith('image/'));

    if (jsonFiles.length > 0) {
      await handleJsonFile(jsonFiles[0]);
    }

    if (csvFiles.length > 0) {
      const file = csvFiles[0];
      const text = await fileToText(file);
      const parsed = parseCSV(text);
      if (parsed) {
        setCsvContext({ name: file.name, ...parsed });
        const raw = parseCsvToRows(text);
        const { rows, headers } = enrichWithEngagement(raw.rows, raw.headers);
        setSessionCsvHeaders(headers);
        setSessionCsvRows(rows);
        setCsvDataSummary(computeDatasetSummary(rows, headers));
        setSessionSlimCsv(buildSlimCsv(rows, headers));
      }
    }

    if (imageFiles.length > 0) {
      const newImages = await Promise.all(
        imageFiles.map(async (f) => ({
          data: await fileToBase64(f),
          mimeType: f.type,
          name: f.name,
        }))
      );
      setImages((prev) => [...prev, ...newImages]);
    }
  };

  const handleFileSelect = async (e) => {
    const files = [...e.target.files];
    e.target.value = '';

    const csvFiles = files.filter((f) => f.name.endsWith('.csv') || f.type === 'text/csv');
    const jsonFiles = files.filter((f) => f.name.endsWith('.json') || f.type === 'application/json');
    const imageFiles = files.filter((f) => f.type.startsWith('image/'));

    if (jsonFiles.length > 0) {
      await handleJsonFile(jsonFiles[0]);
    }

    if (csvFiles.length > 0) {
      const text = await fileToText(csvFiles[0]);
      const parsed = parseCSV(text);
      if (parsed) {
        setCsvContext({ name: csvFiles[0].name, ...parsed });
        const raw = parseCsvToRows(text);
        const { rows, headers } = enrichWithEngagement(raw.rows, raw.headers);
        setSessionCsvHeaders(headers);
        setSessionCsvRows(rows);
        setCsvDataSummary(computeDatasetSummary(rows, headers));
        setSessionSlimCsv(buildSlimCsv(rows, headers));
      }
    }
    if (imageFiles.length > 0) {
      const newImages = await Promise.all(
        imageFiles.map(async (f) => ({
          data: await fileToBase64(f),
          mimeType: f.type,
          name: f.name,
        }))
      );
      setImages((prev) => [...prev, ...newImages]);
    }
  };

  const handlePaste = async (e) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imageItems = items.filter((item) => item.type.startsWith('image/'));
    if (!imageItems.length) return;
    e.preventDefault();
    const newImages = await Promise.all(
      imageItems.map(
        (item) =>
          new Promise((resolve) => {
            const file = item.getAsFile();
            if (!file) return resolve(null);
            const reader = new FileReader();
            reader.onload = () =>
              resolve({ data: reader.result.split(',')[1], mimeType: file.type, name: 'pasted-image' });
            reader.readAsDataURL(file);
          })
      )
    );
    setImages((prev) => [...prev, ...newImages.filter(Boolean)]);
  };

  const handleStop = () => {
    abortRef.current = true;
  };

  // ── Send message ────────────────────────────────────────────────────────────

  const handleSend = async () => {
    const text = input.trim();
    if ((!text && !images.length && !csvContext && !jsonContext) || streaming || !activeSessionId) return;

    let sessionId = activeSessionId;
    if (sessionId === 'new') {
      const title = chatTitle();
      const { id } = await createSession(username, 'lisa', title);
      sessionId = id;
      justCreatedSessionRef.current = true;
      setActiveSessionId(id);
      setSessions((prev) => [{ id, agent: 'lisa', title, createdAt: new Date().toISOString(), messageCount: 0 }, ...prev]);
    }

    // ── Routing ──
    const PYTHON_ONLY_KEYWORDS = /\b(regression|scatter|histogram|seaborn|matplotlib|numpy|time.?series|heatmap|box.?plot|violin|distribut|linear.?model|logistic|forecast|trend.?line)\b/i;
    const IMAGE_GEN_KEYWORDS = /\b(generate\s+(an?\s+)?image|create\s+(an?\s+)?image|make\s+(an?\s+)?image|draw|generate\s+picture|create\s+picture)\b/i;
    const wantPythonOnly = PYTHON_ONLY_KEYWORDS.test(text);
    const wantCode = CODE_KEYWORDS.test(text) && !sessionCsvRows && !sessionJsonData;
    const wantImageGen = IMAGE_GEN_KEYWORDS.test(text) || (images.length > 0 && /\b(generate|create|make|edit|transform|modify)\b/i.test(text));
    const capturedCsv = csvContext;
    const capturedJson = jsonContext;
    const hasJsonInSession = !!sessionJsonData || !!capturedJson;
    const needsBase64 = !!capturedCsv && wantPythonOnly;

    // Mode selection:
    //   useJsonTools    — JSON loaded + relevant question → JSON function calling
    //   useTools        — CSV loaded + no Python needed → CSV client-side tools
    //   useCodeExecution — Python explicitly needed
    //   else            — Google Search streaming
    const useJsonTools = hasJsonInSession && !wantPythonOnly && !wantCode;
    const useTools = !!sessionCsvRows && !wantPythonOnly && !wantCode && !capturedCsv && !useJsonTools;
    const useCodeExecution = (wantPythonOnly || wantCode) && !useJsonTools;

    // ── Build prompt ──
    const userNamePrefix = userFullName ? `[User: ${userFullName}]\n` : '';
    const sessionSummary = csvDataSummary || '';
    const slimCsvBlock = sessionSlimCsv
      ? `\n\nFull dataset (key columns):\n\`\`\`csv\n${sessionSlimCsv}\n\`\`\``
      : '';

    const csvPrefix = capturedCsv
      ? needsBase64
        ? `[CSV File: "${capturedCsv.name}" | ${capturedCsv.rowCount} rows | Columns: ${capturedCsv.headers.join(', ')}]\n\n${sessionSummary}${slimCsvBlock}\n\nIMPORTANT — to load the full data in Python use this exact pattern:\n\`\`\`python\nimport pandas as pd, io, base64\ndf = pd.read_csv(io.BytesIO(base64.b64decode("${capturedCsv.base64}")))\n\`\`\`\n\n---\n\n`
        : `[CSV File: "${capturedCsv.name}" | ${capturedCsv.rowCount} rows | Columns: ${capturedCsv.headers.join(', ')}]\n\n${sessionSummary}${slimCsvBlock}\n\n---\n\n`
      : sessionSummary
      ? `[CSV columns: ${sessionCsvHeaders?.join(', ')}]\n\n${sessionSummary}\n\n---\n\n`
      : '';

    const jsonPrefix = hasJsonInSession
      ? `[JSON Data: ${sessionJsonData?.length || capturedJson?.count || 0} videos | Fields: ${(sessionJsonData ? Object.keys(sessionJsonData[0]) : capturedJson?.fields || []).join(', ')}]\n\n${jsonSummary || ''}\n\n---\n\n`
      : '';

    const userContent = text || (images.length ? '(Image)' : capturedJson ? '(JSON attached)' : '(CSV attached)');
    const promptForGemini = userNamePrefix + jsonPrefix + csvPrefix + (text || (images.length ? 'What do you see in this image?' : capturedJson ? 'I have uploaded YouTube channel data as JSON. What can you tell me about it?' : 'Please analyze this CSV data.'));

    const userMsg = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: userContent,
      timestamp: new Date().toISOString(),
      images: [...images],
      csvName: capturedCsv?.name || null,
      jsonName: capturedJson?.name || null,
    };

    setMessages((m) => [...m, userMsg]);
    setInput('');
    const capturedImages = [...images];
    setImages([]);
    setCsvContext(null);
    setJsonContext(null);
    setStreaming(true);

    await saveMessage(sessionId, 'user', userContent, capturedImages.length ? capturedImages : null);

    const imageParts = capturedImages.map((img) => ({ mimeType: img.mimeType, data: img.data }));

    const history = messages
      .filter((m) => m.role === 'user' || m.role === 'model')
      .map((m) => ({ role: m.role, content: m.content || messageText(m) }));

    const assistantId = `a-${Date.now()}`;
    setMessages((m) => [
      ...m,
      { id: assistantId, role: 'model', content: '', timestamp: new Date().toISOString() },
    ]);

    abortRef.current = false;

    let fullContent = '';
    let groundingData = null;
    let structuredParts = null;
    let toolCharts = [];
    let toolVideoCards = [];
    let toolCalls = [];
    let generatedImages = [];

    try {
      if (useJsonTools) {
        // ── JSON function-calling path ──
        console.log('[Chat] useJsonTools=true | videos:', sessionJsonData?.length);
        const jsonFields = sessionJsonData ? Object.keys(sessionJsonData[0]) : [];
        const { text: answer, charts, videoCards, toolCalls: calls, generateImageResult } = await chatWithJsonTools(
          history,
          promptForGemini,
          jsonFields,
          (toolName, args) => executeJsonTool(toolName, args, sessionJsonData || []),
          imageParts
        );
        fullContent = answer;
        toolCharts = charts || [];
        toolVideoCards = videoCards || [];
        toolCalls = calls || [];

        // Handle generateImage tool call
        if (generateImageResult?._generateImage) {
          try {
            const anchorImage = capturedImages.length ? capturedImages[0] : null;
            const genResult = await generateImageWithGemini(
              generateImageResult.prompt,
              anchorImage?.data || null,
              anchorImage?.mimeType || 'image/png'
            );
            if (genResult.imageData) {
              generatedImages.push({ data: genResult.imageData, mimeType: genResult.mimeType || 'image/png' });
              if (genResult.text) fullContent = genResult.text + '\n\n' + fullContent;
            }
          } catch (err) {
            fullContent += `\n\n(Image generation failed: ${err.message})`;
          }
        }

        // Handle image gen requested directly via wantImageGen
        if (wantImageGen && !generateImageResult?._generateImage) {
          try {
            const anchorImage = capturedImages.length ? capturedImages[0] : null;
            const genResult = await generateImageWithGemini(
              text,
              anchorImage?.data || null,
              anchorImage?.mimeType || 'image/png'
            );
            if (genResult.imageData) {
              generatedImages.push({ data: genResult.imageData, mimeType: genResult.mimeType || 'image/png' });
              if (genResult.text) fullContent = genResult.text;
            }
          } catch (err) {
            fullContent += `\n\n(Image generation failed: ${err.message})`;
          }
        }

        setMessages((m) =>
          m.map((msg) =>
            msg.id === assistantId
              ? {
                  ...msg,
                  content: fullContent,
                  charts: toolCharts.length ? toolCharts : undefined,
                  videoCards: toolVideoCards.length ? toolVideoCards : undefined,
                  toolCalls: toolCalls.length ? toolCalls : undefined,
                  generatedImages: generatedImages.length ? generatedImages : undefined,
                }
              : msg
          )
        );
      } else if (useTools) {
        // ── CSV function-calling path ──
        console.log('[Chat] useTools=true | rows:', sessionCsvRows.length, '| headers:', sessionCsvHeaders);
        const { text: answer, charts: returnedCharts, toolCalls: returnedCalls } = await chatWithCsvTools(
          history,
          promptForGemini,
          sessionCsvHeaders,
          (toolName, args) => executeTool(toolName, args, sessionCsvRows)
        );
        fullContent = answer;
        toolCharts = returnedCharts || [];
        toolCalls = returnedCalls || [];
        setMessages((m) =>
          m.map((msg) =>
            msg.id === assistantId
              ? {
                  ...msg,
                  content: fullContent,
                  charts: toolCharts.length ? toolCharts : undefined,
                  toolCalls: toolCalls.length ? toolCalls : undefined,
                }
              : msg
          )
        );
      } else if (wantImageGen && !useJsonTools) {
        // ── Direct image generation path (no JSON loaded) ──
        try {
          const anchorImage = capturedImages.length ? capturedImages[0] : null;
          const genResult = await generateImageWithGemini(
            text,
            anchorImage?.data || null,
            anchorImage?.mimeType || 'image/png'
          );
          if (genResult.imageData) {
            generatedImages.push({ data: genResult.imageData, mimeType: genResult.mimeType || 'image/png' });
          }
          fullContent = genResult.text || 'Here is the generated image:';
        } catch (err) {
          fullContent = `Image generation failed: ${err.message}`;
        }
        setMessages((m) =>
          m.map((msg) =>
            msg.id === assistantId
              ? { ...msg, content: fullContent, generatedImages: generatedImages.length ? generatedImages : undefined }
              : msg
          )
        );
      } else {
        // ── Streaming path: code execution or search ──
        for await (const chunk of streamChat(history, promptForGemini, imageParts, useCodeExecution)) {
          if (abortRef.current) break;
          if (chunk.type === 'text') {
            fullContent += chunk.text;
            setMessages((m) =>
              m.map((msg) => (msg.id === assistantId ? { ...msg, content: fullContent } : msg))
            );
          } else if (chunk.type === 'fullResponse') {
            structuredParts = chunk.parts;
            setMessages((m) =>
              m.map((msg) =>
                msg.id === assistantId ? { ...msg, content: '', parts: structuredParts } : msg
              )
            );
          } else if (chunk.type === 'grounding') {
            groundingData = chunk.data;
          }
        }
      }
    } catch (err) {
      const errText = `Error: ${err.message}`;
      setMessages((m) =>
        m.map((msg) => (msg.id === assistantId ? { ...msg, content: errText } : msg))
      );
      fullContent = errText;
    }

    if (groundingData) {
      setMessages((m) =>
        m.map((msg) => (msg.id === assistantId ? { ...msg, grounding: groundingData } : msg))
      );
    }

    const savedContent = structuredParts
      ? structuredParts.filter((p) => p.type === 'text').map((p) => p.text).join('\n')
      : fullContent;
    await saveMessage(
      sessionId,
      'model',
      savedContent,
      generatedImages.length ? generatedImages : null,
      toolCharts.length ? toolCharts : null,
      toolCalls.length ? toolCalls : null
    );

    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, messageCount: s.messageCount + 2 } : s))
    );

    setStreaming(false);
    inputRef.current?.focus();
  };

  const removeImage = (i) => setImages((prev) => prev.filter((_, idx) => idx !== i));

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    const diffDays = Math.floor((Date.now() - d) / 86400000);
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 0) return `Today · ${time}`;
    if (diffDays === 1) return `Yesterday · ${time}`;
    return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${time}`;
  };

  const handleImageDownload = (imgData, mimeType) => {
    const ext = mimeType?.includes('png') ? 'png' : 'jpg';
    const a = document.createElement('a');
    a.href = `data:${mimeType};base64,${imgData}`;
    a.download = `generated_image.${ext}`;
    a.click();
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="chat-layout">
      {/* ── Sidebar ──────────────────────────────── */}
      <aside className="chat-sidebar">
        <div className="sidebar-top">
          <h1 className="sidebar-title">Chat</h1>
          <button className="new-chat-btn" onClick={handleNewChat}>
            + New Chat
          </button>
        </div>

        <div className="sidebar-sessions">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`sidebar-session${session.id === activeSessionId ? ' active' : ''}`}
              onClick={() => handleSelectSession(session.id)}
            >
              <div className="sidebar-session-info">
                <span className="sidebar-session-title">{session.title}</span>
                <span className="sidebar-session-date">{formatDate(session.createdAt)}</span>
              </div>
              <div
                className="sidebar-session-menu"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenMenuId(openMenuId === session.id ? null : session.id);
                }}
              >
                <span className="three-dots">⋮</span>
                {openMenuId === session.id && (
                  <div className="session-dropdown">
                    <button
                      className="session-delete-btn"
                      onClick={(e) => handleDeleteSession(session.id, e)}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <span className="sidebar-username">{userFullName || username}</span>
          <button onClick={onLogout} className="sidebar-logout">
            Log out
          </button>
        </div>
      </aside>

      {/* ── Main chat area ───────────────────────── */}
      <div className="chat-main">
        <>
        <header className="chat-header">
          <h2 className="chat-header-title">{activeSession?.title ?? 'New Chat'}</h2>
        </header>

        <div
          className={`chat-messages${dragOver ? ' drag-over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          {messages.map((m) => (
            <div key={m.id} className={`chat-msg ${m.role}`}>
              <div className="chat-msg-meta">
                <span className="chat-msg-role">{m.role === 'user' ? (userFirstName || username) : 'AI'}</span>
                <span className="chat-msg-time">
                  {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              {m.csvName && (
                <div className="msg-csv-badge">📄 {m.csvName}</div>
              )}
              {m.jsonName && (
                <div className="msg-json-badge">📋 {m.jsonName}</div>
              )}

              {m.images?.length > 0 && (
                <div className="chat-msg-images">
                  {m.images.map((img, i) => (
                    <img key={i} src={`data:${img.mimeType};base64,${img.data}`} alt="" className="chat-msg-thumb" />
                  ))}
                </div>
              )}

              <div className="chat-msg-content">
                {m.role === 'model' ? (
                  m.parts ? (
                    <StructuredParts parts={m.parts} />
                  ) : m.content ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                  ) : (
                    <span className="thinking-dots">
                      <span /><span /><span />
                    </span>
                  )
                ) : (
                  m.content
                )}
              </div>

              {/* Generated images */}
              {m.generatedImages?.length > 0 && (
                <div className="generated-images-wrap">
                  {m.generatedImages.map((img, i) => (
                    <div key={i} className="generated-image-container">
                      <img
                        src={`data:${img.mimeType};base64,${img.data}`}
                        alt="Generated"
                        className="generated-image"
                        onClick={() => setLightboxImage(img)}
                      />
                      <button
                        className="generated-image-download"
                        onClick={() => handleImageDownload(img.data, img.mimeType)}
                        title="Download image"
                      >
                        ⬇
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Video cards from play_video tool */}
              {m.videoCards?.length > 0 && (
                <div className="video-cards-wrap">
                  {m.videoCards.map((vc, i) => (
                    <VideoCard key={i} video={vc} />
                  ))}
                </div>
              )}

              {/* Tool calls log */}
              {m.toolCalls?.length > 0 && (
                <details className="tool-calls-details">
                  <summary className="tool-calls-summary">
                    🔧 {m.toolCalls.length} tool{m.toolCalls.length > 1 ? 's' : ''} used
                  </summary>
                  <div className="tool-calls-list">
                    {m.toolCalls.map((tc, i) => (
                      <div key={i} className="tool-call-item">
                        <span className="tool-call-name">{tc.name}</span>
                        <span className="tool-call-args">{JSON.stringify(tc.args)}</span>
                        {tc.result && !tc.result._chartType && !tc.result._cardType && !tc.result._generateImage && (
                          <span className="tool-call-result">
                            → {JSON.stringify(tc.result).slice(0, 200)}
                            {JSON.stringify(tc.result).length > 200 ? '…' : ''}
                          </span>
                        )}
                        {tc.result?._chartType && (
                          <span className="tool-call-result">→ rendered chart</span>
                        )}
                        {tc.result?._cardType && (
                          <span className="tool-call-result">→ video card</span>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {/* Charts */}
              {m.charts?.map((chart, ci) =>
                chart._chartType === 'engagement' ? (
                  <EngagementChart
                    key={ci}
                    data={chart.data}
                    metricColumn={chart.metricColumn}
                  />
                ) : chart._chartType === 'metric_vs_time' ? (
                  <MetricChart
                    key={ci}
                    data={chart.data}
                    metric={chart.metric}
                    title={chart.title}
                  />
                ) : null
              )}

              {/* Search sources */}
              {m.grounding?.groundingChunks?.length > 0 && (
                <div className="chat-msg-sources">
                  <span className="sources-label">Sources</span>
                  <div className="sources-list">
                    {m.grounding.groundingChunks.map((chunk, i) =>
                      chunk.web ? (
                        <a key={i} href={chunk.web.uri} target="_blank" rel="noreferrer" className="source-link">
                          {chunk.web.title || chunk.web.uri}
                        </a>
                      ) : null
                    )}
                  </div>
                  {m.grounding.webSearchQueries?.length > 0 && (
                    <div className="sources-queries">
                      Searched: {m.grounding.webSearchQueries.join(' · ')}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {dragOver && <div className="chat-drop-overlay">Drop CSV, JSON, or images here</div>}

        {/* ── Input area ── */}
        <div className="chat-input-area">
          {csvContext && (
            <div className="csv-chip">
              <span className="csv-chip-icon">📄</span>
              <span className="csv-chip-name">{csvContext.name}</span>
              <span className="csv-chip-meta">
                {csvContext.rowCount} rows · {csvContext.headers.length} cols
              </span>
              <button className="csv-chip-remove" onClick={() => setCsvContext(null)} aria-label="Remove CSV">×</button>
            </div>
          )}

          {jsonContext && (
            <div className="json-chip">
              <span className="json-chip-icon">📋</span>
              <span className="json-chip-name">{jsonContext.name}</span>
              <span className="json-chip-meta">
                {jsonContext.count} videos · {jsonContext.fields.length} fields
              </span>
              <button className="json-chip-remove" onClick={() => { setJsonContext(null); setSessionJsonData(null); setJsonSummary(null); }} aria-label="Remove JSON">×</button>
            </div>
          )}

          {images.length > 0 && (
            <div className="chat-image-previews">
              {images.map((img, i) => (
                <div key={i} className="chat-img-preview">
                  <img src={`data:${img.mimeType};base64,${img.data}`} alt="" />
                  <button type="button" onClick={() => removeImage(i)} aria-label="Remove">×</button>
                </div>
              ))}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.csv,text/csv,.json,application/json"
            multiple
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />

          <div className="chat-input-row">
            <button
              type="button"
              className="attach-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={streaming}
              title="Attach image, CSV, or JSON"
            >
              📎
            </button>
            <input
              ref={inputRef}
              type="text"
              placeholder="Ask about channel data, request charts, or generate images…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              onPaste={handlePaste}
              disabled={streaming}
            />
            {streaming ? (
              <button onClick={handleStop} className="stop-btn">
                ■ Stop
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim() && !images.length && !csvContext && !jsonContext}
              >
                Send
              </button>
            )}
          </div>
        </div>
        </>
      </div>

      {/* Lightbox */}
      {lightboxImage && (
        <ImageLightbox
          src={`data:${lightboxImage.mimeType};base64,${lightboxImage.data}`}
          alt="Generated image"
          onClose={() => setLightboxImage(null)}
          onDownload={() => handleImageDownload(lightboxImage.data, lightboxImage.mimeType)}
        />
      )}
    </div>
  );
}
