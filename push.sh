#!/bin/bash
echo ""
echo "═══════════════════════════════════════════"
echo "  TRACKNOW — PUSH TO GITHUB + RENDER"
echo "═══════════════════════════════════════════"
echo ""

# Detect which machine we're on — check Dropbox FIRST (laptop)
if [ -d "$HOME/Dropbox/2. Finance/CW/TrackNow/TrackNow" ]; then
  FOLDER="$HOME/Dropbox/2. Finance/CW/TrackNow/TrackNow"
  echo "  Machine: Laptop (Dropbox)"
elif [ -d "$HOME/Desktop/CW/TrackNow/TrackNow" ]; then
  FOLDER="$HOME/Desktop/CW/TrackNow/TrackNow"
  echo "  Machine: Mac Mini (Desktop)"
else
  echo "  ERROR: Cannot find TrackNow folder"
  exit 1
fi

cd "$FOLDER" || exit 1
echo "  Folder: $FOLDER"
echo ""

# Init git if needed
if [ ! -d ".git" ]; then
  echo "⏳ Setting up git..."
  git init
  git branch -M main
fi

# Set remote
TOKEN=$(cat ~/.github_token 2>/dev/null)
if [ -z "$TOKEN" ]; then
  echo "  ERROR: No GitHub token found at ~/.github_token"
  echo "  Run this first: echo YOUR_TOKEN > ~/.github_token"
  exit 1
fi

git remote set-url origin "https://jamesglobalac007:${TOKEN}@github.com/jamesglobalac007/tracknow-portal.git" 2>/dev/null || \
git remote add origin "https://jamesglobalac007:${TOKEN}@github.com/jamesglobalac007/tracknow-portal.git"

echo "✅ Git ready"
echo ""

# Stage
echo "⏳ Staging files..."
git add -A
echo "✅ Files staged"
echo ""

# Commit
echo "⏳ Committing..."
git commit -m "Add individual email filter, SIM provider consolidation"
echo "✅ Committed"
echo ""

# Push
echo "⏳ Pushing to GitHub..."
git push origin main --force

echo ""
echo "═══════════════════════════════════════════"
echo "  ✅ PUSH COMPLETE — ALL GOOD!"
echo "═══════════════════════════════════════════"
echo ""
echo "  Live URL: https://tracknow-portal.onrender.com"
echo "  Render will redeploy in 2-5 minutes"
echo "═══════════════════════════════════════════"
