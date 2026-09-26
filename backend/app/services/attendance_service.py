import hmac
import hashlib
import math
import time
from typing import Tuple

QR_INTERVAL_SECONDS = 5
# Projector QR rotates every 5 seconds.
# Students have a 100-second submission window (20 windows * 5s) to take selfie & submit.
TOKEN_VALIDITY_WINDOWS = 20

def generate_qr_token(session_id: int, session_secret: str, timestamp: float = None) -> Tuple[str, int]:
    """
    Generate a dynamic rolling QR token for a session.
    Returns (token_str, remaining_seconds_in_current_window).
    """
    if timestamp is None:
        timestamp = time.time()
    
    current_window = int(timestamp // QR_INTERVAL_SECONDS)
    remaining_seconds = QR_INTERVAL_SECONDS - int(timestamp % QR_INTERVAL_SECONDS)
    if remaining_seconds == 0:
        remaining_seconds = QR_INTERVAL_SECONDS

    message = f"{session_id}:{current_window}".encode("utf-8")
    token = hmac.new(session_secret.encode("utf-8"), message, hashlib.sha256).hexdigest()[:16]
    return token, remaining_seconds


def verify_qr_token(session_id: int, session_secret: str, token_to_verify: str, timestamp: float = None) -> bool:
    """
    Verify if a token was generated within the allowed 100-second window (20 * 5s).
    """
    if not token_to_verify or not session_secret:
        return False

    if timestamp is None:
        timestamp = time.time()

    current_window = int(timestamp // QR_INTERVAL_SECONDS)

    # Check current window and previous 19 windows (TTL = 100 seconds total)
    for offset in range(TOKEN_VALIDITY_WINDOWS):
        win = current_window - offset
        message = f"{session_id}:{win}".encode("utf-8")
        expected_token = hmac.new(session_secret.encode("utf-8"), message, hashlib.sha256).hexdigest()[:16]
        if hmac.compare_digest(token_to_verify.lower(), expected_token.lower()):
            return True

    return False


def calculate_haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great circle distance in meters between two coordinates on Earth.
    """
    R = 6371000.0  # Earth radius in meters

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) * (math.sin(delta_lambda / 2.0) ** 2))
    
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c
