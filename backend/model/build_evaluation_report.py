"""
Build the aggregate evaluation report shown on the doctor Model Evaluation dashboard.

Runs the trained model over:
  - the training-time validation split (20% of dataset/train, seed 42 — the same
    split `train_model.py` used for checkpoint selection) to SELECT a threshold;
  - the held-out dataset/test split to REPORT metrics.

The threshold is never tuned on the test set. Results are written as JSON with
aggregate counts only (no file names or patient identifiers). The production
decision rule (argmax) and model weights are not changed.

Usage:
    cd backend
    .\\.venv\\Scripts\\Activate.ps1
    python model\\build_evaluation_report.py
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path

import numpy as np
from dotenv import load_dotenv
from tensorflow import keras

try:
    from model.evaluate_model import DEFAULT_DATASET_DIR, _load_test_split, _predict_class_probs
    from model.evaluation_report import (
        TRAINING_SEED,
        TRAINING_VALIDATION_SPLIT,
        assemble_report,
        class_counts,
    )
    from model.inference import ChestXRayClassifier, DEFAULT_IMG_SIZE, DEFAULT_MODEL_PATH
    from model.preprocessing import CLASS_INDICES, CLASS_NAMES, preprocessing_mode
except ImportError:
    from evaluate_model import DEFAULT_DATASET_DIR, _load_test_split, _predict_class_probs
    from evaluation_report import (
        TRAINING_SEED,
        TRAINING_VALIDATION_SPLIT,
        assemble_report,
        class_counts,
    )
    from inference import ChestXRayClassifier, DEFAULT_IMG_SIZE, DEFAULT_MODEL_PATH
    from preprocessing import CLASS_INDICES, CLASS_NAMES, preprocessing_mode

MODEL_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = MODEL_DIR.parent.parent
DEFAULT_OUTPUT = MODEL_DIR / "evaluation" / "evaluation_report.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build the Model Evaluation dashboard report (JSON).")
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL_PATH)
    parser.add_argument("--dataset-dir", type=Path, default=DEFAULT_DATASET_DIR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument(
        "--model-version",
        default=None,
        help="Label for the evaluated model (default: MODEL_VERSION from .env).",
    )
    return parser.parse_args()


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _training_validation_split(dataset_dir: Path) -> tuple[list[Path], np.ndarray]:
    """Recreate the validation subset train_model.py held out from dataset/train."""
    train_dir = dataset_dir / "train"
    if not train_dir.is_dir():
        raise FileNotFoundError(f"Missing train directory: {train_dir}")
    # Only the file listing is used; images are loaded later via preprocess_image.
    val_ds = keras.utils.image_dataset_from_directory(
        train_dir,
        validation_split=TRAINING_VALIDATION_SPLIT,
        subset="validation",
        seed=TRAINING_SEED,
        shuffle=True,
        label_mode="int",
        class_names=list(CLASS_NAMES),
        image_size=(DEFAULT_IMG_SIZE, DEFAULT_IMG_SIZE),
        batch_size=None,
        verbose=False,
    )
    paths = [Path(p) for p in val_ds.file_paths]
    labels = np.asarray([CLASS_INDICES[p.parent.name] for p in paths], dtype=np.int64)
    return paths, labels


def build_report(args: argparse.Namespace) -> dict[str, object]:
    model_path = args.model.resolve()
    classifier = ChestXRayClassifier(model_path=model_path)

    print("Recreating training-time validation split...")
    val_paths, val_labels = _training_validation_split(args.dataset_dir)
    print(f"Validation images: {len(val_paths)} {class_counts(val_labels, CLASS_INDICES)}")

    test_paths, test_labels, _ = _load_test_split(args.dataset_dir)
    print(f"Test images: {len(test_paths)} {class_counts(test_labels, CLASS_INDICES)}")

    # Same preprocessing as production inference (model.preprocessing.preprocess_image).
    print("Predicting validation split...")
    val_probs = _predict_class_probs(classifier, val_paths, args.batch_size)
    print("Predicting test split...")
    test_probs = _predict_class_probs(classifier, test_paths, args.batch_size)

    return assemble_report(
        val_probs=val_probs,
        val_labels=val_labels,
        test_probs=test_probs,
        test_labels=test_labels,
        class_names=CLASS_NAMES,
        class_indices=CLASS_INDICES,
        model_info={
            "file_name": model_path.name,
            "sha256": file_sha256(model_path),
            "size_bytes": model_path.stat().st_size,
            "version_label": args.model_version or os.getenv("MODEL_VERSION") or "unversioned",
            "architecture": "EfficientNetB0 transfer learning, 3-class softmax",
        },
        preprocessing_info={
            "description": (
                "model.preprocessing.preprocess_image (production inference path): "
                f"load_img RGB resized to {classifier.img_size}x{classifier.img_size}, "
                f"then {preprocessing_mode()}"
            ),
            "image_size": classifier.img_size,
        },
    )


def main() -> None:
    load_dotenv(PROJECT_ROOT / ".env", override=False)
    args = parse_args()
    report = build_report(args)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = args.output.with_suffix(".json.tmp")
    tmp_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    tmp_path.replace(args.output)
    print(f"\nWrote {args.output.resolve()}")
    for point in report["operating_points"]:
        m = point["metrics"]
        print(
            f"{point['label']}: acc={m['accuracy']} prec={m['precision']} "
            f"rec={m['recall']} spec={m['specificity']} f1={m['f1']}"
        )
    roc = report["curves"]["roc"]
    print(f"ROC-AUC: {None if roc is None else roc['auc']}")


if __name__ == "__main__":
    main()
