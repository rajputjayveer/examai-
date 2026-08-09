"""
pdf_service.py — Premium PDF Report Generator for SecureExam AI
Uses PyMuPDF (fitz) to produce a professional A4 report with:
  • Gradient header band with logo text
  • Candidate & exam summary card
  • Animated-style score display with grade badge
  • Color-coded violation audit table (all violations, paginated)
  • Evidence snapshot gallery (4-up grid per page)
  • AI Insight section (if provided)
  • Page numbers + footer on every page
"""

import fitz
import os
from datetime import datetime
from typing import List, Optional

# ── Resolve the backend/storage/ directory correctly ─────────────────────────
# __file__ = .../backend/app/services/pdf_service.py
# dirname x1 → .../backend/app/services/
# dirname x2 → .../backend/app/
# dirname x3 → .../backend/
# join "storage" → .../backend/storage/   ← where proctoring saves files
_THIS_FILE   = os.path.abspath(__file__)
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(_THIS_FILE)))
STORAGE_DIR  = os.path.join(_BACKEND_DIR, "storage")


# ── Brand colours (R,G,B  0–1 floats) ──────────────────────────────────────
C_INDIGO      = (0.380, 0.341, 0.933)   # #6166ed  primary brand
C_PURPLE      = (0.545, 0.231, 0.929)   # #8b3bed  accent
C_DARK        = (0.059, 0.071, 0.125)   # #0f1220
C_SLATE       = (0.200, 0.247, 0.333)   # #333f55
C_MUTED       = (0.580, 0.620, 0.694)   # #949db1
C_BORDER      = (0.886, 0.910, 0.941)   # #e2e8f0
C_BG_LIGHT    = (0.973, 0.980, 0.992)   # #f8fafd
C_GREEN       = (0.133, 0.773, 0.369)   # #22c55e
C_RED         = (0.937, 0.173, 0.173)   # #ef2c2c
C_AMBER       = (0.960, 0.620, 0.067)   # #f59e11
C_BLUE        = (0.133, 0.533, 0.933)   # #2288ed
C_WHITE       = (1.0,   1.0,   1.0)


def _grade(pct: float):
    if pct >= 90: return "A+  Excellent",  C_GREEN
    if pct >= 75: return "A   Very Good",  C_GREEN
    if pct >= 60: return "B   Good",       C_BLUE
    if pct >= 45: return "C   Average",    C_AMBER
    return              "D   Needs Work",  C_RED


def _draw_header(page, page_num: int, total_pages: int):
    """Draw the gradient-style header band + footer on every page."""
    W = 595

    # Header band fill
    page.draw_rect(fitz.Rect(0, 0, W, 72),
                   color=None, fill=C_INDIGO, width=0)
    # Accent stripe
    page.draw_rect(fitz.Rect(0, 66, W, 72),
                   color=None, fill=C_PURPLE, width=0)

    # Logo text
    page.insert_text(fitz.Point(36, 36),
                     "SecureExam AI",
                     fontsize=18, fontname="helvetica-bold", color=C_WHITE)
    page.insert_text(fitz.Point(36, 56),
                     "PROCTORING ANALYSIS REPORT",
                     fontsize=8, fontname="helvetica", color=(0.85, 0.85, 1.0))

    # Generated date (top right)
    gen = f"Generated  {datetime.now().strftime('%d %b %Y  %H:%M')}"
    page.insert_text(fitz.Point(W - 200, 36),
                     gen, fontsize=8, fontname="helvetica", color=(0.85, 0.85, 1.0))

    # Footer
    page.draw_line(fitz.Point(36, 820), fitz.Point(W - 36, 820),
                   color=C_BORDER, width=0.5)
    page.insert_text(fitz.Point(36, 833),
                     "Confidential — SecureExam AI Proctoring System",
                     fontsize=7, fontname="helvetica", color=C_MUTED)
    page.insert_text(fitz.Point(W - 80, 833),
                     f"Page {page_num} of {total_pages}",
                     fontsize=7, fontname="helvetica", color=C_MUTED)


def _section_title(page, y: float, title: str):
    """Draw a section title with underline."""
    page.insert_text(fitz.Point(36, y),
                     title, fontsize=12, fontname="helvetica-bold", color=C_DARK)
    page.draw_line(fitz.Point(36, y + 6), fitz.Point(559, y + 6),
                   color=C_INDIGO, width=1.2)
    return y + 22


def _info_row(page, y: float, label: str, value: str):
    page.insert_text(fitz.Point(40, y), label,
                     fontsize=9, fontname="helvetica-bold", color=C_MUTED)
    page.insert_text(fitz.Point(170, y), value,
                     fontsize=9, fontname="helvetica", color=C_DARK)
    return y + 18


def generate_pdf_report(
    pdf_path: str,
    candidate_name: str,
    exam_title: str,
    score: float,
    total_questions: int,
    violations: List,
    started_at,
    submitted_at,
    ai_insight: Optional[str] = None,
):
    W, H = 595, 842   # A4

    # Pre-calculate page count
    # Page 1: summary + violations (up to 18 rows)
    # Extra violation pages: every 26 rows after page 1
    overflow_viols = max(0, len(violations) - 18)
    viol_extra_pages = (overflow_viols + 25) // 26 if overflow_viols > 0 else 0

    evidence_violations = [v for v in violations if v.evidence_path
                           and not str(v.evidence_path).endswith('.webm')]
    evidence_pages = (len(evidence_violations) + 3) // 4 if evidence_violations else 0

    ai_pages = 1 if ai_insight else 0
    total_pages = 1 + viol_extra_pages + evidence_pages + ai_pages

    doc = fitz.open()

    # ────────────────────────────────────────────────────────────────────
    # PAGE 1 — Summary + Violations start
    # ────────────────────────────────────────────────────────────────────
    p1 = doc.new_page(width=W, height=H)
    _draw_header(p1, 1, total_pages)

    y = 96  # start below header band

    # ── Candidate & Exam card ─────────────────────────────────────────
    y = _section_title(p1, y, "Candidate & Exam Summary")

    p1.draw_rect(fitz.Rect(36, y, 559, y + 88),
                 color=C_BORDER, fill=C_BG_LIGHT, width=0.8)

    yi = y + 18
    pct = round((score / total_questions) * 100) if total_questions > 0 else 0
    dur = ""
    if started_at and submitted_at:
        delta = submitted_at - started_at
        mins, secs = divmod(int(delta.total_seconds()), 60)
        dur = f"{mins}m {secs}s"

    rows = [
        ("Candidate Name:", candidate_name),
        ("Exam Title:",     exam_title),
        ("Started At:",     started_at.strftime('%d %b %Y  %H:%M:%S') if started_at else "N/A"),
        ("Submitted At:",   submitted_at.strftime('%d %b %Y  %H:%M:%S') if submitted_at else "N/A"),
    ]
    for lbl, val in rows:
        p1.insert_text(fitz.Point(52, yi), lbl,
                       fontsize=9, fontname="helvetica-bold", color=C_MUTED)
        p1.insert_text(fitz.Point(185, yi), val,
                       fontsize=9, fontname="helvetica", color=C_DARK)
        yi += 17

    if dur:
        p1.insert_text(fitz.Point(440, y + 18), "Duration",
                       fontsize=8, fontname="helvetica-bold", color=C_MUTED)
        p1.insert_text(fitz.Point(440, y + 34), dur,
                       fontsize=11, fontname="helvetica-bold", color=C_INDIGO)

    y += 104

    # ── Score & Grade card ────────────────────────────────────────────
    y = _section_title(p1, y, "Performance Score")

    p1.draw_rect(fitz.Rect(36, y, 559, y + 80),
                 color=C_BORDER, fill=C_BG_LIGHT, width=0.8)

    grade_label, grade_color = _grade(pct)
    score_txt = f"{int(score)} / {total_questions}"

    # Big score
    p1.insert_text(fitz.Point(56, y + 30),
                   "Score", fontsize=9, fontname="helvetica-bold", color=C_MUTED)
    p1.insert_text(fitz.Point(56, y + 58),
                   score_txt, fontsize=24, fontname="helvetica-bold", color=C_INDIGO)

    # Percentage
    p1.insert_text(fitz.Point(185, y + 30),
                   "Percentage", fontsize=9, fontname="helvetica-bold", color=C_MUTED)
    p1.insert_text(fitz.Point(185, y + 58),
                   f"{pct}%", fontsize=24, fontname="helvetica-bold", color=grade_color)

    # Grade badge box
    badge_x, badge_y = 320, y + 20
    p1.draw_rect(fitz.Rect(badge_x, badge_y, badge_x + 170, badge_y + 40),
                 color=grade_color, fill=(*grade_color[:3],), width=0)
    p1.insert_text(fitz.Point(badge_x + 12, badge_y + 27),
                   grade_label, fontsize=12, fontname="helvetica-bold", color=C_WHITE)

    # Violations count
    v_color = C_RED if len(violations) > 0 else C_GREEN
    p1.insert_text(fitz.Point(badge_x, y + 72),
                   f"Violations Logged: {len(violations)}",
                   fontsize=9, fontname="helvetica-bold", color=v_color)

    y += 96

    # ── Score progress bar ────────────────────────────────────────────
    bar_x0, bar_y, bar_x1 = 36, y, 559
    p1.draw_rect(fitz.Rect(bar_x0, bar_y, bar_x1, bar_y + 8),
                 color=C_BORDER, fill=C_BORDER, width=0)
    fill_w = max(0, int((pct / 100) * (bar_x1 - bar_x0)))
    _, bar_color = _grade(pct)
    p1.draw_rect(fitz.Rect(bar_x0, bar_y, bar_x0 + fill_w, bar_y + 8),
                 color=bar_color, fill=bar_color, width=0)

    y += 22

    # ── Violations Audit Table ────────────────────────────────────────
    y = _section_title(p1, y, "Violation Events Audit Trail")

    if not violations:
        p1.draw_rect(fitz.Rect(36, y, 559, y + 40),
                     color=C_BORDER, fill=(0.94, 1.0, 0.96), width=0.8)
        p1.insert_text(fitz.Point(52, y + 24),
                       "No proctoring violations recorded — Exam session was clean.",
                       fontsize=10, fontname="helvetica", color=C_GREEN)
        y += 56
    else:
        # Table header
        p1.draw_rect(fitz.Rect(36, y, 559, y + 18),
                     color=None, fill=C_INDIGO, width=0)
        for col_x, col_lbl in [(42, "#"), (68, "Type"), (210, "Description"), (455, "Time")]:
            p1.insert_text(fitz.Point(col_x, y + 13),
                           col_lbl, fontsize=8, fontname="helvetica-bold", color=C_WHITE)
        y += 20

        page_ptr = p1
        page_num_ptr = 1
        row_limit = 18  # rows on first page

        for i, v in enumerate(violations):
            # Overflow → new page
            if i == row_limit or (i > row_limit and (i - row_limit) % 26 == 0):
                page_num_ptr += 1
                page_ptr = doc.new_page(width=W, height=H)
                _draw_header(page_ptr, page_num_ptr, total_pages)
                y = 96
                _section_title(page_ptr, y - 16, "Violation Events (continued)")
                # Re-draw column header
                page_ptr.draw_rect(fitz.Rect(36, y, 559, y + 18),
                                   color=None, fill=C_INDIGO, width=0)
                for col_x, col_lbl in [(42, "#"), (68, "Type"), (210, "Description"), (455, "Time")]:
                    page_ptr.insert_text(fitz.Point(col_x, y + 13),
                                         col_lbl, fontsize=8, fontname="helvetica-bold", color=C_WHITE)
                y += 20

            # Alternating row background
            row_bg = C_BG_LIGHT if i % 2 == 0 else C_WHITE
            page_ptr.draw_rect(fitz.Rect(36, y, 559, y + 18),
                               color=C_BORDER, fill=row_bg, width=0.4)

            # Row number
            page_ptr.insert_text(fitz.Point(42, y + 13), str(i + 1),
                                  fontsize=8, fontname="helvetica", color=C_MUTED)

            # Violation type pill
            type_str = v.type.replace("_", " ").upper()
            page_ptr.insert_text(fitz.Point(68, y + 13), type_str,
                                  fontsize=8, fontname="helvetica-bold", color=C_RED)

            # Description
            desc = f"Proctoring flag: {v.type.replace('_', ' ')}"
            page_ptr.insert_text(fitz.Point(210, y + 13), desc[:52],
                                  fontsize=8, fontname="helvetica", color=C_DARK)

            # Timestamp
            ts = v.created_at.strftime('%H:%M:%S') if v.created_at else "N/A"
            page_ptr.insert_text(fitz.Point(455, y + 13), ts,
                                  fontsize=8, fontname="helvetica", color=C_MUTED)

            y += 18

    # ────────────────────────────────────────────────────────────────────
    # EVIDENCE SNAPSHOT PAGES (4-up grid)
    # ────────────────────────────────────────────────────────────────────
    if evidence_violations:
        for chunk_idx in range(0, len(evidence_violations), 4):
            page_num_ptr = doc.page_count + 1
            ev_page = doc.new_page(width=W, height=H)
            _draw_header(ev_page, page_num_ptr, total_pages)

            ev_page.insert_text(fitz.Point(36, 96),
                                 "Evidence Snapshot Gallery",
                                 fontsize=12, fontname="helvetica-bold", color=C_DARK)
            ev_page.draw_line(fitz.Point(36, 102), fitz.Point(559, 102),
                               color=C_INDIGO, width=1.2)

            chunk = evidence_violations[chunk_idx:chunk_idx + 4]
            grid = [
                fitz.Rect(44,  116, 288, 300),
                fitz.Rect(307, 116, 551, 300),
                fitz.Rect(44,  336, 288, 520),
                fitz.Rect(307, 336, 551, 520),
            ]

            for i, v in enumerate(chunk):
                rect = grid[i]
                full_path = os.path.join(
                    STORAGE_DIR,
                    v.evidence_path.replace("/", os.sep)
                )

                # Image border with rounded corners feel
                ev_page.draw_rect(rect, color=C_INDIGO, fill=C_BG_LIGHT, width=1.2)

                if os.path.exists(full_path):
                    try:
                        ev_page.insert_image(rect.inflate(-4), filename=full_path)
                    except Exception as img_err:
                        ev_page.insert_text(
                            fitz.Point(rect.x0 + 10, rect.y0 + 80),
                            "Image unavailable", fontsize=9,
                            fontname="helvetica", color=C_MUTED
                        )
                else:
                    ev_page.insert_text(
                        fitz.Point(rect.x0 + 10, rect.y0 + 80),
                        "Snapshot not found", fontsize=9,
                        fontname="helvetica", color=C_MUTED
                    )

                # Caption strip below image
                lbl_y = rect.y1 + 4
                ts = v.created_at.strftime('%H:%M:%S') if v.created_at else "N/A"
                ev_page.draw_rect(fitz.Rect(rect.x0, lbl_y, rect.x1, lbl_y + 28),
                                   color=C_BORDER, fill=C_BG_LIGHT, width=0.5)
                ev_page.insert_text(fitz.Point(rect.x0 + 6, lbl_y + 12),
                                     v.type.replace("_", " ").upper(),
                                     fontsize=8, fontname="helvetica-bold", color=C_RED)
                ev_page.insert_text(fitz.Point(rect.x0 + 6, lbl_y + 24),
                                     f"Logged at {ts}",
                                     fontsize=7, fontname="helvetica", color=C_MUTED)

    # ────────────────────────────────────────────────────────────────────
    # AI INSIGHT PAGE (if available)
    # ────────────────────────────────────────────────────────────────────
    if ai_insight:
        ai_pg_num = doc.page_count + 1
        ai_page = doc.new_page(width=W, height=H)
        _draw_header(ai_page, ai_pg_num, total_pages)

        y = 100
        ai_page.insert_text(fitz.Point(36, y),
                             "AI Mentor Insights",
                             fontsize=12, fontname="helvetica-bold", color=C_DARK)
        ai_page.draw_line(fitz.Point(36, y + 6), fitz.Point(559, y + 6),
                           color=C_INDIGO, width=1.2)
        y += 24

        # Insight card box
        ai_page.draw_rect(fitz.Rect(36, y, 559, y + 14),
                           color=None, fill=C_INDIGO, width=0)
        ai_page.insert_text(fitz.Point(44, y + 10),
                             "Powered by Google Gemini AI",
                             fontsize=8, fontname="helvetica-bold", color=C_WHITE)
        y += 18

        # Word-wrap insight text into 85-char lines
        words = ai_insight.split()
        lines = []
        line = ""
        for w in words:
            if len(line) + len(w) + 1 > 85:
                lines.append(line)
                line = w
            else:
                line = (line + " " + w).strip()
        if line:
            lines.append(line)

        box_h = max(80, len(lines) * 16 + 24)
        ai_page.draw_rect(fitz.Rect(36, y, 559, y + box_h),
                           color=C_BORDER, fill=C_BG_LIGHT, width=0.8)

        ty = y + 18
        for ln in lines:
            ai_page.insert_text(fitz.Point(48, ty), ln,
                                  fontsize=9, fontname="helvetica", color=C_DARK)
            ty += 16

        y += box_h + 16
        ai_page.insert_text(fitz.Point(36, y),
                             "Note: AI insights are generated automatically and are for guidance only.",
                             fontsize=7, fontname="helvetica", color=C_MUTED)

    doc.save(pdf_path)
    doc.close()
