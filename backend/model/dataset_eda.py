"""
Dataset exploratory data analysis (EDA) for the chest X-ray classifier.

Pure Pillow + numpy (no TensorFlow) so it can be unit-tested on tiny synthetic
datasets. `build_dataset_eda.py` adds the TensorFlow-dependent parts (the
training-time validation split and preprocessing constants) and writes the JSON.

The report holds aggregate statistics only: no file names, paths or metadata.
Records returned by `inspect_dataset` carry file paths for sample-thumbnail
generation, but those never reach the report.
"""

from __future__ import annotations

import hashlib
import io
from collections import Counter, defaultdict
from collections.abc import Callable, Iterable, Sequence
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image

# Same extensions as model/evaluate_model.py and Keras image_dataset_from_directory.
IMAGE_EXTENSIONS = frozenset({".jpg", ".jpeg", ".png", ".bmp", ".gif"})
SPLITS = ("train", "val", "test")
REPORT_SCHEMA_VERSION = 1
HISTOGRAM_BINS = 20
EXTREME_ASPECT_RATIO = 1.5  # width/height above this (or below its inverse)
SAMPLE_THUMBNAIL_SIZE = 256


@dataclass
class ImageRecord:
    split: str
    label: str
    path: Path
    extension: str
    readable: bool = False
    error: str | None = None
    width: int | None = None
    height: int | None = None
    mode: str | None = None
    format: str | None = None
    sha256: str | None = None


@dataclass
class FolderInfo:
    split: str
    label: str
    exists: bool
    image_paths: list[Path] = field(default_factory=list)
    non_image_files: int = 0


def scan_structure(
    dataset_root: Path,
    class_names: Sequence[str],
    splits: Sequence[str] = SPLITS,
) -> list[FolderInfo]:
    """List image files per split/class folder; missing folders are reported, not raised."""
    folders: list[FolderInfo] = []
    for split in splits:
        for label in class_names:
            class_dir = dataset_root / split / label
            info = FolderInfo(split=split, label=label, exists=class_dir.is_dir())
            if info.exists:
                for path in sorted(class_dir.iterdir()):
                    if not path.is_file():
                        continue
                    if path.suffix.lower() in IMAGE_EXTENSIONS:
                        info.image_paths.append(path)
                    else:
                        info.non_image_files += 1
            folders.append(info)
    return folders


def inspect_image(record: ImageRecord) -> ImageRecord:
    """Hash the file and fully decode it; failures mark the record unreadable."""
    try:
        data = record.path.read_bytes()
    except OSError as exc:
        record.error = type(exc).__name__
        return record
    record.sha256 = hashlib.sha256(data).hexdigest()
    try:
        with Image.open(io.BytesIO(data)) as img:
            img.load()  # full decode catches truncated / corrupted files
            record.width, record.height = img.size
            record.mode = img.mode
            record.format = img.format
        record.readable = True
    except (OSError, SyntaxError, ValueError, Image.DecompressionBombError) as exc:
        record.error = type(exc).__name__
    return record


def inspect_dataset(
    folders: Iterable[FolderInfo],
    workers: int = 8,
    progress: Callable[[int, int], None] | None = None,
) -> list[ImageRecord]:
    records = [
        ImageRecord(split=f.split, label=f.label, path=p, extension=p.suffix.lower())
        for f in folders
        for p in f.image_paths
    ]
    total = len(records)
    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        for done, _ in enumerate(pool.map(inspect_image, records), start=1):
            if progress and (done % 500 == 0 or done == total):
                progress(done, total)
    return records


def _pct(part: int, whole: int) -> float | None:
    return part / whole if whole else None


def _stats(values: Sequence[float]) -> dict[str, float] | None:
    if not values:
        return None
    arr = np.asarray(values, dtype=np.float64)
    p25, median, p75 = np.percentile(arr, [25, 50, 75])
    return {
        "min": float(arr.min()),
        "p25": float(p25),
        "median": float(median),
        "p75": float(p75),
        "max": float(arr.max()),
        "mean": float(arr.mean()),
    }


def _histogram(
    by_label: dict[str, list[int]], class_names: Sequence[str]
) -> dict[str, object] | None:
    all_values = [v for label in class_names for v in by_label.get(label, [])]
    if not all_values:
        return None
    lo, hi = min(all_values), max(all_values)
    if lo == hi:
        hi = lo + 1
    edges = np.linspace(lo, hi, HISTOGRAM_BINS + 1)
    return {
        "bin_edges": [float(e) for e in edges],
        "counts": {
            label: np.histogram(by_label.get(label, []), bins=edges)[0].astype(int).tolist()
            for label in class_names
        },
    }


def _duplicates(records: list[ImageRecord]) -> dict[str, object]:
    """Exact byte-identical files (SHA-256). Pixel-identical re-encodes are not detected."""
    groups: dict[str, list[ImageRecord]] = defaultdict(list)
    for r in records:
        if r.sha256:
            groups[r.sha256].append(r)
    dup_groups = [g for g in groups.values() if len(g) > 1]
    cross_split: Counter[str] = Counter()
    conflicting_labels = 0
    for group in dup_groups:
        splits = sorted({r.split for r in group})
        for i, a in enumerate(splits):
            for b in splits[i + 1 :]:
                cross_split[f"{a}-{b}"] += 1
        if len({r.label for r in group}) > 1:
            conflicting_labels += 1
    return {
        "method": "Exact byte match (SHA-256 of file contents)",
        "duplicate_groups": len(dup_groups),
        "redundant_copies": sum(len(g) - 1 for g in dup_groups),
        "groups_spanning_splits": dict(sorted(cross_split.items())),
        "groups_with_conflicting_labels": conflicting_labels,
    }


def _class_weights(counts: dict[str, int], class_names: Sequence[str]) -> dict[str, float] | None:
    """Balanced weights exactly as train_model._compute_class_weights computes them."""
    if any(counts.get(label, 0) <= 0 for label in class_names):
        return None
    total = sum(counts[label] for label in class_names)
    return {label: total / (len(class_names) * counts[label]) for label in class_names}


def _findings(report: dict[str, object], class_names: Sequence[str]) -> list[dict[str, str]]:
    """Rule-based observations generated from the computed statistics."""
    out: list[dict[str, str]] = []
    quality = report["quality"]

    for item in quality["missing_folders"]:
        out.append({"severity": "error", "text": f"Missing class folder: {item}."})
    for item in quality["empty_folders"]:
        out.append({"severity": "error", "text": f"Class folder has no images: {item}."})
    if quality["unreadable"]["count"]:
        out.append(
            {
                "severity": "error",
                "text": f"{quality['unreadable']['count']} image files could not be decoded.",
            }
        )

    usage = report.get("training_usage")
    fit_counts = usage["fit"] if usage else report["splits"][0]["class_counts"]
    present = {k: v for k, v in fit_counts.items() if v > 0}
    if len(present) >= 2:
        largest = max(present, key=present.get)
        smallest = min(present, key=present.get)
        ratio = present[largest] / present[smallest]
        if ratio >= 1.5:
            out.append(
                {
                    "severity": "warning",
                    "text": (
                        f"Class imbalance in the training data: {largest} has {ratio:.1f}x as many images as "
                        f"{smallest} ({present[largest]} vs {present[smallest]}). Without correction the model "
                        f"is pushed toward predicting {largest}; train_model.py enables balanced class weights "
                        "by default (USE_CLASS_WEIGHTS) to counter this, which raises the loss weight of rarer classes."
                    ),
                }
            )

    formats = report["image_properties"]["formats_by_class"]
    format_sets = {label: {f for f, n in formats.get(label, {}).items() if n} for label in class_names}
    non_empty = {k: v for k, v in format_sets.items() if v}
    for label, fmts in non_empty.items():
        others = set().union(*(v for k, v in non_empty.items() if k != label))
        if others and fmts.isdisjoint(others):
            out.append(
                {
                    "severity": "warning",
                    "text": (
                        f"All {label} images are {'/'.join(sorted(fmts))} while every other class is "
                        f"{'/'.join(sorted(others))}. File format separates {label} perfectly, which suggests a "
                        "different source dataset; the model could learn source-specific cues (compression, "
                        "original size, contrast) instead of disease patterns."
                    ),
                }
            )

    for label, info in report["image_properties"]["dominant_size_by_class"].items():
        if info and info["share"] >= 0.9 and info["share_in_other_classes"] < 0.05:
            out.append(
                {
                    "severity": "warning",
                    "text": (
                        f"{info['share'] * 100:.0f}% of {label} images are exactly {info['width']}x{info['height']} px, "
                        f"a size found in {info['share_in_other_classes'] * 100:.1f}% of other images. Original image "
                        "size alone nearly identifies this class (resizing to the model input hides size, but "
                        "source artefacts may remain)."
                    ),
                }
            )

    dims = quality["dimension_issues"]
    if dims["below_min_dimension"]:
        out.append(
            {
                "severity": "info",
                "text": (
                    f"{dims['below_min_dimension']} images are smaller than {dims['min_dimension']} px on a side "
                    "and are upscaled for the model; the production upload quality check would reject them."
                ),
            }
        )
    if dims["extreme_aspect_ratio"]:
        out.append(
            {
                "severity": "info",
                "text": (
                    f"{dims['extreme_aspect_ratio']} images have an aspect ratio beyond "
                    f"{EXTREME_ASPECT_RATIO}:1; resizing to a square stretches them (no cropping or padding)."
                ),
            }
        )

    dup = quality["duplicates"]
    if dup["duplicate_groups"]:
        spans = ", ".join(f"{k}: {v}" for k, v in dup["groups_spanning_splits"].items()) or "none"
        out.append(
            {
                "severity": "warning" if dup["groups_spanning_splits"] else "info",
                "text": (
                    f"{dup['duplicate_groups']} groups of byte-identical images ({dup['redundant_copies']} redundant "
                    f"copies). Groups spanning splits: {spans}. Duplicates across train and test inflate test "
                    "metrics."
                ),
            }
        )
    if dup["groups_with_conflicting_labels"]:
        out.append(
            {
                "severity": "error",
                "text": f"{dup['groups_with_conflicting_labels']} identical images carry different class labels.",
            }
        )

    if usage and usage.get("unused_splits"):
        out.append(
            {
                "severity": "info",
                "text": (
                    "dataset/" + ", dataset/".join(usage["unused_splits"]) + " exists on disk but is not used "
                    "by train_model.py, which takes its validation set from dataset/train instead."
                ),
            }
        )
    return out


def summarize(
    folders: list[FolderInfo],
    records: list[ImageRecord],
    class_names: Sequence[str],
    *,
    splits: Sequence[str] = SPLITS,
    min_dimension: int = 224,
    training_usage: dict[str, object] | None = None,
    preprocessing: dict[str, object] | None = None,
    samples: list[dict[str, object]] | None = None,
) -> dict[str, object]:
    """Build the JSON-serialisable aggregate report."""
    readable = [r for r in records if r.readable]

    split_rows = []
    for split in splits:
        split_folders = [f for f in folders if f.split == split]
        counts = {f.label: len(f.image_paths) for f in split_folders}
        total = sum(counts.values())
        split_rows.append(
            {
                "split": split,
                "exists": any(f.exists for f in split_folders),
                "class_counts": counts,
                "class_percentages": {k: _pct(v, total) for k, v in counts.items()},
                "total": total,
                "non_image_files": sum(f.non_image_files for f in split_folders),
            }
        )

    overall_counts = {label: sum(r["class_counts"].get(label, 0) for r in split_rows) for label in class_names}
    grand_total = sum(overall_counts.values())

    widths: dict[str, list[int]] = defaultdict(list)
    heights: dict[str, list[int]] = defaultdict(list)
    aspects: dict[str, list[float]] = defaultdict(list)
    modes: dict[str, Counter[str]] = defaultdict(Counter)
    formats: dict[str, Counter[str]] = defaultdict(Counter)
    sizes: dict[str, Counter[tuple[int, int]]] = defaultdict(Counter)
    for r in readable:
        widths[r.label].append(r.width)
        heights[r.label].append(r.height)
        aspects[r.label].append(r.width / r.height)
        modes[r.label][r.mode] += 1
        formats[r.label][r.format] += 1
        sizes[r.label][(r.width, r.height)] += 1

    dominant: dict[str, dict[str, object] | None] = {}
    for label in class_names:
        if not sizes[label]:
            dominant[label] = None
            continue
        (w, h), n = sizes[label].most_common(1)[0]
        others = [o for o in class_names if o != label]
        other_total = sum(len(widths[o]) for o in others)
        other_same = sum(sizes[o][(w, h)] for o in others)
        dominant[label] = {
            "width": w,
            "height": h,
            "count": n,
            "share": n / len(widths[label]),
            "distinct_sizes": len(sizes[label]),
            "share_in_other_classes": other_same / other_total if other_total else 0.0,
        }

    unreadable = [r for r in records if not r.readable]
    unreadable_by_folder = Counter(f"{r.split}/{r.label}" for r in unreadable)

    report: dict[str, object] = {
        "schema_version": REPORT_SCHEMA_VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dataset_root": "dataset/",
        "class_names": list(class_names),
        "overall": {
            "total": grand_total,
            "class_counts": overall_counts,
            "class_percentages": {k: _pct(v, grand_total) for k, v in overall_counts.items()},
        },
        "splits": split_rows,
        "training_usage": training_usage,
        "image_properties": {
            "measured_images": len(readable),
            "width": {label: _stats(widths[label]) for label in class_names},
            "height": {label: _stats(heights[label]) for label in class_names},
            "aspect_ratio": {label: _stats(aspects[label]) for label in class_names},
            "width_histogram": _histogram(widths, class_names),
            "height_histogram": _histogram(heights, class_names),
            "color_modes_by_class": {label: dict(modes[label]) for label in class_names},
            "formats_by_class": {label: dict(formats[label]) for label in class_names},
            "dominant_size_by_class": dominant,
        },
        "quality": {
            "missing_folders": [f"{f.split}/{f.label}" for f in folders if not f.exists],
            "empty_folders": [f"{f.split}/{f.label}" for f in folders if f.exists and not f.image_paths],
            "unreadable": {
                "count": len(unreadable),
                "by_folder": dict(sorted(unreadable_by_folder.items())),
                "error_types": dict(Counter(r.error or "unknown" for r in unreadable)),
            },
            "duplicates": _duplicates(records),
            "dimension_issues": {
                "min_dimension": min_dimension,
                "below_min_dimension": sum(1 for r in readable if min(r.width, r.height) < min_dimension),
                "extreme_aspect_ratio": sum(
                    1
                    for r in readable
                    if r.width / r.height > EXTREME_ASPECT_RATIO or r.height / r.width > EXTREME_ASPECT_RATIO
                ),
                "non_rgb_or_grayscale": sum(1 for r in readable if r.mode not in ("L", "RGB")),
            },
        },
        "class_weights": _class_weights(
            training_usage["fit"] if training_usage else split_rows[0]["class_counts"], class_names
        ),
        "preprocessing": preprocessing,
        "samples": samples or [],
    }
    report["findings"] = _findings(report, class_names)
    return report


def select_samples(
    records: list[ImageRecord],
    class_names: Sequence[str],
    per_class: int = 4,
    split: str = "train",
) -> list[ImageRecord]:
    """Deterministic, content-based pick (lowest SHA-256) of readable images per class."""
    chosen: list[ImageRecord] = []
    seen: set[str] = set()
    for label in class_names:
        pool = sorted(
            (r for r in records if r.readable and r.split == split and r.label == label),
            key=lambda r: r.sha256 or "",
        )
        picked = 0
        for r in pool:
            if picked >= per_class:
                break
            if r.sha256 in seen:
                continue
            seen.add(r.sha256)
            chosen.append(r)
            picked += 1
    return chosen


def sample_id(record: ImageRecord) -> str:
    """Opaque identifier derived from content, never from the filename."""
    return (record.sha256 or "")[:16]


def write_thumbnail(record: ImageRecord, out_dir: Path) -> dict[str, object]:
    """Re-encode a downscaled PNG without metadata (drops EXIF/text chunks)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    with Image.open(record.path) as img:
        img.load()
        mode = "L" if img.mode in ("L", "I", "I;16", "1") else "RGB"
        thumb = img.convert(mode)
        thumb.thumbnail((SAMPLE_THUMBNAIL_SIZE, SAMPLE_THUMBNAIL_SIZE))
        clean = Image.new(thumb.mode, thumb.size)
        clean.putdata(list(thumb.getdata()))
    sid = sample_id(record)
    clean.save(out_dir / f"{sid}.png", format="PNG")
    return {
        "id": sid,
        "label": record.label,
        "split": record.split,
        "width": record.width,
        "height": record.height,
    }
