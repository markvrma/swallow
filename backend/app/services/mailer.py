import logging
import smtplib
from email.message import EmailMessage

from app.config import get_settings

logger = logging.getLogger("swallow.mailer")


class MailError(RuntimeError):
    """SMTP refused the message. The caller decides whether that is fatal."""


def send_verification_code(to_email: str, code: str) -> None:
    """Email a signup code.

    With no SMTP host configured the code is logged instead. That keeps local
    development running without an SMTP account -- set SMTP_HOST in any
    environment where real mail matters.
    """
    settings = get_settings()
    if not settings.smtp_host:
        logger.warning("SMTP not configured; verification code for %s is %s", to_email, code)
        return

    message = EmailMessage()
    message["Subject"] = f"{code} is your Swallow code"
    message["From"] = settings.smtp_from
    message["To"] = to_email
    message.set_content(
        f"Your Swallow verification code is {code}.\n\n"
        f"It expires in {settings.otp_ttl_minutes} minutes. "
        "If you didn't sign up for Swallow, ignore this email."
    )

    try:
        with smtplib.SMTP(
            settings.smtp_host, settings.smtp_port, timeout=settings.smtp_timeout_seconds
        ) as smtp:
            if settings.smtp_starttls:
                smtp.starttls()
            if settings.smtp_user:
                smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(message)
    except (smtplib.SMTPException, OSError) as exc:
        raise MailError(str(exc)) from exc
