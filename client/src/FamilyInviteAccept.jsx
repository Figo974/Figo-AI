import { useEffect, useState } from "react";
import { Icons } from "./icons.jsx";
import { getFamilyInviteByToken, acceptFamilyInvite, declineFamilyInvite } from "./api.js";
import "./Login.css";

export default function FamilyInviteAccept({ token, onDone }) {
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getFamilyInviteByToken(token)
      .then(setInvite)
      .catch((err) => setError(err.message || "This invite is no longer valid"))
      .finally(() => setLoading(false));
  }, [token]);

  const handleAccept = async () => {
    setSubmitting(true);
    try {
      await acceptFamilyInvite(token);
      onDone();
    } catch (err) {
      setError(err.message || "Could not accept that invite");
      setSubmitting(false);
    }
  };

  const handleDecline = async () => {
    setSubmitting(true);
    try {
      await declineFamilyInvite(token);
    } catch {
      // Not worth blocking on — either way we're leaving this screen.
    }
    onDone();
  };

  // relation describes how *you* (the invitee) relate to the inviter.
  const roleText = invite?.relation === "child" ? "their child" : "their parent or guardian";

  return (
    <div className="login-container dark">
      <div className="login-card">
        <div className="login-card__header">
          <p className="family-invite__title">Family invite</p>
        </div>

        {loading && <p className="login-card__subtitle">Loading invite…</p>}

        {!loading && error && (
          <>
            <p className="login-card__subtitle">{error}</p>
            <button type="button" className="login-card__submit family-invite__continue" onClick={onDone}>
              <Icons.ArrowRight />
              <span>Continue</span>
            </button>
          </>
        )}

        {!loading && !error && invite && (
          <>
            <p className="login-card__subtitle">
              <strong>{invite.inviterName}</strong> wants to link FigoAI accounts with you as {roleText}.
            </p>
            <p className="family-invite__sent-to"><Icons.User size={14} /> Sent to {invite.contact}</p>
            <div className="family-invite__actions">
              <button className="btn-cancel" disabled={submitting} onClick={handleDecline}>Decline</button>
              <button className="pill-btn pill-btn--solid" disabled={submitting} onClick={handleAccept}>
                {submitting ? "Accepting…" : "Accept"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
