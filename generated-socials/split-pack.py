#!/usr/bin/env python3
"""Split a TrackNow Social Graphics Pack into one standalone HTML per post.

Input: the pack file James drops into ~/ (Chrome "Save Page As" format).
Output: one file per card-wrap block (post 2 onward, by default), each
self-contained — same <head>, same <style>, just one card in the grid.

Why: Metricool import expects one post at a time; easier to open a
single-post file, right-click → Save image for the 1080x1080 graphic,
then paste the caption from the preview.
"""
import re
import sys
from pathlib import Path

SRC = Path("/Users/jamesglobal/TrackNow — FIrst post Social Graphics Pack.html")
OUT_DIR = Path("/Users/jamesglobal/MDS/tracknow-portal/generated-socials")
START_FROM_POST = 2   # skip post 1 (already live)

# Post labels for filenames
POST_SLUGS = {
    1: "01-operational-efficiency",
    2: "02-cost-savings",
    3: "03-productivity-accountability",
    4: "04-security-protection",
    5: "05-business-intelligence",
    6: "06-customer-service-growth",
}

def main():
    src_text = SRC.read_text(encoding="utf-8", errors="replace")

    # 1) Grab everything up to and including the first <div class="grid">
    #    — that becomes the shared head. Anything AFTER the last card-wrap
    #    (demo-cta, toast, scripts) is the shared footer.
    grid_open_match = re.search(r'<div class="grid">', src_text)
    if not grid_open_match:
        print("Could not find <div class=\"grid\">. Aborting.")
        sys.exit(1)
    head_html = src_text[:grid_open_match.end()]

    # Find the closing of the grid — last </div> after the 6th card, before
    # the .demo-cta block. Easiest heuristic: the demo-cta starts with
    # <div class="demo-cta"> or similar. Fallback: just close grid manually.
    demo_match = re.search(r'<div class="demo-cta"|<div class="toast"|<script', src_text[grid_open_match.end():])
    if demo_match:
        footer_start = grid_open_match.end() + demo_match.start()
        footer_html = "</div>\n" + src_text[footer_start:]
    else:
        footer_html = "</div>\n</body>\n</html>"

    # 2) Split the card-wrap blocks out of the grid body
    body = src_text[grid_open_match.end():footer_start if demo_match else -1]
    # Each card starts with <!-- ============ N. ... ============ -->
    # then a <div class="card-wrap"> ... </div> (outermost)
    # Use a regex that captures the comment + the full card-wrap block.
    # We find the start lines and then match brackets manually.

    card_starts = [m.start() for m in re.finditer(r'<!--\s*={4,}\s*\d+\.', body)]
    card_starts.append(len(body))  # sentinel so slicing works for the last one

    posts = []
    for i in range(len(card_starts) - 1):
        chunk = body[card_starts[i]:card_starts[i+1]].rstrip()
        # Derive the post number from the comment marker
        m = re.search(r'<!--\s*={4,}\s*(\d+)\.\s*([^=]+?)\s*={4,}\s*-->', chunk)
        if not m:
            continue
        post_num = int(m.group(1))
        title = m.group(2).strip()
        posts.append((post_num, title, chunk))

    if not posts:
        print("No card-wrap blocks found.")
        sys.exit(1)

    print(f"Found {len(posts)} post(s). Writing posts {START_FROM_POST}+…")

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    count = 0
    for num, title, chunk in posts:
        if num < START_FROM_POST:
            continue
        slug = POST_SLUGS.get(num, f"{num:02d}-post")
        filename = f"tracknow-post-{slug}.html"

        # Tweak the page title so each file has a clear title
        file_head = re.sub(
            r'<title>.*?</title>',
            f'<title>TrackNow — Post {num:02d}: {title}</title>',
            head_html,
            count=1,
            flags=re.S
        )
        # Also tweak the header H1 if present so the on-screen title matches
        file_head = re.sub(
            r'<h1>.*?</h1>',
            f'<h1>Post {num:02d} — <span>{title}</span></h1>',
            file_head,
            count=1,
            flags=re.S
        )

        html = file_head + "\n" + chunk + "\n" + footer_html

        out_path = OUT_DIR / filename
        out_path.write_text(html, encoding="utf-8")
        size_kb = out_path.stat().st_size / 1024
        print(f"  → {filename}  ({size_kb:.0f} KB)")
        count += 1

    print(f"\nDone. {count} file(s) written to {OUT_DIR}")

if __name__ == "__main__":
    main()
