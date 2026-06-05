import { useEffect, useRef, useState } from "react";
import { checkHealth, sendMessage } from "./api.js";
import Login from "./login.jsx";

// SVG Icons
const Icons = {
  Logo: () => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z"/>
      <path d="M2 17l10 5 10-5"/>
      <path d="M2 12l10 5 10-5"/>
    </svg>
  ),
  User: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  ),
  Bot: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="3"/>
      <circle cx="9" cy="10" r="1.5" fill="currentColor"/>
      <circle cx="15" cy="10" r="1.5" fill="currentColor"/>
      <path d="M9 15c1.5 2 4.5 2 6 0"/>
    </svg>
  ),
  Send: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"/>
      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  ),
  Logout: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  ),
  MessageCircle: () => (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  AlertCircle: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  ),
  Mic: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="23"/>
      <line x1="8" y1="23" x2="16" y2="23"/>
    </svg>
  ),
};

function Message({ role, content }) {
  return (
    <div className={`message message--${role}`}>
      <div className="message__avatar">
        {role === "user" ? <Icons.User /> : <Icons.Bot />}
      </div>
      <div className="message__body">
        <span className="message__role">{role === "user" ? "You" : "AI Assistant"}</span>
        <p className="message__content">{content}</p>
      </div>
    </div>
  );
}

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [model, setModel] = useState(null);
  const [online, setOnline] = useState(false);
  const [user, setUser] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Check backend health only after login
  useEffect(() => {
    if (user) {
      checkHealth()
        .then((data) => {
          setOnline(true);
          setModel(data.model);
        })
        .catch(() => setOnline(false));
    }
  }, [user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function handleSubmit(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setError(null);
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);

    try {
      const reply = await sendMessage(text);
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  const handleLogin = (userData) => {
    setUser(userData);
  };

  const handleLogout = () => {
    setUser(null);
    setMessages([]);
    setModel(null);
    setOnline(false);
  };

  // Show login screen first - no access to AI until authenticated
  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <>
      <style>{`
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
        }

        #root {
          width: 100%;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .app {
          width: 100%;
          max-width: 900px;
          height: 90vh;
          background: white;
          border-radius: 24px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          animation: fadeIn 0.5s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }

        .header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          padding: 20px 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          color: white;
        }

        .header__left {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .header__logo {
          background: rgba(255, 255, 255, 0.2);
          width: 44px;
          height: 44px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          backdrop-filter: blur(10px);
        }

        .header__title {
          display: flex;
          align-items: baseline;
          gap: 10px;
        }

        .header__title h1 {
          font-size: 22px;
          font-weight: 700;
        }

        .header__model {
          font-size: 11px;
          background: rgba(255, 255, 255, 0.2);
          padding: 4px 10px;
          border-radius: 20px;
          backdrop-filter: blur(10px);
          font-weight: 500;
        }

        .header__right {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .status {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          padding: 6px 14px;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.2);
          backdrop-filter: blur(10px);
          font-weight: 500;
        }

        .status__dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #10b981;
          box-shadow: 0 0 6px rgba(16, 185, 129, 0.5);
          animation: pulse-dot 2s infinite;
        }

        .status--offline .status__dot {
          background: #ef4444;
          box-shadow: 0 0 6px rgba(239, 68, 68, 0.5);
          animation: none;
        }

        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .header__user-info {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 4px 8px 4px 4px;
          background: rgba(255, 255, 255, 0.15);
          border-radius: 20px;
          backdrop-filter: blur(10px);
        }

        .header__user-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.3);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .header__username {
          font-weight: 600;
          font-size: 14px;
        }

        .header__logout {
          background: rgba(255, 255, 255, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.3);
          color: white;
          padding: 8px;
          border-radius: 50%;
          cursor: pointer;
          transition: all 0.3s;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
        }

        .header__logout:hover {
          background: rgba(239, 68, 68, 0.3);
          border-color: rgba(239, 68, 68, 0.5);
          transform: scale(1.1);
        }

        .chat {
          flex: 1;
          overflow-y: auto;
          padding: 24px;
          background: #f9fafb;
          scroll-behavior: smooth;
        }

        .chat::-webkit-scrollbar {
          width: 6px;
        }

        .chat::-webkit-scrollbar-track {
          background: transparent;
        }

        .chat::-webkit-scrollbar-thumb {
          background: #d1d5db;
          border-radius: 3px;
        }

        .chat::-webkit-scrollbar-thumb:hover {
          background: #9ca3af;
        }

        .empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #9ca3af;
          text-align: center;
          padding: 40px 20px;
        }

        .empty__icon {
          color: #d1d5db;
          margin-bottom: 20px;
          animation: float 3s ease-in-out infinite;
        }

        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }

        .empty h3 {
          font-size: 20px;
          color: #374151;
          margin-bottom: 8px;
          font-weight: 600;
        }

        .empty p {
          font-size: 15px;
          color: #9ca3af;
          max-width: 300px;
          line-height: 1.5;
        }

        .message {
          display: flex;
          gap: 12px;
          margin-bottom: 24px;
          animation: messageSlide 0.4s ease-out;
        }

        @keyframes messageSlide {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .message--user {
          flex-direction: row-reverse;
        }

        .message__avatar {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          flex-shrink: 0;
          box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
        }

        .message--user .message__avatar {
          background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
          box-shadow: 0 2px 8px rgba(245, 87, 108, 0.3);
        }

        .message__body {
          max-width: 70%;
        }

        .message__role {
          font-size: 11px;
          font-weight: 600;
          color: #6b7280;
          margin-bottom: 4px;
          display: block;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .message--user .message__role {
          text-align: right;
        }

        .message__content {
          background: white;
          padding: 12px 16px;
          border-radius: 16px;
          font-size: 15px;
          line-height: 1.6;
          color: #1f2937;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
          word-wrap: break-word;
        }

        .message--user .message__content {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }

        .message--assistant .message__content {
          border-top-left-radius: 4px;
        }

        .message--user .message__content {
          border-top-right-radius: 4px;
        }

        .typing {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 16px !important;
        }

        .typing__dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #9ca3af;
          animation: typingBounce 1.4s infinite;
        }

        .typing__dot:nth-child(2) { animation-delay: 0.2s; }
        .typing__dot:nth-child(3) { animation-delay: 0.4s; }

        @keyframes typingBounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-10px); opacity: 1; }
        }

        .error {
          display: flex;
          align-items: center;
          gap: 10px;
          background: #fee2e2;
          color: #dc2626;
          padding: 12px 16px;
          border-radius: 12px;
          margin-bottom: 20px;
          font-size: 14px;
          animation: shake 0.5s ease-out;
          border-left: 4px solid #dc2626;
        }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }

        .composer {
          padding: 20px 24px;
          background: white;
          border-top: 1px solid #e5e7eb;
        }

        .composer__input-wrapper {
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .composer input {
          flex: 1;
          padding: 14px 20px;
          border: 2px solid #e5e7eb;
          border-radius: 24px;
          font-size: 15px;
          transition: all 0.3s;
          background: #f9fafb;
          color: #1f2937;
        }

        .composer input:focus {
          outline: none;
          border-color: #667eea;
          background: white;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        .composer input:disabled {
          background: #f3f4f6;
          cursor: not-allowed;
        }

        .composer input::placeholder {
          color: #9ca3af;
        }

        .composer__send {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border: none;
          color: white;
          cursor: pointer;
          transition: all 0.3s;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .composer__send:hover:not(:disabled) {
          transform: scale(1.05);
          box-shadow: 0 8px 20px rgba(102, 126, 234, 0.4);
        }

        .composer__send:active:not(:disabled) {
          transform: scale(0.95);
        }

        .composer__send:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        @media (max-width: 768px) {
          .app {
            height: 100vh;
            border-radius: 0;
            max-width: 100%;
          }

          .header { padding: 16px; }
          .header__title h1 { font-size: 20px; }
          .chat { padding: 16px; }
          .message__body { max-width: 85%; }
          .composer { padding: 16px; }
        }
      `}</style>

      <div className="app">
        <header className="header">
          <div className="header__left">
            <div className="header__logo">
              <Icons.Logo />
            </div>
            <div className="header__title">
              <h1>FigoAI</h1>
              {model && <span className="header__model">{model}</span>}
            </div>
          </div>

          <div className="header__right">
            <span className={`status ${online ? "status--online" : "status--offline"}`}>
              <span className="status__dot"></span>
              {online ? "Connected" : "Offline"}
            </span>
            <div className="header__user-info">
              <div className="header__user-avatar">
                <Icons.User />
              </div>
              <span className="header__username">{user.username}</span>
              <button 
                onClick={handleLogout} 
                className="header__logout" 
                title="Logout"
              >
                <Icons.Logout />
              </button>
            </div>
          </div>
        </header>

        <main className="chat">
          {messages.length === 0 && !loading && (
            <div className="empty">
              <div className="empty__icon">
                <Icons.MessageCircle />
              </div>
              <h3>Welcome, {user.username}!</h3>
              <p>Send a message to start chatting with your AI assistant.</p>
            </div>
          )}

          {messages.map((msg, i) => (
            <Message key={i} role={msg.role} content={msg.content} />
          ))}

          {loading && (
            <div className="message message--assistant">
              <div className="message__avatar">
                <Icons.Bot />
              </div>
              <div className="message__body">
                <span className="message__role">AI Assistant</span>
                <p className="message__content typing">
                  <span className="typing__dot"></span>
                  <span className="typing__dot"></span>
                  <span className="typing__dot"></span>
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="error">
              <Icons.AlertCircle />
              <span>{error}</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </main>

        <form className="composer" onSubmit={handleSubmit}>
          <div className="composer__input-wrapper">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={online ? "Type a message..." : "Server offline..."}
              disabled={!online || loading}
              autoFocus
            />
            <button
              type="submit"
              className="composer__send"
              disabled={!online || loading || !input.trim()}
            >
              <Icons.Send />
            </button>
          </div>
        </form>
      </div>
    </>
  );
}