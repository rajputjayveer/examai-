import os
import base64
import cv2
import numpy as np
from deepface import DeepFace

# Standard distance thresholds for DeepFace face verification model:
# FaceNet512 default threshold is around 0.30 (Cosine) or 10.0 (L2 Euclidean)
# VGG-Face default threshold is around 0.40 (Cosine) or 0.60 (L2 Euclidean)
# Using VGG-Face model by default as it is lightweight and performs fast on CPU.
MODEL_NAME = "VGG-Face"
DISTANCE_METRIC = "cosine"
MATCH_THRESHOLD = 0.40

def save_base64_image(base64_str: str, file_path: str):
    """Decode base64 string and save it to file path."""
    header, encoded = base64_str.split(",", 1) if "," in base64_str else ("", base64_str)
    img_data = base64.b64decode(encoded)
    with open(file_path, "wb") as f:
        f.write(img_data)

def verify_faces(reference_img_path: str, live_img_base64: str) -> tuple[bool, float]:
    """
    Compare reference photo on disk with live base64 snapshot frame using DeepFace.
    Returns (is_match, distance).
    """
    if not os.path.exists(reference_img_path):
        print(f"[Face Verification Error] Reference photo does not exist at: {reference_img_path}")
        return False, 1.0

    # Save live image to temporary file
    temp_live_path = reference_img_path + "_temp_live.jpg"
    try:
        save_base64_image(live_img_base64, temp_live_path)

        # Execute DeepFace verification check
        result = DeepFace.verify(
            img1_path=reference_img_path,
            img2_path=temp_live_path,
            model_name=MODEL_NAME,
            distance_metric=DISTANCE_METRIC,
            enforce_detection=False
        )

        distance = float(result["distance"])
        is_match = bool(result["verified"])
        
        print(f"[Face Verification] Model: {MODEL_NAME}, Distance: {distance:.4f} (Threshold: {result['threshold']}), Match: {is_match}")
        return is_match, distance
    except Exception as e:
        print(f"[Face Verification Exception] DeepFace failed: {e}")
        return False, 1.0
    finally:
        if os.path.exists(temp_live_path):
            try:
                os.remove(temp_live_path)
            except:
                pass
