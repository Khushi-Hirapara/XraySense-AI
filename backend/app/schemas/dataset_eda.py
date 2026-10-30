"""Response schemas for the aggregate dataset EDA report (no file names or patient data)."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class SplitSummary(BaseModel):
    split: str
    exists: bool
    class_counts: dict[str, int]
    class_percentages: dict[str, float | None]
    total: int = Field(..., ge=0)
    non_image_files: int = Field(..., ge=0)


class OverallSummary(BaseModel):
    total: int = Field(..., ge=0)
    class_counts: dict[str, int]
    class_percentages: dict[str, float | None]


class TrainingUsage(BaseModel):
    description: str
    fit: dict[str, int]
    validation: dict[str, int]
    unused_splits: list[str]


class DistributionStats(BaseModel):
    min: float
    p25: float
    median: float
    p75: float
    max: float
    mean: float


class Histogram(BaseModel):
    bin_edges: list[float]
    counts: dict[str, list[int]]


class DominantSize(BaseModel):
    width: int
    height: int
    count: int
    share: float
    distinct_sizes: int
    share_in_other_classes: float


class ImageProperties(BaseModel):
    measured_images: int = Field(..., ge=0)
    width: dict[str, DistributionStats | None]
    height: dict[str, DistributionStats | None]
    aspect_ratio: dict[str, DistributionStats | None]
    width_histogram: Histogram | None = None
    height_histogram: Histogram | None = None
    color_modes_by_class: dict[str, dict[str, int]]
    formats_by_class: dict[str, dict[str, int]]
    dominant_size_by_class: dict[str, DominantSize | None]


class UnreadableSummary(BaseModel):
    count: int = Field(..., ge=0)
    by_folder: dict[str, int]
    error_types: dict[str, int]


class DuplicateSummary(BaseModel):
    method: str
    duplicate_groups: int = Field(..., ge=0)
    redundant_copies: int = Field(..., ge=0)
    groups_spanning_splits: dict[str, int]
    groups_with_conflicting_labels: int = Field(..., ge=0)


class DimensionIssues(BaseModel):
    min_dimension: int
    below_min_dimension: int = Field(..., ge=0)
    extreme_aspect_ratio: int = Field(..., ge=0)
    non_rgb_or_grayscale: int = Field(..., ge=0)


class QualitySummary(BaseModel):
    missing_folders: list[str]
    empty_folders: list[str]
    unreadable: UnreadableSummary
    duplicates: DuplicateSummary
    dimension_issues: DimensionIssues


class Augmentation(BaseModel):
    applied_to: str
    steps: list[str]


class PreprocessingSummary(BaseModel):
    model_input_size: int
    inference_input_size: int
    backbone: str
    preprocess_function: str
    color_mode: str
    aspect_ratio_handling: str
    training_loader: str
    training_resize_interpolation: str
    inference_loader: str
    inference_resize_interpolation: str
    augmentation: Augmentation
    class_weighting: str
    differences: list[str]


class SampleImage(BaseModel):
    id: str = Field(..., pattern=r"^[0-9a-f]{16}$")
    label: str
    split: str
    width: int
    height: int


class Finding(BaseModel):
    severity: Literal["error", "warning", "info"]
    text: str


class DatasetEdaReport(BaseModel):
    """Shape of model/evaluation/dataset_eda_report.json."""

    schema_version: int
    generated_at: datetime
    dataset_root: str
    class_names: list[str]
    label_mapping: dict[str, int] | None = None
    overall: OverallSummary
    splits: list[SplitSummary]
    training_usage: TrainingUsage | None = None
    image_properties: ImageProperties
    quality: QualitySummary
    class_weights: dict[str, float] | None = None
    preprocessing: PreprocessingSummary | None = None
    samples: list[SampleImage]
    findings: list[Finding]


class DatasetEdaResponse(BaseModel):
    report: DatasetEdaReport
    dataset_available: bool = Field(
        ..., description="Whether the dataset directory is present on this server right now."
    )
    dataset_matches_report: bool | None = Field(
        default=None,
        description=(
            "True if current per-folder image counts equal the report's; "
            "null when the dataset is unavailable."
        ),
    )
