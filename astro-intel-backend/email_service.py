"""
Email notification service.

Priority:
  1. Resend (https://resend.com) — if RESEND_API_KEY is set
  2. Gmail SMTP               — if SMTP_USER + SMTP_PASSWORD are set
  3. Dev fallback             — prints code to terminal, returns False

Config via .env:
  # Resend (recommended — free, no credit card)
  RESEND_API_KEY=re_xxxxxxxxxxxx
  EMAIL_FROM=AURA with Rav <onboarding@resend.dev>   # use resend.dev until you verify your domain

  # Gmail SMTP (alternative)
  SMTP_USER=you@gmail.com
  SMTP_PASSWORD=xxxx xxxx xxxx xxxx   # Gmail App Password (16 chars)
  EMAIL_FROM=AURA with Rav <you@gmail.com>

  APP_URL=http://localhost:4200   # shown in email CTA button
"""
from __future__ import annotations

import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger(__name__)

_RESEND_KEY  = os.environ.get("RESEND_API_KEY", "")
_SMTP_HOST   = os.environ.get("SMTP_HOST", "smtp.gmail.com")
_SMTP_PORT   = int(os.environ.get("SMTP_PORT", "587"))
_SMTP_USER   = os.environ.get("SMTP_USER", "")
_SMTP_PASS   = os.environ.get("SMTP_PASSWORD", "")
_EMAIL_FROM  = os.environ.get("EMAIL_FROM", "AURA with Rav <onboarding@resend.dev>")
_APP_URL     = os.environ.get("APP_URL", "http://localhost:4200")

# Public HTTPS image URLs — hosted on GitHub raw, loads in Gmail on any device/mode.
_GITHUB_RAW  = "https://raw.githubusercontent.com/RavSinghChandan/ai-engineer/main/astro-intel/public"
_LOGO_B64    = f"{_GITHUB_RAW}/rav-logo-email.jpg"
_PHOTO_B64   = f"{_GITHUB_RAW}/rav-photo-email.jpg"


# ── HTML builders ─────────────────────────────────────────────────────────────

def _otp_html(name: str, code: str) -> str:
    F = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif"
    LOGO = _LOGO_B64
    PHOTO = _PHOTO_B64
    return f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background:#f1f5f9;{F}">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px">
<tr><td align="center">
<table width="460" cellpadding="0" cellspacing="0" style="max-width:460px;width:100%;background:#ffffff;border-radius:20px;border:1px solid #e0e7ff">

  <!-- HEADER -->
  <tr><td align="center" style="background:#4f46e5;padding:28px 20px 24px;border-radius:20px 20px 0 0">
    <table cellpadding="0" cellspacing="0" style="margin:0 auto 14px auto">
      <tr>
        <td align="center" style="padding-right:16px">
          <img src="{LOGO}" width="80" height="80" alt="AURA Logo" style="display:block;border-radius:50%;border:3px solid #ffffff"/>
        </td>
        <td align="center">
          <img src="{PHOTO}" width="80" height="80" alt="Rav Singh" style="display:block;border-radius:50%;border:3px solid #ffffff"/>
        </td>
      </tr>
    </table>
    <div style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:0.05em">&#10022; AURA <span style="font-weight:300">with Rav</span></div>
    <div style="color:rgba(255,255,255,0.8);font-size:11px;letter-spacing:0.1em;text-transform:uppercase;margin-top:4px">See Life — As It Is</div>
  </td></tr>

  <!-- BODY -->
  <tr><td align="center" style="padding:32px 36px 28px;background:#ffffff">
    <p style="margin:0 0 6px 0;font-size:18px;font-weight:700;color:#1e1b4b;{F}">Namaste, {name} &#x1F64F;</p>
    <p style="margin:0 0 24px 0;font-size:13px;color:#6b7280;line-height:1.7;{F}">Your one-time secure login code is:</p>
    <table cellpadding="0" cellspacing="0" style="margin:0 auto 24px auto">
      <tr><td align="center" style="background:#f5f3ff;border:2px solid #c4b5fd;border-radius:12px;padding:20px 44px">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.16em;color:#7c3aed;text-transform:uppercase;margin-bottom:8px;{F}">Your Login Code</div>
        <div style="font-size:40px;font-weight:900;letter-spacing:0.2em;color:#4338ca;{F}">{code}</div>
      </td></tr>
    </table>
    <p style="margin:0 0 6px 0;font-size:12px;color:#9ca3af;{F}">Expires in 10 minutes &nbsp;&middot;&nbsp; Never share this code</p>
    <p style="margin:0;font-size:12px;color:#9ca3af;{F}">If you didn't request this, ignore this email.</p>
  </td></tr>

  <!-- FOOTER -->
  <tr><td align="center" style="background:#f8fafc;padding:14px 36px;border-top:1px solid #e5e7eb;border-radius:0 0 20px 20px">
    <div style="font-size:11px;color:#9ca3af;{F}">AURA with Rav &nbsp;&middot;&nbsp; See life — as it is.</div>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>"""


def _report_html(name: str, summary: str, report_url: str = "") -> str:
    url = report_url or _APP_URL
    F = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif"
    LOGO = _LOGO_B64
    PHOTO = _PHOTO_B64
    return f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background:#f1f5f9;{F}">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#ffffff;border-radius:20px;border:1px solid #e0e7ff">

  <!-- HEADER -->
  <tr><td align="center" style="background:#4f46e5;padding:32px 20px 28px;border-radius:20px 20px 0 0">
    <table cellpadding="0" cellspacing="0" style="margin:0 auto 16px auto">
      <tr>
        <td align="center" style="padding-right:20px">
          <img src="{LOGO}" width="90" height="90" alt="AURA Logo" style="display:block;border-radius:50%;border:3px solid #ffffff"/>
        </td>
        <td align="center">
          <img src="{PHOTO}" width="90" height="90" alt="Rav Singh" style="display:block;border-radius:50%;border:3px solid #ffffff"/>
        </td>
      </tr>
    </table>
    <div style="color:#ffffff;font-size:26px;font-weight:800;letter-spacing:0.05em">&#10022; AURA <span style="font-weight:300">with Rav</span></div>
    <div style="color:rgba(255,255,255,0.8);font-size:11px;letter-spacing:0.12em;text-transform:uppercase;margin-top:5px">360&#176; Astro-Spiritual Intelligence</div>
    <div style="color:rgba(255,255,255,0.65);font-size:11px;margin-top:3px">by Rav Singh &nbsp;&middot;&nbsp; Expert Vedic Astrologer</div>
  </td></tr>

  <!-- BADGE + GREETING -->
  <tr><td align="center" style="background:#ffffff;padding:28px 40px 8px">
    <table cellpadding="0" cellspacing="0" style="margin:0 auto 16px auto">
      <tr><td align="center" style="background:#f5f3ff;border:1px solid #c4b5fd;border-radius:30px;padding:6px 20px">
        <span style="font-size:11px;font-weight:700;color:#6d28d9;letter-spacing:0.12em;text-transform:uppercase;{F}">&#10022; Your Reading Is Ready</span>
      </td></tr>
    </table>
    <p style="margin:0 0 10px 0;font-size:20px;font-weight:700;color:#1e1b4b;{F}">Namaste, {name} &#x1F64F;</p>
    <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.8;{F}">Your personalised 360&#176; Vedic reading is complete. Our expert astrologer has carefully analysed your birth chart, numerology, and spiritual indicators.</p>
  </td></tr>

  <!-- SUMMARY BOX -->
  <tr><td style="background:#ffffff;padding:20px 40px">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="background:#f0fdf4;border:2px solid #6ee7b7;border-radius:12px;padding:18px 22px">
        <div style="font-size:10px;font-weight:800;color:#065f46;text-transform:uppercase;letter-spacing:0.14em;margin-bottom:8px;{F}">&#10022; Reading Summary</div>
        <div style="font-size:13px;color:#374151;line-height:1.75;{F}">{summary}</div>
      </td></tr>
    </table>
  </td></tr>

  <!-- CTA -->
  <tr><td align="center" style="background:#ffffff;padding:8px 40px 32px">
    <p style="margin:0 0 20px 0;font-size:13px;color:#6b7280;line-height:1.8;{F}">Log into AURA with Rav to view your complete report — full astrology chart, numerology breakdown, and personalised life guidance.</p>
    <table cellpadding="0" cellspacing="0">
      <tr><td align="center" style="background:#6366f1;border-radius:10px">
        <a href="{url}" style="display:inline-block;background:#6366f1;color:#ffffff;text-decoration:none;padding:14px 44px;border-radius:10px;font-size:15px;font-weight:700;{F}">Open My Full Report &#8594;</a>
      </td></tr>
    </table>
    <p style="margin:16px 0 0 0;font-size:11px;color:#9ca3af;{F}">Prepared with care by Rav Singh &amp; the AURA expert team.<br/>For spiritual guidance only. &copy; 2026 AURA with Rav.</p>
  </td></tr>

  <!-- FOOTER -->
  <tr><td align="center" style="background:#f8fafc;padding:14px 40px;border-top:1px solid #e5e7eb;border-radius:0 0 20px 20px">
    <div style="font-size:11px;color:#9ca3af;{F}">AURA with Rav &nbsp;&middot;&nbsp; See life — as it is. &nbsp;&middot;&nbsp; Powered by AI + Human Wisdom</div>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>"""


# ── Transport layer ───────────────────────────────────────────────────────────

def _send_via_resend(to_email: str, subject: str, html: str, plain: str) -> bool:
    try:
        import resend
        resend.api_key = _RESEND_KEY
        resend.Emails.send({
            "from":    _EMAIL_FROM,
            "to":      [to_email],
            "subject": subject,
            "html":    html,
            "text":    plain,
        })
        logger.info("[EMAIL/Resend] ✓ sent to %s — %s", to_email, subject)
        return True
    except Exception as exc:
        logger.error("[EMAIL/Resend] failed to %s: %s", to_email, exc)
        return False


def _send_via_smtp(to_email: str, subject: str, html: str, plain: str) -> bool:
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = _EMAIL_FROM
        msg["To"]      = to_email
        msg.attach(MIMEText(plain, "plain"))
        msg.attach(MIMEText(html,  "html"))
        with smtplib.SMTP(_SMTP_HOST, _SMTP_PORT) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.login(_SMTP_USER, _SMTP_PASS)
            smtp.sendmail(_SMTP_USER, [to_email], msg.as_string())
        logger.info("[EMAIL/SMTP] ✓ sent to %s — %s", to_email, subject)
        return True
    except Exception as exc:
        logger.error("[EMAIL/SMTP] failed to %s: %s", to_email, exc)
        return False


def _dispatch(to_email: str, subject: str, html: str, plain: str) -> bool:
    if _RESEND_KEY:
        return _send_via_resend(to_email, subject, html, plain)
    if _SMTP_USER and _SMTP_PASS:
        return _send_via_smtp(to_email, subject, html, plain)
    logger.warning("[EMAIL] No provider configured (RESEND_API_KEY or SMTP_USER). Email skipped for %s.", to_email)
    return False


# ── Public API ────────────────────────────────────────────────────────────────

def send_otp_email(to_email: str, to_name: str, code: str) -> bool:
    """Send 6-digit OTP. Returns True if sent, False if skipped/failed."""
    if not _RESEND_KEY and not (_SMTP_USER and _SMTP_PASS):
        # Dev mode — print to terminal so developer can see the code
        print(f"\n{'='*50}", flush=True)
        print(f"  OTP for {to_email}: {code}")
        print(f"{'='*50}\n", flush=True)
        return False

    subject = f"Your AURA login code: {code}"
    plain   = (
        f"Namaste {to_name},\n\n"
        f"Your AURA one-time code is: {code}\n\n"
        f"Expires in 10 minutes. Do not share it.\n\n"
        f"— AURA with Rav"
    )
    return _dispatch(to_email, subject, _otp_html(to_name, code), plain)


def send_report_ready(to_email: str, to_name: str, report_summary: str, lead_id: str = "") -> bool:
    """Send report-ready notification. Returns True if sent, False if skipped/failed."""
    # Deep-link straight to the report — user lands logged-in on their tracker
    report_url = f"{_APP_URL}?lead={lead_id}" if lead_id else _APP_URL
    subject = f"✦ Your AURA Reading is Ready, {to_name}!"
    plain   = (
        f"Namaste {to_name},\n\n"
        f"Your personalised 360° Vedic reading is complete!\n\n"
        f"Summary:\n{report_summary}\n\n"
        f"Open your full report here: {report_url}\n\n"
        f"— AURA with Rav"
    )
    return _dispatch(to_email, subject, _report_html(to_name, report_summary, report_url), plain)
