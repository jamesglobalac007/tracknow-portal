#!/usr/bin/env python3
"""TrackNow Portal — Push to GitHub + Render"""
import os, sys, json, base64, urllib.request, urllib.error

# ── Config ──
TOKEN_FILE = os.path.expanduser("~/.github_token")
if os.path.isfile(TOKEN_FILE):
    PAT = open(TOKEN_FILE).read().strip()
else:
    print(f"  \033[91m✗  No token found at ~/.github_token\033[0m")
    print(f"  \033[2m  Run: echo YOUR_TOKEN > ~/.github_token\033[0m")
    sys.exit(1)
REPO = "jamesglobalac007/tracknow-portal"
FILE = "index.html"
PORTAL = os.path.expanduser("~/Dropbox/2. Finance/CW/TrackNow/TrackNow/TrackNow-Portal-v6.html")
API = f"https://api.github.com/repos/{REPO}/contents/{FILE}"

G = "\033[92m"  # green
O = "\033[38;5;214m"  # orange
R = "\033[91m"  # red
D = "\033[2m"   # dim
B = "\033[1m"   # bold
X = "\033[0m"   # reset

print(f"\n{O}{B}  ╔══════════════════════════════════════════╗{X}")
print(f"{O}{B}  ║       🚀  TrackNow Portal Deploy         ║{X}")
print(f"{O}{B}  ╚══════════════════════════════════════════╝{X}\n")

# ── Step 1: Check file ──
if not os.path.isfile(PORTAL):
    print(f"  {R}✗  Portal file not found{X}")
    print(f"  {D}  Expected: {PORTAL}{X}")
    sys.exit(1)

size_kb = os.path.getsize(PORTAL) / 1024
print(f"  {G}✓{X}  Portal found {D}({size_kb:.0f} KB){X}")

# ── Step 2: Read & encode ──
with open(PORTAL, "rb") as f:
    content_b64 = base64.b64encode(f.read()).decode("utf-8")
print(f"  {G}✓{X}  Encoded for upload")

# ── Step 3: Get current SHA ──
print(f"  {D}⟳{X}  Checking current version on GitHub...")
headers = {
    "Authorization": f"Bearer {PAT}",
    "Accept": "application/vnd.github+json",
    "User-Agent": "TrackNow-Push"
}

sha = None
try:
    req = urllib.request.Request(API, headers=headers)
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())
        sha = data.get("sha", "")
    print(f"  {G}✓{X}  Existing deploy found {D}(sha: {sha[:7]}...){X}")
except urllib.error.HTTPError as e:
    if e.code == 404:
        print(f"  {G}✓{X}  First deploy — creating new file")
    else:
        print(f"  {R}✗  GitHub API error: {e.code}{X}")
        sys.exit(1)

# ── Step 4: Push ──
print(f"  {D}⟳{X}  Pushing to GitHub...")

from datetime import datetime
timestamp = datetime.now().strftime("%d %b %Y %I:%M%p")

payload = {
    "message": f"Portal update — {timestamp}",
    "content": content_b64
}
if sha:
    payload["sha"] = sha

body = json.dumps(payload).encode("utf-8")
req = urllib.request.Request(API, data=body, headers={**headers, "Content-Type": "application/json"}, method="PUT")

try:
    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read())
    new_sha = result.get("content", {}).get("sha", "")[:7]
    print(f"\n{G}  ═══════════════════════════════════════════{X}")
    print(f"{G}{B}    ✅  DEPLOYED SUCCESSFULLY{X}")
    print(f"{G}  ═══════════════════════════════════════════{X}")
    print(f"  {D}Commit:{X}  {new_sha}")
    print(f"  {D}Time:{X}    {timestamp}")
    print(f"  {D}Size:{X}    {size_kb:.0f} KB")
    print(f"\n  {O}{B}🌐  https://tracknow-portal.onrender.com{X}")
    print(f"  {D}Auto-deploys in ~1-2 minutes{X}\n")
except urllib.error.HTTPError as e:
    err_body = e.read().decode()
    try:
        err_msg = json.loads(err_body).get("message", "Unknown error")
    except:
        err_msg = err_body[:200]
    print(f"\n  {R}{B}❌  DEPLOY FAILED{X}")
    print(f"  {R}{err_msg}{X}\n")
    sys.exit(1)
