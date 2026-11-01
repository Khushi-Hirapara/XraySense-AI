"""Unit tests for model evaluation metrics and report assembly (no TensorFlow)."""

import numpy as np
import pytest

from model.evaluation_metrics import (
    binary_metrics,
    classification_report,
    confusion_matrix,
    downsample_curve,
    one_vs_rest_roc,
    precision_recall_curve,
    roc_curve,
    select_threshold_youden,
    threshold_sweep,
    valid_probability_mask,
)
from model.evaluation_report import assemble_report

CLASS_NAMES = ("NORMAL", "PNEUMONIA", "COVID")
CLASS_INDICES = {"NORMAL": 0, "PNEUMONIA": 1, "COVID": 2}


def test_binary_metrics_known_counts():
    y_true = [1, 1, 1, 1, 0, 0, 0, 0, 0, 0]
    y_pred = [1, 1, 1, 0, 1, 1, 0, 0, 0, 0]
    m = binary_metrics(y_true, y_pred)
    assert (m["tp"], m["fn"], m["fp"], m["tn"]) == (3, 1, 2, 4)
    assert m["accuracy"] == pytest.approx(0.7)
    assert m["precision"] == pytest.approx(3 / 5)
    assert m["recall"] == pytest.approx(3 / 4)
    assert m["specificity"] == pytest.approx(4 / 6)
    assert m["f1"] == pytest.approx(2 * 0.6 * 0.75 / (0.6 + 0.75))


def test_binary_metrics_undefined_values_are_none():
    # No predicted positives -> precision undefined; no negatives -> specificity undefined.
    m = binary_metrics([1, 1], [0, 0])
    assert m["precision"] is None
    assert m["specificity"] is None
    assert m["recall"] == 0.0
    assert m["f1"] is None

    empty = binary_metrics([], [])
    assert empty["accuracy"] is None


def test_binary_metrics_rejects_non_binary_labels():
    with pytest.raises(ValueError):
        binary_metrics([0, 2], [0, 1])


def test_confusion_matrix_rows_actual_columns_predicted():
    # actual NORMAL predicted PNEUMONIA must land at [0, 1], not [1, 0].
    cm = confusion_matrix([0, 0, 1, 2, 2], [1, 0, 1, 0, 2], num_classes=3)
    assert cm.tolist() == [[1, 1, 0], [0, 1, 0], [1, 0, 1]]


def test_confusion_matrix_rejects_out_of_range_labels():
    with pytest.raises(ValueError):
        confusion_matrix([0, 3], [0, 0], num_classes=3)
    with pytest.raises(ValueError):
        confusion_matrix([0], [0, 1], num_classes=3)


def test_classification_report_missing_class_is_undefined_not_zero():
    # No COVID images and nothing predicted as COVID.
    cm = np.array([[5, 1, 0], [2, 8, 0], [0, 0, 0]])
    report = classification_report(cm, CLASS_NAMES)
    covid = report["classes"][2]
    assert covid["support"] == 0
    assert covid["precision"] is None
    assert covid["recall"] is None
    assert covid["f1"] is None
    normal = report["classes"][0]
    assert normal["precision"] == pytest.approx(5 / 7)
    assert normal["recall"] == pytest.approx(5 / 6)
    # Macro average ignores the undefined COVID row.
    assert report["macro_avg"]["recall"] == pytest.approx(np.mean([5 / 6, 8 / 10]))
    assert report["accuracy"] == pytest.approx(13 / 16)
    assert report["total_support"] == 16


def test_roc_auc_matches_mann_whitney_with_ties():
    rng = np.random.default_rng(0)
    y = rng.integers(0, 2, 300)
    scores = np.round(rng.random(300) * 0.5 + y * 0.3, 2)  # rounding creates ties
    pos, neg = scores[y == 1], scores[y == 0]
    greater = (pos[:, None] > neg[None, :]).sum()
    ties = (pos[:, None] == neg[None, :]).sum()
    expected = (greater + 0.5 * ties) / (pos.size * neg.size)
    assert roc_curve(y, scores)["auc"] == pytest.approx(expected)


def test_roc_extremes_and_single_class():
    assert roc_curve([0, 0, 1, 1], [0.1, 0.2, 0.8, 0.9])["auc"] == pytest.approx(1.0)
    assert roc_curve([0, 0, 1, 1], [0.9, 0.8, 0.2, 0.1])["auc"] == pytest.approx(0.0)
    assert roc_curve([0, 1, 0, 1], [0.5, 0.5, 0.5, 0.5])["auc"] == pytest.approx(0.5)
    assert roc_curve([1, 1, 1], [0.2, 0.5, 0.9]) is None
    assert roc_curve([0, 0], [0.2, 0.5]) is None


def test_average_precision_known_value():
    pr = precision_recall_curve([1, 0, 1, 0], [0.9, 0.8, 0.7, 0.1])
    assert pr["average_precision"] == pytest.approx(0.5 * 1.0 + 0.5 * (2 / 3))
    assert pr["prevalence"] == pytest.approx(0.5)
    assert precision_recall_curve([0, 0], [0.1, 0.2]) is None


def test_threshold_sweep_uses_greater_or_equal():
    rows = threshold_sweep([0, 1], [0.5, 0.5], [0.5, 0.51])
    assert (rows[0]["tp"], rows[0]["fp"]) == (1, 1)  # score == threshold -> positive
    assert (rows[1]["tp"], rows[1]["fp"]) == (0, 0)


def test_threshold_selection_maximises_youden_and_breaks_ties_towards_half():
    # Perfectly separable: every threshold in (0.3, 0.7] gives J = 1; 0.5 is preferred.
    y = [0, 0, 1, 1]
    scores = [0.2, 0.3, 0.7, 0.8]
    selected = select_threshold_youden(y, scores)
    assert selected["threshold"] == pytest.approx(0.5)
    assert selected["youden_j"] == pytest.approx(1.0)

    shifted = select_threshold_youden([0, 0, 1, 1], [0.05, 0.1, 0.2, 0.25])
    assert 0.1 < shifted["threshold"] <= 0.2


def test_threshold_selection_requires_both_classes():
    assert select_threshold_youden([1, 1], [0.4, 0.9]) is None


def test_valid_probability_mask_flags_bad_rows():
    probs = np.array(
        [
            [0.2, 0.5, 0.3],  # ok
            [np.nan, 0.5, 0.5],  # NaN
            [0.5, 0.5, 0.5],  # sums to 1.5
            [-0.2, 0.7, 0.5],  # negative
            [np.inf, 0.0, 0.0],  # inf
        ]
    )
    assert valid_probability_mask(probs, 3).tolist() == [True, False, False, False, False]
    assert valid_probability_mask(np.ones((2, 2)) / 2, 3).tolist() == [False, False]


def test_downsample_curve_keeps_endpoints():
    points = [{"x": float(i)} for i in range(1000)]
    thinned = downsample_curve(points, max_points=50)
    assert len(thinned) <= 50
    assert thinned[0] == points[0] and thinned[-1] == points[-1]


def _probs(rows):
    return np.asarray(rows, dtype=np.float64)


def _assemble(val_probs, val_labels, test_probs, test_labels):
    return assemble_report(
        val_probs=val_probs,
        val_labels=np.asarray(val_labels),
        test_probs=test_probs,
        test_labels=np.asarray(test_labels),
        class_names=CLASS_NAMES,
        class_indices=CLASS_INDICES,
        model_info={
            "file_name": "m.h5",
            "sha256": "abc",
            "size_bytes": 1,
            "version_label": "test",
            "architecture": "test",
        },
        preprocessing_info={"description": "test", "image_size": 224},
    )


def test_assemble_report_threshold_comes_from_validation_not_test():
    # Validation separates at ~0.3; test separates at ~0.8. The selected threshold must
    # follow validation, so the test result at that threshold is imperfect.
    val_probs = _probs([[0.9, 0.1, 0.0], [0.8, 0.2, 0.0], [0.6, 0.4, 0.0], [0.5, 0.5, 0.0]])
    val_labels = [0, 0, 1, 1]
    test_probs = _probs(
        [[0.3, 0.7, 0.0], [0.4, 0.6, 0.0], [0.1, 0.9, 0.0], [0.05, 0.95, 0.0], [0.1, 0.1, 0.8]]
    )
    test_labels = [0, 0, 1, 1, 2]
    report = _assemble(val_probs, val_labels, test_probs, test_labels)

    selected = report["threshold_selection"]["selected_threshold"]
    assert 0.2 < selected <= 0.4
    points = {p["id"]: p for p in report["operating_points"]}
    assert points["validation_threshold"]["threshold"] == selected
    assert points["validation_threshold"]["metrics"]["fp"] == 2
    assert points["argmax"]["threshold"] is None
    # COVID test image is excluded from the binary task but kept in the 3-class matrix.
    assert report["datasets"]["test"]["binary_task_total"] == 4
    assert report["multiclass"]["confusion_matrix"][2] == [0, 0, 1]
    assert report["curves"]["roc"]["auc"] == pytest.approx(1.0)
    # Binary confusion matrix: rows actual [NORMAL, PNEUMONIA], cols predicted.
    assert points["argmax"]["confusion_matrix"] == {
        "labels": ["NORMAL", "PNEUMONIA"],
        "matrix": [[0, 2], [0, 2]],
    }


def test_assemble_report_handles_missing_class_and_invalid_predictions():
    val_probs = _probs([[0.1, 0.9, 0.0], [0.2, 0.8, 0.0]])  # no NORMAL in validation
    test_probs = _probs([[0.1, 0.9, 0.0], [np.nan, 0.5, 0.5], [0.3, 0.7, 0.0]])
    report = _assemble(val_probs, [1, 1], test_probs, [1, 1, 1])  # no NORMAL in test

    assert report["threshold_selection"]["selected_threshold"] is None
    assert [p["id"] for p in report["operating_points"]] == ["argmax"]
    assert report["datasets"]["test"]["invalid_predictions_excluded"] == 1
    assert report["datasets"]["test"]["binary_task_total"] == 2
    assert report["curves"]["roc"] is None
    m = report["operating_points"][0]["metrics"]
    assert m["specificity"] is None
    assert m["recall"] == pytest.approx(1.0)
    # Only PNEUMONIA in the test set: one-vs-rest AUC is undefined for every class.
    auc = report["multiclass"]["roc_auc_ovr"]
    assert auc["macro"] is None and auc["weighted"] is None
    assert all(v is None for v in auc["per_class"].values())
    assert auc["note"].startswith("Unavailable")
    assert report["multiclass"]["roc_curves_ovr"] == []


# --------------------------------------------------------------------------- #
# Three-class evaluation (primary view)                                       #
# --------------------------------------------------------------------------- #


def _pairwise_auc(pos, neg):
    greater = (pos[:, None] > neg[None, :]).sum()
    ties = (pos[:, None] == neg[None, :]).sum()
    return (greater + 0.5 * ties) / (pos.size * neg.size)


def test_one_vs_rest_auc_matches_pairwise_definition_for_each_class():
    rng = np.random.default_rng(1)
    y = rng.integers(0, 3, 400)
    logits = rng.normal(size=(400, 3)) + np.eye(3)[y] * 1.5
    probs = np.exp(logits) / np.exp(logits).sum(axis=1, keepdims=True)
    result = one_vs_rest_roc(y, probs, CLASS_NAMES)
    expected = []
    for i, row in enumerate(result["per_class"]):
        assert row["label"] == CLASS_NAMES[i]
        exp = _pairwise_auc(probs[y == i, i], probs[y != i, i])
        expected.append(exp)
        assert row["auc"] == pytest.approx(exp)
        assert row["support"] == int(np.sum(y == i))
    assert result["macro_auc"] == pytest.approx(np.mean(expected))
    supports = [np.sum(y == i) for i in range(3)]
    assert result["weighted_auc"] == pytest.approx(np.average(expected, weights=supports))


def test_one_vs_rest_auc_missing_class_is_undefined():
    y = [0, 0, 1, 1]  # no COVID samples
    probs = np.array([[0.8, 0.1, 0.1], [0.6, 0.3, 0.1], [0.2, 0.7, 0.1], [0.1, 0.8, 0.1]])
    result = one_vs_rest_roc(y, probs, CLASS_NAMES)
    by_label = {row["label"]: row["auc"] for row in result["per_class"]}
    assert by_label["COVID"] is None
    assert by_label["NORMAL"] == pytest.approx(1.0)
    assert result["macro_auc"] == pytest.approx(1.0)  # mean over defined classes only
    with pytest.raises(ValueError):
        one_vs_rest_roc(y, probs[:, :2], CLASS_NAMES)


def _three_class_fixture():
    """
    Actual NORMAL (3)    -> predicted NORMAL 2, PNEUMONIA 1
    Actual PNEUMONIA (4) -> predicted PNEUMONIA 3, COVID 1
    Actual COVID (2)     -> predicted COVID 2
    Asymmetric counts, so a transposed matrix would fail.
    """
    probs = _probs(
        [
            [0.8, 0.1, 0.1],
            [0.7, 0.2, 0.1],
            [0.3, 0.6, 0.1],
            [0.1, 0.8, 0.1],
            [0.2, 0.7, 0.1],
            [0.1, 0.6, 0.3],
            [0.1, 0.3, 0.6],
            [0.0, 0.1, 0.9],
            [0.1, 0.1, 0.8],
        ]
    )
    labels = [0, 0, 0, 1, 1, 1, 1, 2, 2]
    return probs, labels


def test_three_class_confusion_matrix_orientation_and_per_class_metrics():
    probs, labels = _three_class_fixture()
    mc = _assemble(probs, labels, probs, labels)["multiclass"]
    assert mc["labels"] == ["NORMAL", "PNEUMONIA", "COVID"]
    assert mc["decision_rule"] == "argmax"
    assert mc["total"] == 9
    # Rows = actual, columns = predicted.
    assert mc["confusion_matrix"] == [[2, 1, 0], [0, 3, 1], [0, 0, 2]]
    rows = {r["label"]: r for r in mc["classification_report"]["classes"]}
    assert rows["NORMAL"]["precision"] == pytest.approx(1.0)
    assert rows["NORMAL"]["recall"] == pytest.approx(2 / 3)
    assert rows["PNEUMONIA"]["precision"] == pytest.approx(3 / 4)
    assert rows["PNEUMONIA"]["recall"] == pytest.approx(3 / 4)
    assert rows["COVID"]["precision"] == pytest.approx(2 / 3)
    assert rows["COVID"]["recall"] == pytest.approx(1.0)
    assert rows["COVID"]["f1"] == pytest.approx(0.8)
    assert [rows[c]["support"] for c in CLASS_NAMES] == [3, 4, 2]
    assert [rows[c]["predicted_count"] for c in CLASS_NAMES] == [2, 4, 3]
    summary = mc["classification_report"]
    assert summary["accuracy"] == pytest.approx(7 / 9)
    assert summary["macro_avg"]["recall"] == pytest.approx(np.mean([2 / 3, 3 / 4, 1.0]))
    assert summary["weighted_avg"]["recall"] == pytest.approx(7 / 9)  # equals accuracy
    auc = mc["roc_auc_ovr"]
    assert set(auc["per_class"]) == set(CLASS_NAMES)
    assert all(v is not None for v in auc["per_class"].values())
    assert auc["note"] is None
    assert [c["label"] for c in mc["roc_curves_ovr"]] == list(CLASS_NAMES)


def test_interpretation_names_where_misses_go_without_repeating_them():
    probs, labels = _three_class_fixture()
    limitations = _assemble(probs, labels, probs, labels)["interpretation"]["limitations"]
    normal = [t for t in limitations if t.startswith("NORMAL recall")]
    assert normal == ["NORMAL recall is only 66.7%: of 3 NORMAL images, 1 was misclassified (1 as PNEUMONIA)."]
    # The same NORMAL -> PNEUMONIA error is not restated as a separate "most common error".
    assert not any(t.startswith("Most common error") and "NORMAL images" in t for t in limitations)


def test_three_class_pr_curves_and_threshold_sweeps_cover_every_class():
    probs, labels = _three_class_fixture()
    mc = _assemble(probs, labels, probs, labels)["multiclass"]
    assert [c["label"] for c in mc["pr_curves_ovr"]] == list(CLASS_NAMES)
    prevalence = {c["label"]: c["prevalence"] for c in mc["pr_curves_ovr"]}
    assert prevalence == pytest.approx({"NORMAL": 3 / 9, "PNEUMONIA": 4 / 9, "COVID": 2 / 9})
    sweeps = {c["label"]: c for c in mc["threshold_sweep_ovr"]["classes"]}
    assert list(sweeps) == list(CLASS_NAMES)
    assert [sweeps[c]["support"] for c in CLASS_NAMES] == [3, 4, 2]
    for name, sweep in sweeps.items():
        support = sweep["support"]
        for row in sweep["rows"]:
            # Every threshold row accounts for all 9 images, one-vs-rest.
            assert row["tp"] + row["fn"] == support
            assert row["fp"] + row["tn"] == 9 - support
    # COVID vs rest at P(COVID) >= 0.5: both COVID images caught, one PNEUMONIA image flagged.
    covid_half = next(r for r in sweeps["COVID"]["rows"] if r["threshold"] == pytest.approx(0.5))
    assert (covid_half["tp"], covid_half["fn"], covid_half["fp"]) == (2, 0, 1)


def test_label_mapping_must_match_class_order():
    probs, labels = _three_class_fixture()
    with pytest.raises(ValueError):
        assemble_report(
            val_probs=probs,
            val_labels=np.asarray(labels),
            test_probs=probs,
            test_labels=np.asarray(labels),
            class_names=CLASS_NAMES,
            class_indices={"NORMAL": 0, "PNEUMONIA": 2, "COVID": 1},
            model_info={},
            preprocessing_info={},
        )


def test_binary_section_is_separate_from_three_class_results():
    probs, labels = _three_class_fixture()
    report = _assemble(probs, labels, probs, labels)
    binary = report["binary_task"]
    assert binary["included_classes"] == ["NORMAL", "PNEUMONIA"]
    assert binary["excluded_classes"] == ["COVID"]
    assert (binary["included_samples"], binary["excluded_samples"]) == (7, 2)
    assert binary["argmax_predicted_covid"] == 1  # one actual PNEUMONIA predicted COVID
    argmax = next(p for p in report["operating_points"] if p["id"] == "argmax")
    assert argmax["confusion_matrix"]["labels"] == ["NORMAL", "PNEUMONIA"]
    m = argmax["metrics"]
    # COVID-labelled images excluded; the COVID prediction counts as "not pneumonia".
    assert (m["tp"], m["fn"], m["fp"], m["tn"]) == (3, 1, 1, 2)
    # Production rule is argmax with no threshold; binary thresholds are analysis-only.
    assert report["production_decision"]["rule"] == "argmax"
    assert report["production_decision"]["probability_threshold"] is None
    assert argmax["threshold"] is None
    for point in report["operating_points"]:
        if point["threshold"] is not None:
            assert "Not used in production" in point["decision_rule"]
    # Binary-only commentary stays out of the three-class interpretation.
    three_class_text = " ".join(report["interpretation"]["strengths"] + report["interpretation"]["limitations"])
    assert "P(PNEUMONIA)" not in three_class_text
    assert report["interpretation"]["binary_notes"]
