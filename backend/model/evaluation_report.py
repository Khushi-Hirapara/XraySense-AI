"""
Assemble the Model Evaluation dashboard report from model outputs.

Pure numpy (no TensorFlow), so it can be unit-tested with synthetic
probabilities. `build_evaluation_report.py` handles data loading and inference.
"""

from __future__ import annotations

from datetime import datetime, timezone

import numpy as np

try:
    from model.evaluation_metrics import (
        binary_metrics,
        classification_report,
        confusion_matrix,
        default_threshold_grid,
        downsample_curve,
        one_vs_rest_roc,
        precision_recall_curve,
        roc_curve,
        select_threshold_youden,
        threshold_sweep,
        valid_probability_mask,
    )
except ImportError:
    from evaluation_metrics import (
        binary_metrics,
        classification_report,
        confusion_matrix,
        default_threshold_grid,
        downsample_curve,
        one_vs_rest_roc,
        precision_recall_curve,
        roc_curve,
        select_threshold_youden,
        threshold_sweep,
        valid_probability_mask,
    )

REPORT_SCHEMA_VERSION = 2

# Must match train_model.py `_build_datasets` so the same images are held out.
TRAINING_VALIDATION_SPLIT = 0.2
TRAINING_SEED = 42

POSITIVE_CLASS = "PNEUMONIA"
NEGATIVE_CLASS = "NORMAL"
BINARY_CLASS_NAMES = (NEGATIVE_CLASS, POSITIVE_CLASS)
SWEEP_STEP = 0.05


def class_counts(labels: np.ndarray, class_indices: dict[str, int]) -> dict[str, int]:
    return {name: int(np.sum(labels == idx)) for name, idx in class_indices.items()}


def _filter_valid(
    probs: np.ndarray, labels: np.ndarray, num_classes: int
) -> tuple[np.ndarray, np.ndarray, int]:
    """Drop rows with unusable probabilities or out-of-range labels."""
    mask = valid_probability_mask(probs, num_classes)
    mask &= (labels >= 0) & (labels < num_classes)
    return np.asarray(probs)[mask], labels[mask], int(np.sum(~mask))


def _binary_subset(
    probs: np.ndarray, labels: np.ndarray, class_indices: dict[str, int]
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """NORMAL vs PNEUMONIA images only. Returns (y_true 0/1, pneumonia score, argmax pred)."""
    keep = np.isin(labels, [class_indices[NEGATIVE_CLASS], class_indices[POSITIVE_CLASS]])
    subset_probs = probs[keep]
    y_true = (labels[keep] == class_indices[POSITIVE_CLASS]).astype(np.int64)
    scores = subset_probs[:, class_indices[POSITIVE_CLASS]].astype(np.float64)
    argmax_pred = np.argmax(subset_probs, axis=1) if subset_probs.size else np.array([], dtype=np.int64)
    return y_true, scores, argmax_pred


def _binary_matrix(m: dict[str, object]) -> list[list[int]]:
    # Rows = actual [NORMAL, PNEUMONIA], columns = predicted [NORMAL, PNEUMONIA].
    return [[m["tn"], m["fp"]], [m["fn"], m["tp"]]]


def _operating_point(
    point_id: str,
    label: str,
    rule: str,
    threshold: float | None,
    y_true: np.ndarray,
    y_pred: np.ndarray,
) -> dict[str, object]:
    metrics = binary_metrics(y_true, y_pred)
    matrix = _binary_matrix(metrics)
    return {
        "id": point_id,
        "label": label,
        "decision_rule": rule,
        "threshold": threshold,
        "dataset": "test",
        "metrics": metrics,
        "confusion_matrix": {"labels": list(BINARY_CLASS_NAMES), "matrix": matrix},
        "classification_report": classification_report(np.asarray(matrix), BINARY_CLASS_NAMES),
    }


def _fmt(value: float | None) -> str:
    return "undefined" if value is None else f"{value * 100:.1f}%"


def _largest_confusion(cm: list[list[int]], labels: list[str]) -> tuple[str, str, int, int] | None:
    """(actual, predicted, count, actual support) for the biggest off-diagonal cell."""
    best = None
    for i, row in enumerate(cm):
        for j, n in enumerate(row):
            if i != j and n and (best is None or n > best[2]):
                best = (labels[i], labels[j], n, sum(row))
    return best


def build_interpretation(report: dict[str, object]) -> dict[str, list[str]]:
    """
    Rule-based summary generated from the computed numbers.

    `strengths` / `limitations` describe the 3-class production model;
    `binary_notes` describe only the separate NORMAL-vs-PNEUMONIA analysis.
    """
    strengths: list[str] = []
    limitations: list[str] = []
    binary_notes: list[str] = []

    # --- Three-class (production) ---
    mc = report["multiclass"]
    mc_report = mc["classification_report"]
    if mc_report["accuracy"] is not None:
        strengths.append(
            f"Three-class accuracy is {_fmt(mc_report['accuracy'])} on {mc_report['total_support']} "
            "held-out test images using the production argmax rule."
        )
    for row in mc_report["classes"]:
        if row["recall"] is None:
            limitations.append(f"{row['label']} recall is undefined: the test set has no {row['label']} images.")
        elif row["recall"] >= 0.95:
            strengths.append(
                f"{row['label']} recall {_fmt(row['recall'])} "
                f"(precision {_fmt(row['precision'])}, n={row['support']})."
            )
        elif row["recall"] < 0.8:
            limitations.append(
                f"{row['label']} recall is only {_fmt(row['recall'])}: "
                f"{row['support'] - round(row['recall'] * row['support'])} of {row['support']} "
                f"{row['label']} images were assigned another class."
            )
    worst = _largest_confusion(mc["confusion_matrix"], mc["labels"])
    if worst:
        actual, predicted, n, support = worst
        limitations.append(
            f"Most common error: {n} of {support} {actual} images predicted as {predicted}."
        )
    auc = mc["roc_auc_ovr"]
    if auc["macro"] is not None:
        strengths.append(
            f"Macro one-vs-rest ROC-AUC {auc['macro']:.3f}: the softmax probabilities rank each class "
            "above the others well, even where argmax mislabels some images."
        )

    # --- Binary analysis (NORMAL vs PNEUMONIA) ---
    points = {p["id"]: p for p in report["operating_points"]}
    argmax = points["argmax"]["metrics"]
    if argmax["recall"] is not None and argmax["specificity"] is not None:
        binary_notes.append(
            f"Argmax mapped to pneumonia-vs-not gives sensitivity {_fmt(argmax['recall'])} and "
            f"specificity {_fmt(argmax['specificity'])} on NORMAL/PNEUMONIA images "
            f"({argmax['fn']} pneumonia missed, {argmax['fp']} normal flagged)."
        )
    off_task = report["binary_task"]["argmax_predicted_covid"]
    binary_notes.append(
        f"{off_task} NORMAL/PNEUMONIA test images were predicted as COVID by argmax; in the binary "
        "view these count as 'not pneumonia'."
    )
    selected = points.get("validation_threshold")
    if selected is not None:
        m = selected["metrics"]
        binary_notes.append(
            f"A threshold of {selected['threshold']:.2f} on P(PNEUMONIA), chosen on validation data, gives "
            f"test sensitivity {_fmt(m['recall'])} and specificity {_fmt(m['specificity'])}. It is an "
            "analysis only and is not used in production."
        )
    else:
        binary_notes.append(
            "No threshold could be selected: the validation data lacks NORMAL or PNEUMONIA images."
        )

    invalid = report["datasets"]["test"]["invalid_predictions_excluded"]
    if invalid:
        limitations.append(f"{invalid} test predictions were invalid (NaN or malformed) and excluded.")

    val_counts = report["datasets"]["validation"]["class_counts"]
    binary_notes.append(
        "Validation for threshold selection is the 20% hold-out from dataset/train "
        f"(NORMAL={val_counts.get('NORMAL', 0)}, PNEUMONIA={val_counts.get('PNEUMONIA', 0)}); it comes "
        "from the same source distribution as training and was also used for checkpoint selection."
    )
    limitations.append(
        "Production inference resizes images with nearest-neighbour interpolation (keras load_img), "
        "while training used bilinear resizing. This evaluation uses the production path, so it "
        "reflects what users receive."
    )
    limitations.append(
        "Single public dataset, no external or prospective validation, and no patient-level "
        "demographic analysis: results may not generalise to other hospitals or scanners."
    )
    return {"strengths": strengths, "limitations": limitations, "binary_notes": binary_notes}


def assemble_report(
    *,
    val_probs: np.ndarray,
    val_labels: np.ndarray,
    test_probs: np.ndarray,
    test_labels: np.ndarray,
    class_names: tuple[str, ...],
    class_indices: dict[str, int],
    model_info: dict[str, object],
    preprocessing_info: dict[str, object],
) -> dict[str, object]:
    """Build the JSON-serialisable report. Thresholds are selected on validation only."""
    expected_mapping = {name: i for i, name in enumerate(class_names)}
    if dict(class_indices) != expected_mapping:
        raise ValueError(
            f"class_indices {dict(class_indices)} must match class_names order {expected_mapping}"
        )
    num_classes = len(class_names)
    val_labels = np.asarray(val_labels, dtype=np.int64).reshape(-1)
    test_labels = np.asarray(test_labels, dtype=np.int64).reshape(-1)

    val_probs_ok, val_labels_ok, val_invalid = _filter_valid(val_probs, val_labels, num_classes)
    test_probs_ok, test_labels_ok, test_invalid = _filter_valid(test_probs, test_labels, num_classes)

    # --- Threshold selection on validation only ---
    val_true, val_scores, _ = _binary_subset(val_probs_ok, val_labels_ok, class_indices)
    selection = select_threshold_youden(val_true, val_scores) if val_true.size else None

    # --- Test evaluation ---
    y_true, scores, argmax_pred = _binary_subset(test_probs_ok, test_labels_ok, class_indices)
    pneumonia_idx = class_indices[POSITIVE_CLASS]
    operating_points = [
        _operating_point(
            "argmax",
            "Argmax (production rule)",
            f"Pneumonia if PNEUMONIA has the highest of the {num_classes} softmax probabilities; "
            "a NORMAL or COVID argmax counts as not pneumonia",
            None,
            y_true,
            (argmax_pred == pneumonia_idx).astype(np.int64),
        )
    ]
    if selection is not None:
        threshold = float(selection["threshold"])
        operating_points.append(
            _operating_point(
                "validation_threshold",
                f"Validation-selected threshold ({threshold:.2f}) — analysis only",
                f"Pneumonia if P(PNEUMONIA) >= {threshold:.2f} (Youden's J on validation). "
                "Not used in production",
                threshold,
                y_true,
                (scores >= threshold).astype(np.int64),
            )
        )

    roc = roc_curve(y_true, scores) if y_true.size else None
    pr = precision_recall_curve(y_true, scores) if y_true.size else None
    sweep_rows = (
        threshold_sweep(y_true, scores, default_threshold_grid(SWEEP_STEP)) if y_true.size else []
    )
    multiclass_pred = (
        np.argmax(test_probs_ok, axis=1) if test_probs_ok.size else np.array([], dtype=np.int64)
    )
    multiclass_cm = confusion_matrix(test_labels_ok, multiclass_pred, num_classes)
    multiclass_report = classification_report(multiclass_cm, class_names)
    covid_idx = class_indices.get("COVID")

    ovr = (
        one_vs_rest_roc(test_labels_ok, test_probs_ok, class_names)
        if test_labels_ok.size
        else None
    )
    present = [name for name in class_names if np.any(test_labels_ok == class_indices[name])]
    missing = [name for name in class_names if name not in present]
    if ovr is None or ovr["macro_auc"] is None:
        auc_note = "Unavailable: the test set needs at least two classes to compute one-vs-rest ROC-AUC."
    elif missing:
        auc_note = f"Undefined for {', '.join(missing)} (no test images); averages use the remaining classes."
    else:
        auc_note = None

    report: dict[str, object] = {
        "schema_version": REPORT_SCHEMA_VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "model": model_info,
        "preprocessing": preprocessing_info,
        "label_mapping": dict(class_indices),
        "production_decision": {
            "rule": "argmax",
            "classes": list(class_names),
            "description": (
                f"The deployed model outputs a softmax probability for each of {', '.join(class_names)} and "
                "predicts the class with the highest probability. No probability threshold is applied."
            ),
            "probability_threshold": None,
        },
        "positive_class": POSITIVE_CLASS,
        "negative_class": NEGATIVE_CLASS,
        "score_definition": f"Softmax probability of PNEUMONIA (class index {pneumonia_idx})",
        "datasets": {
            "test": {
                "source": "dataset/test (held out; never used for training or threshold selection)",
                "class_counts": class_counts(test_labels, class_indices),
                "total": int(test_labels.size),
                "invalid_predictions_excluded": test_invalid,
                "binary_task_total": int(y_true.size),
            },
            "validation": {
                "source": (
                    f"dataset/train validation_split={TRAINING_VALIDATION_SPLIT}, seed={TRAINING_SEED} "
                    "(same hold-out as train_model.py)"
                ),
                "class_counts": class_counts(val_labels, class_indices),
                "total": int(val_labels.size),
                "invalid_predictions_excluded": val_invalid,
                "binary_task_total": int(val_true.size),
            },
        },
        "binary_task": {
            "description": (
                "Secondary analysis of NORMAL vs PNEUMONIA only. Images labelled COVID are excluded "
                "(they appear in the three-class evaluation). Among the included images, an argmax "
                "prediction of COVID counts as 'not pneumonia'."
            ),
            "included_classes": [NEGATIVE_CLASS, POSITIVE_CLASS],
            "excluded_classes": [c for c in class_names if c not in (NEGATIVE_CLASS, POSITIVE_CLASS)],
            "included_samples": int(y_true.size),
            "excluded_samples": int(test_labels_ok.size - y_true.size),
            "argmax_predicted_covid": 0
            if covid_idx is None
            else int(np.sum(argmax_pred == covid_idx)),
        },
        "threshold_selection": {
            "method": "Maximise Youden's J (sensitivity + specificity - 1) on validation, grid 0.01-0.99",
            "dataset": "validation",
            "selected_threshold": None if selection is None else selection["threshold"],
            "youden_j": None if selection is None else selection["youden_j"],
            "validation_metrics": None if selection is None else selection["metrics"],
            "production_rule": "argmax (no probability threshold is applied in production)",
        },
        "operating_points": operating_points,
        "curves": {
            "dataset": "test",
            "roc": None
            if roc is None
            else {
                "auc": roc["auc"],
                "points": downsample_curve(
                    [{"fpr": float(f), "tpr": float(t)} for f, t in zip(roc["fpr"], roc["tpr"])]
                ),
            },
            "precision_recall": None
            if pr is None
            else {
                "average_precision": pr["average_precision"],
                "prevalence": pr["prevalence"],
                "points": downsample_curve(
                    [
                        {"recall": float(r), "precision": float(p)}
                        for r, p in zip(pr["recall"], pr["precision"])
                    ]
                ),
            },
        },
        "threshold_sweep": {
            "dataset": "test",
            "note": "Descriptive trade-off only; no threshold was chosen from this sweep.",
            "rows": sweep_rows,
        },
        "multiclass": {
            "dataset": "test",
            "decision_rule": "argmax",
            "labels": list(class_names),
            "total": int(test_labels_ok.size),
            "confusion_matrix": multiclass_cm.tolist(),
            "classification_report": multiclass_report,
            "roc_auc_ovr": {
                "method": (
                    "One-vs-rest: for each class, P(class) scores that class against the other two. "
                    "Macro = unweighted mean over classes; weighted = mean weighted by class support."
                ),
                "per_class": {
                    row["label"]: row["auc"] for row in (ovr["per_class"] if ovr else [])
                },
                "macro": None if ovr is None else ovr["macro_auc"],
                "weighted": None if ovr is None else ovr["weighted_auc"],
                "note": auc_note,
            },
            "roc_curves_ovr": [
                {
                    "label": row["label"],
                    "auc": row["auc"],
                    "points": downsample_curve(
                        [{"fpr": float(f), "tpr": float(t)} for f, t in zip(row["fpr"], row["tpr"])],
                        max_points=120,
                    ),
                }
                for row in (ovr["per_class"] if ovr else [])
                if row["auc"] is not None
            ],
        },
    }
    report["interpretation"] = build_interpretation(report)
    return report
