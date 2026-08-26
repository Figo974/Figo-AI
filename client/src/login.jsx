import { useState } from "react";
import { Icons } from "./icons.jsx";
import { loginUser, registerUser, forgotPassword, resetPassword } from "./api.js";
import "./Login.css";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login({ onLogin, oauthError, resetToken, onResetDone, onCancel }) {
  const [mode, setMode] = useState(resetToken ? "reset" : "login"); // 'login' | 'register' | 'forgot' | 'reset'
  const [formData, setFormData] = useState({ username: "", email: "", password: "", newPassword: "", confirmPassword: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(oauthError || "");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  const continueWith = (provider) => {
    window.location.href = `/api/auth/${provider}`;
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError("");
  };

  const switchMode = (next) => {
    setMode(next);
    setError("");
    setNotice("");
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const email = formData.email.trim();
    if (!EMAIL_RE.test(email)) {
      setError("Enter a valid email address");
      return;
    }
    setSubmitting(true);
    try {
      await forgotPassword(email);
      setNotice("If an account exists for that email, a reset link is on its way. Check your inbox.");
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const { newPassword, confirmPassword } = formData;
    if (!newPassword || !confirmPassword) {
      setError("Fill in both password fields");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    setSubmitting(true);
    try {
      await resetPassword(resetToken, newPassword);
      setResetDone(true);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const goToLoginAfterReset = () => {
    setMode("login");
    setResetDone(false);
    setFormData({ username: "", email: "", password: "", newPassword: "", confirmPassword: "" });
    onResetDone?.();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const username = formData.username.trim();
    const email = formData.email.trim();
    const password = formData.password;

    if (!username || !password || (mode === "register" && !email)) {
      setError("Please fill in all fields");
      return;
    }
    if (mode === "register" && !EMAIL_RE.test(email)) {
      setError("Enter a valid email address");
      return;
    }
    if (mode === "register" && password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setSubmitting(true);
    try {
      const data = mode === "login" ? await loginUser(username, password) : await registerUser(username, email, password);
      onLogin(data);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-container dark">
      <div className="login-card">
        {onCancel && (
          <button onClick={onCancel} className="login-card__back" type="button" title="Cancel">
            <Icons.ChevronLeft />
          </button>
        )}

        <div className="login-card__header">
          <div className="login-card__brand-logo">
            <img src="/logo.png" alt="FigoAI" />
          </div>

          <p className="login-card__subtitle">
            {mode === "login" && (onCancel ? "Sign in to add another account" : "Welcome back — sign in to continue")}
            {mode === "register" && (onCancel ? "Create another account" : "Create an account to get started")}
            {mode === "forgot" && "Reset your password"}
            {mode === "reset" && "Choose a new password"}
          </p>
        </div>

        {(mode === "login" || mode === "register") && (
          <>
            <div className="login-card__social">
              <button type="button" className="social-btn social-btn--google" onClick={() => continueWith("google")}>
                <Icons.Google /> <span>Continue with Google</span>
              </button>
              <button type="button" className="social-btn social-btn--github" onClick={() => continueWith("github")}>
                <Icons.Github /> <span>Continue with GitHub</span>
              </button>
            </div>
            <div className="login-card__divider"><span>or</span></div>
          </>
        )}

        {(mode === "login" || mode === "register") && (
          <form onSubmit={handleSubmit} className="login-card__form">
            <div className="input-group">
              <label htmlFor="username">
                <span className="input-icon">
                  <Icons.User />
                </span>
                {mode === "login" ? "Username or Email" : "Username"}
              </label>
              <div className="login-input-wrapper">
                <input
                  id="username"
                  name="username"
                  type="text"
                  value={formData.username}
                  onChange={handleChange}
                  placeholder={mode === "login" ? "Enter your username or email" : "Choose a username"}
                  autoFocus
                  autoComplete="username"
                />
                <span className="input-decoration">
                  <Icons.User />
                </span>
              </div>
            </div>

            {mode === "register" && (
              <div className="input-group">
                <label htmlFor="email">
                  <span className="input-icon">
                    <Icons.Mail />
                  </span>
                  Email
                </label>
                <div className="login-input-wrapper">
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                  <span className="input-decoration">
                    <Icons.Mail />
                  </span>
                </div>
              </div>
            )}

            <div className="input-group">
              <label htmlFor="password">
                <span className="input-icon">
                  <Icons.Lock />
                </span>
                Password
              </label>
              <div className="login-input-wrapper password-wrapper">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={handleChange}
                  placeholder={mode === "register" ? "At least 8 characters" : "Enter your password"}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                />
                <span className="input-decoration">
                  <Icons.Lock />
                </span>
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
              {mode === "login" && (
                <button type="button" className="forgot-password-link" onClick={() => switchMode("forgot")}>
                  Forgot password?
                </button>
              )}
            </div>

            {error && (
              <div className="login-card__error">
                <span className="error-icon"><Icons.AlertTriangle /></span>
                <span>{error}</span>
              </div>
            )}

            <button type="submit" className="login-card__submit" disabled={submitting}>
              <Icons.Sparkles />
              <span>
                {submitting
                  ? mode === "login" ? "Signing in…" : "Creating account…"
                  : mode === "login" ? "Sign In" : "Create Account"}
              </span>
              <Icons.ArrowRight />
            </button>

            <div className="login-card__info">
              <Icons.Shield />
              <span>Your password is hashed and never stored in plain text.</span>
            </div>
          </form>
        )}

        {mode === "forgot" && (
          <form onSubmit={handleForgotSubmit} className="login-card__form">
            {!notice && (
              <div className="input-group">
                <label htmlFor="forgot-email">
                  <span className="input-icon">
                    <Icons.Mail />
                  </span>
                  Email
                </label>
                <div className="login-input-wrapper">
                  <input
                    id="forgot-email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="you@example.com"
                    autoFocus
                    autoComplete="email"
                  />
                  <span className="input-decoration">
                    <Icons.Mail />
                  </span>
                </div>
              </div>
            )}

            {error && (
              <div className="login-card__error">
                <span className="error-icon"><Icons.AlertTriangle /></span>
                <span>{error}</span>
              </div>
            )}
            {notice && (
              <div className="login-card__notice">
                <span className="error-icon"><Icons.Check /></span>
                <span>{notice}</span>
              </div>
            )}

            {!notice && (
              <button type="submit" className="login-card__submit" disabled={submitting}>
                <Icons.Mail />
                <span>{submitting ? "Sending…" : "Send Reset Link"}</span>
              </button>
            )}
          </form>
        )}

        {mode === "reset" && !resetDone && (
          <form onSubmit={handleResetSubmit} className="login-card__form">
            <div className="input-group">
              <label htmlFor="newPassword">
                <span className="input-icon">
                  <Icons.Lock />
                </span>
                New Password
              </label>
              <div className="login-input-wrapper">
                <input
                  id="newPassword"
                  name="newPassword"
                  type={showPassword ? "text" : "password"}
                  value={formData.newPassword}
                  onChange={handleChange}
                  placeholder="At least 8 characters"
                  autoFocus
                  autoComplete="new-password"
                />
                <span className="input-decoration">
                  <Icons.Lock />
                </span>
              </div>
            </div>

            <div className="input-group">
              <label htmlFor="confirmPassword">
                <span className="input-icon">
                  <Icons.Lock />
                </span>
                Confirm New Password
              </label>
              <div className="login-input-wrapper">
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  placeholder="Re-enter new password"
                  autoComplete="new-password"
                />
                <span className="input-decoration">
                  <Icons.Lock />
                </span>
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

            {error && (
              <div className="login-card__error">
                <span className="error-icon"><Icons.AlertTriangle /></span>
                <span>{error}</span>
              </div>
            )}

            <button type="submit" className="login-card__submit" disabled={submitting}>
              <Icons.Check />
              <span>{submitting ? "Updating…" : "Update Password"}</span>
            </button>
          </form>
        )}

        {mode === "reset" && resetDone && (
          <div className="login-card__form">
            <div className="login-card__notice">
              <span className="error-icon"><Icons.Check /></span>
              <span>Your password has been updated.</span>
            </div>
            <button type="button" className="login-card__submit" onClick={goToLoginAfterReset}>
              <Icons.ArrowRight />
              <span>Sign In</span>
            </button>
          </div>
        )}

        {(mode === "login" || mode === "register") && (
          <div className="login-card__switch">
            {mode === "login" ? (
              <p>Don't have an account? <button type="button" onClick={() => switchMode("register")}>Create one</button></p>
            ) : (
              <p>Already have an account? <button type="button" onClick={() => switchMode("login")}>Sign in</button></p>
            )}
          </div>
        )}

        {mode === "forgot" && (
          <div className="login-card__switch">
            <p><button type="button" onClick={() => switchMode("login")}>Back to sign in</button></p>
          </div>
        )}
      </div>
    </div>
  );
}
