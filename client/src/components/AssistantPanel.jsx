import { useState, useEffect, useRef } from "react";
import MarkdownMessage from "./MarkdownMessage";
import { useSymbol } from "../context/SymbolContext";

function getSuggestions(symbol) {
  if (symbol) {
    return [
      { label: 'Sentiment chart',   prompt: `Show ${symbol}'s sentiment vs price chart` },
      { label: 'vs peers',          prompt: `Compare ${symbol} to its sector peers` },
      { label: 'Options ideas',     prompt: `Suggest options strategies for ${symbol}` },
    ];
  }
  return [
    { label: 'Portfolio review',    prompt: 'Review my portfolio risk and current allocation' },
    { label: 'Sector leaders',      prompt: 'Which sectors are leading the market today?' },
    { label: 'Best opportunities',  prompt: 'What are the best opportunities in my watchlist?' },
  ];
}

export default function AssistantPanel({
  open,
  onClose,
  inline = false,
  panelWidth,
  setPanelWidth,
  account,
  positions,
  orders,
  marketSnapshot,
  externalPrompt,
}) {
  const { symbol } = useSymbol();
  const [messages, setMessages] = useState([
    { from: "assistant", text: "Hi Duan — what would you like to explore?" },
  ]);
  const [input, setInput]     = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  // Desktop resize
  const isResizing      = useRef(false);
  const cleanupResize   = useRef(() => {});

  // Mobile bottom sheet
  const [sheetSnap, setSheetSnap] = useState('half');
  const dragStartY = useRef(null);

  // Cleanup any active resize listeners on unmount
  useEffect(() => () => cleanupResize.current(), []);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Fire external prompt (from insight cards / sidebar buttons)
  useEffect(() => {
    if (externalPrompt?.text) {
      sendMessage(externalPrompt.text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalPrompt?.id]);

  if (!inline && !open) return null;

  // ── Desktop drag-to-resize ──────────────────────────────────
  function onDragStart() {
    if (!setPanelWidth) return;
    isResizing.current = true;

    function move(e) {
      if (!isResizing.current) return;
      const newWidth = window.innerWidth - e.clientX;
      setPanelWidth(Math.min(640, Math.max(280, newWidth)));
    }

    function up() {
      isResizing.current = false;
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      cleanupResize.current = () => {};
    }

    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    cleanupResize.current = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
  }

  // ── Mobile bottom sheet snap ────────────────────────────────
  function onTouchStart(e) {
    dragStartY.current = e.touches[0].clientY;
  }

  function onTouchEnd(e) {
    const deltaY = e.changedTouches[0].clientY - dragStartY.current;
    if (deltaY < -60) {
      setSheetSnap(prev => prev === 'collapsed' ? 'half' : 'full');
    } else if (deltaY > 60) {
      setSheetSnap(prev => prev === 'full' ? 'half' : 'collapsed');
    }
  }

  // ── Message sending ─────────────────────────────────────────
  async function sendMessage(text) {
    const msg = typeof text === "string" ? text.trim() : input.trim();
    if (!msg) return;

    setMessages(prev => [...prev, { from: "user", text: msg }]);
    setInput("");
    setLoading(true);

    try {
      setMessages(prev => [...prev, { from: "assistant", text: "" }]);

      const payload = {
        message: msg,
        context: {
          account,
          positions,
          orders,
          marketSnapshot,
          symbol: symbol || null,
        },
      };

      console.log('[AssistantPanel] payload context.symbol:', payload.context.symbol);

      const response = await fetch("http://localhost:3001/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok || !response.body) {
        throw new Error("Assistant request failed");
      }

      const reader  = response.body.getReader();
      const decoder = new TextDecoder("utf-8");

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        setMessages(prev => {
          if (!prev.length) return prev;
          const next      = [...prev];
          const lastIndex = next.length - 1;
          if (next[lastIndex].from !== "assistant") {
            next.push({ from: "assistant", text: chunk });
            return next;
          }
          next[lastIndex] = { ...next[lastIndex], text: next[lastIndex].text + chunk };
          return next;
        });
      }
    } catch {
      setMessages(prev => [
        ...prev,
        { from: "assistant", text: "Sorry — I hit an error processing that." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function handleReset() {
    setMessages([{ from: "assistant", text: "Hi Duan — what would you like to explore?" }]);
    setInput("");
  }

  const suggestions = getSuggestions(symbol);
  const modeBadge   = symbol
    ? { text: `Symbol mode: ${symbol}`, cls: "ap-badge--symbol" }
    : { text: "Market mode",            cls: "ap-badge--market" };

  // ── Shared inner content ────────────────────────────────────
  const content = (
    <>
      <div className="assistant-header">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span>AI Assistant</span>
          <span className={`ap-badge ${modeBadge.cls}`}>{modeBadge.text}</span>
        </div>
        {!inline && (
          <button className="assistant-close" onClick={onClose}>×</button>
        )}
      </div>

      <div className="assistant-messages">
        {messages.map((m, i) => {
          const isLastAssistant =
            m.from === "assistant" &&
            i === messages.length - 1 &&
            !loading &&
            m.text.length > 10;

          return (
            <div key={i}>
              <div className={m.from === "user" ? "msg msg-user" : "msg msg-assistant"}>
                {m.from === "assistant"
                  ? <MarkdownMessage text={m.text} />
                  : m.text
                }
              </div>

              {isLastAssistant && (
                <div className="ap-suggestions">
                  {suggestions.map((s, si) => (
                    <button
                      key={si}
                      className="ap-suggestion-btn"
                      onClick={() => sendMessage(s.prompt)}
                    >
                      {s.label} ↗
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="assistant-input-row">
        <textarea
          className="assistant-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your positions, risk, strategies, or the market…"
        />
        <button className="btn send-btn" onClick={() => sendMessage()} disabled={loading}>
          {loading ? "Thinking…" : "Send"}
        </button>
        <button className="btn reset-btn" onClick={handleReset}>
          Reset
        </button>
      </div>
    </>
  );

  // ── Inline layout (AssistantPage tab) ──────────────────────
  if (inline) {
    return (
      <div className="assistant-inline">
        <div className="assistant-panel assistant-panel-inline">
          {content}
        </div>
      </div>
    );
  }

  // ── Side panel / mobile bottom sheet ───────────────────────
  return (
    <div
      className="assistant-side-panel"
      style={{ width: panelWidth }}
      data-sheet={sheetSnap}
    >
      {/* Desktop: drag handle on the left edge */}
      <div className="ap-resize-handle" onMouseDown={onDragStart} />

      {/* Mobile: drag handle bar at top of sheet */}
      <div
        className="ap-sheet-handle"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="ap-sheet-handle-bar" />
      </div>

      {content}
    </div>
  );
}
