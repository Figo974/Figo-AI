import { useState } from "react";
import { Icons } from "./icons.jsx";
import "./Login.css";

export default function Login({ onLogin, onGuest, oauthError, onCancel }) {
  const [error, setError] = useState(oauthError || "");
  const [loading, setLoading] = useState(false);

  const continueWithGoogle = () => {
    window.location.href = "/api/auth/google";
  };

  const continueAsGuest = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/guest", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not continue as guest");
      onGuest(data);
    } catch (err) {
      setError(err.message || "Could not continue as guest. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container dark">
      <div className="login-card login-card--simple">
        <button onClick={onCancel || continueAsGuest} className="login-card__close" type="button" aria-label="Close">×</button>
        <div className="login-card__simple-heading">Log in or sign up</div>
        <p className="login-card__simple-subtitle">
          You’ll get smarter responses and can upload files, images, and more.
        </p>
        <div className="login-card__social">
          <button type="button" className="social-btn social-btn--google" onClick={continueWithGoogle}>
            <Icons.Google /><span>Continue with Google</span>
          </button>
        </div>
        {error && <div className="login-card__error" role="alert">{error}</div>}
        <div className="login-card__simple-divider"><span>OR</span></div>
        <button type="button" className="login-card__guest" onClick={continueAsGuest} disabled={loading}>
          {loading ? "Starting…" : "Continue as guest"}
        </button>
        <p className="login-card__guest-note">You can use Figo AI without an account. Sign in with Google for a personalized experience.</p>
      </div>
    </div>
  );
}
