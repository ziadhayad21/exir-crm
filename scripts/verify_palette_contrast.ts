function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16),
      parseInt(clean[1] + clean[1], 16),
      parseInt(clean[2] + clean[2], 16),
    ];
  }
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r / 255, g / 255, b / 255].map((c) => {
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(hex1: string, hex2: string): number {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);
  const l1 = relativeLuminance(rgb1[0], rgb1[1], rgb1[2]);
  const l2 = relativeLuminance(rgb2[0], rgb2[1], rgb2[2]);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const colors = {
  // Brand
  Cream: '#FCF0DA',
  Olive: '#AEAC78',
  Gold: '#F2C46A',
  Ink: '#4C4541',

  // Surfaces
  Background: '#FFFCF6',
  Card: '#FFFFFF',
  SurfaceMuted: '#FFFEFB',
  SidebarBg: '#FBF5E8',
  Selected: '#F9E2AB',
  Hover: '#FCEFCF',
  BubbleOutgoing: '#FCEBC2',
  BubbleIncoming: '#FFFFFF',

  // Derived Ink variants
  MutedForeground: '#6E6662',

  // Derived Semantic Text
  DangerText: '#8E1E14',
  SuccessText: '#2E5A27',
  WarningText: '#7A4F03',
  InfoText: '#2B5870',

  // Derived Primaries
  PrimaryHover: '#E2B252',
  PrimaryActive: '#D49F3A',
};

console.log('=== WCAG CONTRAST VERIFICATION ===\n');

const checks = [
  { fg: colors.Ink, fgName: 'Ink (#4C4541)', bg: colors.Background, bgName: '--background (#FFFCF6)', min: 8.0 },
  { fg: colors.Ink, fgName: 'Ink (#4C4541)', bg: colors.Card, bgName: '--card (#FFFFFF)', min: 8.0 },
  { fg: colors.Ink, fgName: 'Ink (#4C4541)', bg: colors.SurfaceMuted, bgName: '--surface-muted (#FFFEFB)', min: 8.0 },
  { fg: colors.Ink, fgName: 'Ink (#4C4541)', bg: colors.SidebarBg, bgName: '--sidebar-bg (#FBF5E8)', min: 8.0 },
  { fg: colors.Ink, fgName: 'Ink (#4C4541)', bg: colors.Gold, bgName: 'Gold (#F2C46A)', min: 4.5 },
  { fg: colors.Ink, fgName: 'Ink (#4C4541)', bg: colors.Selected, bgName: '--selected (#F9E2AB)', min: 4.5 },
  { fg: colors.Ink, fgName: 'Ink (#4C4541)', bg: colors.Hover, bgName: '--hover (#FCEFCF)', min: 4.5 },
  { fg: colors.Ink, fgName: 'Ink (#4C4541)', bg: colors.BubbleOutgoing, bgName: '--bubble-outgoing (#FCEBC2)', min: 4.5 },
  { fg: colors.MutedForeground, fgName: 'Muted Ink (#6E6662)', bg: colors.Background, bgName: '--background (#FFFCF6)', min: 4.5 },
  { fg: colors.MutedForeground, fgName: 'Muted Ink (#6E6662)', bg: colors.Card, bgName: '--card (#FFFFFF)', min: 4.5 },
  { fg: colors.MutedForeground, fgName: 'Muted Ink (#6E6662)', bg: colors.SidebarBg, bgName: '--sidebar-bg (#FBF5E8)', min: 4.5 },
  { fg: colors.DangerText, fgName: 'Danger Text (#8E1E14)', bg: colors.Card, bgName: '--card (#FFFFFF)', min: 4.5 },
  { fg: colors.SuccessText, fgName: 'Success Text (#2E5A27)', bg: colors.Card, bgName: '--card (#FFFFFF)', min: 4.5 },
  { fg: colors.WarningText, fgName: 'Warning Text (#7A4F03)', bg: colors.Card, bgName: '--card (#FFFFFF)', min: 4.5 },
  { fg: colors.InfoText, fgName: 'Info Text (#2B5870)', bg: colors.Card, bgName: '--card (#FFFFFF)', min: 4.5 },
];

let allPassed = true;
for (const check of checks) {
  const ratio = contrastRatio(check.fg, check.bg);
  const passed = ratio >= check.min;
  if (!passed) allPassed = false;
  console.log(
    `${passed ? '✅' : '❌'} ${check.fgName} on ${check.bgName}: ${ratio.toFixed(2)}:1 (Req: >= ${check.min}:1)`
  );
}

console.log('\n--- Informational Checks ---');
const inkOnOlive = contrastRatio(colors.Ink, colors.Olive);
console.log(`ℹ️ Ink on Solid Olive (#AEAC78): ${inkOnOlive.toFixed(2)}:1 (Passes UI component 3:1, Fails normal text 4.5:1 as expected)`);

if (allPassed) {
  console.log('\n🎉 ALL CONTRAST TARGETS SATISFIED!');
} else {
  console.error('\n⚠️ SOME CONTRAST TARGETS FAILED!');
  process.exit(1);
}
