"""Response schemas for the aggregate model evaluation report (no patient data)."""

from datetime import datetime

from pydantic import BaseModel, Field


class BinaryMetrics(BaseModel):
    tp: int = Field(..., ge=0)
    tn: int = Field(..., ge=0)
    fp: int = Field(..., ge=0)
    fn: int = Field(..., ge=0)
    accuracy: float | None = None
    precision: float | None = None
    recall: float | None = Field(default=None, description="Sensitivity.")
    specificity: float | None = None
    f1: float | None = None


class ThresholdRow(BinaryMetrics):
    threshold: float


class ClassReportRow(BaseModel):
    label: str
    precision: float | None = None
    recall: float | None = None
    f1: float | None = None
    support: int = Field(..., ge=0)
    predicted_count: int = Field(..., ge=0)


class AveragedMetrics(BaseModel):
    precision: float | None = None
    recall: float | None = None
    f1: float | None = None


class ClassificationReport(BaseModel):
    classes: list[ClassReportRow]
    accuracy: float | None = None
    macro_avg: AveragedMetrics
    weighted_avg: AveragedMetrics
    total_support: int = Field(..., ge=0)


class LabeledConfusionMatrix(BaseModel):
    labels: list[str] = Field(..., description="Row (actual) and column (predicted) order.")
    matrix: list[list[int]]


class OperatingPoint(BaseModel):
    id: str
    label: str
    decision_rule: str
    threshold: float | None = Field(
        default=None, description="Probability threshold, or null for the argmax rule."
    )
    dataset: str
    metrics: BinaryMetrics
    confusion_matrix: LabeledConfusionMatrix
    classification_report: ClassificationReport


class ModelInfo(BaseModel):
    file_name: str
    sha256: str
    size_bytes: int
    version_label: str
    architecture: str


class PreprocessingInfo(BaseModel):
    description: str
    image_size: int


class DatasetSummary(BaseModel):
    source: str
    class_counts: dict[str, int]
    total: int = Field(..., ge=0)
    invalid_predictions_excluded: int = Field(..., ge=0)
    binary_task_total: int = Field(..., ge=0)


class DatasetsInfo(BaseModel):
    test: DatasetSummary
    validation: DatasetSummary


class BinaryTaskInfo(BaseModel):
    description: str
    included_classes: list[str]
    excluded_classes: list[str]
    included_samples: int = Field(..., ge=0)
    excluded_samples: int = Field(..., ge=0)
    argmax_predicted_covid: int = Field(..., ge=0)


class ProductionDecision(BaseModel):
    rule: str
    classes: list[str]
    description: str
    probability_threshold: float | None = Field(
        default=None, description="Always null for the argmax rule."
    )


class ThresholdSelection(BaseModel):
    method: str
    dataset: str
    selected_threshold: float | None = None
    youden_j: float | None = None
    validation_metrics: ThresholdRow | None = None
    production_rule: str


class RocPoint(BaseModel):
    fpr: float
    tpr: float


class RocCurve(BaseModel):
    auc: float
    points: list[RocPoint]


class PrPoint(BaseModel):
    recall: float
    precision: float


class PrecisionRecallCurve(BaseModel):
    average_precision: float
    prevalence: float
    points: list[PrPoint]


class Curves(BaseModel):
    dataset: str
    roc: RocCurve | None = None
    precision_recall: PrecisionRecallCurve | None = None


class ThresholdSweep(BaseModel):
    dataset: str
    note: str
    rows: list[ThresholdRow]


class MulticlassRocAuc(BaseModel):
    method: str
    per_class: dict[str, float | None]
    macro: float | None = None
    weighted: float | None = None
    note: str | None = Field(default=None, description="Why some or all AUC values are unavailable.")


class OvrRocCurve(BaseModel):
    label: str
    auc: float
    points: list[RocPoint]


class MulticlassEvaluation(BaseModel):
    dataset: str
    decision_rule: str
    labels: list[str] = Field(..., description="Row (actual) and column (predicted) order.")
    total: int = Field(..., ge=0)
    confusion_matrix: list[list[int]]
    classification_report: ClassificationReport
    roc_auc_ovr: MulticlassRocAuc
    roc_curves_ovr: list[OvrRocCurve]


class Interpretation(BaseModel):
    strengths: list[str]
    limitations: list[str]
    binary_notes: list[str] = Field(
        default_factory=list, description="Observations about the binary analysis only."
    )


class EvaluationReport(BaseModel):
    """Shape of model/evaluation/evaluation_report.json (schema version 2)."""

    schema_version: int = Field(..., ge=2, description="Reports older than v2 must be regenerated.")
    generated_at: datetime
    model: ModelInfo
    preprocessing: PreprocessingInfo
    label_mapping: dict[str, int]
    production_decision: ProductionDecision
    positive_class: str
    negative_class: str
    score_definition: str
    datasets: DatasetsInfo
    binary_task: BinaryTaskInfo
    threshold_selection: ThresholdSelection
    operating_points: list[OperatingPoint]
    curves: Curves
    threshold_sweep: ThresholdSweep
    multiclass: MulticlassEvaluation
    interpretation: Interpretation


class ModelEvaluationResponse(BaseModel):
    report: EvaluationReport
    model_matches_report: bool | None = Field(
        default=None,
        description=(
            "True if the deployed model file has the same SHA-256 as the evaluated one; "
            "null if the deployed model file cannot be read."
        ),
    )
    deployed_model_version: str
