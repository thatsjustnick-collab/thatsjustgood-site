// Email and text messages through Brevo. Without keys (local development), messages are
// captured in memory instead of sent, so every flow can still be tested end to end.
import { SITE, esc } from "./util.mjs";

const outbox = (globalThis.__TJG_OUTBOX ||= []);
export const getOutbox = () => outbox;
export const clearOutbox = () => { outbox.length = 0; };

const FROM_EMAIL = () => process.env.EMAIL_FROM || "dogood@thatsjustgood.com";
export const NOTIFY_EMAIL = () => process.env.NOTIFY_EMAIL || "dogood@thatsjustgood.com";

export async function sendEmail({ to, toName, subject, html, text, attachments = [], replyTo }) {
  const key = process.env.BREVO_API_KEY;
  const msg = { channel: "email", to, subject, html, text, attachments: attachments.map((a) => a.name) };
  if (!key) { outbox.push(msg); return { dev: true }; }
  const body = {
    sender: { name: "That's Just Good", email: FROM_EMAIL() },
    to: [{ email: to, ...(toName ? { name: toName } : {}) }],
    subject, htmlContent: html, textContent: text || undefined,
    replyTo: replyTo || { email: NOTIFY_EMAIL(), name: "That's Just Good" },
  };
  if (attachments.length) body.attachment = attachments.map((a) => ({ name: a.name, content: Buffer.from(a.content).toString("base64") }));
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST", headers: { "api-key": key, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body),
  });
  if (!r.ok) console.error("Brevo email failed", r.status, await r.text());
  return { ok: r.ok };
}

export async function sendSms({ to, text }) {
  const key = process.env.BREVO_API_KEY, sender = process.env.BREVO_SMS_SENDER;
  if (!to) return { skipped: true };
  if (!key || !sender) { outbox.push({ channel: "sms", to, text }); return { dev: true }; }
  const r = await fetch("https://api.brevo.com/v3/transactionalSMS/send", {
    method: "POST", headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ sender, recipient: to.replace(/^\+/, ""), content: text, type: "transactional" }),
  });
  if (!r.ok) console.error("Brevo SMS failed", r.status, await r.text());
  return { ok: r.ok };
}

/** Add an attendee to the That's Just Good mailing list (only when they opted in). */
export async function addToList({ email, name, listId = process.env.BREVO_LIST_ID }) {
  const key = process.env.BREVO_API_KEY;
  if (!key || !listId) return { skipped: true };
  const [firstName, ...rest] = String(name || "").split(" ");
  const r = await fetch("https://api.brevo.com/v3/contacts", {
    method: "POST", headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ email, attributes: { FIRSTNAME: firstName, LASTNAME: rest.join(" ") }, listIds: [Number(listId)], updateEnabled: true }),
  });
  return { ok: r.ok };
}

/* ---------------- Branded email layout ---------------- */
const C = { navy: "#13294B", coral: "#FF5B4A", sky: "#8ED1FC", cloud: "#F4F8FB", slate: "#4B5E72" };

export function layout({ preheader = "", heading, body, cta, ctaUrl, footerNote = "" }) {
  const logo = `${SITE()}/images/brand/logo-horizontal-reversed-email.png`;
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width"><meta charset="utf-8"></head>
<body style="margin:0;background:${C.cloud};font-family:Arial,Helvetica,sans-serif;color:${C.navy}">
<span style="display:none;max-height:0;overflow:hidden">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.cloud}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden">
<tr><td style="background:${C.navy};padding:22px 28px"><img src="${logo}" alt="That's Just Good" width="220" style="display:block;border:0;width:220px;max-width:100%"></td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 14px;font-size:24px;line-height:1.25;color:${C.navy}">${esc(heading)}</h1>
<div style="font-size:16px;line-height:1.6;color:${C.navy}">${body}</div>
${cta ? `<p style="margin:26px 0 6px"><a href="${ctaUrl}" style="background:${C.coral};color:${C.navy};text-decoration:none;font-weight:bold;padding:14px 22px;border-radius:999px;display:inline-block">${esc(cta)}</a></p>` : ""}
</td></tr>
<tr><td style="padding:18px 28px;background:${C.cloud};font-size:13px;line-height:1.5;color:${C.slate}">
${footerNote ? footerNote + "<br><br>" : ""}That's Just Good · Show up. Do good. Tell the story.<br>
Questions? Reply to this email or write <a href="mailto:dogood@thatsjustgood.com" style="color:${C.slate}">dogood@thatsjustgood.com</a>.
</td></tr></table></td></tr></table></body></html>`;
}

export const detailRows = (rows) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0;border-top:1px solid #D6E3EE">${rows
    .filter((r) => r[1])
    .map(([k, v]) => `<tr><td style="padding:10px 12px 10px 0;border-bottom:1px solid #D6E3EE;color:${C.slate};font-size:14px;width:34%;vertical-align:top">${esc(k)}</td><td style="padding:10px 0;border-bottom:1px solid #D6E3EE;font-size:15px">${v}</td></tr>`)
    .join("")}</table>`;
