import { useState, useEffect, useRef } from "react";
import axios from "axios";

export default function AssistantPanel({
  open,
  onClose,
  account,
  positions,
  orders,
  marketSnapshot,
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
      const res = await axios.post("http://localhost:3001/api/assistant", {
        message: userMsg.text,
        context: {
          account,
          positions,
          orders,
          marketSnapshot,
        },
      });

      const assistantMsg = { from: "assistant", text: res.data.reply };
      setMessages((prev) => [...prev, assistantMsg]);
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
        </div>
      </div>
    </div>
  );
}
