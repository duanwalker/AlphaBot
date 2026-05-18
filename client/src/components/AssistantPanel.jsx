import { useState, useEffect, useRef } from "react";

export default function AssistantPanel({
  open,
  onClose,
  account,
  positions,
  orders,
  marketSnapshot,
  symbol
}) {
  const [messages, setMessages] = useState([
    { from: "assistant", text: "Hi Duan — what would you like to explore?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!open) return null;

  async function sendMessage() {
  if (!input.trim()) return;

  const userMsg = { from: "user", text: input };
  setMessages((prev) => [...prev, userMsg]);
  setInput("");
  setLoading(true);

  try {
    setMessages((prev) => [...prev, { from: "assistant", text: "" }]);

    const payload = {
      message: userMsg.text,
      context: {
        account,
        positions,
        orders,
        marketSnapshot,
        symbol: symbol || null
      },
    };

    const response = await fetch("http://localhost:3001/api/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok || !response.body) {
      throw new Error("Assistant request failed");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let fullText = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      fullText += chunk;

      setMessages((prev) => {
        if (!prev.length) return prev;
        const next = [...prev];
        const lastIndex = next.length - 1;
        if (next[lastIndex].from !== "assistant") {
          next.push({ from: "assistant", text: chunk });
          return next;
        }
        next[lastIndex] = {
          ...next[lastIndex],
          text: next[lastIndex].text + chunk,
        };
        return next;
      });
    }
  } catch (err) {
    setMessages((prev) => [
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

  // ───────────────────────────────────────────────
  // RESET CHAT / NEW CONVERSATION
  // ───────────────────────────────────────────────
  const handleReset = () => {
    setMessages([]);      // clears the entire chat history
    setInput("");         // clears the input box
  };

  return (
    <div className="assistant-overlay">
      <div className="assistant-panel">
        <div className="assistant-header">
          <span>AI Assistant</span>
          <button className="assistant-close" onClick={onClose}>×</button>
        </div>

        <div className="assistant-messages">
          {messages.map((m, i) => (
            <div
              key={i}
              className={m.from === "user" ? "msg msg-user" : "msg msg-assistant"}
            >
              {m.text}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <div className="assistant-input-row">
          <textarea
            className="assistant-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your positions, risk, strategies, or the market..."
          />
          <button className="btn send-btn" onClick={sendMessage} disabled={loading}>
            {loading ? "Thinking..." : "Send"}
          </button>
          <button className="btn reset-btn" onClick={handleReset}>
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
