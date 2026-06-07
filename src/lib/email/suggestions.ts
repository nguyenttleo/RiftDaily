import nodemailer from "nodemailer";

type SuggestionEmailInput = {
  name?: string;
  contact?: string;
  type: string;
  message: string;
  page?: string;
  userEmail?: string | null;
};

type SuggestionEmailResult =
  | { sent: true }
  | {
      sent: false;
      reason: "disabled" | "unconfigured" | "failed";
      message?: string;
    };

const DEFAULT_SUGGESTION_TO = "leo@playriftdaily.io";

export async function sendSuggestionEmail(input: SuggestionEmailInput): Promise<SuggestionEmailResult> {
  if (process.env.SUGGESTION_EMAIL_ENABLED !== "true") {
    return { sent: false, reason: "disabled" };
  }

  const host = process.env.SES_SMTP_HOST || process.env.SMTP_HOST;
  const port = Number(process.env.SES_SMTP_PORT || process.env.SMTP_PORT || 587);
  const user = process.env.SES_SMTP_USER || process.env.SMTP_USER;
  const pass = process.env.SES_SMTP_PASSWORD || process.env.SMTP_PASSWORD;
  const from = process.env.SUGGESTION_EMAIL_FROM || process.env.EMAIL_FROM;
  const to = process.env.SUGGESTION_EMAIL_TO || DEFAULT_SUGGESTION_TO;

  if (!host || !port || !user || !pass || !from || !to) {
    return { sent: false, reason: "unconfigured" };
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: process.env.SES_SMTP_SECURE === "true" || process.env.SMTP_SECURE === "true" || port === 465,
    auth: {
      user,
      pass
    }
  });

  const replyTo = firstEmail(input.contact) ?? input.userEmail ?? undefined;
  const subject = `Rift Daily suggestion: ${input.type}`;
  const text = buildSuggestionText(input);

  try {
    await transporter.sendMail({
      from,
      to,
      replyTo,
      subject,
      text,
      html: buildSuggestionHtml(input)
    });

    return { sent: true };
  } catch (error) {
    return {
      sent: false,
      reason: "failed",
      message: error instanceof Error ? error.message : "Suggestion email failed."
    };
  }
}

function buildSuggestionText(input: SuggestionEmailInput) {
  return [
    `Type: ${input.type}`,
    `Name: ${input.name || "Not provided"}`,
    `Contact: ${input.contact || input.userEmail || "Not provided"}`,
    `Page: ${input.page || "Not provided"}`,
    "",
    "Suggestion:",
    input.message
  ].join("\n");
}

function buildSuggestionHtml(input: SuggestionEmailInput) {
  return `
    <div style="font-family:Inter,Arial,sans-serif;background:#050914;color:#f8fafc;padding:24px;">
      <div style="max-width:680px;margin:0 auto;border:1px solid rgba(245,197,66,.28);border-radius:16px;background:#111827;padding:22px;">
        <p style="margin:0 0 8px;color:#f5c542;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">Rift Daily Suggestion</p>
        <h1 style="margin:0 0 18px;font-size:24px;line-height:1.2;color:#fff;">${escapeHtml(input.type)}</h1>
        <table style="width:100%;border-collapse:collapse;margin-bottom:18px;color:#cbd5e1;font-size:14px;">
          <tr><td style="padding:5px 0;color:#94a3b8;">Name</td><td style="padding:5px 0;">${escapeHtml(input.name || "Not provided")}</td></tr>
          <tr><td style="padding:5px 0;color:#94a3b8;">Contact</td><td style="padding:5px 0;">${escapeHtml(input.contact || input.userEmail || "Not provided")}</td></tr>
          <tr><td style="padding:5px 0;color:#94a3b8;">Page</td><td style="padding:5px 0;">${escapeHtml(input.page || "Not provided")}</td></tr>
        </table>
        <div style="white-space:pre-wrap;border-radius:12px;background:#050914;padding:16px;color:#f8fafc;line-height:1.55;">${escapeHtml(input.message)}</div>
      </div>
    </div>
  `;
}

function firstEmail(value?: string) {
  const match = value?.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match?.[0];
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
