import json
import numpy as np

# face-api.js's faceRecognitionNet produces 128-length descriptors.
# 0.6 is the standard Euclidean-distance threshold used by face-api.js/
# dlib-based models — below it is treated as "same person".
MATCH_THRESHOLD = 0.55

def save_descriptor(descriptor: list[float]) -> str:
    """Serialize a 128-float descriptor for storage in the User row."""
    return json.dumps(descriptor)

def compare_descriptors(stored_json: str, incoming: list[float]) -> tuple[bool, float]:
    """Returns (is_match, distance). Lower distance = more similar."""
    stored = np.array(json.loads(stored_json), dtype=np.float32)
    live = np.array(incoming, dtype=np.float32)
    distance = float(np.linalg.norm(stored - live))
    print(f"[Face Verification] Calculated Euclidean distance: {distance:.4f} (Threshold: {MATCH_THRESHOLD})")
    return distance < MATCH_THRESHOLD, distance
