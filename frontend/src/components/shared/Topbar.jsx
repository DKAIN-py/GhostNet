import { useEffect, useState } from 'react';
import { useGhostnet } from '../../context/GhostnetContext';
import { useReplayMode } from '../../context/ReplayContext';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  T,
  getInitialTheme,
  applyTheme,
} from '../../lib/theme';

export default function Topbar() {
  const { connected } = useGhostnet();
  const { enterReplay, exitReplay } = useReplayMode();
  const navigate = useNavigate();
  const location = useLocation();

  const isReplay = location.pathname === '/replay';

  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function toggleTheme() {
    const nextTheme = theme === 'dark' ? 'monochrome' : 'dark';

    setTheme(nextTheme);
    applyTheme(nextTheme);
  }

  return (
    <header
      className="h-12 flex items-center justify-between px-4 sm:px-7 shrink-0"
      style={{
        background: T.bg.card,
        borderBottom: `1.5px solid ${T.border.strong}`,
        fontFamily: T.font.mono,
      }}
    >
      {/* ─────────────────────────────────────────────────────────────
          WORDMARK
      ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2 shrink-0">
          <span
            className="text-[13px] font-bold tracking-[0.28em] uppercase"
            style={{ color: T.text.primary }}
          >
            GHOSTNET
          </span>
        </div>

        <span
          className="hidden md:inline text-[9px] tracking-[0.2em] uppercase truncate pl-3"
          style={{
            color: T.text.micro,
            borderLeft: `1px solid ${T.border.subtle}`,
          }}
        >
          Urban Early Warning Engine
        </span>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          RIGHT CLUSTER
      ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 sm:gap-5 shrink-0">

        {/* ─────────────────────────────────────────────────────────
            LIVE / REPLAY
        ───────────────────────────────────────────────────────── */}
        <div
          className="flex items-center p-0.5"
          style={{
            background: T.bg.surface,
            border: `1px solid ${T.border.subtle}`,
          }}
        >
          <button
            onClick={() => {
              exitReplay();
              navigate('/');
            }}
            className="text-[9px] tracking-[0.15em] uppercase px-3 py-1.5 font-bold transition-all"
            style={{
              background: !isReplay ? T.bg.card : 'transparent',
              color: !isReplay ? T.text.primary : T.text.muted,
              fontFamily: T.font.mono,
              boxShadow: !isReplay
                ? '0 1px 2px rgba(0,0,0,0.12)'
                : 'none',
            }}
          >
            Live
          </button>

          <button
            onClick={() => {
              enterReplay();
              navigate('/replay');
            }}
            className="text-[9px] tracking-[0.15em] uppercase px-3 py-1.5 font-bold transition-all"
            style={{
              background: isReplay ? T.bg.card : 'transparent',
              color: isReplay ? T.text.primary : T.text.muted,
              fontFamily: T.font.mono,
              boxShadow: isReplay
                ? '0 1px 2px rgba(0,0,0,0.12)'
                : 'none',
            }}
          >
            Replay
          </button>
        </div>

        {/* ─────────────────────────────────────────────────────────
            THEME TOGGLE
            Replaces the old connection dot.
        ───────────────────────────────────────────────────────── */}
        <button
          onClick={toggleTheme}
          title={
            theme === 'dark'
              ? 'Switch to light theme'
              : 'Switch to dark theme'
          }
          aria-label={
            theme === 'dark'
              ? 'Switch to light theme'
              : 'Switch to dark theme'
          }
          className="group flex items-center justify-center w-7 h-7 transition-all"
          style={{
            background: 'transparent',
            color: T.text.secondary,
            border: `1px solid ${T.border.subtle}`,
            cursor: 'pointer',
          }}
        >
          {theme === 'dark' ? (
            /* SUN */
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2.2" />
              <path d="M12 19.8V22" />
              <path d="m4.93 4.93 1.55 1.55" />
              <path d="m17.52 17.52 1.55 1.55" />
              <path d="M2 12h2.2" />
              <path d="M19.8 12H22" />
              <path d="m4.93 19.07 1.55-1.55" />
              <path d="m17.52 6.48 1.55-1.55" />
            </svg>
          ) : (
            /* MOON */
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.7 6.7 0 0 0 9.8 9.8Z" />
            </svg>
          )}
        </button>

        {/* ─────────────────────────────────────────────────────────
            DELHI NODE
        ───────────────────────────────────────────────────────── */}
        <span
          className="hidden lg:inline text-[9px] tracking-[0.15em] uppercase pl-4"
          style={{
            color: T.text.micro,
            borderLeft: `1px solid ${T.border.subtle}`,
          }}
        >
          Delhi Node
        </span>
      </div>

      <style>{`
        @keyframes gn-pulse-dot {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.35; }
        }
      `}</style>
    </header>
  );
}