from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet
from datetime import datetime

def generate_pdf_report(pdf_path: str, candidate_name: str, exam_title: str, score: float, violations_count: int, started_at: datetime, submitted_at: datetime):
    doc = SimpleDocTemplate(pdf_path)
    styles = getSampleStyleSheet()
    
    content = [
        Paragraph("ExamGuard AI Monitoring Report", styles["Title"]),
        Spacer(1, 20),
        Paragraph(f"Candidate: {candidate_name}", styles["Normal"]),
        Paragraph(f"Exam: {exam_title}", styles["Normal"]),
        Paragraph(f"Score: {score}", styles["Normal"]),
        Paragraph(f"Total Proctoring Violations: {violations_count}", styles["Normal"]),
        Paragraph(f"Started At: {started_at.strftime('%Y-%m-%d %H:%M:%S') if started_at else 'N/A'}", styles["Normal"]),
        Paragraph(f"Submitted At: {submitted_at.strftime('%Y-%m-%d %H:%M:%S') if submitted_at else 'N/A'}", styles["Normal"]),
        Spacer(1, 20),
        Paragraph("Report Generated Successfully", styles["Heading2"])
    ]
    
    doc.build(content)
