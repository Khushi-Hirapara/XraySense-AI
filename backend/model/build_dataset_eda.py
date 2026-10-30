"""
Build the aggregate Dataset EDA report shown on the doctor Dataset EDA dashboard.

Scans dataset/{train,val,test}/{NORMAL,PNEUMONIA,COVID} once, fully decoding every
image, and writes:
  - model/evaluation/dataset_eda_report.json  (aggregate statistics only)
  - model/evaluation/eda_samples/<id>.png      (a few downscaled sample thumbnails,
                                                re-encoded without metadata)

The API serves these files; it never rescans the dataset or reads arbitrary paths.

Usage:
    cd backend
    .\\.venv\\Scripts\\Activate.ps1
    python model\\build_dataset_eda.py
"""

from __future__ import annotations

import argparse
import inspect
import json
import os
from pathlib import Path

from dotenv import load_dotenv

MODEL_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = MODEL_DIR.parent.parent
DEFAULT_DATASET_DIR = PROJECT_ROOT / "dataset"
DEFAULT_OUTPUT = MODEL_DIR / "evaluation" / "dataset_eda_report.json"
DEFAULT_SAMPLES_DIR = MODEL_DIR / "evaluation" / "eda_samples"

# Must match train_model.py `_build_datasets`.
TRAINING_VALIDATION_SPLIT = 0.2
TRAINING_SEED = 42


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build the Dataset EDA dashboard report (JSON).")
    parser.add_argument("--dataset-dir", type=Path, default=DEFAULT_DATASET_DIR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--samples-dir", type=Path, default=DEFAULT_SAMPLES_DIR)
    parser.add_argument("--samples-per-class", type=int, default=4)
    parser.add_argument("--workers", type=int, default=8)
    return parser.parse_args()


def _training_usage(dataset_dir: Path, class_names, class_indices, train_counts) -> dict[str, object]:
    """Recreate train_model.py's train/validation split of dataset/train (file listing only)."""
    from tensorflow import keras

    val_ds = keras.utils.image_dataset_from_directory(
        dataset_dir / "train",
        validation_split=TRAINING_VALIDATION_SPLIT,
        subset="validation",
        seed=TRAINING_SEED,
        shuffle=True,
        label_mode="int",
        class_names=list(class_names),
        batch_size=None,
        verbose=False,
    )
    val_counts = {label: 0 for label in class_names}
    for p in val_ds.file_paths:
        val_counts[Path(p).parent.name] += 1
    fit_counts = {label: train_counts[label] - val_counts[label] for label in class_names}
    return {
        "description": (
            f"train_model.py splits dataset/train with validation_split={TRAINING_VALIDATION_SPLIT}, "
            f"seed={TRAINING_SEED}: the 'fit' subset trains the model and the 'validation' subset drives "
            "checkpointing and early stopping. dataset/test is held out for evaluation."
        ),
        "fit": fit_counts,
        "validation": val_counts,
        "unused_splits": ["val"],
    }


def _preprocessing_summary(min_dimension: int) -> dict[str, object]:
    """Read preprocessing facts from the existing code rather than restating them."""
    from tensorflow import keras

    try:
        from model import inference, preprocessing, train_model
    except ImportError:
        import inference
        import preprocessing
        import train_model

    train_interp = inspect.signature(keras.utils.image_dataset_from_directory).parameters["interpolation"].default
    infer_interp = inspect.signature(keras.utils.load_img).parameters["interpolation"].default
    build_src = inspect.getsource(train_model._build_datasets)
    infer_src = inspect.getsource(preprocessing.preprocess_image)
    if "interpolation" in build_src:
        train_interp = "set explicitly in train_model._build_datasets (see source)"
    if "interpolation" in infer_src:
        infer_interp = "set explicitly in preprocessing.preprocess_image (see source)"

    differences = []
    if train_interp != infer_interp:
        differences.append(
            f"Resize interpolation: training uses '{train_interp}' (image_dataset_from_directory default) "
            f"while production inference uses '{infer_interp}' (keras load_img default)."
        )
    differences.append(
        "Production uploads pass a quality check (minimum "
        f"{min_dimension}px per side) and DICOM files are converted to 8-bit PNG first; the training "
        "pipeline applies neither."
    )

    return {
        "model_input_size": train_model.IMG_SIZE,
        "inference_input_size": inference.DEFAULT_IMG_SIZE,
        "backbone": preprocessing.MODEL_BACKBONE,
        "preprocess_function": preprocessing.preprocessing_mode(),
        "color_mode": "RGB (grayscale images are expanded to 3 channels) in both training and inference",
        "aspect_ratio_handling": "Stretched to a square (no cropping or padding) in both training and inference",
        "training_loader": "keras.utils.image_dataset_from_directory (train_model._build_datasets)",
        "training_resize_interpolation": train_interp,
        "inference_loader": "keras.utils.load_img + img_to_array (preprocessing.preprocess_image)",
        "inference_resize_interpolation": infer_interp,
        "augmentation": {
            "applied_to": "training 'fit' subset only (train_model._augment_images)",
            "steps": [
                "tf.image.random_flip_left_right",
                "tf.image.random_brightness(max_delta=20.0) on the 0-255 scale",
                "tf.image.random_contrast(lower=0.9, upper=1.1)",
                "clip to [0, 255], then backbone preprocessing",
            ],
        },
        "class_weighting": (
            "Balanced class weights (total / (classes * count)) when USE_CLASS_WEIGHTS is true "
            f"(default true; current environment: {os.getenv('USE_CLASS_WEIGHTS', 'unset')}). "
            "The setting used for the deployed weights is not recorded."
        ),
        "differences": differences,
    }


def main() -> None:
    load_dotenv(PROJECT_ROOT / ".env", override=False)
    args = parse_args()

    try:
        from model.dataset_eda import inspect_dataset, scan_structure, select_samples, summarize, write_thumbnail
        from model.preprocessing import CLASS_INDICES, CLASS_NAMES
    except ImportError:
        from dataset_eda import inspect_dataset, scan_structure, select_samples, summarize, write_thumbnail
        from preprocessing import CLASS_INDICES, CLASS_NAMES

    dataset_dir = args.dataset_dir.resolve()
    if not dataset_dir.is_dir():
        raise SystemExit(f"Dataset directory not found: {dataset_dir}")
    min_dimension = int(os.getenv("MIN_IMAGE_DIMENSION", "224"))

    folders = scan_structure(dataset_dir, CLASS_NAMES)
    print(f"Found {sum(len(f.image_paths) for f in folders)} image files; decoding...")
    records = inspect_dataset(
        folders, workers=args.workers, progress=lambda d, t: print(f"  {d}/{t}", flush=True)
    )

    train_counts = {f.label: len(f.image_paths) for f in folders if f.split == "train"}
    training_usage = None
    if all(train_counts.get(label, 0) > 0 for label in CLASS_NAMES):
        print("Recreating training-time validation split...")
        training_usage = _training_usage(dataset_dir, CLASS_NAMES, CLASS_INDICES, train_counts)

    for old in args.samples_dir.glob("*.png") if args.samples_dir.is_dir() else []:
        old.unlink()
    samples = [
        write_thumbnail(r, args.samples_dir)
        for r in select_samples(records, CLASS_NAMES, per_class=args.samples_per_class)
    ]

    report = summarize(
        folders,
        records,
        CLASS_NAMES,
        min_dimension=min_dimension,
        training_usage=training_usage,
        preprocessing=_preprocessing_summary(min_dimension),
        samples=samples,
    )
    report["label_mapping"] = dict(CLASS_INDICES)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    tmp = args.output.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(report, indent=2), encoding="utf-8")
    tmp.replace(args.output)
    print(f"\nWrote {args.output.resolve()} and {len(samples)} sample thumbnails")
    print(f"Total images: {report['overall']['total']} {report['overall']['class_counts']}")
    for row in report["splits"]:
        print(f"  {row['split']}: {row['total']} {row['class_counts']}")
    for finding in report["findings"]:
        print(f"[{finding['severity']}] {finding['text']}")


if __name__ == "__main__":
    main()
