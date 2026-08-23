import { useEffect, useRef, useState } from 'react';
import { T } from '../lib/theme';

// ─────────────────────────────────────────────────────────
// CHATBOT — standalone full-page component
//
// Talks to the backend through POST /api/chat only.
// Request:  { message }
// Response: { reply }
//
// No routing, sidebar, or mount-point logic lives here —
// that's handled elsewhere. This file is self-contained.
// ─────────────────────────────────────────────────────────

const PRESETS = [
  "Which areas are in crisis right now?",
  "Is it safe to travel through Central Delhi?",
  "What's causing the current alerts?",
  "How severe is the situation overall?",
];

const WELCOME_MESSAGE = {
  role: 'assistant',
  text: "Hi! Ask me anything about Delhi's current city status.",
};

// In-memory only — lives at module scope so it survives this component
// unmounting/remounting as you navigate between pages in the app, but
// resets automatically on an actual page reload or server restart
// (nothing is written to localStorage/sessionStorage/disk).
let sessionMessages = null;

function loadPersistedMessages() {
  if (sessionMessages && sessionMessages.length > 0) return sessionMessages;
  return [WELCOME_MESSAGE];
}

export default function Chatbot() {
  const [messages, setMessages] = useState(loadPersistedMessages);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const scrollRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    sessionMessages = messages;
  }, [messages]);

  async function sendMessage(messageOverride) {
    const message = (messageOverride ?? input).trim();
    if (!message || loading) return;

    setMessages((m) => [...m, { role: 'user', text: message }]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });

      if (!res.ok) throw new Error('Non-OK response');

      const data = await res.json();

      setMessages((m) => [...m, { role: 'assistant', text: data.reply }]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: 'assistant', text: 'Chat service unavailable. Please try again.', isError: true },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div className="flex flex-col h-full" style={{ fontFamily: T.font.mono, background: T.bg.root }}>

      {/* ============================================================
          HEADER
      ============================================================ */}
      <div
        className="relative shrink-0 px-5 sm:px-8 py-5 flex items-center justify-between gap-4 overflow-hidden"
        style={{ borderBottom: `1px solid ${T.border.default}`, background: T.bg.card }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage: `repeating-linear-gradient(90deg, ${T.accent.teal} 0px, ${T.accent.teal} 1px, transparent 1px, transparent 4px)`,
          }}
        />
        <div className="relative flex items-center gap-4">
          <div
            className="flex items-center justify-center w-11 h-11 shrink-0"
            style={{ border: `1px solid ${T.accent.teal}`, background: `${T.accent.teal}12` }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="8" stroke={T.accent.teal} strokeWidth="2" />
              <circle cx="12" cy="12" r="2" fill={T.accent.teal} />
              <path d="M12 4V2M12 22v-2M20 12h2M2 12h2" stroke={T.accent.teal} strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold tracking-[0.08em] uppercase" style={{ color: T.text.primary }}>
              Cortex
            </h1>
            <p className="text-[10px] sm:text-[11px] tracking-[0.2em] uppercase mt-0.5" style={{ color: T.accent.teal }}>
            City Intelligence
            </p>
          </div>
        </div>

        <div className="relative flex flex-col items-end gap-2">
          <span className="text-[9px] tracking-[0.15em] uppercase hidden sm:block" style={{ color: T.text.micro }}>
            Live City Analysis AI
          </span>
          <span className="flex items-center gap-1.5">
            <span className="relative flex items-center justify-center" style={{ width: 8, height: 8 }}>
              <span
                className="absolute inline-block rounded-full"
                style={{ width: 8, height: 8, background: T.severity.good.border, opacity: 0.4, animation: 'gn-ring 1.6s ease-out infinite' }}
              />
              <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: T.severity.good.border }} />
            </span>
            <span className="text-[10px] tracking-[0.2em] uppercase font-bold" style={{ color: T.severity.good.border }}>
              Online
            </span>
          </span>
          <button
            onClick={() => {
              sessionMessages = [WELCOME_MESSAGE];
              setMessages([WELCOME_MESSAGE]);
            }}
            className="text-[8px] tracking-[0.15em] uppercase transition-colors duration-200"
            style={{ color: T.text.micro }}
            onMouseEnter={(e) => { e.currentTarget.style.color = T.accent.teal; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = T.text.micro; }}
          >
            Clear conversation
          </button>
        </div>
      </div>

      {/* ============================================================
          CONVERSATION
      ============================================================ */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 flex flex-col gap-4">
        {messages.map((m, i) => (
          <MessageBubble key={i} role={m.role} text={m.text} isError={m.isError} />
        ))}

        {loading && <TypingIndicator />}
      </div>

      {/* ============================================================
          PRESETS
      ============================================================ */}
      <div className="shrink-0 px-4 sm:px-8 pt-3 pb-1 flex flex-wrap gap-2" style={{ background: T.bg.root }}>
        {PRESETS.map((q) => (
          <button
            key={q}
            onClick={() => sendMessage(q)}
            disabled={loading}
            className="text-left text-[10px] sm:text-[11px] tracking-wide px-3 py-2 transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              border: `1px solid ${T.border.default}`,
              background: T.bg.card,
              color: T.text.secondary,
              fontFamily: T.font.mono,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = T.accent.teal;
              e.currentTarget.style.color = T.text.primary;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = T.border.default;
              e.currentTarget.style.color = T.text.secondary;
            }}
          >
            {q}
          </button>
        ))}
      </div>

      {/* ============================================================
          INPUT
      ============================================================ */}
      <div className="shrink-0 px-4 sm:px-8 pb-5 pt-3" style={{ background: T.bg.root }}>
        <div
          className="flex items-end gap-3 px-3 py-2.5 transition-colors duration-200"
          style={{ border: `1px solid ${T.border.default}`, background: T.bg.card }}
          onFocusCapture={(e) => { e.currentTarget.style.borderColor = T.accent.teal; }}
          onBlurCapture={(e) => { e.currentTarget.style.borderColor = T.border.default; }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about Delhi's current status..."
            rows={1}
            disabled={loading}
            className="flex-1 resize-none bg-transparent outline-none text-[13px] leading-relaxed max-h-32 disabled:opacity-50"
            style={{ color: T.text.primary, fontFamily: T.font.mono }}
          />
          <button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            className="shrink-0 flex items-center justify-center px-4 py-2 text-[10px] tracking-[0.15em] uppercase font-bold transition-colors duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ background: T.accent.teal, color: T.bg.root }}
          >
            {loading ? '···' : 'Send'}
          </button>
        </div>
        <p className="text-[9px] tracking-wide mt-1.5" style={{ color: T.text.micro }}>
          Enter to send · Shift + Enter for a new line
        </p>
      </div>

      <style>{`
        @keyframes gn-ring {
          0%   { transform: scale(1);   opacity: 0.4; }
          100% { transform: scale(2.6); opacity: 0;   }
        }
        @keyframes gn-fade-up {
          0%   { opacity: 0; transform: translateY(4px); }
          100% { opacity: 1; transform: translateY(0);   }
        }
        @keyframes gn-dot {
          0%, 80%, 100% { opacity: 0.25; transform: translateY(0); }
          40%           { opacity: 1;    transform: translateY(-2px); }
        }
        .gn-fade-up { animation: gn-fade-up 0.25s ease-out; }
        @media (prefers-reduced-motion: reduce) {
          .gn-fade-up { animation: none; }
        }
      `}</style>
    </div>
  );
}

/* ============================================================
   Small presentational helpers
============================================================ */

function MessageBubble({ role, text, isError }) {
  const isUser = role === 'user';

  return (
    <div className={`flex gn-fade-up ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex flex-col gap-1 max-w-[85%] sm:max-w-[70%] ${isUser ? 'items-end' : 'items-start'}`}>
        {!isUser && (
          <span className="text-[8px] tracking-[0.2em] uppercase font-bold px-0.5" style={{ color: isError ? T.severity.critical.border : T.accent.teal }}>
            Ghostnet AI
          </span>
        )}
        <div
          className="px-4 py-3 text-[13px] leading-relaxed whitespace-pre-wrap break-words"
          style={
            isUser
              ? { background: `${T.accent.teal}18`, border: `1px solid ${T.accent.teal}`, color: T.text.primary }
              : isError
              ? { background: T.severity.critical.bg, border: `1px solid ${T.severity.critical.border}`, color: T.severity.critical.text }
              : { background: T.bg.card, border: `1px solid ${T.border.default}`, color: T.text.primary }
          }
        >
          {renderFormattedText(text)}
        </div>
      </div>
    </div>
  );
}

// Lightweight inline-markdown renderer. Only handles **bold** — the
// one construct the backend actually sends (e.g. "**Critical ICU
// capacity at hospitals**"). Deliberately not pulling in a full
// markdown library for one pattern. Splits on **...** pairs and wraps
// matches in <strong>, leaving everything else as plain text exactly
// as received.
function renderFormattedText(text) {
  if (!text) return text;

  const parts = String(text).split(/(\*\*[^*]+\*\*)/g);

  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={i} className="font-bold" style={{ color: 'inherit' }}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function TypingIndicator() {
  return (
    <div className="flex justify-start gn-fade-up">
      <div className="flex flex-col gap-1 items-start">
        <span className="text-[8px] tracking-[0.2em] uppercase font-bold px-0.5" style={{ color: T.accent.teal }}>
          Ghostnet AI
        </span>
        <div
          className="flex items-center gap-2 px-4 py-3"
          style={{ background: T.bg.card, border: `1px solid ${T.border.default}` }}
        >
          <span className="text-[10px] tracking-[0.15em] uppercase" style={{ color: T.text.secondary }}>
            AI Analyzing City Data
          </span>
          <span className="flex items-center gap-0.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="inline-block w-1 h-1 rounded-full"
                style={{ background: T.accent.teal, animation: `gn-dot 1.1s ease-in-out ${i * 0.15}s infinite` }}
              />
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}