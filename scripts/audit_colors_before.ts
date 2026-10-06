import fs from 'fs';
import path from 'path';

interface Finding {
  file: string;
  line: number;
  match: string;
  type: string;
  snippet: string;
}

const HEX_REGEX = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
const RGB_REGEX = /rgba?\([^)]+\)/g;
const HSL_REGEX = /hsla?\([^)]+\)/g;
const TW_COLOR_REGEX = /\b(?:dark:)?(?:bg|text|border|ring|stroke|fill|divide|outline|from|via|to|shadow|accent)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-[0-9]{2,3}(?:\/[0-9]+)?)?\b/g;
const TW_BLACK_WHITE = /\b(?:dark:)?(?:bg|text|border)-(?:black|white)(?:\/[0-9]+)?\b/g;
const DARK_VARIANT_REGEX = /\bdark:[a-zA-Z0-9_\-\/\[\]#:]+\b/g;

const findings: Finding[] = [];

function scanDir(dir: string) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.next') {
        scanDir(fullPath);
      }
    } else if (/\.(tsx|ts|css|html|jsx|js)$/.test(entry.name)) {
      scanFile(fullPath);
    }
  }
}

function scanFile(filePath: string) {
  const relPath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  lines.forEach((lineText, idx) => {
    const lineNum = idx + 1;

    // Check HEX
    let m: RegExpExecArray | null;
    while ((m = HEX_REGEX.exec(lineText)) !== null) {
      findings.push({
        file: relPath,
        line: lineNum,
        match: m[0],
        type: 'hex',
        snippet: lineText.trim().slice(0, 100),
      });
    }

    // Check RGB/RGBA
    while ((m = RGB_REGEX.exec(lineText)) !== null) {
      findings.push({
        file: relPath,
        line: lineNum,
        match: m[0],
        type: 'rgb',
        snippet: lineText.trim().slice(0, 100),
      });
    }

    // Check HSL/HSLA
    while ((m = HSL_REGEX.exec(lineText)) !== null) {
      findings.push({
        file: relPath,
        line: lineNum,
        match: m[0],
        type: 'hsl',
        snippet: lineText.trim().slice(0, 100),
      });
    }

    // Check TW color classes
    while ((m = TW_COLOR_REGEX.exec(lineText)) !== null) {
      findings.push({
        file: relPath,
        line: lineNum,
        match: m[0],
        type: 'tailwind-color',
        snippet: lineText.trim().slice(0, 100),
      });
    }

    // Check TW black/white
    while ((m = TW_BLACK_WHITE.exec(lineText)) !== null) {
      findings.push({
        file: relPath,
        line: lineNum,
        match: m[0],
        type: 'tailwind-bw',
        snippet: lineText.trim().slice(0, 100),
      });
    }

    // Check dark: variants
    while ((m = DARK_VARIANT_REGEX.exec(lineText)) !== null) {
      findings.push({
        file: relPath,
        line: lineNum,
        match: m[0],
        type: 'dark-variant',
        snippet: lineText.trim().slice(0, 100),
      });
    }
  });
}

scanDir(path.join(process.cwd(), 'src'));

// Generate report
const linesOut: string[] = [];
linesOut.push('# Colors Audit (Before Brand Re-Theme)');
linesOut.push('');
linesOut.push(`Generated: ${new Date().toISOString()}`);
linesOut.push(`Total Findings in \`src/\`: ${findings.length}`);
linesOut.push('');

const byType: Record<string, number> = {};
for (const f of findings) {
  byType[f.type] = (byType[f.type] || 0) + 1;
}

linesOut.push('## Summary by Type');
linesOut.push('| Type | Count |');
linesOut.push('| --- | --- |');
for (const [t, c] of Object.entries(byType)) {
  linesOut.push(`| ${t} | ${c} |`);
}
linesOut.push('');

// Group by file
const byFile: Record<string, Finding[]> = {};
for (const f of findings) {
  if (!byFile[f.file]) byFile[f.file] = [];
  byFile[f.file].push(f);
}

linesOut.push('## Summary by File');
linesOut.push('| File | Findings Count |');
linesOut.push('| --- | --- |');
for (const [file, items] of Object.entries(byFile)) {
  linesOut.push(`| \`${file}\` | ${items.length} |`);
}
linesOut.push('');

linesOut.push('## Detailed Findings (File:Line + Color Found)');
linesOut.push('');
linesOut.push('| File:Line | Type | Color / Class | Snippet |');
linesOut.push('| --- | --- | --- | --- |');
for (const f of findings) {
  const cleanSnippet = f.snippet.replace(/\|/g, '\\|').replace(/`/g, '\\`');
  linesOut.push(`| \`${f.file}:${f.line}\` | ${f.type} | \`${f.match}\` | \`${cleanSnippet}\` |`);
}

const auditDir = path.join(process.cwd(), 'audit');
if (!fs.existsSync(auditDir)) fs.mkdirSync(auditDir, { recursive: true });
fs.writeFileSync(path.join(auditDir, 'colors-before.md'), linesOut.join('\n'), 'utf-8');

console.log(`Audited ${findings.length} color instances across ${Object.keys(byFile).length} files.`);
console.log('Saved to audit/colors-before.md');
