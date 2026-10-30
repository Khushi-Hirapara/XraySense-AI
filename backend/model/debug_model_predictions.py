"""
Debug chest X-ray model class balance and softmax outputs.

Usage:
    cd backend
    .\\.venv\\Scripts\\python.exe model\\debug_model_predictions.py --dataset-dir ..\\dataset
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
        _predict_class_probs,
    )
    from model.inference import ChestXRayClassifier, DEFAULT_MODEL_PATH
    from model.preprocessing import CLASS_INDICES, CLASS_NAMES
except ImportError:
    from evaluate_model import (
        DEFAULT_DATASET_DIR,
        _classification_report,
        _load_test_split,
        _predict_class_probs,
    )
    from inference import ChestXRayClassifier, DEFAULT_MODEL_PATH
    from preprocessing import CLASS_INDICES, CLASS_NAMES

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".gif"}
DEFAULT_HIST_PATH = Path(__file__).resolve().parent / "class_confidence_histogram.png"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Debug 3-class model predictions.")
    parser.add_argument("--dataset-dir", type=Path, default=DEFAULT_DATASET_DIR)
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL_PATH)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--save-hist", type=Path, default=DEFAULT_HIST_PATH)
    return parser.parse_args()


def _count_images(class_dir: Path) -> int:
    return sum(
        1 for p in class_dir.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS
    )


def _count_split(dataset_dir: Path, split: str) -> dict[str, int]:
    split_dir = dataset_dir / split
    if not split_dir.is_dir():
        raise FileNotFoundError(f"Missing split directory: {split_dir}")
    counts: dict[str, int] = {}
    for class_name in CLASS_NAMES:
        class_dir = split_dir / class_name
        counts[class_name] = _count_images(class_dir) if class_dir.is_dir() else 0
    return counts


def _save_histogram(win_probs: np.ndarray, output_path: Path) -> None:
    try:
        import matplotlib.pyplot as plt
    except Exception as exc:
        print(f"Could not save histogram ({exc})")
        return
    plt.figure(figsize=(8, 4))
    plt.hist(win_probs, bins=25, range=(0.0, 1.0), color="#0f766e", edgecolor="white")
    plt.title("Winning-class softmax confidence")
    plt.xlabel("Confidence")
    plt.ylabel("Count")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(output_path, dpi=140)
    plt.close()
    print(f"Saved histogram to {output_path.resolve()}")


def main() -> None:
    args = parse_args()
    print("\n=== XRaySense AI Debug Predictions ===")
    print(f"Dataset: {args.dataset_dir.resolve()}")
    print(f"Model:   {args.model.resolve()}")
    print(f"Classes: {dict(CLASS_INDICES)}")

    print("\n1) Number of train images per class")
    train_counts = _count_split(args.dataset_dir, "train")
    for name in CLASS_NAMES:
        print(f"   {name}: {train_counts[name]}")

    print("\n2) Number of validation images per class")
    val_counts = _count_split(args.dataset_dir, "val")
    for name in CLASS_NAMES:
        print(f"   {name}: {val_counts[name]}")

    print("\n3) Number of test images per class")
    test_counts = _count_split(args.dataset_dir, "test")
    for name in CLASS_NAMES:
        print(f"   {name}: {test_counts[name]}")

    total_train = sum(train_counts.values())
    if total_train and all(train_counts[name] > 0 for name in CLASS_NAMES):
        print("\n4) Suggested balanced class weights")
        n = float(len(CLASS_NAMES))
        for name in CLASS_NAMES:
            weight = total_train / (n * train_counts[name])
            print(f"   {name}: {weight:.4f}")
    else:
        print("\n4) Class weights skipped (need images in every train class)")

    image_paths, y_true, _ = _load_test_split(args.dataset_dir)
    classifier = ChestXRayClassifier(model_path=args.model)
    class_probs = _predict_class_probs(classifier, image_paths, args.batch_size)
    y_pred = np.argmax(class_probs, axis=1).astype(np.int32)
    win_probs = np.max(class_probs, axis=1)

    print("\n5) Winning-class confidence stats")
    print(f"   min:    {float(np.min(win_probs)):.6f}")
    print(f"   max:    {float(np.max(win_probs)):.6f}")
    print(f"   mean:   {float(np.mean(win_probs)):.6f}")
    print(f"   median: {float(np.median(win_probs)):.6f}")

    print("\n6) Prediction counts")
    for name in CLASS_NAMES:
        print(f"   predicted {name}: {int(np.sum(y_pred == CLASS_INDICES[name]))}")

    print("\n7) Classification report")
    print(_classification_report(y_true, y_pred))

    _save_histogram(win_probs, args.save_hist)


if __name__ == "__main__":
    main()
