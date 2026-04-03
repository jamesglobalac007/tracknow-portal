from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, cm
from reportlab.lib.colors import HexColor, black, white
from reportlab.pdfgen import canvas
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import Paragraph, Frame
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
import os

OUTPUT = "/sessions/amazing-eager-bell/mnt/Projects--TrackNow/TrackNow-Portal-Proposal.pdf"
W, H = A4  # 595.27 x 841.89

# ── Colours ──
BLACK = HexColor("#000000")
DARK = HexColor("#0a0a0a")
DARK2 = HexColor("#111111")
DARK3 = HexColor("#1a1a1a")
ORANGE = HexColor("#FFA028")
ORANGE_LIGHT = HexColor("#FFB84D")
GREEN = HexColor("#00CC66")
WHITE = HexColor("#FFFFFF")
GREY = HexColor("#888888")
GREY_LIGHT = HexColor("#AAAAAA")
GREY_DIM = HexColor("#555555")

def draw_bg(c, page_h=H):
    c.setFillColor(BLACK)
    c.rect(0, 0, W, page_h, fill=1, stroke=0)

def draw_header_bar(c, y):
    c.setFillColor(ORANGE)
    c.rect(0, y, W, 3, fill=1, stroke=0)

def draw_footer(c):
    c.setFillColor(DARK2)
    c.rect(0, 0, W, 40, fill=1, stroke=0)
    c.setFillColor(GREY_DIM)
    c.setFont("Helvetica", 7)
    c.drawCentredString(W/2, 18, "Designed by MDS Diversified Pty Ltd | ABN Pending")
    c.drawCentredString(W/2, 9, "Confidential — For intended recipient only | © 2026 MDS Diversified Pty Ltd")

def orange_line(c, x, y, w):
    c.setStrokeColor(ORANGE)
    c.setLineWidth(1.5)
    c.line(x, y, x + w, y)

def section_box(c, x, y, w, h, title, items, highlight_last=False):
    """Draw a dark card with title and bullet items."""
    # Card bg
    c.setFillColor(DARK2)
    c.roundRect(x, y, w, h, 4, fill=1, stroke=0)
    # Left accent
    c.setFillColor(ORANGE)
    c.rect(x, y, 3, h, fill=1, stroke=0)
    # Title
    c.setFillColor(ORANGE)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(x + 14, y + h - 22, title)
    # Separator
    c.setStrokeColor(DARK3)
    c.setLineWidth(0.5)
    c.line(x + 14, y + h - 28, x + w - 14, y + h - 28)
    # Items
    c.setFont("Helvetica", 9)
    ty = y + h - 44
    for i, item in enumerate(items):
        if highlight_last and i == len(items) - 1:
            c.setFillColor(GREEN)
            c.setFont("Helvetica-Bold", 9)
        else:
            c.setFillColor(GREY_LIGHT)
            c.setFont("Helvetica", 9)
        c.drawString(x + 20, ty, "›  " + item)
        ty -= 16

def price_row(c, y, label, amount, bold=False):
    font = "Helvetica-Bold" if bold else "Helvetica"
    c.setFont(font, 10 if not bold else 11)
    c.setFillColor(WHITE if bold else GREY_LIGHT)
    c.drawString(60, y, label)
    c.drawRightString(W - 60, y, amount)

# ═══════════════════════════════════════════════════════════════
# PAGE 1 — Cover
# ═══════════════════════════════════════════════════════════════
c = canvas.Canvas(OUTPUT, pagesize=A4)

draw_bg(c)

# Top accent line
c.setFillColor(ORANGE)
c.rect(0, H - 4, W, 4, fill=1, stroke=0)

# Phase 1 banner
c.setFillColor(HexColor("#0d1a0d"))
c.roundRect(50, H - 55, W - 100, 36, 4, fill=1, stroke=0)
c.setStrokeColor(GREEN)
c.setLineWidth(1)
c.roundRect(50, H - 55, W - 100, 36, 4, fill=0, stroke=1)
c.setFillColor(GREEN)
c.setFont("Helvetica-Bold", 11)
c.drawCentredString(W/2, H - 42, "PHASE 1 BUILD COMPLETE  |  $7,500 + GST Due & Payable  |  Separate Invoice to Be Sent")

# Logo / Brand area
y = H - 120
c.setFillColor(ORANGE)
c.setFont("Helvetica-Bold", 36)
c.drawString(50, y, "TrackNow")
c.setFillColor(GREY)
c.setFont("Helvetica", 12)
c.drawString(50, y - 22, "GPS Fleet Tracking Solutions")

# Divider
orange_line(c, 50, y - 45, 180)

# Proposal title
y2 = y - 100
c.setFillColor(WHITE)
c.setFont("Helvetica-Bold", 28)
c.drawString(50, y2, "Sales & Marketing Portal")
c.setFont("Helvetica-Bold", 28)
c.drawString(50, y2 - 36, "Build Proposal")

# Subtitle
c.setFillColor(GREY)
c.setFont("Helvetica", 13)
c.drawString(50, y2 - 75, "Custom-built digital sales platform for TrackNow's")
c.drawString(50, y2 - 92, "GPS fleet tracking sales operations across Australia")

# Date / Prepared for box
box_y = y2 - 200
c.setFillColor(DARK2)
c.roundRect(50, box_y, 260, 80, 4, fill=1, stroke=0)
c.setFillColor(ORANGE)
c.rect(50, box_y, 3, 80, fill=1, stroke=0)

c.setFillColor(GREY_DIM)
c.setFont("Helvetica", 8)
c.drawString(66, box_y + 62, "PREPARED FOR")
c.setFillColor(WHITE)
c.setFont("Helvetica-Bold", 13)
c.drawString(66, box_y + 42, "Mark Speelmeyer")
c.setFillColor(GREY_LIGHT)
c.setFont("Helvetica", 10)
c.drawString(66, box_y + 24, "TrackNow Pty Ltd")
c.setFillColor(GREY_DIM)
c.setFont("Helvetica", 9)
c.drawString(66, box_y + 8, "April 2026")

# Right side - prepared by
box2_y = box_y
c.setFillColor(DARK2)
c.roundRect(330, box2_y, 220, 80, 4, fill=1, stroke=0)
c.setFillColor(ORANGE)
c.rect(330, box2_y, 3, 80, fill=1, stroke=0)

c.setFillColor(GREY_DIM)
c.setFont("Helvetica", 8)
c.drawString(346, box2_y + 62, "PREPARED BY")
c.setFillColor(WHITE)
c.setFont("Helvetica-Bold", 13)
c.drawString(346, box2_y + 42, "MDS Diversified Pty Ltd")
c.setFillColor(GREY_LIGHT)
c.setFont("Helvetica", 10)
c.drawString(346, box2_y + 24, "MDS Diversified Pty Ltd")
c.setFillColor(GREY_DIM)
c.setFont("Helvetica", 9)
c.drawString(346, box2_y + 8, "ABN Pending")

# Confidential badge
c.setFillColor(HexColor("#1a1a1a"))
c.roundRect(50, 70, 120, 24, 3, fill=1, stroke=0)
c.setStrokeColor(GREY_DIM)
c.setLineWidth(0.5)
c.roundRect(50, 70, 120, 24, 3, fill=0, stroke=1)
c.setFillColor(GREY_DIM)
c.setFont("Helvetica-Bold", 8)
c.drawCentredString(110, 78, "CONFIDENTIAL")

draw_footer(c)
c.showPage()

# ═══════════════════════════════════════════════════════════════
# PAGE 2 — Project Overview
# ═══════════════════════════════════════════════════════════════
draw_bg(c)
draw_header_bar(c, H - 3)
draw_footer(c)

y = H - 45
c.setFillColor(ORANGE)
c.setFont("Helvetica-Bold", 20)
c.drawString(50, y, "Project Overview")
orange_line(c, 50, y - 10, 140)

# Intro paragraph
c.setFillColor(GREY_LIGHT)
c.setFont("Helvetica", 10)
lines = [
    "MDS Diversified will design, develop, and deploy a custom Sales & Marketing Portal",
    "for TrackNow — a single-page web application purpose-built to accelerate GPS fleet",
    "tracking sales operations across Australia. The portal consolidates lead generation,",
    "pipeline management, customer tracking, and sales tools into one unified platform.",
]
ty = y - 40
for line in lines:
    c.drawString(50, ty, line)
    ty -= 16

# What's Included section
ty -= 30
section_box(c, 50, ty - 160, 240, 160, "Core Platform", [
    "Secure login with role-based access",
    "Interactive sales dashboard",
    "Drag-and-drop pipeline board",
    "Customer management system",
    "Lead scraper database (500+ leads)",
    "Analytics & reporting charts",
    "Mobile-responsive design",
])

section_box(c, 300, ty - 160, 250, 160, "Sales Tools & Calculators", [
    "GPS Quote Calculator",
    "Fuel Savings Calculator",
    "Insurance Savings Calculator",
    "Finance Savings Calculator",
    "Full ROI Summary Engine",
    "Hidden Cost & Fraud Calculator",
    "Deal P&L / Breakeven Analyser",
])

ty2 = ty - 185
section_box(c, 50, ty2 - 130, 240, 130, "Revenue & Commission", [
    "Commission calculator engine",
    "Deal P&L with 24-month projection",
    "Breakeven month identification",
    "Competitor pricing comparison",
    "Free hardware promo modelling",
])

section_box(c, 300, ty2 - 130, 250, 130, "Marketing & Resources", [
    "Cold call scripts (industry-specific)",
    "Email templates library",
    "Objection handler with responses",
    "Marketing Hub for campaigns",
    "Competitor intelligence data",
])

# Bottom highlight
ty3 = ty2 - 152
c.setFillColor(DARK2)
c.roundRect(50, ty3, 500, 36, 4, fill=1, stroke=0)
c.setFillColor(GREEN)
c.setFont("Helvetica-Bold", 10)
c.drawCentredString(W/2, ty3 + 13, "Hosted live on Render.com with auto-deploy from GitHub  —  Always up to date")

# Important Notice — Design scope disclaimer
ty4 = ty3 - 50
c.setFillColor(DARK2)
c.roundRect(50, ty4 - 100, 500, 100, 4, fill=1, stroke=0)
c.setFillColor(HexColor("#dc2626"))
c.rect(50, ty4 - 100, 3, 100, fill=1, stroke=0)
c.setFillColor(HexColor("#dc2626"))
c.setFont("Helvetica-Bold", 10)
c.drawString(66, ty4 - 18, "IMPORTANT NOTICE")
c.setStrokeColor(DARK3)
c.setLineWidth(0.5)
c.line(66, ty4 - 24, 536, ty4 - 24)
c.setFillColor(GREY_LIGHT)
c.setFont("Helvetica", 9)
notice_lines = [
    "MDS Diversified is a portal design and development company only. We are not a data",
    "storage provider, cyber security provider, IT infrastructure company, or managed",
    "services provider. All data entered into this portal is managed, owned, and maintained",
    "by TrackNow. TrackNow is solely responsible for the accuracy, security, backup, and",
    "management of its own business data, user credentials, and client information.",
]
nty = ty4 - 40
for nl in notice_lines:
    c.drawString(66, nty, nl)
    nty -= 14

c.showPage()

# ═══════════════════════════════════════════════════════════════
# PAGE 3 — MDS Shield + Tech Stack
# ═══════════════════════════════════════════════════════════════
draw_bg(c)
draw_header_bar(c, H - 3)
draw_footer(c)

y = H - 45
c.setFillColor(ORANGE)
c.setFont("Helvetica-Bold", 20)
c.drawString(50, y, "Technology Stack")
orange_line(c, 50, y - 10, 150)

ty2 = y - 45

section_box(c, 50, ty2 - 100, 240, 100, "Frontend", [
    "Single-file HTML / CSS / JavaScript",
    "Chart.js for analytics visualisation",
    "Responsive flex/grid layout",
    "Zero external dependencies",
])

section_box(c, 300, ty2 - 100, 250, 100, "Infrastructure", [
    "GitHub repository (version controlled)",
    "Render.com static site hosting",
    "Auto-deploy on push",
    "Custom deploy script (bash)",
])

ty3 = ty2 - 125
section_box(c, 50, ty3 - 100, 500, 100, "Security & Access", [
    "Username / password authentication",
    "Role-based access control (admin / client)",
    "localStorage session management",
    "MDS Shield legal compliance layer",
])

c.showPage()

# ═══════════════════════════════════════════════════════════════
# PAGE 4 — Pricing
# ═══════════════════════════════════════════════════════════════
draw_bg(c)
draw_header_bar(c, H - 3)
draw_footer(c)

y = H - 45
c.setFillColor(ORANGE)
c.setFont("Helvetica-Bold", 20)
c.drawString(50, y, "Investment")
orange_line(c, 50, y - 10, 100)

# Pricing box
box_top = y - 50
box_h = 340
c.setFillColor(DARK2)
c.roundRect(50, box_top - box_h, W - 100, box_h, 6, fill=1, stroke=0)
# Orange top accent
c.setFillColor(ORANGE)
c.rect(50, box_top - 3, W - 100, 3, fill=1, stroke=0)

# Title in box
c.setFillColor(WHITE)
c.setFont("Helvetica-Bold", 14)
c.drawString(75, box_top - 35, "TrackNow Sales & Marketing Portal — Build Cost")

# Separator
c.setStrokeColor(DARK3)
c.setLineWidth(0.5)
c.line(75, box_top - 48, W - 75, box_top - 48)

# Line items
ity = box_top - 72
c.setFillColor(GREY_LIGHT)
c.setFont("Helvetica", 10)

items = [
    ("Portal Design & Development", "Included"),
    ("Dashboard, Pipeline, Customer Management", "Included"),
    ("Sales Tools & Calculator Suite (7 calculators)", "Included"),
    ("Lead Scraper Database (500+ Australian leads)", "Included"),
    ("Marketing Hub, Email Templates, Objection Handler", "Included"),
    ("Revenue & Commission Module", "Included"),
    ("GitHub Repo + Render Hosting Setup", "Included"),
    ("Ongoing Tweaks & Refinements (this session)", "Included"),
]

for label, val in items:
    c.setFillColor(GREY_LIGHT)
    c.setFont("Helvetica", 9.5)
    c.drawString(75, ity, label)
    c.setFillColor(GREEN)
    c.setFont("Helvetica-Bold", 9.5)
    c.drawRightString(W - 75, ity, val)
    # faint line
    ity -= 4
    c.setStrokeColor(HexColor("#222222"))
    c.setLineWidth(0.3)
    c.line(75, ity, W - 75, ity)
    ity -= 18

# Total section
total_y = box_top - box_h + 15
c.setStrokeColor(ORANGE)
c.setLineWidth(1)
c.line(75, total_y + 45, W - 75, total_y + 45)

c.setFillColor(GREY_DIM)
c.setFont("Helvetica", 9)
c.drawString(75, total_y + 28, "Subtotal (ex GST)")
c.setFillColor(WHITE)
c.setFont("Helvetica-Bold", 11)
c.drawRightString(W - 75, total_y + 28, "$7,500.00")

c.setFillColor(GREY_DIM)
c.setFont("Helvetica", 9)
c.drawString(75, total_y + 12, "GST (10%)")
c.setFillColor(WHITE)
c.setFont("Helvetica", 10)
c.drawRightString(W - 75, total_y + 12, "$750.00")

# Grand total highlight
c.setFillColor(HexColor("#0d1a0d"))
c.roundRect(60, total_y - 18, W - 120, 26, 3, fill=1, stroke=0)
c.setStrokeColor(GREEN)
c.setLineWidth(1)
c.roundRect(60, total_y - 18, W - 120, 26, 3, fill=0, stroke=1)

c.setFillColor(GREEN)
c.setFont("Helvetica-Bold", 12)
c.drawString(75, total_y - 12, "TOTAL (inc GST)")
c.setFont("Helvetica-Bold", 14)
c.drawRightString(W - 75, total_y - 12, "$8,250.00")

# Payment terms
ty_pay = box_top - box_h - 35
c.setFillColor(WHITE)
c.setFont("Helvetica-Bold", 13)
c.drawString(50, ty_pay, "Payment Terms")
ty_pay -= 25

terms = [
    "Phase 1 build complete — $8,250.00 (inc GST) now due and payable",
    "Separate invoice to be sent",
    "Payment via bank transfer within 7 days of invoice",
]
c.setFont("Helvetica", 10)
for t in terms:
    c.setFillColor(GREY_LIGHT)
    c.drawString(65, ty_pay, "›  " + t)
    ty_pay -= 18

# What's NOT included
ty_pay -= 20
c.setFillColor(WHITE)
c.setFont("Helvetica-Bold", 13)
c.drawString(50, ty_pay, "Exclusions")
ty_pay -= 25

exclusions = [
    "Domain registration and custom domain setup (if required)",
    "Third-party API integrations beyond current scope",
    "Ongoing hosting fees (Render free tier currently in use)",
    "Content writing — all sales copy provided by TrackNow",
]
c.setFont("Helvetica", 10)
for t in exclusions:
    c.setFillColor(GREY_DIM)
    c.drawString(65, ty_pay, "›  " + t)
    ty_pay -= 18

c.showPage()
c.save()
print(f"PDF saved to: {OUTPUT}")
print(f"File size: {os.path.getsize(OUTPUT):,} bytes")
