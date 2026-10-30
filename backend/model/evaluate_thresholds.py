"""
Summarize multi-class confidence on dataset/test for chest_xray_model.h5.

Usage:
    cd backend
    .\\.venv\\Scripts\\Activate.ps1
    python model\\evaluate_thresholds.py
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np

try:
    from model.evaluate_model import (
        DEFAULT_DATASET_DIR,
        _classification_report,
        _load_test_split,
        _multiclass_metrics,
        _predict_class_probs,
    )
    from model.inference import ChestXRayClassifier, DEFAULT_MODEL_PATH
    from model.preprocessing import CLASS_INDICES, CLASS_NAMES, preprocessing_mode
except ImportError:
    from evaluate_model import (
        DEFAULT_DATASET_DIR,
        _classification_report,
        _load_test_split,
        _multiclass_metrics,
        _predict_class_probs,
    )
    from inference import ChestXRayClassifier, DEFAULT_MODEL_PATH
    from preprocessing import CLASS_INDICES, CLASS_NAMES, preprocessing_mode


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Summarize 3-class confidence on the test split (argmax decode)."
    )
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL_PATH)
    parser.add_argument("--dataset-dir", type=Path, default=DEFAULT_DATASET_DIR)
    parser.add_argument("--batch-size", type=int, default=32)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    print("\n=== XRaySense AI Multi-class Confidence Summary ===")
    print(f"Model path:   {args.model.resolve()}")
    print(f"Dataset path: {args.dataset_dir.resolve()}")
    print(f"Class mapping: {CLASS_INDICES}")
    print(f"Preprocessing mode: {preprocessing_mode()}")
    print("Rule: prediction = argmax(softmax)  (no binary threshold)")

    image_paths, y_true, counts = _load_test_split(args.dataset_dir)
    print("\n--- Test Image Counts ---")
    for name in CLASS_NAMES:
        print(f"{name} images: {counts[name]}")

    classifier = ChestXRayClassifier(model_path=args.model)
    class_probs = _predict_class_probs(classifier, image_paths, args.batch_size)
    y_pred = np.argmax(class_probs, axis=1).astype(np.int32)
    win_probs = np.max(class_probs, axis=1)

    metrics = _multiclass_metrics(y_true, y_pred)
    print("\n--- Core Metrics ---")
    print(f"Accuracy:  {metrics['accuracy']:.4f}")
    print(f"Macro F1:  {metrics['macro_f1']:.4f}")

    print("\n--- Winning-class confidence ---")
    print(f"min:    {float(np.min(win_probs)):.4f}")
    print(f"max:    {float(np.max(win_probs)):.4f}")
    print(f"mean:   {float(np.mean(win_probs)):.4f}")
    print(f"median: {float(np.median(win_probs)):.4f}")
    for floor in (0.50, 0.70, 0.90):
        frac = float(np.mean(win_probs >= floor))
        print(f"fraction with confidence >= {floor:.2f}: {100.0 * frac:.1f}%")

    print("\n--- Classification Report ---")
    print(_classification_report(y_true, y_pred))
    print()


if __name__ == "__main__":
    main()
