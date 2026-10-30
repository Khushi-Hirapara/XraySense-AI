"""Generate PDF diagnostic reports for saved scans."""

from __future__ import annotations

from datetime import datetime
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    HRFlowable,
    Image as RLImage,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.core.config import PROJECT_ROOT, Settings, settings
from app.models.scan import Scan
from app.models.scan_note import ScanNote
from app.models.user import User
from app.services.ai_findings import AI_SCREENING_DISCLAIMER
from app.services.recommendations import MEDICAL_DISCLAIMER

# Clinical report palette
_TEAL_HEADER = colors.HexColor("#115e59")
_SLATE_900 = colors.HexColor("#0f172a")
_SLATE_700 = colors.HexColor("#334155")
_SLATE_600 = colors.HexColor("#475569")
_SLATE_500 = colors.HexColor("#64748b")
_SLATE_200 = colors.HexColor("#e2e8f0")
_SLATE_100 = colors.HexColor("#f1f5f9")
_SLATE_50 = colors.HexColor("#f8fafc")
_NORMAL_BG = colors.HexColor("#f0fdf4")
_NORMAL_TEXT = colors.HexColor("#166534")
_PNEUMONIA_BG = colors.HexColor("#fef2f2")
_PNEUMONIA_TEXT = colors.HexColor("#991b1b")
_SEVERITY_MILD_BG = colors.HexColor("#fffbeb")
_SEVERITY_MILD_TEXT = colors.HexColor("#92400e")
_SEVERITY_MODERATE_BG = colors.HexColor("#fff7ed")
_SEVERITY_MODERATE_TEXT = colors.HexColor("#9a3412")
_SEVERITY_SEVERE_BG = colors.HexColor("#fef2f2")
_SEVERITY_SEVERE_TEXT = colors.HexColor("#991b1b")
_WHITE = colors.white

_PAGE_WIDTH, _PAGE_HEIGHT = letter
_CONTENT_WIDTH = _PAGE_WIDTH - 1.5 * inch


def _resolve_storage_path(stored: str | None) -> Path | None:
    if not stored:
        return None
    path = Path(stored)
    if path.is_absolute():
        return path if path.is_file() else None
    full = PROJECT_ROOT / path
    return full if full.is_file() else None


def _format_datetime(dt: datetime) -> str:
    if dt.tzinfo is not None:
        dt = dt.replace(tzinfo=None)
    return dt.strftime("%B %d, %Y · %I:%M %p")


def _format_date(dt: datetime) -> str:
    if dt.tzinfo is not None:
        dt = dt.replace(tzinfo=None)
    return dt.strftime("%d %b %Y")


def _report_number(scan_id: int) -> str:
    return f"CV-{scan_id:06d}"


def _confidence_tier(pct: float) -> str:
    if pct >= 90:
        return "Very high"
    if pct >= 75:
        return "High"
    if pct >= 60:
        return "Moderate"
    return "Low"


def _prediction_key(prediction: str) -> str:
    from app.services.prediction_labels import prediction_key

    return prediction_key(prediction)


def _is_abnormal_prediction(prediction: str) -> bool:
    from app.services.prediction_labels import is_abnormal_prediction

    return is_abnormal_prediction(prediction)


def _confidence_interpretation(prediction: str, confidence_pct: float) -> tuple[str, str]:
    """Return (headline, explanation) for model confidence (certainty, not severity)."""
    tier = _confidence_tier(confidence_pct)
    headline = f"{tier} Confidence" if tier != "Very high" else "Very High Confidence"
    key = _prediction_key(prediction)
    if key == "pneumonia":
        if confidence_pct >= 75:
            explanation = "The model strongly believes this image represents pneumonia."
        elif confidence_pct >= 60:
            explanation = "The model leans toward pneumonia, but with moderate certainty."
        else:
            explanation = (
                "The model suggests pneumonia, but confidence is limited—"
                "clinical review is especially important."
            )
    elif key in {"covid", "covid-19"}:
        if confidence_pct >= 75:
            explanation = (
                "The model strongly believes this image represents a COVID-19–related pattern."
            )
        elif confidence_pct >= 60:
            explanation = (
                "The model leans toward a COVID-19–related pattern, but with moderate certainty."
            )
        else:
            explanation = (
                "The model suggests COVID-19–related findings, but confidence is limited—"
                "clinical review is especially important."
            )
    elif confidence_pct >= 75:
        explanation = (
            "The model strongly believes this image does not show a pneumonia or COVID pattern."
        )
    elif confidence_pct >= 60:
        explanation = "The model leans toward a normal study, but with moderate certainty."
    else:
        explanation = (
            "The model did not detect pneumonia or COVID with high certainty—"
            "other pathology may still be present."
        )
    return headline, explanation


def _scaled_image(path: Path, max_width: float, max_height: float) -> RLImage:
    img = RLImage(str(path))
    ratio = min(max_width / img.drawWidth, max_height / img.drawHeight, 1.0)
    img.drawWidth *= ratio
    img.drawHeight *= ratio
    img.hAlign = "CENTER"
    return img


def _styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "letterhead_title": ParagraphStyle(
            "LetterheadTitle",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=18,
            leading=22,
            textColor=_WHITE,
        ),
        "letterhead_sub": ParagraphStyle(
            "LetterheadSub",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9,
            leading=12,
            textColor=colors.HexColor("#ccfbf1"),
        ),
        "letterhead_meta": ParagraphStyle(
            "LetterheadMeta",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8,
            leading=11,
            textColor=colors.HexColor("#ccfbf1"),
            alignment=TA_RIGHT,
        ),
        "confidential": ParagraphStyle(
            "Confidential",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=7,
            leading=9,
            textColor=_SLATE_500,
            alignment=TA_CENTER,
        ),
        "meta_label": ParagraphStyle(
            "MetaLabel",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=7,
            leading=9,
            textColor=_SLATE_500,
        ),
        "meta_value": ParagraphStyle(
            "MetaValue",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=9,
            leading=11,
            textColor=_SLATE_900,
        ),
        "section_title": ParagraphStyle(
            "SectionTitle",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=9,
            leading=11,
            textColor=_TEAL_HEADER,
            spaceBefore=2,
            spaceAfter=4,
        ),
        "field_label": ParagraphStyle(
            "FieldLabel",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=10,
            textColor=_SLATE_600,
        ),
        "field_value": ParagraphStyle(
            "FieldValue",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=10,
            leading=13,
            textColor=_SLATE_900,
        ),
        "body": ParagraphStyle(
            "Body",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=10,
            leading=14,
            textColor=_SLATE_900,
        ),
        "impression": ParagraphStyle(
            "Impression",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=10,
            leading=14,
            textColor=_SLATE_700,
        ),
        "image_caption": ParagraphStyle(
            "ImageCaption",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=10,
            textColor=_SLATE_600,
            alignment=TA_CENTER,
        ),
        "figure_label": ParagraphStyle(
            "FigureLabel",
            parent=base["Normal"],
            fontName="Helvetica-Oblique",
            fontSize=8,
            leading=10,
            textColor=_SLATE_500,
            alignment=TA_CENTER,
        ),
        "disclaimer": ParagraphStyle(
            "Disclaimer",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8,
            leading=11,
            textColor=_SLATE_600,
        ),
        "summary_label": ParagraphStyle(
            "SummaryLabel",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=10,
            textColor=_SLATE_600,
        ),
        "summary_value": ParagraphStyle(
            "SummaryValue",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=11,
            leading=14,
            textColor=_SLATE_900,
        ),
        "summary_value_large": ParagraphStyle(
            "SummaryValueLarge",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=13,
            leading=16,
            textColor=_SLATE_900,
        ),
        "signature_label": ParagraphStyle(
            "SignatureLabel",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8,
            leading=10,
            textColor=_SLATE_500,
        ),
        "logo_monogram": ParagraphStyle(
            "LogoMonogram",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=16,
            leading=18,
            textColor=_WHITE,
            alignment=TA_CENTER,
        ),
        "panel_header": ParagraphStyle(
            "PanelHeader",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=10,
            textColor=_TEAL_HEADER,
        ),
    }


def _letterhead(
    scan_id: int,
    generated_at: datetime,
    styles: dict[str, ParagraphStyle],
    cfg: Settings,
) -> Table:
    report_no = _report_number(scan_id)
    logo_cell = _logo_cell(cfg, styles)

    hospital_block = [
        Paragraph(escape(cfg.hospital_name), styles["letterhead_title"]),
        Paragraph(escape(cfg.hospital_department), styles["letterhead_sub"]),
        Paragraph(escape(cfg.hospital_address), styles["letterhead_sub"]),
        Paragraph(f"Tel: {escape(cfg.hospital_phone)}", styles["letterhead_sub"]),
    ]
    meta = Paragraph(
        f"<b>RADIOLOGY REPORT</b><br/>"
        f"<b>Report No.</b> {report_no}<br/>"
        f"<b>Issued</b> {_format_date(generated_at)}<br/>"
        f"<b>Time</b> {generated_at.strftime('%I:%M %p')}",
        styles["letterhead_meta"],
    )

    band = Table([[logo_cell, hospital_block, meta]], colWidths=[1.05 * inch, 3.35 * inch, 2.1 * inch])
    band.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), _TEAL_HEADER),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (0, 0), 14),
                ("LEFTPADDING", (1, 0), (1, 0), 8),
                ("RIGHTPADDING", (2, 0), (2, 0), 14),
                ("TOPPADDING", (0, 0), (-1, -1), 14),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 14),
                ("ALIGN", (2, 0), (2, 0), "RIGHT"),
            ]
        )
    )
    return band


def _logo_cell(cfg: Settings, styles: dict[str, ParagraphStyle]):
    logo_path = cfg.resolved_report_logo_path
    if logo_path:
        try:
            logo = RLImage(str(logo_path))
            max_side = 0.72 * inch
            ratio = min(max_side / logo.drawWidth, max_side / logo.drawHeight, 1.0)
            logo.drawWidth *= ratio
            logo.drawHeight *= ratio
            logo.hAlign = "CENTER"
            return logo
        except Exception:
            pass

    monogram = Table(
        [[Paragraph("CV", styles["logo_monogram"])]],
        colWidths=[0.62 * inch],
        rowHeights=[0.62 * inch],
    )
    monogram.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#0f766e")),
                ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#99f6e4")),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        )
    )
    return monogram


def _patient_physician_panel(
    scan: Scan,
    generated_at: datetime,
    styles: dict[str, ParagraphStyle],
) -> Table:
    doctor = getattr(scan, "user", None)
    doctor_name = doctor.name if isinstance(doctor, User) else "Referring physician not recorded"
    doctor_email = doctor.email if isinstance(doctor, User) else "—"
    doctor_role = "Attending Radiologist" if getattr(doctor, "role", "") == "doctor" else "Clinician"

    patient_rows = [
        ("Patient name", scan.patient_name),
        ("Study ID", str(scan.id)),
        ("Study date", _format_datetime(scan.created_at)),
        ("Modality", "Chest X-Ray (PA)"),
    ]
    physician_rows = [
        ("Referring physician", doctor_name),
        ("Department", doctor_role),
        ("Contact", doctor_email),
        ("Report issued", _format_datetime(generated_at)),
    ]

    patient_table = _mini_info_table("Patient Information", patient_rows, styles)
    physician_table = _mini_info_table("Physician / Referrer", physician_rows, styles)
    panel = Table([[patient_table, physician_table]], colWidths=[3.15 * inch, 3.15 * inch])
    panel.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    return panel


def _mini_info_table(
    title: str,
    rows: list[tuple[str, str]],
    styles: dict[str, ParagraphStyle],
) -> Table:
    header = Paragraph(title.upper(), styles["panel_header"])
    body_rows: list[list[Paragraph]] = [[header]]
    for label, value in rows:
        body_rows.append(
            [
                Paragraph(
                    f'<font size="7" color="#64748b">{escape(label.upper())}</font><br/>'
                    f"<b>{escape(value)}</b>",
                    styles["field_value"],
                )
            ]
        )
    table = Table(body_rows, colWidths=[3.05 * inch])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), _SLATE_50),
                ("BOX", (0, 0), (-1, -1), 0.5, _SLATE_200),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (0, 0), 8),
                ("BOTTOMPADDING", (0, 0), (0, 0), 6),
                ("TOPPADDING", (0, 1), (-1, -1), 6),
                ("BOTTOMPADDING", (0, -1), (-1, -1), 8),
                ("LINEBELOW", (0, 0), (-1, 0), 0.5, _SLATE_200),
            ]
        )
    )
    return table


def _clinical_recommendation_panel(
    recommendation_html: str,
    follow_up: str,
    styles: dict[str, ParagraphStyle],
) -> Table:
    follow_html = escape(follow_up).replace("\n", "<br/>")
    content = Paragraph(
        f'<font name="Helvetica-Bold" size="10" color="#991b1b">Clinical Recommendation</font>'
        f"<br/><br/>{recommendation_html}<br/><br/>"
        f'<font name="Helvetica-Bold" size="9" color="#334155">Recommended Next Step</font>'
        f"<br/>{follow_html}",
        styles["body"],
    )
    table = Table([[content]], colWidths=[_CONTENT_WIDTH])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#fff1f2")),
                ("BOX", (0, 0), (-1, -1), 0.75, colors.HexColor("#fecdd3")),
                ("LEFTPADDING", (0, 0), (-1, -1), 14),
                ("RIGHTPADDING", (0, 0), (-1, -1), 14),
                ("TOPPADDING", (0, 0), (-1, -1), 12),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
            ]
        )
    )
    return table


def _confidential_strip(styles: dict[str, ParagraphStyle]) -> Table:
    table = Table(
        [[Paragraph("CONFIDENTIAL — FOR CLINICAL USE ONLY", styles["confidential"])]],
        colWidths=[_CONTENT_WIDTH],
    )
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), _SLATE_100),
                ("BOX", (0, 0), (-1, -1), 0.25, _SLATE_200),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return table


def _meta_strip(
    rows: list[tuple[str, str]],
    styles: dict[str, ParagraphStyle],
) -> Table:
    """Horizontal key facts row (4 columns)."""
    cells: list[list[Paragraph]] = [[]]
    for label, value in rows:
        cells[0].append(
            Paragraph(
                f'<font size="7" color="#64748b">{escape(label.upper())}</font><br/>'
                f"<b>{escape(value)}</b>",
                styles["meta_value"],
            )
        )
    col_w = _CONTENT_WIDTH / max(len(rows), 1)
    table = Table(cells, colWidths=[col_w] * len(rows))
    table.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 0.5, _SLATE_200),
                ("INNERGRID", (0, 0), (-1, -1), 0.25, _SLATE_200),
                ("BACKGROUND", (0, 0), (-1, -1), _WHITE),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    return table


def _section_title(title: str, styles: dict[str, ParagraphStyle]) -> list:
    """Hospital-style section header: rule, teal title, rule (matches report screenshots)."""
    return [
        Spacer(1, 0.12 * inch),
        HRFlowable(
            width="100%",
            thickness=0.6,
            color=_SLATE_200,
            spaceBefore=0,
            spaceAfter=6,
        ),
        Paragraph(title.upper(), styles["section_title"]),
        HRFlowable(
            width="100%",
            thickness=0.6,
            color=_SLATE_200,
            spaceBefore=4,
            spaceAfter=10,
        ),
    ]


def _section_block(title: str, styles: dict[str, ParagraphStyle], *body) -> KeepTogether:
    """Keep section title and its content on the same page (no orphaned headings)."""
    flowables: list = [*_section_title(title, styles), *body]
    return KeepTogether(flowables)


def _info_grid(rows: list[tuple[str, str]], styles: dict[str, ParagraphStyle]) -> Table:
    data: list[list[Paragraph]] = []
    for label, value in rows:
        data.append(
            [
                Paragraph(label, styles["field_label"]),
                Paragraph(escape(value), styles["field_value"]),
            ]
        )
    table = Table(data, colWidths=[1.65 * inch, _CONTENT_WIDTH - 1.65 * inch])
    table.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 0.5, _SLATE_200),
                ("INNERGRID", (0, 0), (-1, -1), 0.25, _SLATE_200),
                ("BACKGROUND", (0, 0), (0, -1), _SLATE_50),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    return table


def _severity_colors(severity: str) -> tuple[colors.Color, colors.Color, colors.Color]:
    key = severity.strip().lower()
    if key == "mild":
        return _SEVERITY_MILD_BG, _SEVERITY_MILD_TEXT, _SEVERITY_MILD_TEXT
    if key == "moderate":
        return _SEVERITY_MODERATE_BG, _SEVERITY_MODERATE_TEXT, _SEVERITY_MODERATE_TEXT
    if key == "severe":
        return _SEVERITY_SEVERE_BG, _SEVERITY_SEVERE_TEXT, _SEVERITY_SEVERE_TEXT
    return _SLATE_50, _SLATE_600, _SLATE_200


def _diagnostic_summary_table(
    prediction: str,
    confidence_pct: float,
    severity: str,
    model_version: str,
    styles: dict[str, ParagraphStyle],
) -> Table:
    is_abnormal = _is_abnormal_prediction(prediction)
    key = _prediction_key(prediction)
    finding_bg = _PNEUMONIA_BG if is_abnormal else _NORMAL_BG
    finding_fg = _PNEUMONIA_TEXT if is_abnormal else _NORMAL_TEXT
    finding_display = "COVID" if key in {"covid", "covid-19"} else prediction.strip().title()
    if key == "pneumonia":
        finding_sub = "AI pattern consistent with pneumonia"
    elif key in {"covid", "covid-19"}:
        finding_sub = "AI pattern consistent with COVID-19"
    else:
        finding_sub = "No pneumonia or COVID pattern detected by AI"

    tier = _confidence_tier(confidence_pct)
    sev_label = severity.strip() or "None"
    sev_bg, sev_fg, sev_border = _severity_colors(sev_label)
    if sev_label.lower() == "none":
        sev_display = "Not elevated (screening)"
        sev_bg, sev_fg, sev_border = _SLATE_50, _SLATE_600, _SLATE_200
    else:
        sev_display = sev_label

    header_style = ParagraphStyle(
        "SumHdr",
        fontName="Helvetica-Bold",
        fontSize=8,
        textColor=_WHITE,
        alignment=TA_CENTER,
    )

    finding_style = ParagraphStyle(
        "Finding",
        fontName="Helvetica-Bold",
        fontSize=14,
        leading=17,
        textColor=finding_fg,
    )
    finding_sub_style = ParagraphStyle(
        "FindingSub",
        fontName="Helvetica",
        fontSize=8,
        leading=10,
        textColor=finding_fg,
    )

    data = [
        [
            Paragraph("PRIMARY AI FINDING", header_style),
            Paragraph("MODEL CONFIDENCE", header_style),
            Paragraph("AI SEVERITY", header_style),
            Paragraph("ANALYSIS MODEL", header_style),
        ],
        [
            [
                Paragraph(escape(finding_display), finding_style),
                Spacer(1, 2),
                Paragraph(escape(finding_sub), finding_sub_style),
            ],
            Paragraph(
                f'{confidence_pct}%<br/><font size="8" color="#475569">'
                f"({escape(tier)} certainty)</font>",
                ParagraphStyle(
                    "ConfCell",
                    fontName="Helvetica-Bold",
                    fontSize=16,
                    leading=19,
                    textColor=_SLATE_900,
                    alignment=TA_CENTER,
                ),
            ),
            Paragraph(
                escape(sev_display),
                ParagraphStyle(
                    "SevCell",
                    fontName="Helvetica-Bold",
                    fontSize=12,
                    leading=15,
                    textColor=sev_fg,
                    alignment=TA_CENTER,
                ),
            ),
            Paragraph(
                escape(model_version),
                ParagraphStyle(
                    "ModelCell",
                    fontName="Helvetica",
                    fontSize=9,
                    leading=12,
                    textColor=_SLATE_700,
                    alignment=TA_CENTER,
                ),
            ),
        ],
    ]

    col_w = _CONTENT_WIDTH / 4
    table = Table(data, colWidths=[col_w] * 4)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, 0), _TEAL_HEADER),
                ("BACKGROUND", (1, 0), (1, 0), _TEAL_HEADER),
                ("BACKGROUND", (2, 0), (2, 0), _TEAL_HEADER),
                ("BACKGROUND", (3, 0), (3, 0), _TEAL_HEADER),
                ("BACKGROUND", (0, 1), (0, 1), finding_bg),
                ("BACKGROUND", (1, 1), (1, 1), _WHITE),
                ("BACKGROUND", (2, 1), (2, 1), sev_bg),
                ("BACKGROUND", (3, 1), (3, 1), _SLATE_50),
                ("BOX", (0, 0), (-1, -1), 0.75, _SLATE_200),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, _SLATE_200),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ALIGN", (0, 0), (-1, 0), "CENTER"),
                ("ALIGN", (1, 1), (1, 1), "CENTER"),
                ("ALIGN", (2, 1), (2, 1), "CENTER"),
                ("ALIGN", (3, 1), (3, 1), "CENTER"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, 0), 6),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
                ("TOPPADDING", (0, 1), (-1, 1), 12),
                ("BOTTOMPADDING", (0, 1), (-1, 1), 12),
            ]
        )
    )
    return table


def _structured_ai_analysis_summary(
    prediction: str,
    confidence_pct: float,
    observed_regions: str,
    severity: str,
    clinical_suggestion: str,
    next_step: str,
    styles: dict[str, ParagraphStyle],
) -> Table:
    """Professional labeled AI Analysis Summary block for PDF reports."""
    is_abnormal = _is_abnormal_prediction(prediction)
    finding_fg = _PNEUMONIA_TEXT if is_abnormal else _NORMAL_TEXT
    finding_bg = _PNEUMONIA_BG if is_abnormal else _NORMAL_BG
    sev_label = severity.strip() or "None"
    if sev_label.lower() == "none":
        sev_display = "None"
        sev_bg, sev_fg = _SLATE_50, _SLATE_600
    else:
        sev_display = sev_label
        sev_bg, sev_fg, _ = _severity_colors(sev_label)

    label_style = ParagraphStyle(
        "AiSumLabel",
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
        textColor=_SLATE_600,
        spaceBefore=0,
        spaceAfter=2,
    )
    value_style = ParagraphStyle(
        "AiSumValue",
        fontName="Helvetica",
        fontSize=10,
        leading=13,
        textColor=_SLATE_900,
        spaceAfter=8,
    )
    prediction_style = ParagraphStyle(
        "AiSumPrediction",
        fontName="Helvetica-Bold",
        fontSize=20,
        leading=24,
        textColor=finding_fg,
        spaceAfter=0,
    )
    confidence_style = ParagraphStyle(
        "AiSumConf",
        fontName="Helvetica-Bold",
        fontSize=14,
        leading=17,
        textColor=_SLATE_900,
        spaceAfter=8,
    )

    suggestion = escape(clinical_suggestion).replace("\n", "<br/>")
    next_step_html = escape(next_step).replace("\n", "<br/>")
    conf_headline, conf_explanation = _confidence_interpretation(prediction, confidence_pct)
    conf_note = (
        "This score reflects the model's certainty in its classification, "
        "not the severity of disease."
    )

    rows = [
        [Paragraph(escape(prediction.strip().title()), prediction_style)],
        [Paragraph("CONFIDENCE", label_style)],
        [Paragraph(f"{confidence_pct}%", confidence_style)],
        [
            Paragraph(
                f"<b>{escape(conf_headline)}</b><br/>{escape(conf_explanation)}<br/>"
                f"<font size='8' color='#64748b'>{escape(conf_note)}</font>",
                value_style,
            )
        ],
        [Paragraph("AFFECTED AREA", label_style)],
        [Paragraph(escape(observed_regions).replace("\n", "<br/>"), value_style)],
        [Paragraph("SEVERITY", label_style)],
        [
            Paragraph(
                escape(sev_display),
                ParagraphStyle(
                    "AiSumSev",
                    fontName="Helvetica-Bold",
                    fontSize=11,
                    leading=14,
                    textColor=sev_fg,
                    spaceAfter=8,
                ),
            )
        ],
        [Paragraph("CLINICAL SUGGESTION", label_style)],
        [Paragraph(suggestion, value_style)],
        [Paragraph("RECOMMENDED NEXT STEP", label_style)],
        [Paragraph(next_step_html, value_style)],
    ]

    table = Table(rows, colWidths=[_CONTENT_WIDTH])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, 0), finding_bg),
                ("BACKGROUND", (0, 1), (-1, -1), _WHITE),
                ("BACKGROUND", (0, 7), (0, 7), sev_bg),
                ("BOX", (0, 0), (-1, -1), 0.75, _SLATE_200),
                ("LINEBELOW", (0, 0), (0, 0), 0.5, _SLATE_200),
                ("LEFTPADDING", (0, 0), (-1, -1), 14),
                ("RIGHTPADDING", (0, 0), (-1, -1), 14),
                ("TOPPADDING", (0, 0), (0, 0), 16),
                ("BOTTOMPADDING", (0, 0), (0, 0), 16),
                ("TOPPADDING", (0, 1), (-1, -1), 8),
                ("BOTTOMPADDING", (0, -1), (0, -1), 12),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    return table


def _clinical_impression(
    prediction: str,
    confidence_pct: float,
    severity: str,
    styles: dict[str, ParagraphStyle],
) -> Table:
    key = _prediction_key(prediction)
    sev = severity.strip()
    if key == "pneumonia":
        text = (
            f"The AI screening model classified this study as <b>pneumonia</b> with "
            f"<b>{confidence_pct}%</b> confidence ({_confidence_tier(confidence_pct).lower()}). "
        )
        if sev and sev.lower() != "none":
            text += f"Associated AI severity is graded as <b>{escape(sev)}</b>. "
        text += (
            "Correlation with clinical presentation, laboratory findings, and physician "
            "interpretation is required before treatment decisions."
        )
    elif key in {"covid", "covid-19"}:
        text = (
            f"The AI screening model classified this study as <b>COVID</b> with "
            f"<b>{confidence_pct}%</b> confidence ({_confidence_tier(confidence_pct).lower()}). "
        )
        if sev and sev.lower() != "none":
            text += f"Associated AI severity is graded as <b>{escape(sev)}</b>. "
        text += (
            "Correlation with clinical presentation, laboratory findings, and physician "
            "interpretation is required before treatment decisions."
        )
    else:
        text = (
            f"The AI screening model did not detect a pneumonia or COVID pattern in this "
            f"chest X-ray (<b>{confidence_pct}%</b> confidence for the reported class). "
            "This does not exclude other pathology; standard clinical review remains indicated."
        )
    table = Table([[Paragraph(text, styles["impression"])]], colWidths=[_CONTENT_WIDTH])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), _SLATE_50),
                ("BOX", (0, 0), (-1, -1), 0.5, _SLATE_200),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    return table


def _body_box(text: str, styles: dict[str, ParagraphStyle]) -> Table:
    table = Table([[Paragraph(text, styles["body"])]], colWidths=[_CONTENT_WIDTH])
    table.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 0.5, _SLATE_200),
                ("BACKGROUND", (0, 0), (-1, -1), _WHITE),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    return table


def _disclaimer_box(title: str, text: str, styles: dict[str, ParagraphStyle]) -> Table:
    content = (
        f'<font name="Helvetica-Bold" size="9">{escape(title)}</font><br/><br/>'
        f"{escape(text)}"
    )
    table = Table([[Paragraph(content, styles["disclaimer"])]], colWidths=[_CONTENT_WIDTH])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#fffbeb")),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#fcd34d")),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    return table


def _framed_image(
    path: Path,
    *,
    frame_w: float,
    frame_h: float,
) -> Table:
    """Center an image inside a fixed-size frame so side-by-side cells align."""
    img = _scaled_image(path, frame_w, frame_h)
    frame = Table([[img]], colWidths=[frame_w], rowHeights=[frame_h])
    frame.setStyle(
        TableStyle(
            [
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ("BACKGROUND", (0, 0), (-1, -1), _SLATE_50),
                ("BOX", (0, 0), (-1, -1), 0.4, _SLATE_200),
            ]
        )
    )
    return frame


def _image_panel_cell(
    figure_no: int,
    title: str,
    path: Path | None,
    styles: dict[str, ParagraphStyle],
    *,
    placeholder: str,
    cell_w: float,
    frame_w: float,
    frame_h: float,
) -> Table:
    """Single radiology figure as a nested table (reliable side-by-side layout)."""
    caption = Paragraph(f"<b>Figure {figure_no}.</b> {escape(title)}", styles["image_caption"])
    if path and path.is_file():
        body: Table | Paragraph = _framed_image(path, frame_w=frame_w, frame_h=frame_h)
        source = Paragraph("Source: stored study image", styles["figure_label"])
    else:
        body = Table(
            [[Paragraph(placeholder, styles["body"])]],
            colWidths=[frame_w],
            rowHeights=[frame_h],
        )
        body.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), _SLATE_50),
                    ("BOX", (0, 0), (-1, -1), 0.4, _SLATE_200),
                    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ]
            )
        )
        source = Paragraph("Source: unavailable", styles["figure_label"])

    panel = Table(
        [[caption], [Spacer(1, 6)], [body], [Spacer(1, 4)], [source]],
        colWidths=[cell_w],
    )
    panel.setStyle(
        TableStyle(
            [
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    return panel


def _build_imaging_section(
    xray_path: Path | None,
    heatmap_path: Path | None,
    styles: dict[str, ParagraphStyle],
) -> list:
    if not xray_path and not heatmap_path:
        return []

    # Two equal columns that always sit on one horizontal row.
    cell_w = (_CONTENT_WIDTH - 0.12 * inch) / 2
    frame_w = cell_w - 0.16 * inch
    frame_h = 2.55 * inch

    left = _image_panel_cell(
        1,
        "Chest radiograph (study image)",
        xray_path,
        styles,
        placeholder="Study image unavailable",
        cell_w=cell_w,
        frame_w=frame_w,
        frame_h=frame_h,
    )
    right = _image_panel_cell(
        2,
        "Grad-CAM explainability overlay",
        heatmap_path,
        styles,
        placeholder="Explainability overlay not available",
        cell_w=cell_w,
        frame_w=frame_w,
        frame_h=frame_h,
    )

    grid = Table([[left, right]], colWidths=[cell_w, cell_w])
    grid.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 0.5, _SLATE_200),
                ("LINEBEFORE", (1, 0), (1, 0), 0.5, _SLATE_200),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("BACKGROUND", (0, 0), (-1, -1), _WHITE),
            ]
        )
    )
    return [
        _section_block("Radiology Images", styles, grid),
    ]


def _build_doctor_notes_section(
    notes: list[ScanNote],
    styles: dict[str, ParagraphStyle],
) -> list:
    if not notes:
        return []

    rows: list[list[Paragraph]] = []
    for note in notes:
        author = note.doctor.name if note.doctor else f"Physician ID {note.doctor_id}"
        header = (
            f"<b>{escape(author)}</b> · "
            f"{escape(_format_datetime(note.created_at))}"
        )
        body = escape(note.note_text).replace("\n", "<br/>")
        rows.append([Paragraph(f"{header}<br/><br/>{body}", styles["body"])])

    table = Table(rows, colWidths=[_CONTENT_WIDTH])
    table.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 0.5, _SLATE_200),
                ("BACKGROUND", (0, 0), (-1, -1), _WHITE),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("LINEBELOW", (0, 0), (-1, -2), 0.25, _SLATE_200),
            ]
        )
    )
    return [
        _section_block("Physician Notes", styles, table),
    ]


def _signature_block(styles: dict[str, ParagraphStyle]) -> Table:
    line = Table([[""]], colWidths=[2.8 * inch], rowHeights=[0.01 * inch])
    line.setStyle(TableStyle([("LINEBELOW", (0, 0), (0, 0), 0.5, _SLATE_600)]))
    block = Table(
        [
            [line],
            [Paragraph("Reviewing clinician (signature)", styles["signature_label"])],
            [Paragraph("Date: _________________________", styles["signature_label"])],
        ],
        colWidths=[3 * inch],
    )
    block.setStyle(
        TableStyle(
            [
                ("TOPPADDING", (0, 1), (0, 1), 8),
                ("TOPPADDING", (0, 2), (0, 2), 4),
            ]
        )
    )
    outer = Table([[block, ""]], colWidths=[3.2 * inch, _CONTENT_WIDTH - 3.2 * inch])
    outer.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "BOTTOM")]))
    return outer


def _make_page_callbacks(scan_id: int, patient_name: str, hospital_name: str):
    report_no = _report_number(scan_id)
    patient_safe = patient_name[:40]
    org = hospital_name[:48]

    def _draw_page(canvas, doc) -> None:
        canvas.saveState()
        # Top rule on pages 2+
        if canvas.getPageNumber() > 1:
            canvas.setStrokeColor(_SLATE_200)
            canvas.setLineWidth(0.5)
            y_top = _PAGE_HEIGHT - 0.6 * inch
            canvas.line(0.75 * inch, y_top, _PAGE_WIDTH - 0.75 * inch, y_top)
            canvas.setFont("Helvetica", 7)
            canvas.setFillColor(_SLATE_500)
            canvas.drawString(
                0.75 * inch,
                y_top + 0.08 * inch,
                f"{org} · Report {report_no} · {patient_safe}",
            )

        footer_y = 0.55 * inch
        canvas.setStrokeColor(_SLATE_200)
        canvas.setLineWidth(0.5)
        canvas.line(
            0.75 * inch,
            footer_y + 0.35 * inch,
            _PAGE_WIDTH - 0.75 * inch,
            footer_y + 0.35 * inch,
        )
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(_SLATE_500)
        canvas.drawCentredString(
            _PAGE_WIDTH / 2,
            footer_y + 0.12 * inch,
            "AI-assisted screening — not a substitute for professional medical diagnosis.",
        )
        canvas.setFont("Helvetica-Bold", 7)
        canvas.setFillColor(_TEAL_HEADER)
        canvas.drawCentredString(
            _PAGE_WIDTH / 2,
            footer_y - 0.08 * inch,
            f"{org} · {report_no}",
        )
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(_SLATE_500)
        canvas.drawRightString(
            _PAGE_WIDTH - 0.75 * inch,
            footer_y - 0.28 * inch,
            f"Page {canvas.getPageNumber()}",
        )
        canvas.restoreState()

    return _draw_page


def generate_scan_report_pdf(
    scan: Scan,
    *,
    notes: list[ScanNote] | None = None,
    cfg: Settings | None = None,
) -> bytes:
    """Build a PDF report from saved scan data (no model re-inference)."""
    report_cfg = cfg or settings
    buffer = BytesIO()
    generated_at = datetime.now()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=0.75 * inch,
        leftMargin=0.75 * inch,
        topMargin=0.65 * inch,
        bottomMargin=1.0 * inch,
        title=f"XRaySense AI Report - {_report_number(scan.id)}",
    )

    styles = _styles()
    confidence_pct = round(scan.confidence * 100, 1)
    severity_display = scan.severity or "None"
    observed_regions = (
        getattr(scan, "observed_regions", None)
        or "Observed regions not recorded for this scan."
    )
    ai_findings = scan.ai_findings or "AI findings not recorded for this scan."
    follow_up = (
        scan.follow_up_recommendation
        or "Follow-up recommendation not recorded for this scan."
    )
    model_version = scan.model_version or "Not recorded"

    recommendation = scan.recommendation or "No recommendation recorded."
    if MEDICAL_DISCLAIMER in recommendation:
        recommendation = recommendation.split(MEDICAL_DISCLAIMER)[0].strip()
    rec_display = escape(recommendation).replace("\n", "<br/>")

    xray_path = _resolve_storage_path(scan.image_path)
    heatmap_path = _resolve_storage_path(scan.heatmap_path)
    if heatmap_path and heatmap_path == xray_path:
        heatmap_path = None

    report_notes = notes or []
    page_cb = _make_page_callbacks(scan.id, scan.patient_name, report_cfg.hospital_name)

    story: list = [
        _letterhead(scan.id, generated_at, styles, report_cfg),
        Spacer(1, 0.08 * inch),
        _confidential_strip(styles),
        Spacer(1, 0.1 * inch),
        _meta_strip(
            [
                ("Patient", scan.patient_name),
                ("Study ID", str(scan.id)),
                ("Study Date", _format_date(scan.created_at)),
                ("Prediction", scan.prediction),
            ],
            styles,
        ),
        Spacer(1, 0.12 * inch),
        _patient_physician_panel(scan, generated_at, styles),
    ]

    # —— Page 1: study identity + radiology images ————————————————
    imaging = _build_imaging_section(xray_path, heatmap_path, styles)
    if imaging:
        story.append(Spacer(1, 0.12 * inch))
        story.extend(imaging)

    dicom_meta = getattr(scan, "dicom_metadata", None) or {}
    if isinstance(dicom_meta, dict) and dicom_meta:
        modality = dicom_meta.get("modality") or "—"
        study_date = dicom_meta.get("study_date") or "—"
        matrix = "—"
        if dicom_meta.get("rows") and dicom_meta.get("columns"):
            matrix = f"{dicom_meta.get('rows')} × {dicom_meta.get('columns')}"
        story.append(
            _section_block(
                "DICOM Study Metadata",
                styles,
                _info_grid(
                    [
                        ("Source format", str(dicom_meta.get("source_format") or "DICOM")),
                        ("Modality", str(modality)),
                        ("DICOM study date", str(study_date)),
                        ("Body part", str(dicom_meta.get("body_part_examined") or "—")),
                        ("Matrix", matrix),
                        ("Institution", str(dicom_meta.get("institution_name") or "—")),
                    ],
                    styles,
                ),
            )
        )

    # —— Page 2: AI Analysis Summary (title + body kept together) ——
    story.append(PageBreak())
    story.append(
        _section_block(
            "AI Analysis Summary",
            styles,
            _structured_ai_analysis_summary(
                scan.prediction,
                confidence_pct,
                observed_regions,
                severity_display,
                ai_findings,
                follow_up,
                styles,
            ),
            Spacer(1, 0.1 * inch),
            _clinical_impression(scan.prediction, confidence_pct, severity_display, styles),
            Spacer(1, 0.08 * inch),
            Paragraph(
                f"<b>Analysis model:</b> {escape(model_version)}",
                styles["body"],
            ),
        )
    )

    # —— Page 3: recommendations, notices (each title stays with content) —
    story.append(PageBreak())
    story.append(
        _section_block(
            "Clinical Recommendations",
            styles,
            _clinical_recommendation_panel(rec_display, follow_up, styles),
        )
    )

    notes_block = _build_doctor_notes_section(report_notes, styles)
    if notes_block:
        story.extend(notes_block)

    story.extend(
        [
            _section_block(
                "Important Notices",
                styles,
                _disclaimer_box(
                    "Medical disclaimer",
                    f"{MEDICAL_DISCLAIMER} {AI_SCREENING_DISCLAIMER}",
                    styles,
                ),
            ),
            Spacer(1, 0.2 * inch),
            _signature_block(styles),
        ]
    )

    doc.build(story, onFirstPage=page_cb, onLaterPages=page_cb)
    return buffer.getvalue()
