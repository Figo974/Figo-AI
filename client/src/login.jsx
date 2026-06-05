import { useState } from "react";

// SVG Icons
const Icons = {
  Logo: () => (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z"/>
      <path d="M2 17l10 5 10-5"/>
      <path d="M2 12l10 5 10-5"/>
    </svg>
  ),
  User: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  ),
  Lock: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  ),
  Eye: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ),
  EyeOff: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  ),
  AlertCircle: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  ),
  ArrowRight: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/>
      <polyline points="12 5 19 12 12 19"/>
    </svg>
  ),
  CheckCircle: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
      <polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
  ),
};

const AUTH_KEY = "figoai_auth";

export default function Login({ onLogin }) {
  const [formData, setFormData] = useState({
    username: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!formData.username.trim() || !formData.password.trim()) {
      setError("Please fill in all fields");
      return;
    }

    setIsLoading(true);
    setError("");

    // Simulate API authentication - Replace with your actual API call
    try {
      // Example: const response = await loginAPI(formData.username, formData.password);
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Demo validation - Replace with actual authentication
      if (formData.username === "admin" && formData.password === "admin") {
        const userData = {
          username: formData.username,
          id: "user_123",
          role: "user",
        };
        localStorage.setItem(AUTH_KEY, JSON.stringify(userData));
        onLogin(userData);
      } else if (formData.username === "user" && formData.password === "user") {
        const userData = {
          username: formData.username,
          id: "user_456",
          role: "user",
        };
        localStorage.setItem(AUTH_KEY, JSON.stringify(userData));
        onLogin(userData);
      } else {
        setError("Invalid username or password");
      }
    } catch (err) {
      setError("Authentication failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      {/* Background decoration */}
      <div className="login-bg-shapes">
        <div className="shape shape-1"></div>
        <div className="shape shape-2"></div>
        <div className="shape shape-3"></div>
      </div>

      <div className="login-card">
        <div className="login-card__header">
          <div className="login-card__logo-wrapper">
            <div className="login-card__logo">
              <Icons.Logo />
            </div>
          </div>
          <h1 className="login-card__title">Welcome Back</h1>
          <p className="login-card__subtitle">
            Sign in to access your AI assistant
          </p>
        </div>

        <form onSubmit={handleSubmit} className="login-card__form">
          <div className="input-group">
            <label htmlFor="username">
              <span className="input-icon">
                <Icons.User />
              </span>
              Username
            </label>
            <div className="input-wrapper">
              <input
                id="username"
                name="username"
                type="text"
                value={formData.username}
                onChange={handleChange}
                placeholder="Enter your username"
                disabled={isLoading}
                autoFocus
                autoComplete="username"
              />
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="password">
              <span className="input-icon">
                <Icons.Lock />
              </span>
              Password
            </label>
            <div className="input-wrapper password-wrapper">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                value={formData.password}
                onChange={handleChange}
                placeholder="Enter your password"
                disabled={isLoading}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <Icons.EyeOff /> : <Icons.Eye />}
              </button>
            </div>
          </div>

          <div className="login-card__options">
            <label className="checkbox-label">
              <input type="checkbox" />
              <span className="checkbox-custom"></span>
              <span>Remember me</span>
            </label>
            <a href="#" className="forgot-link" onClick={(e) => e.preventDefault()}>
              Forgot password?
            </a>
          </div>

          {error && (
            <div className="login-card__error">
              <Icons.AlertCircle />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            className="login-card__submit"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <span className="spinner"></span>
                <span>Authenticating...</span>
              </>
            ) : (
              <>
                <span>Sign In</span>
                <Icons.ArrowRight />
              </>
            )}
          </button>

          <div className="login-card__demo">
            <div className="demo-header">
              <Icons.CheckCircle />
              <span>Demo Credentials</span>
            </div>
            <div className="demo-credentials">
              <div className="demo-item">
                <span className="demo-label">Username:</span>
                <code>admin</code>
              </div>
              <div className="demo-item">
                <span className="demo-label">Password:</span>
                <code>admin</code>
              </div>
            </div>
            <button
              type="button"
              className="demo-fill-btn"
              onClick={() => {
                setFormData({ username: "admin", password: "admin" });
                setError("");
              }}
            >
              Fill Demo Credentials
            </button>
          </div>
        </form>
      </div>

      <style>{`
        .login-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background: linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%);
          position: relative;
          overflow: hidden;
        }

        .login-bg-shapes {
          position: absolute;
          width: 100%;
          height: 100%;
          overflow: hidden;
        }

        .shape {
          position: absolute;
          border-radius: 50%;
          opacity: 0.1;
          animation: float 20s infinite;
        }

        .shape-1 {
          width: 600px;
          height: 600px;
          background: #667eea;
          top: -300px;
          left: -100px;
          animation-delay: 0s;
        }

        .shape-2 {
          width: 400px;
          height: 400px;
          background: #764ba2;
          bottom: -200px;
          right: -100px;
          animation-delay: -7s;
        }

        .shape-3 {
          width: 300px;
          height: 300px;
          background: #f093fb;
          top: 50%;
          left: 50%;
          animation-delay: -14s;
        }

        @keyframes float {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          33% { transform: translate(50px, -50px) rotate(120deg); }
          66% { transform: translate(-50px, 30px) rotate(240deg); }
        }

        .login-card {
          background: rgba(255, 255, 255, 0.98);
          backdrop-filter: blur(20px);
          border-radius: 24px;
          padding: 48px 40px;
          width: 100%;
          max-width: 440px;
          box-shadow: 
            0 25px 50px rgba(0, 0, 0, 0.25),
            0 0 0 1px rgba(255, 255, 255, 0.1);
          animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1);
          position: relative;
          z-index: 10;
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(40px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .login-card__header {
          text-align: center;
          margin-bottom: 40px;
        }

        .login-card__logo-wrapper {
          margin-bottom: 24px;
        }

        .login-card__logo {
          width: 80px;
          height: 80px;
          margin: 0 auto;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          box-shadow: 
            0 15px 30px rgba(102, 126, 234, 0.4),
            0 0 0 8px rgba(102, 126, 234, 0.1);
          animation: logoPulse 3s ease-in-out infinite;
        }

        @keyframes logoPulse {
          0%, 100% { 
            transform: scale(1);
            box-shadow: 0 15px 30px rgba(102, 126, 234, 0.4), 0 0 0 8px rgba(102, 126, 234, 0.1);
          }
          50% { 
            transform: scale(1.05);
            box-shadow: 0 20px 40px rgba(102, 126, 234, 0.5), 0 0 0 12px rgba(102, 126, 234, 0.15);
          }
        }

        .login-card__title {
          font-size: 32px;
          font-weight: 700;
          color: #1a1a2e;
          margin-bottom: 8px;
          letter-spacing: -0.5px;
        }

        .login-card__subtitle {
          color: #6b7280;
          font-size: 16px;
          line-height: 1.5;
        }

        .login-card__form {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .input-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .input-group label {
          font-size: 13px;
          font-weight: 600;
          color: #374151;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .input-icon {
          display: flex;
          align-items: center;
          color: #667eea;
        }

        .input-wrapper {
          position: relative;
        }

        .input-group input {
          width: 100%;
          padding: 14px 16px;
          border: 2px solid #e5e7eb;
          border-radius: 14px;
          font-size: 16px;
          transition: all 0.3s;
          background: #f9fafb;
          color: #1f2937;
          font-family: inherit;
        }

        .input-group input:focus {
          outline: none;
          border-color: #667eea;
          background: white;
          box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.1);
        }

        .input-group input::placeholder {
          color: #9ca3af;
        }

        .input-group input:disabled {
          background: #f3f4f6;
          cursor: not-allowed;
          opacity: 0.7;
        }

        .password-wrapper input {
          padding-right: 55px;
        }

        .password-toggle {
          position: absolute;
          right: 8px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          cursor: pointer;
          padding: 8px;
          color: #9ca3af;
          transition: all 0.3s;
          display: flex;
          align-items: center;
          border-radius: 8px;
        }

        .password-toggle:hover {
          color: #667eea;
          background: rgba(102, 126, 234, 0.1);
        }

        .login-card__options {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: -8px;
        }

        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          color: #6b7280;
          cursor: pointer;
          user-select: none;
        }

        .checkbox-label input[type="checkbox"] {
          display: none;
        }

        .checkbox-custom {
          width: 18px;
          height: 18px;
          border: 2px solid #d1d5db;
          border-radius: 6px;
          transition: all 0.3s;
          position: relative;
        }

        .checkbox-label input:checked + .checkbox-custom {
          background: #667eea;
          border-color: #667eea;
        }

        .checkbox-label input:checked + .checkbox-custom::after {
          content: '';
          position: absolute;
          left: 5px;
          top: 2px;
          width: 4px;
          height: 8px;
          border: solid white;
          border-width: 0 2px 2px 0;
          transform: rotate(45deg);
        }

        .forgot-link {
          font-size: 14px;
          color: #667eea;
          text-decoration: none;
          font-weight: 500;
          transition: all 0.3s;
        }

        .forgot-link:hover {
          color: #764ba2;
          text-decoration: underline;
        }

        .login-card__error {
          background: #fee2e2;
          color: #dc2626;
          padding: 14px 16px;
          border-radius: 14px;
          font-size: 14px;
          display: flex;
          align-items: center;
          gap: 10px;
          animation: shake 0.5s ease-out;
          border-left: 4px solid #dc2626;
        }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          75% { transform: translateX(8px); }
        }

        .login-card__submit {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          padding: 16px;
          border-radius: 14px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          position: relative;
          overflow: hidden;
          font-family: inherit;
        }

        .login-card__submit::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.2),
            transparent
          );
          transition: left 0.5s;
        }

        .login-card__submit:hover:not(:disabled)::before {
          left: 100%;
        }

        .login-card__submit:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 12px 30px rgba(102, 126, 234, 0.5);
        }

        .login-card__submit:active:not(:disabled) {
          transform: translateY(0);
        }

        .login-card__submit:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .spinner {
          width: 20px;
          height: 20px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .login-card__demo {
          margin-top: 8px;
          padding: 20px;
          background: #f0fdf4;
          border: 2px solid #bbf7d0;
          border-radius: 14px;
        }

        .demo-header {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #059669;
          font-weight: 600;
          font-size: 14px;
          margin-bottom: 12px;
        }

        .demo-credentials {
          display: flex;
          gap: 16px;
          margin-bottom: 12px;
        }

        .demo-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
        }

        .demo-label {
          color: #6b7280;
          font-weight: 500;
        }

        .demo-item code {
          background: white;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 13px;
          color: #059669;
          border: 1px solid #bbf7d0;
          font-family: 'Courier New', monospace;
          font-weight: 600;
        }

        .demo-fill-btn {
          width: 100%;
          padding: 10px;
          background: white;
          border: 2px solid #059669;
          color: #059669;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
          font-family: inherit;
        }

        .demo-fill-btn:hover {
          background: #059669;
          color: white;
        }

        @media (max-width: 480px) {
          .login-card {
            padding: 32px 24px;
            border-radius: 20px;
          }

          .login-card__title {
            font-size: 28px;
          }

          .login-card__logo {
            width: 64px;
            height: 64px;
            border-radius: 20px;
          }

          .demo-credentials {
            flex-direction: column;
            gap: 8px;
          }
        }
      `}</style>
    </div>
  );
}