#!/usr/bin/env node
/**
 * TrackNow Portal Validator
 * Run this after any edit to catch JavaScript errors before deploying.
 * Usage: node validate-portal.js
 */

const fs = require('fs');
const path = require('path');

const PORTAL_FILE = path.join(__dirname, 'TrackNow-Portal-v5.html');

console.log('🔍 Validating TrackNow Portal...\n');

let html;
try {
  html = fs.readFileSync(PORTAL_FILE, 'utf8');
} catch(e) {
  console.error('❌ Could not read portal file:', e.message);
  process.exit(1);
}

// Extract inline scripts (skip external src= scripts)
const scriptRegex = /<script(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)<\/script>/gi;
let match, scriptCount = 0, errors = 0;

while ((match = scriptRegex.exec(html)) !== null) {
  const scriptContent = match[1].trim();
  if (!scriptContent) continue;
  scriptCount++;

  try {
    new Function(scriptContent); // syntax check
    console.log(`✅ Script block ${scriptCount}: OK (${scriptContent.length.toLocaleString()} chars)`);
  } catch(e) {
    errors++;
    // Find approximate line number
    const lines = scriptContent.split('\n');
    let charCount = 0;
    let errorLine = '?';
    for (let i = 0; i < lines.length; i++) {
      charCount += lines[i].length + 1;
      if (charCount >= (e.columnNumber || 0)) {
        errorLine = i + 1;
        break;
      }
    }
    console.error(`❌ Script block ${scriptCount}: SYNTAX ERROR`);
    console.error(`   ${e.message}`);
    // Show a snippet around the error
    const errorLineNum = parseInt(errorLine) || 0;
    if (errorLineNum > 0) {
      const start = Math.max(0, errorLineNum - 2);
      const end = Math.min(lines.length, errorLineNum + 2);
      console.error(`   Near line ${errorLineNum}:`);
      lines.slice(start, end).forEach((l, i) => {
        const lineNo = start + i + 1;
        const marker = lineNo === errorLineNum ? '>>>' : '   ';
        console.error(`   ${marker} ${lineNo}: ${l.trim().slice(0, 100)}`);
      });
    }
  }
}

// Also check for common pitfalls
const pitfalls = [
  { pattern: /showToast\('[^']*'[^']*'\)/, desc: "Unescaped apostrophe in showToast() string" },
  { pattern: /alert\('[^']*'[^']*'\)/, desc: "Unescaped apostrophe in alert() string" },
];
pitfalls.forEach(({ pattern, desc }) => {
  if (pattern.test(html)) {
    errors++;
    console.error(`⚠️  Potential issue: ${desc}`);
  }
});

console.log(`\n${errors === 0 ? '✅ All good! Portal is ready to deploy.' : `❌ ${errors} error(s) found — fix before deploying.`}`);
process.exit(errors > 0 ? 1 : 0);
