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


# ── HTML builders ─────────────────────────────────────────────────────────────

def _otp_html(name: str, code: str) -> str:
    return f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/>
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f1f5f9; margin: 0; }}
  .shell {{ max-width: 480px; margin: 32px auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }}
  .header {{ background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 28px 40px; text-align: center; }}
  .header h1 {{ color: #fff; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: 0.04em; }}
  .body {{ padding: 32px 40px; text-align: center; }}
  .greeting {{ font-size: 16px; font-weight: 600; color: #1e1b4b; margin-bottom: 8px; }}
  .msg {{ font-size: 13px; color: #6b7280; line-height: 1.6; margin-bottom: 24px; }}
  .code-box {{ background: linear-gradient(135deg, #eef2ff, #f5f3ff); border: 2px solid #c7d2fe; border-radius: 14px; padding: 22px; margin: 0 auto 24px; display: inline-block; min-width: 220px; }}
  .code {{ font-size: 40px; font-weight: 800; letter-spacing: 0.18em; color: #4338ca; font-variant-numeric: tabular-nums; }}
  .expire {{ font-size: 12px; color: #9ca3af; }}
  .footer {{ background: #f8fafc; padding: 16px 40px; text-align: center; font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; }}
</style>
</head>
<body>
<div class="shell">
  <div class="header"><h1>✦ AURA <span style="font-weight:400;opacity:0.85">with Rav</span></h1></div>
  <div class="body">
    <p class="greeting">Namaste, {name} 🙏</p>
    <p class="msg">Your one-time login code is:</p>
    <div class="code-box"><div class="code">{code}</div></div>
    <p class="expire">Expires in 10 minutes. Never share this code.</p>
    <p class="msg" style="margin-top:20px;font-size:12px;">If you didn't request this, ignore this email.</p>
  </div>
  <div class="footer">AURA with Rav · See life — as it is.</div>
</div>
</body></html>"""


def _report_html(name: str, summary: str) -> str:
    return f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/>
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f1f5f9; margin: 0; padding: 0; }}
  .shell {{ max-width: 600px; margin: 32px auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }}
  .header {{ background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 36px 40px; text-align: center; }}
  .header h1 {{ color: #fff; margin: 0; font-size: 26px; font-weight: 700; letter-spacing: 0.04em; }}
  .header p  {{ color: rgba(255,255,255,0.8); margin: 6px 0 0; font-size: 14px; }}
  .body {{ padding: 36px 40px; }}
  .greeting {{ font-size: 18px; font-weight: 600; color: #1e1b4b; margin-bottom: 12px; }}
  .msg {{ font-size: 14px; color: #4b5563; line-height: 1.7; margin-bottom: 24px; }}
  .report-box {{ background: linear-gradient(135deg, #f0fdf4, #ecfdf5); border: 1.5px solid #6ee7b7; border-radius: 12px; padding: 20px 24px; margin-bottom: 28px; }}
  .report-box h3 {{ font-size: 13px; font-weight: 700; color: #065f46; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 0.06em; }}
  .report-box p  {{ font-size: 13.5px; color: #374151; margin: 0; line-height: 1.6; white-space: pre-wrap; }}
  .cta {{ text-align: center; margin: 28px 0; }}
  .cta a {{ display: inline-block; background: linear-gradient(135deg, #4f46e5, #7c3aed); color: #fff; text-decoration: none; padding: 14px 36px; border-radius: 10px; font-size: 15px; font-weight: 700; box-shadow: 0 4px 14px rgba(99,102,241,0.4); }}
  .footer {{ background: #f8fafc; padding: 20px 40px; text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; }}
</style>
</head>
<body>
<div class="shell">
  <div class="header">
    <h1>✦ AURA <em style="font-style:normal;font-weight:400;opacity:0.85">with Rav</em></h1>
    <p>360° Astro-Spiritual Intelligence</p>
  </div>
  <div class="body">
    <p class="greeting">Namaste, {name} 🙏</p>
    <p class="msg">Your personalised 360° Vedic reading is complete! Our expert astrologer has carefully analysed your birth chart, numerology, and spiritual indicators to prepare a reading crafted specifically for you.</p>
    <div class="report-box">
      <h3>✦ Reading Summary</h3>
      <p>{summary}</p>
    </div>
    <p class="msg">Log back into AURA with Rav to view your complete report — it includes your full astrology chart, numerology breakdown, and personalised guidance.</p>
    <div class="cta"><a href="{_APP_URL}">Open My Full Report →</a></div>
    <p class="msg" style="font-size:12px;color:#9ca3af;">Prepared with care by Rav Singh and the AURA expert team. For guidance only. © 2026 AURA with Rav.</p>
  </div>
  <div class="footer">AURA with Rav · See life — as it is. · Powered by AI + Human Wisdom</div>
</div>
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


def send_report_ready(to_email: str, to_name: str, report_summary: str) -> bool:
    """Send report-ready notification. Returns True if sent, False if skipped/failed."""
    subject = f"✦ Your AURA Reading is Ready, {to_name}!"
    plain   = (
        f"Namaste {to_name},\n\n"
        f"Your personalised 360° Vedic reading is complete!\n\n"
        f"Summary:\n{report_summary}\n\n"
        f"Log in to view your full report: {_APP_URL}\n\n"
        f"— AURA with Rav"
    )
    return _dispatch(to_email, subject, _report_html(to_name, report_summary), plain)
