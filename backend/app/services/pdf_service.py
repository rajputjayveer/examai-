import fitz
import os
from datetime import datetime
from typing import List

# Resolve evidence directories relative to backend root
STORAGE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def generate_pdf_report(
    pdf_path: str,
    candidate_name: str,
    exam_title: str,
    score: float,
    total_questions: int,
    violations: List,
    started_at: datetime,
    submitted_at: datetime
):
    """
    Generate a detailed proctoring analysis PDF report using PyMuPDF (fitz).
    Features:
    - Custom header and page layout styling
    - Candidate performance report card (Score, duration, dates)
    - Detailed violation activity table
    - Embedded evidence snapshots captured by proctoring cameras
    """
    doc = fitz.open()
    
    # ── Page 1: General Info & Summary ─────────────────────────────────────────
    page1 = doc.new_page(width=595, height=842) # A4 format
    
    # Draw Background banner (Light Slate Accent)
    page1.draw_rect(fitz.Rect(0, 0, 595, 120), color=(0.145, 0.388, 0.965), fill=(0.937, 0.960, 1.0), width=0)
    
    # Header Title
    page1.insert_text(fitz.Point(36, 50), "ExamGuard AI", fontsize=24, fontname="helvetica-bold", color=(0.145, 0.388, 0.965))
    page1.insert_text(fitz.Point(36, 75), "PROCTORING ANALYSIS REPORT", fontsize=10, fontname="helvetica", color=(0.274, 0.352, 0.470))
    
    # Date Stamp
    page1.insert_text(fitz.Point(400, 75), f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}", fontsize=9, fontname="helvetica", color=(0.474, 0.525, 0.611))
    
    # Candidate details section header
    page1.insert_text(fitz.Point(36, 160), "Candidate & Exam Summary", fontsize=14, fontname="helvetica-bold", color=(0.090, 0.121, 0.203))
    page1.draw_line(fitz.Point(36, 172), fitz.Point(559, 172), color=(0.886, 0.910, 0.941), width=1)
    
    # Info list layout
    infos = [
        ("Candidate Name:", candidate_name),
        ("Exam Title:", exam_title),
        ("Started At:", started_at.strftime('%Y-%m-%d %H:%M:%S') if started_at else 'N/A'),
        ("Submitted At:", submitted_at.strftime('%Y-%m-%d %H:%M:%S') if submitted_at else 'N/A'),
    ]
    
    y = 195
    for label, val in infos:
        page1.insert_text(fitz.Point(40, y), label, fontsize=10, fontname="helvetica-bold", color=(0.372, 0.447, 0.564))
        page1.insert_text(fitz.Point(160, y), val, fontsize=10, fontname="helvetica", color=(0.090, 0.121, 0.203))
        y += 22
        
    # Performance Report Card Frame
    page1.draw_rect(fitz.Rect(36, 290, 559, 390), color=(0.886, 0.910, 0.941), fill=(0.984, 0.988, 0.992), width=1)
    
    # Score details
    page1.insert_text(fitz.Point(56, 335), "Exam Score", fontsize=11, fontname="helvetica-bold", color=(0.372, 0.447, 0.564))
    pct = round((score / total_questions) * 100) if total_questions > 0 else 0
    score_txt = f"{score} / {total_questions} ({pct}% Correct)"
    page1.insert_text(fitz.Point(56, 360), score_txt, fontsize=18, fontname="helvetica-bold", color=(0.145, 0.388, 0.965))
    
    # Total violations count
    page1.insert_text(fitz.Point(340, 335), "Total Violations Logged", fontsize=11, fontname="helvetica-bold", color=(0.372, 0.447, 0.564))
    v_color = (0.862, 0.149, 0.149) if len(violations) > 0 else (0.062, 0.607, 0.384)
    page1.insert_text(fitz.Point(340, 360), str(len(violations)), fontsize=18, fontname="helvetica-bold", color=v_color)
    
    # Violations Log table header
    page1.insert_text(fitz.Point(36, 425), "Violation Events Audit Trail", fontsize=14, fontname="helvetica-bold", color=(0.090, 0.121, 0.203))
    page1.draw_line(fitz.Point(36, 437), fitz.Point(559, 437), color=(0.886, 0.910, 0.941), width=1)
    
    if len(violations) == 0:
        page1.insert_text(fitz.Point(40, 465), "No proctoring violations recorded during the exam session.", fontsize=10, fontname="helvetica", color=(0.372, 0.447, 0.564))
    else:
        # Draw table headers
        page1.draw_rect(fitz.Rect(36, 450, 559, 470), color=(0.886, 0.910, 0.941), fill=(0.949, 0.960, 0.972), width=1)
        page1.insert_text(fitz.Point(42, 463), "Type", fontsize=9, fontname="helvetica-bold", color=(0.274, 0.352, 0.470))
        page1.insert_text(fitz.Point(170, 463), "Description", fontsize=9, fontname="helvetica-bold", color=(0.274, 0.352, 0.470))
        page1.insert_text(fitz.Point(460, 463), "Timestamp", fontsize=9, fontname="helvetica-bold", color=(0.274, 0.352, 0.470))
        
        y = 485
        # Print up to top 10 violations on page 1 (overflow logic)
        for v in violations[:10]:
            page1.insert_text(fitz.Point(42, y), v.type.upper(), fontsize=9, fontname="helvetica-bold", color=(0.862, 0.149, 0.149))
            desc = f"Candidate warning logged for: {v.type.replace('_', ' ')}"
            page1.insert_text(fitz.Point(170, y), desc[:52], fontsize=9, fontname="helvetica", color=(0.090, 0.121, 0.203))
            ts = v.created_at.strftime('%H:%M:%S') if v.created_at else 'N/A'
            page1.insert_text(fitz.Point(460, y), ts, fontsize=9, fontname="helvetica", color=(0.474, 0.525, 0.611))
            page1.draw_line(fitz.Point(36, y + 5), fitz.Point(559, y + 5), color=(0.949, 0.960, 0.972), width=1)
            y += 22

    # ── Page 2+: Evidence Snapshot Gallery ──────────────────────────────────────
    evidence_violations = [v for v in violations if v.evidence_path]
    
    if len(evidence_violations) > 0:
        # Group snapshot frames in sets of 4 per page
        for chunk_idx in range(0, len(evidence_violations), 4):
            page = doc.new_page(width=595, height=842)
            
            # Header
            page.draw_rect(fitz.Rect(0, 0, 595, 50), color=(0.145, 0.388, 0.965), fill=(0.937, 0.960, 1.0), width=0)
            page.insert_text(fitz.Point(36, 30), "ExamGuard AI — Proctoring Evidence Snapshots", fontsize=12, fontname="helvetica-bold", color=(0.145, 0.388, 0.965))
            
            chunk = evidence_violations[chunk_idx:chunk_idx+4]
            grid_positions = [
                fitz.Rect(50,  90,  280, 240), # Top-Left
                fitz.Rect(315, 90,  545, 240), # Top-Right
                fitz.Rect(50,  300, 280, 450), # Bottom-Left
                fitz.Rect(315, 300, 545, 450)  # Bottom-Right
            ]
            
            for i, v in enumerate(chunk):
                full_img_path = os.path.join(STORAGE_DIR, "storage", v.evidence_path.replace("/", os.sep))
                rect = grid_positions[i]
                
                # Draw photo border box
                page.draw_rect(rect, color=(0.886, 0.910, 0.941), fill=(0.984, 0.988, 0.992), width=1)
                
                if os.path.exists(full_img_path):
                    try:
                        page.insert_image(rect, filename=full_img_path)
                    except Exception as img_err:
                        print("Failed inserting image to PDF document:", img_err)
                else:
                    # Missing image placeholder fallback text
                    page.insert_text(fitz.Point(rect.x0 + 10, rect.y0 + 70), "Evidence Snapshot Missing", fontsize=9, fontname="helvetica", color=(0.474, 0.525, 0.611))
                
                # Snapshot description label
                lbl_y = rect.y1 + 18
                ts = v.created_at.strftime('%Y-%m-%d %H:%M:%S') if v.created_at else 'N/A'
                page.insert_text(fitz.Point(rect.x0, lbl_y), f"Type: {v.type.upper()}", fontsize=9, fontname="helvetica-bold", color=(0.862, 0.149, 0.149))
                page.insert_text(fitz.Point(rect.x0, lbl_y + 12), f"Time: {ts}", fontsize=8, fontname="helvetica", color=(0.274, 0.352, 0.470))

    # Save generated report
    doc.save(pdf_path)
    doc.close()
