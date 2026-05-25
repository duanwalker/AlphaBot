import { useState, useEffect, useRef } from "react";

// Static suggested prompts shown after each assistant response
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
  account,
  positions,
  orders,
  marketSnapshot,
  symbol,
  externalPrompt,   // { text, id } — fires sendMessage when id changes
}) {
  const [messages, setMessages] = useState([
    { from: "assistant", text: "Hi Duan — what would you like to explore?" },
  ]);
  const [input, setInput]   = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

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

  async function sendMessage(text) {
    const msg = typeof text === "string" ? text.trim() : input.trim();
    if (!msg) return;

    const userMsg = { from: "user", text: msg };
    setMessages(prev => [...prev, userMsg]);
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

  const suggestions  = getSuggestions(symbol);
  const modeBadge    = symbol
    ? { text: `Symbol mode: ${symbol}`, cls: "ap-badge--symbol" }
    : { text: "Market mode",            cls: "ap-badge--market" };

  const containerClass = inline ? "assistant-inline" : "assistant-overlay";
  const panelClass     = inline ? "assistant-panel assistant-panel-inline" : "assistant-panel";

  return (
    <div className={containerClass}>
      <div className={panelClass}>
        {/* Header */}
        <div className="assistant-header">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>AI Assistant</span>
            <span className={`ap-badge ${modeBadge.cls}`}>{modeBadge.text}</span>
          </div>
          {!inline && (
            <button className="assistant-close" onClick={onClose}>×</button>
          )}
        </div>

        {/* Messages */}
        <div className="assistant-messages">
          {messages.map((m, i) => {
            const isLastAssistant =
              m.from === "assistant" &&
              i === messages.length - 1 &&
              !loading &&
              m.text.length > 10;  // skip the greeting prompt row

            return (
              <div key={i}>
                <div className={m.from === "user" ? "msg msg-user" : "msg msg-assistant"}>
                  {m.text}
                </div>

                {/* Suggested prompts after last assistant response */}
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

        {/* Input row */}
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
      </div>
    </div>
  );
}
