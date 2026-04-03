#!/bin/bash
echo ""
echo "═══════════════════════════════════════════"
echo "  TRACKNOW — PUSH TO GITHUB + RENDER"
echo "═══════════════════════════════════════════"
echo ""

# Detect which machine we're on — check Dropbox FIRST (laptop)
if [ -d "$HOME/Dropbox/2. Finance/CW/TrackNow/TrackNow" ]; then
  FOLDER="$HOME/Dropbox/2. Finance/CW/TrackNow/TrackNow"
  MACHINE="Laptop (Dropbox)"
elif [ -d "$HOME/Desktop/CW/TrackNow/TrackNow" ]; then
  FOLDER="$HOME/Desktop/CW/TrackNow/TrackNow"
  MACHINE="Mac Mini (Desktop)"
else
  echo "  ❌ ERROR: Cannot find TrackNow folder"
  exit 1
fi

cd "$FOLDER" || exit 1
echo "  ✅ Machine: $MACHINE"
echo "  ✅ Folder:  $FOLDER"
echo ""

# Init git if needed
if [ ! -d ".git" ]; then
  echo "  ⏳ Setting up git..."
  git init -q
  git branch -M main
fi

# Check token
TOKEN=$(cat ~/.github_token 2>/dev/null)
if [ -z "$TOKEN" ]; then
  echo "  ❌ No GitHub token found at ~/.github_token"
  echo "     Run: echo YOUR_TOKEN > ~/.github_token"
  exit 1
fi

git remote set-url origin "https://jamesglobalac007:${TOKEN}@github.com/jamesglobalac007/tracknow-portal.git" 2>/dev/null || \
git remote add origin "https://jamesglobalac007:${TOKEN}@github.com/jamesglobalac007/tracknow-portal.git"

echo "  ✅ Git & token ready"
echo ""

# Stage
echo "  ⏳ Staging files..."
git add -A
CHANGES=$(git diff --cached --stat | tail -1)
if [ -z "$CHANGES" ]; then
  echo ""
  echo "═══════════════════════════════════════════"
  echo "  ℹ️  NO CHANGES TO PUSH"
  echo "  Everything is already up to date."
  echo "═══════════════════════════════════════════"
  exit 0
fi
echo "  ✅ Files staged ($CHANGES)"
echo ""

# Commit with auto timestamp
TIMESTAMP=$(date "+%d %b %Y %I:%M%p")
echo "  ⏳ Committing..."
git commit -q -m "TrackNow update — $TIMESTAMP"
echo "  ✅ Committed: TrackNow update — $TIMESTAMP"
echo ""

# Push and check result
echo "  ⏳ Pushing to GitHub..."
if git push origin main --force 2>&1; then
  echo ""
  echo "═══════════════════════════════════════════"
  echo "  ✅ PUSH COMPLETE — ALL GOOD!"
  echo "═══════════════════════════════════════════"
  echo "  Live URL: https://tracknow-portal.onrender.com"
  echo "  Render will redeploy in 2-5 minutes"
  echo "═══════════════════════════════════════════"
else
  echo ""
  echo "═══════════════════════════════════════════"
  echo "  ❌ PUSH FAILED"
  echo "  Check your token or internet connection"
  echo "  Token file: ~/.github_token"
  echo "═══════════════════════════════════════════"
  exit 1
fi
