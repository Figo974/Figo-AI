const axios = require("axios");

const RESEND_API_KEY = process.env.RESEND_API_KEY;
// Resend's shared onboarding domain works without verifying a custom domain,
// but until a domain is verified on the Resend account, it can only actually
// deliver to the email address that account was signed up with — fine for
// now, revisit once a real domain is verified.
const FROM_ADDRESS = "FigoAI <onboarding@resend.dev>";

const isEmailConfigured = !!RESEND_API_KEY;

async function send({ to, subject, text, html }) {
  if (!RESEND_API_KEY) {
    throw new Error("Email sending is not configured on this server");
  }

  await axios.post(
    "https://api.resend.com/emails",
    { from: FROM_ADDRESS, to, subject, text, html },
    { headers: { Authorization: `Bearer ${RESEND_API_KEY}` } }
  );
}

// No logo image here — even a properly inline-marked attachment still makes
// Gmail's inbox list show an attachment chip next to the subject line.
// Revisit once FigoAI is deployed and the logo can be a remote <img src>
// instead of an attached one, which avoids that chip entirely.
async function sendPasswordResetEmail(to, resetUrl) {
  await send({
    to,
    subject: "Reset your FigoAI password",
    text: `We received a request to reset your FigoAI password.\n\nReset it here (expires in 1 hour):\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #0a0a0b; color: #ececec; border-radius: 16px;">
        <h1 style="font-size: 20px; margin: 0 0 12px;">Reset your password</h1>
        <p style="font-size: 14px; line-height: 1.6; color: #a1a1aa; margin: 0 0 24px;">
          We received a request to reset your FigoAI password. This link expires in 1 hour.
        </p>
        <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #a1a1aa, #52525b); color: #0a0a0b; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 14px;">
          Reset Password
        </a>
        <p style="font-size: 12px; color: #71717a; margin-top: 24px;">
          If you didn't request this, you can safely ignore this email.
        </p>
      </div>
    `,
  });
}

async function sendPasswordChangedEmail(to) {
  await send({
    to,
    subject: "Your FigoAI password was changed",
    text: "Your FigoAI account password was just changed. If this wasn't you, reset your password immediately from the sign-in page.",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #0a0a0b; color: #ececec; border-radius: 16px;">
        <h1 style="font-size: 20px; margin: 0 0 12px;">Password changed</h1>
        <p style="font-size: 14px; line-height: 1.6; color: #a1a1aa; margin: 0 0 8px;">
          Your FigoAI account password was just changed.
        </p>
        <p style="font-size: 12px; color: #71717a; margin-top: 16px;">
          If this wasn't you, reset your password immediately from the sign-in page.
        </p>
      </div>
    `,
  });
}

async function sendLoginAlertEmail(to, { deviceType, os, browser, city, regionCode } = {}) {
  const device = [browser, os && `on ${os}`].filter(Boolean).join(" ") || deviceType || "a device";
  const location = city ? `${city}${regionCode ? `, ${regionCode}` : ""}` : null;
  const when = new Date().toLocaleString();

  await send({
    to,
    subject: "New sign-in to your FigoAI account",
    text: `Your FigoAI account (Advanced Account Security enabled) was just signed into from ${device}${location ? ` near ${location}` : ""} at ${when}.\n\nIf this wasn't you, remove the device from Settings > Security and login > Active sessions.`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #0a0a0b; color: #ececec; border-radius: 16px;">
        <h1 style="font-size: 20px; margin: 0 0 12px;">New sign-in to your account</h1>
        <p style="font-size: 14px; line-height: 1.6; color: #a1a1aa; margin: 0 0 8px;">
          A sign-in just happened from <strong style="color:#ececec">${device}</strong>${location ? ` near <strong style="color:#ececec">${location}</strong>` : ""} at ${when}.
        </p>
        <p style="font-size: 12px; color: #71717a; margin-top: 16px;">
          You're getting this because Advanced Account Security is enabled. If this wasn't you, remove the device from Settings &gt; Security and login &gt; Active sessions.
        </p>
      </div>
    `,
  });
}

async function sendFamilyInviteEmail(to, { inviterName, relation, inviteUrl }) {
  // relation describes how the INVITEE relates to the inviter's family.
  const roleText = relation === "child" ? "as their child" : "as their parent or guardian";

  await send({
    to,
    subject: `${inviterName} invited you to link FigoAI accounts`,
    text: `${inviterName} wants to link accounts with you on FigoAI ${roleText}.\n\nAccept the invite here (expires in 7 days):\n${inviteUrl}\n\nIf your family member is new to FigoAI, they'll be asked to create an account first.\n\nIf you weren't expecting this, you can safely ignore this email.`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #0a0a0b; color: #ececec; border-radius: 16px;">
        <h1 style="font-size: 20px; margin: 0 0 12px;">Family invite from ${inviterName}</h1>
        <p style="font-size: 14px; line-height: 1.6; color: #a1a1aa; margin: 0 0 24px;">
          ${inviterName} wants to link FigoAI accounts with you ${roleText}. This invite expires in 7 days.
        </p>
        <a href="${inviteUrl}" style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #a1a1aa, #52525b); color: #0a0a0b; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 14px;">
          Accept invite
        </a>
        <p style="font-size: 12px; color: #71717a; margin-top: 24px;">
          If your family member is new to FigoAI, they'll be asked to create an account first. If you weren't expecting this, you can safely ignore this email.
        </p>
      </div>
    `,
  });
}

module.exports = { sendPasswordResetEmail, sendPasswordChangedEmail, sendLoginAlertEmail, sendFamilyInviteEmail, isEmailConfigured };
