"""Health knowledge base articles for the XRaySense AI Health Assistant."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class KnowledgeArticle:
    id: str
    topic: str
    title: str
    summary: str
    content: str
    keywords: tuple[str, ...]


KNOWLEDGE_ARTICLES: tuple[KnowledgeArticle, ...] = (
    KnowledgeArticle(
        id="pneumonia",
        topic="Pneumonia",
        title="Understanding Pneumonia",
        summary="Pneumonia is an infection that inflames air sacs in one or both lungs.",
        content=(
            "Pneumonia is an infection of the lungs that can cause fever, cough, "
            "shortness of breath, and chest discomfort. On a chest X-ray, pneumonia "
            "may appear as areas of increased opacity (whiteness). XRaySense AI "
            "provides a screening label only—it does not confirm a clinical diagnosis. "
            "A qualified clinician must interpret symptoms, exam findings, and imaging "
            "together. Treatment decisions (including antibiotics) are made only by "
            "licensed healthcare professionals."
        ),
        keywords=("pneumonia", "infection", "opacity", "lung infection", "what is pneumonia"),
    ),
    KnowledgeArticle(
        id="chest-xray",
        topic="Chest X-ray",
        title="Chest X-ray Basics",
        summary="A chest X-ray is an imaging study used to view the lungs, heart, and chest wall.",
        content=(
            "A chest X-ray uses a small amount of radiation to create an image of the "
            "chest. Radiologists look for patterns such as clear lung fields, opacity, "
            "fluid, or other abnormalities. XRaySense AI analyzes a digital chest "
            "X-ray with a trained screening model (EfficientNetB0) and may produce a "
            "Grad-CAM heatmap to show which regions influenced the model's decision. "
            "The heatmap is an explainability tool, not a map of proven disease."
        ),
        keywords=("x-ray", "xray", "chest x-ray", "imaging", "radiograph", "grad-cam", "heatmap"),
    ),
    KnowledgeArticle(
        id="recovery",
        topic="Recovery",
        title="Recovery Guidance (General Education)",
        summary="General recovery tips that support healing alongside clinician-directed care.",
        content=(
            "Recovery needs vary widely. General supportive measures often discussed "
            "with clinicians include rest, adequate hydration, following prescribed "
            "care plans, monitoring fever or breathing changes, and attending follow-up "
            "visits. This assistant cannot prescribe medicines or create a personal "
            "treatment plan. Always follow your doctor's instructions for recovery."
        ),
        keywords=("recovery", "heal", "get better", "rest", "recovering", "feeling better"),
    ),
    KnowledgeArticle(
        id="prevention",
        topic="Prevention",
        title="Prevention Tips",
        summary="Practical ways to reduce respiratory infection risk.",
        content=(
            "Helpful prevention habits include hand hygiene, avoiding close contact "
            "with people who are ill when possible, not smoking, managing chronic "
            "conditions with your clinician, and seeking care early when symptoms "
            "worsen. Prevention advice here is educational and not personalized "
            "medical counseling."
        ),
        keywords=("prevention", "prevent", "avoid", "reduce risk", "hygiene"),
    ),
    KnowledgeArticle(
        id="vaccination",
        topic="Vaccination",
        title="Vaccination Education",
        summary="Vaccines can help prevent some causes of pneumonia and related illness.",
        content=(
            "Vaccines such as pneumococcal and influenza vaccines may reduce risk of "
            "certain respiratory illnesses for eligible people. Vaccine choices depend "
            "on age, medical history, and clinician guidance. This assistant cannot "
            "decide which vaccines you should receive—ask your healthcare provider."
        ),
        keywords=("vaccine", "vaccination", "immunization", "flu shot", "pneumococcal"),
    ),
    KnowledgeArticle(
        id="healthy-lifestyle",
        topic="Healthy Lifestyle",
        title="Healthy Lifestyle Tips",
        summary="Lifestyle habits that support lung and overall health.",
        content=(
            "Supportive lifestyle habits include balanced nutrition, regular physical "
            "activity as advised by your clinician, adequate sleep, stress management, "
            "and avoiding tobacco smoke. These tips are general wellness education and "
            "do not replace individualized medical advice."
        ),
        keywords=("lifestyle", "healthy", "exercise", "diet", "sleep", "wellness", "nutrition"),
    ),
    KnowledgeArticle(
        id="emergency-symptoms",
        topic="Emergency Symptoms",
        title="When to Seek Emergency Care",
        summary="Some breathing and chest symptoms require immediate emergency care.",
        content=(
            "Seek emergency care immediately for severe difficulty breathing, very low "
            "oxygen readings, sudden severe chest pain, blue lips or face, confusion, "
            "fainting, or inability to speak full sentences due to breathlessness. "
            "Call your local emergency number. This AI assistant cannot provide "
            "emergency triage or replace emergency services."
        ),
        keywords=("emergency", "can't breathe", "chest pain", "oxygen", "urgent", "911"),
    ),
    KnowledgeArticle(
        id="faq",
        topic="Frequently Asked Questions",
        title="Frequently Asked Questions",
        summary="Common questions about XRaySense AI screening reports.",
        content=(
            "Q: Does XRaySense AI diagnose pneumonia?\n"
            "A: No. It provides AI-assisted screening to support clinician review.\n\n"
            "Q: What does confidence mean?\n"
            "A: Confidence is how strongly the model favored the screening label on "
            "this image—it is not a clinical certainty.\n\n"
            "Q: What is Grad-CAM?\n"
            "A: A visual explanation overlay showing regions that influenced the "
            "model's decision; it does not prove disease location.\n\n"
            "Q: Can this assistant prescribe medicine?\n"
            "A: No. Only a licensed clinician can diagnose and prescribe."
        ),
        keywords=("faq", "question", "confidence", "diagnose", "prescribe", "what does"),
    ),
)


def list_knowledge_topics() -> list[dict[str, str]]:
    return [
        {
            "id": article.id,
            "topic": article.topic,
            "title": article.title,
            "summary": article.summary,
        }
        for article in KNOWLEDGE_ARTICLES
    ]


def get_article_by_id(article_id: str) -> KnowledgeArticle | None:
    for article in KNOWLEDGE_ARTICLES:
        if article.id == article_id:
            return article
    return None


def select_relevant_knowledge(question: str, *, max_articles: int = 3) -> list[KnowledgeArticle]:
    """Rank knowledge articles by keyword overlap with the patient question."""
    lower = question.lower()
    scored: list[tuple[int, KnowledgeArticle]] = []
    for article in KNOWLEDGE_ARTICLES:
        score = 0
        for keyword in article.keywords:
            if keyword.lower() in lower:
                score += 2 if len(keyword) > 4 else 1
        if article.topic.lower() in lower:
            score += 3
        if score > 0:
            scored.append((score, article))

    scored.sort(key=lambda item: item[0], reverse=True)
    if scored:
        return [article for _, article in scored[:max_articles]]

    # Default educational context when no keyword match
    defaults = ("pneumonia", "chest-xray", "faq")
    return [article for article in KNOWLEDGE_ARTICLES if article.id in defaults]


def format_knowledge_for_prompt(articles: list[KnowledgeArticle]) -> str:
    if not articles:
        return "No knowledge articles selected."
    parts: list[str] = []
    for article in articles:
        parts.append(
            f"### {article.title} ({article.topic})\n"
            f"{article.content}"
        )
    return "\n\n".join(parts)
