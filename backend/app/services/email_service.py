import smtplib
import asyncio
from concurrent.futures import ThreadPoolExecutor
from email.mime.text import MIMEText
from app.core.config import settings

# Dedicated non-blocking worker pool for sending emails
_email_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="email_worker")

def _send_email_sync(to_email: str, subject: str, body: str):
    """Synchronous SMTP worker function."""
    if settings.DEV_MODE:
        print(f"\n--- [DEV MODE] Email to {to_email} ---\nSubject: {subject}\n{body}\n---\n")
        return

    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = settings.SMTP_USER
    msg["To"] = to_email

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(settings.SMTP_USER, [to_email], msg.as_string())
    except Exception as e:
        print(f"Failed to send email to {to_email}: {e}")


def send_email(to_email: str, subject: str, body: str):
    """
    Fire-and-forget background email sender.
    Returns immediately in <1ms without blocking the client HTTP response.
    """
    try:
        loop = asyncio.get_running_loop()
        loop.run_in_executor(_email_executor, _send_email_sync, to_email, subject, body)
    except RuntimeError:
        _email_executor.submit(_send_email_sync, to_email, subject, body)

