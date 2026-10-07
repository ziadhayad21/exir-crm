// scripts/check_colors.ts
// Guardrail script: scans src/ for unapproved hardcoded colors or dark-mode classes.
// Enforces brand palette compliance: Cream (#FCF0DA), Olive (#AEAC78), Gold (#F2C46A), Ink (#4C4541).

import fs from 'fs';
import path from 'path';

interface Violation {
  file: string;
  line: number;
  pattern: string;
  snippet: string;
}

const ALLOWED_EXEMPTIONS: { file: string; linePattern: RegExp }[] = [
  // Layout theme-color meta tag
  { file: 'src/app/layout.tsx', linePattern: /themeColor:\s*['"]#FFFCF6['"]/ },
  // Login subtle gradient and brand ink icon
  { file: 'src/app/login/page.tsx', linePattern: /#FFFFFF|#FCF5E8|#5A524D/ },
  // Skeletons brand olive shimmer
  { file: 'src/app/(dashboard)/loading.tsx', linePattern: /#F3F1DF|#FAF8EE|#FFFFFF/ },
  { file: 'src/app/(dashboard)/crm/inbox/loading.tsx', linePattern: /#F3F1DF|#FAF8EE|#FFFFFF/ },
  // Official social media channel badge colors (WhatsApp, Instagram, Messenger, Mock) & HTML5 video black
  {
    file: 'src/app/(dashboard)/crm/inbox/inbox-client.tsx',
    linePattern: /#1b6338|#25D366|#9f1239|#F58529|#DD2A7B|#8134AF|#0369a1|#0084FF|#6b21a8|#A855F7|#000|rgba\(37,\s*211,\s*102|rgba\(225,\s*48,\s*108|rgba\(0,\s*132,\s*255|rgba\(168,\s*85,\s*247/,
  },
];

// Disallowed Tailwind raw color palettes that bypass our brand tokens
const FORBIDDEN_TAILWIND_CLASSES = /\b(bg|text|border)-(slate|zinc|neutral|stone|gray|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}\b/;

// Disallowed dark mode variant usage
const FORBIDDEN_DARK_CLASSES = /\bdark:/;

// General hex color pattern
const HEX_PATTERN = /#[0-9a-fA-F]{3,8}\b/;

function isExempt(relativeFilePath: string, lineContent: string): boolean {
  const normPath = relativeFilePath.replace(/\\/g, '/');
  for (const ex of ALLOWED_EXEMPTIONS) {
    if (normPath.endsWith(ex.file) && ex.linePattern.test(lineContent)) {
      return true;
    }
  }
  return false;
}

function scanFile(filePath: string, rootDir: string): Violation[] {
  const relPath = path.relative(rootDir, filePath).replace(/\\/g, '/');
  
  // Skip globals.css (token definition file) and audit docs/scripts
  if (relPath === 'src/app/globals.css' || relPath.startsWith('audit/') || relPath.startsWith('scripts/')) {
    return [];
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const violations: Violation[] = [];

  lines.forEach((line, index) => {
    const lineNum = index + 1;

    // Skip comments
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      return;
    }

    // Check dark: variant
    if (FORBIDDEN_DARK_CLASSES.test(line)) {
      violations.push({
        file: relPath,
        line: lineNum,
        pattern: 'Dark mode variant (dark:)',
        snippet: trimmed,
      });
    }

    // Check raw Tailwind color classes
    const twMatch = line.match(FORBIDDEN_TAILWIND_CLASSES);
    if (twMatch) {
      violations.push({
        file: relPath,
        line: lineNum,
        pattern: `Default Tailwind color utility (${twMatch[0]})`,
        snippet: trimmed,
      });
    }

    // Check hex colors
    const hexMatch = line.match(HEX_PATTERN);
    if (hexMatch) {
      if (!isExempt(relPath, line)) {
        violations.push({
          file: relPath,
          line: lineNum,
          pattern: `Hardcoded hex color (${hexMatch[0]})`,
          snippet: trimmed,
        });
      }
    }
  });

  return violations;
}

function getAllFiles(dir: string, fileList: string[] = []): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.next' && entry.name !== '.git') {
        getAllFiles(fullPath, fileList);
      }
    } else if (entry.isFile() && /\.(tsx|ts|jsx|js)$/.test(entry.name)) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

function main() {
  const rootDir = path.resolve(__dirname, '..');
  const srcDir = path.join(rootDir, 'src');

  console.log('--- Brand Palette Guardrail Scan ---');
  console.log(`Scanning: ${srcDir}\n`);

  const files = getAllFiles(srcDir);
  const allViolations: Violation[] = [];

  for (const f of files) {
    const v = scanFile(f, rootDir);
    allViolations.push(...v);
  }

  if (allViolations.length === 0) {
    console.log(`SUCCESS: All ${files.length} source files comply with the El-Exir ERP brand palette!`);
    console.log('Zero forbidden hardcoded hexes, zero default Tailwind colors, zero dark mode classes found.');
    process.exit(0);
  } else {
    console.error(`FAILED: Found ${allViolations.length} color palette violation(s):\n`);
    for (const v of allViolations) {
      console.error(`  [${v.file}:${v.line}] ${v.pattern}`);
      console.error(`    -> ${v.snippet}\n`);
    }
    process.exit(1);
  }
}

main();
