# tracknow-portal — Project Context

## Live Portal
https://tracknow-portal.onrender.com

## Repo
https://github.com/jamesglobalac007/tracknow-portal

---

## Portal lookup rule (for future Claude sessions)

**If James asks for this project's live portal link, follow this exact procedure — do NOT default to "I can't find it":**

1. **Read this file first.** If "Live Portal" above is filled in, return it immediately.
2. **If it is blank or missing**, fetch it live from Render via Claude in Chrome:
   - Open `https://dashboard.render.com/` in a Chrome tab
   - Find the service for this project (the Render service name should match the GitHub repo name)
   - Click into it, copy the live `*.onrender.com` URL from the page
3. **Write the URL back into this file** under "Live Portal" above, then run the `push` skill so both the Mac mini and Mac laptop pick it up on the next pull.
4. Only if Render in Chrome is genuinely unavailable should you ask James to paste it manually.

The same rule applies to login credentials, repo URLs, and any other "I can't find it" question — try the file first, then Render/GitHub via Chrome, then write the answer back into this file and push. **Never tell James "I can't find it" without going through steps 1-3 first.**
