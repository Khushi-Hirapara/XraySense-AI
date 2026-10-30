"""
Pure-numpy evaluation metrics for the chest X-ray classifier.

No TensorFlow import here, so these functions can be unit-tested quickly and
reused by both the offline report builder and the API.

Conventions:
  - Confusion matrices use rows = actual, columns = predicted, in the label
    order passed by the caller (the model's CLASS_INDICES order).
  - Binary decisions are "positive iff score >= threshold".
  - Metrics that are mathematically undefined (e.g. precision with no
    predicted positives, ROC-AUC with a single class) are returned as None,
    never silently replaced with 0.
"""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np

PROBABILITY_SUM_TOLERANCE = 1e-3
PROBABILITY_RANGE_TOLERANCE = 1e-6


def _ratio(num: float, den: float) -> float | None:
    return float(num) / float(den) if den else None


def valid_probability_mask(probs: np.ndarray, num_classes: int) -> np.ndarray:
    """
    Return a boolean mask of rows that are usable softmax outputs.

    A row is invalid if it has the wrong width, contains NaN/inf, has values
    outside [0, 1], or does not sum to ~1.
    """
    arr = np.asarray(probs, dtype=np.float64)
    if arr.ndim != 2 or arr.shape[1] != num_classes:
        return np.zeros(arr.shape[0] if arr.ndim >= 1 else 0, dtype=bool)
    finite = np.all(np.isfinite(arr), axis=1)
    safe = np.where(np.isfinite(arr), arr, 0.0)
    in_range = np.all(
        (safe >= -PROBABILITY_RANGE_TOLERANCE) & (safe <= 1.0 + PROBABILITY_RANGE_TOLERANCE),
        axis=1,
    )
    sums_ok = np.abs(np.sum(safe, axis=1) - 1.0) <= PROBABILITY_SUM_TOLERANCE
    return finite & in_range & sums_ok


def confusion_matrix(
    y_true: Sequence[int] | np.ndarray,
    y_pred: Sequence[int] | np.ndarray,
    num_classes: int,
) -> np.ndarray:
    """Rows = actual, columns = predicted; label indices outside range are rejected."""
    true_arr = np.asarray(y_true, dtype=np.int64).reshape(-1)
    pred_arr = np.asarray(y_pred, dtype=np.int64).reshape(-1)
    if true_arr.shape != pred_arr.shape:
        raise ValueError(f"y_true and y_pred lengths differ: {true_arr.shape} vs {pred_arr.shape}")
    for name, arr in (("y_true", true_arr), ("y_pred", pred_arr)):
        if arr.size and (arr.min() < 0 or arr.max() >= num_classes):
            raise ValueError(f"{name} contains labels outside [0, {num_classes - 1}]")
    cm = np.zeros((num_classes, num_classes), dtype=np.int64)
    np.add.at(cm, (true_arr, pred_arr), 1)
    return cm


def classification_report(
    cm: np.ndarray,
    class_names: Sequence[str],
) -> dict[str, object]:
    """
    Per-class precision / recall / F1 / support from a confusion matrix.

    Macro averages use only classes whose metric is defined; weighted averages
    additionally require support > 0. Undefined values are None.
    """
    matrix = np.asarray(cm, dtype=np.int64)
    n = len(class_names)
    if matrix.shape != (n, n):
        raise ValueError(f"Confusion matrix shape {matrix.shape} does not match {n} classes")

    per_class: list[dict[str, object]] = []
    for i, name in enumerate(class_names):
        tp = int(matrix[i, i])
        support = int(matrix[i, :].sum())
        predicted = int(matrix[:, i].sum())
        precision = _ratio(tp, predicted)
        recall = _ratio(tp, support)
        if precision is None or recall is None:
            f1 = None
        elif precision + recall == 0:
            f1 = 0.0
        else:
            f1 = 2 * precision * recall / (precision + recall)
        per_class.append(
            {
                "label": name,
                "precision": precision,
                "recall": recall,
                "f1": f1,
                "support": support,
                "predicted_count": predicted,
            }
        )

    def _macro(key: str) -> float | None:
        values = [row[key] for row in per_class if row[key] is not None]
        return float(np.mean(values)) if values else None

    def _weighted(key: str) -> float | None:
        rows = [row for row in per_class if row[key] is not None and row["support"]]
        weights = [row["support"] for row in rows]
        if not rows or not sum(weights):
            return None
        return float(np.average([row[key] for row in rows], weights=weights))

    total = int(matrix.sum())
    return {
        "classes": per_class,
        "accuracy": _ratio(int(np.trace(matrix)), total),
        "macro_avg": {k: _macro(k) for k in ("precision", "recall", "f1")},
        "weighted_avg": {k: _weighted(k) for k in ("precision", "recall", "f1")},
        "total_support": total,
    }


def binary_metrics(
    y_true: Sequence[int] | np.ndarray,
    y_pred: Sequence[int] | np.ndarray,
) -> dict[str, object]:
    """
    Binary metrics with 1 = positive class, 0 = negative class.

    Returns counts plus accuracy, precision, recall (sensitivity),
    specificity and F1; undefined ratios are None.
    """
    true_arr = np.asarray(y_true, dtype=np.int64).reshape(-1)
    pred_arr = np.asarray(y_pred, dtype=np.int64).reshape(-1)
    if true_arr.shape != pred_arr.shape:
        raise ValueError("y_true and y_pred lengths differ")
    if not np.all(np.isin(true_arr, (0, 1))) or not np.all(np.isin(pred_arr, (0, 1))):
        raise ValueError("binary_metrics expects labels in {0, 1}")

    tp = int(np.sum((true_arr == 1) & (pred_arr == 1)))
    tn = int(np.sum((true_arr == 0) & (pred_arr == 0)))
    fp = int(np.sum((true_arr == 0) & (pred_arr == 1)))
    fn = int(np.sum((true_arr == 1) & (pred_arr == 0)))

    precision = _ratio(tp, tp + fp)
    recall = _ratio(tp, tp + fn)
    if precision is None or recall is None:
        f1 = None
    elif precision + recall == 0:
        f1 = 0.0
    else:
        f1 = 2 * precision * recall / (precision + recall)

    return {
        "tp": tp,
        "tn": tn,
        "fp": fp,
        "fn": fn,
        "accuracy": _ratio(tp + tn, tp + tn + fp + fn),
        "precision": precision,
        "recall": recall,
        "specificity": _ratio(tn, tn + fp),
        "f1": f1,
    }


def _binary_inputs(y_true: np.ndarray, scores: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    true_arr = np.asarray(y_true, dtype=np.int64).reshape(-1)
    score_arr = np.asarray(scores, dtype=np.float64).reshape(-1)
    if true_arr.shape != score_arr.shape:
        raise ValueError("y_true and scores lengths differ")
    if not np.all(np.isin(true_arr, (0, 1))):
        raise ValueError("Expected binary labels in {0, 1}")
    if not np.all(np.isfinite(score_arr)):
        raise ValueError("Scores must be finite")
    return true_arr, score_arr


def _cumulative_counts(
    true_arr: np.ndarray, score_arr: np.ndarray
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """TP / FP counts when predicting positive for score >= each distinct threshold (descending)."""
    order = np.argsort(-score_arr, kind="mergesort")
    sorted_scores = score_arr[order]
    sorted_true = true_arr[order]
    # Last index of each run of equal scores, so tied scores move together.
    distinct = np.where(np.diff(sorted_scores))[0]
    ends = np.r_[distinct, sorted_true.size - 1]
    tps = np.cumsum(sorted_true)[ends]
    fps = (ends + 1) - tps
    return tps, fps, sorted_scores[ends]


def roc_curve(
    y_true: Sequence[int] | np.ndarray,
    scores: Sequence[float] | np.ndarray,
) -> dict[str, object] | None:
    """
    ROC curve points and AUC (trapezoidal, ties handled).

    Returns None when only one class is present (AUC undefined).
    """
    true_arr, score_arr = _binary_inputs(np.asarray(y_true), np.asarray(scores))
    positives = int(true_arr.sum())
    negatives = int(true_arr.size - positives)
    if positives == 0 or negatives == 0:
        return None
    tps, fps, thresholds = _cumulative_counts(true_arr, score_arr)
    tpr = np.r_[0.0, tps / positives]
    fpr = np.r_[0.0, fps / negatives]
    auc = float(np.trapezoid(tpr, fpr))
    return {
        "fpr": fpr,
        "tpr": tpr,
        "thresholds": np.r_[np.inf, thresholds],
        "auc": auc,
    }


def precision_recall_curve(
    y_true: Sequence[int] | np.ndarray,
    scores: Sequence[float] | np.ndarray,
) -> dict[str, object] | None:
    """
    Precision-recall points and average precision (step-wise, no interpolation).

    Returns None when there are no positive samples (recall undefined).
    """
    true_arr, score_arr = _binary_inputs(np.asarray(y_true), np.asarray(scores))
    positives = int(true_arr.sum())
    if positives == 0:
        return None
    tps, fps, thresholds = _cumulative_counts(true_arr, score_arr)
    precision = tps / (tps + fps)
    recall = tps / positives
    recall_steps = np.diff(np.r_[0.0, recall])
    average_precision = float(np.sum(recall_steps * precision))
    return {
        "precision": precision,
        "recall": recall,
        "thresholds": thresholds,
        "average_precision": average_precision,
        "prevalence": positives / true_arr.size,
    }


def one_vs_rest_roc(
    y_true: Sequence[int] | np.ndarray,
    probs: np.ndarray,
    class_names: Sequence[str],
) -> dict[str, object]:
    """
    One-vs-rest ROC per class from full softmax outputs (class i vs all others,
    scored by P(class i)), plus macro and support-weighted AUC.

    A class's AUC is None when it has no samples or every sample belongs to it;
    averages use only classes whose AUC is defined.
    """
    true_arr = np.asarray(y_true, dtype=np.int64).reshape(-1)
    prob_arr = np.asarray(probs, dtype=np.float64)
    if prob_arr.ndim != 2 or prob_arr.shape != (true_arr.size, len(class_names)):
        raise ValueError(
            f"Expected probabilities of shape ({true_arr.size}, {len(class_names)}), got {prob_arr.shape}"
        )
    per_class: list[dict[str, object]] = []
    for i, name in enumerate(class_names):
        binary = (true_arr == i).astype(np.int64)
        curve = roc_curve(binary, prob_arr[:, i]) if binary.size else None
        per_class.append(
            {
                "label": name,
                "support": int(binary.sum()),
                "auc": None if curve is None else curve["auc"],
                "fpr": None if curve is None else curve["fpr"],
                "tpr": None if curve is None else curve["tpr"],
            }
        )
    defined = [row for row in per_class if row["auc"] is not None]
    weights = [row["support"] for row in defined]
    return {
        "per_class": per_class,
        "macro_auc": float(np.mean([row["auc"] for row in defined])) if defined else None,
        "weighted_auc": float(np.average([row["auc"] for row in defined], weights=weights))
        if defined and sum(weights)
        else None,
    }


def threshold_sweep(
    y_true: Sequence[int] | np.ndarray,
    scores: Sequence[float] | np.ndarray,
    thresholds: Sequence[float],
) -> list[dict[str, object]]:
    """Binary metrics at each threshold (positive iff score >= threshold)."""
    true_arr, score_arr = _binary_inputs(np.asarray(y_true), np.asarray(scores))
    rows: list[dict[str, object]] = []
    for threshold in thresholds:
        pred = (score_arr >= float(threshold)).astype(np.int64)
        rows.append({"threshold": float(threshold), **binary_metrics(true_arr, pred)})
    return rows


def default_threshold_grid(step: float = 0.01) -> np.ndarray:
    """Candidate thresholds in (0, 1), rounded to avoid float drift."""
    count = int(round(1.0 / step))
    return np.round(np.arange(1, count) * step, 6)


def select_threshold_youden(
    y_true: Sequence[int] | np.ndarray,
    scores: Sequence[float] | np.ndarray,
    thresholds: Sequence[float] | None = None,
) -> dict[str, object] | None:
    """
    Pick the threshold maximising Youden's J (sensitivity + specificity - 1).

    Intended for validation data only. Ties prefer the threshold closest to
    0.5, then the lower threshold. Returns None if either class is missing.
    """
    grid = default_threshold_grid() if thresholds is None else np.asarray(thresholds, dtype=np.float64)
    rows = threshold_sweep(y_true, scores, grid)
    scored = [
        (row["recall"] + row["specificity"] - 1.0, row)
        for row in rows
        if row["recall"] is not None and row["specificity"] is not None
    ]
    if not scored:
        return None
    best_j = max(j for j, _ in scored)
    candidates = [row for j, row in scored if np.isclose(j, best_j, atol=1e-12)]
    best = min(candidates, key=lambda row: (abs(row["threshold"] - 0.5), row["threshold"]))
    return {"threshold": best["threshold"], "youden_j": float(best_j), "metrics": best}


def downsample_curve(points: list[dict[str, float]], max_points: int = 200) -> list[dict[str, float]]:
    """Evenly thin a curve for transport, always keeping the first and last points."""
    if len(points) <= max_points:
        return points
    idx = np.unique(np.linspace(0, len(points) - 1, max_points).round().astype(int))
    return [points[i] for i in idx]
