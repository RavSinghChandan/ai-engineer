"""
Email notification service — fires when admin attaches a completed report to a lead.

Config via env vars (all optional — degrades gracefully if not set):
  SMTP_HOST      default: smtp.gmail.com
  SMTP_PORT      default: 587
  SMTP_USER      Gmail address (sender)
  SMTP_PASSWORD  Gmail App Password (not your account password)
  EMAIL_FROM     Display name + address, e.g. "AURA with Rav <rav@aura.local>"

If SMTP_USER is not set, email is skipped silently and a warning is logged.
To set up Gmail: Google Account → Security → 2FA → App Passwords → generate one.
"""
from __future__ import annotations

import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger(__name__)

_SMTP_HOST   = os.environ.get("SMTP_HOST", "smtp.gmail.com")
_SMTP_PORT   = int(os.environ.get("SMTP_PORT", "587"))
_SMTP_USER   = os.environ.get("SMTP_USER", "")
_SMTP_PASS   = os.environ.get("SMTP_PASSWORD", "")
_EMAIL_FROM  = os.environ.get("EMAIL_FROM", f"AURA with Rav <{_SMTP_USER}>")
_APP_URL     = os.environ.get("APP_URL", "http://localhost:4200")


def _build_html(name: str, report_summary: str) -> str:
    return f"""
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f1f5f9; margin: 0; padding: 0; }}
  .shell {{ max-width: 600px; margin: 32px auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }}
  .header {{ background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 36px 40px; text-align: center; }}
  .header h1 {{ color: #fff; margin: 0; font-size: 26px; font-weight: 700; letter-spacing: 0.04em; }}
  .header p  {{ color: rgba(255,255,255,0.8); margin: 6px 0 0; font-size: 14px; }}
  .body {{ padding: 36px 40px; }}
  .greeting {{ font-size: 18px; font-weight: 600; color: #1e1b4b; margin-bottom: 12px; }}
  .msg {{ font-size: 14px; color: #4b5563; line-height: 1.7; margin-bottom: 24px; }}
  .report-box {{
    background: linear-gradient(135deg, #f0fdf4, #ecfdf5);
    border: 1.5px solid #6ee7b7; border-radius: 12px;
    padding: 20px 24px; margin-bottom: 28px;
  }}
  .report-box h3 {{ font-size: 13px; font-weight: 700; color: #065f46; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 0.06em; }}
  .report-box p  {{ font-size: 13.5px; color: #374151; margin: 0; line-height: 1.6; white-space: pre-wrap; }}
  .cta {{ text-align: center; margin: 28px 0; }}
  .cta a {{
    display: inline-block; background: linear-gradient(135deg, #4f46e5, #7c3aed);
    color: #fff; text-decoration: none; padding: 14px 36px; border-radius: 10px;
    font-size: 15px; font-weight: 700; letter-spacing: 0.02em;
    box-shadow: 0 4px 14px rgba(99,102,241,0.4);
  }}
  .footer {{ background: #f8fafc; padding: 20px 40px; text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; }}
  .star {{ color: #6366f1; }}
</style>
</head>
<body>
<div class="shell">
  <div class="header">
    <h1><span class="star">✦</span> AURA <em style="font-style:normal;font-weight:400;opacity:0.85">with Rav</em></h1>
    <p>360° Astro-Spiritual Intelligence</p>
  </div>
  <div class="body">
    <p class="greeting">Namaste, {name} 🙏</p>
    <p class="msg">
      Your personalised 360° Vedic reading is complete! Our expert astrologer has carefully
      analysed your birth chart, numerology, and spiritual indicators to prepare a reading
      crafted specifically for you.
    </p>
    <div class="report-box">
      <h3>✦ Reading Summary</h3>
      <p>{report_summary}</p>
    </div>
    <p class="msg">
      Log back into AURA with Rav to view your complete report — it includes your full
      astrology chart, numerology breakdown, and personalised guidance.
    </p>
    <div class="cta">
      <a href="{_APP_URL}">Open My Full Report →</a>
    </div>
    <p class="msg" style="font-size:12px;color:#9ca3af">
      This reading was prepared with care by Rav Singh and the AURA expert team.
      For guidance only. © 2026 AURA with Rav.
    </p>
  </div>
  <div class="footer">
    AURA with Rav · See life — as it is. · Powered by AI + Human Wisdom
  </div>
</div>
</body>
</html>
"""


def send_otp_email(to_email: str, to_name: str, code: str) -> bool:
    """
    Send a 6-digit OTP login code email.
    Returns True if sent, False if skipped/failed (never raises).
    """
    if not _SMTP_USER or not _SMTP_PASS:
        logger.warning(
            "[EMAIL] SMTP not configured — OTP for %s: %s (log only)", to_email, code
        )
        # Print to stdout so developers can see the code without SMTP
        print(f"\n{'='*50}")
        print(f"  OTP CODE for {to_email}: {code}")
        print(f"{'='*50}\n", flush=True)
        return False

    html = f"""
<!DOCTYPE html>
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
  <div class="header">
    <h1>✦ AURA <span style="font-weight:400;opacity:0.85">with Rav</span></h1>
  </div>
  <div class="body">
    <p class="greeting">Namaste, {to_name} 🙏</p>
    <p class="msg">Your one-time login code is:</p>
    <div class="code-box">
      <div class="code">{code}</div>
    </div>
    <p class="expire">This code expires in 10 minutes. Do not share it with anyone.</p>
    <p class="msg" style="margin-top:20px;font-size:12px;">
      If you didn't request this code, you can safely ignore this email.
    </p>
  </div>
  <div class="footer">AURA with Rav · See life — as it is.</div>
</div>
</body>
</html>"""

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"Your AURA login code: {code}"
        msg["From"]    = _EMAIL_FROM
        msg["To"]      = to_email

        plain = (
            f"Namaste {to_name},\n\n"
            f"Your AURA one-time login code is: {code}\n\n"
            f"This code expires in 10 minutes.\n"
            f"Do not share it with anyone.\n\n"
            f"— The AURA with Rav Team"
        )
        msg.attach(MIMEText(plain, "plain"))
        msg.attach(MIMEText(html, "html"))

        with smtplib.SMTP(_SMTP_HOST, _SMTP_PORT) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.login(_SMTP_USER, _SMTP_PASS)
            smtp.sendmail(_SMTP_USER, [to_email], msg.as_string())

        logger.info("[EMAIL] ✓ OTP sent to %s", to_email)
        return True

    except Exception as exc:
        logger.error("[EMAIL] Failed to send OTP to %s: %s", to_email, exc)
        return False


def send_report_ready(to_email: str, to_name: str, report_summary: str) -> bool:
    """
    Send a "report ready" notification email.
    Returns True if sent, False if skipped/failed (never raises).
    """
    if not _SMTP_USER or not _SMTP_PASS:
        logger.warning(
            "[EMAIL] SMTP_USER / SMTP_PASSWORD not set — skipping email to %s. "
            "Set these env vars to enable email delivery.", to_email
        )
        return False

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"✦ Your AURA Reading is Ready, {to_name}!"
        msg["From"]    = _EMAIL_FROM
        msg["To"]      = to_email

        plain = (
            f"Namaste {to_name},\n\n"
            f"Your personalised 360° Vedic reading is complete!\n\n"
            f"Summary:\n{report_summary}\n\n"
            f"Log in to AURA with Rav to view your full report: {_APP_URL}\n\n"
            f"— The AURA with Rav Team"
        )
        msg.attach(MIMEText(plain, "plain"))
        msg.attach(MIMEText(_build_html(to_name, report_summary), "html"))

        with smtplib.SMTP(_SMTP_HOST, _SMTP_PORT) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.login(_SMTP_USER, _SMTP_PASS)
            smtp.sendmail(_SMTP_USER, [to_email], msg.as_string())

        logger.info("[EMAIL] ✓ Report notification sent to %s", to_email)
        return True

    except Exception as exc:
        logger.error("[EMAIL] Failed to send to %s: %s", to_email, exc)
        return False
