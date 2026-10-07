// scripts/capture_screenshots.ts
import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3005';
const OUTPUT_DIR = path.resolve(process.cwd(), 'audit', 'screenshots', 'after');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

async function capture() {
  const browser = await chromium.launch({ headless: true });
  
  // Create desktop and mobile contexts
  for (const vp of VIEWPORTS) {
    console.log(`\n--- Capturing ${vp.name} viewports (${vp.width}x${vp.height}) ---`);
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();

    // 1. Capture public pages first
    const publicPages = [
      { name: 'login', url: `${BASE_URL}/login` },
      { name: 'unauthorized', url: `${BASE_URL}/unauthorized` },
      { name: 'privacy-policy', url: `${BASE_URL}/privacy-policy` },
    ];

    for (const p of publicPages) {
      try {
        console.log(`Navigating to ${p.name}...`);
        await page.goto(p.url, { waitUntil: 'networkidle', timeout: 15000 });
        const filePath = path.join(OUTPUT_DIR, `${p.name}-${vp.name}.png`);
        await page.screenshot({ path: filePath, fullPage: false });
        console.log(`✅ Saved: ${filePath}`);
      } catch (err: unknown) {
        console.warn(`⚠️ Failed ${p.name}:`, (err as Error).message);
      }
    }

    // 2. Perform Login to capture authenticated pages
    try {
      console.log('Logging in as admin@elexir.test...');
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
      await page.fill('input[type="email"]', 'admin@elexir.test');
      await page.fill('input[type="password"]', 'Admin123!');
      await page.click('button[type="submit"]');
      await page.waitForURL('**/dashboard', { timeout: 15000 });
      console.log('✅ Logged in successfully!');

      const authPages = [
        { name: 'dashboard', url: `${BASE_URL}/dashboard` },
        { name: 'crm-customers', url: `${BASE_URL}/crm/customers` },
        { name: 'crm-leads', url: `${BASE_URL}/crm/leads` },
        { name: 'crm-deals', url: `${BASE_URL}/crm/deals` },
        { name: 'crm-inbox', url: `${BASE_URL}/crm/inbox` },
        { name: 'admin-employees', url: `${BASE_URL}/admin/employees` },
        { name: 'admin-roles', url: `${BASE_URL}/admin/roles` },
        { name: 'admin-permissions', url: `${BASE_URL}/admin/permissions` },
      ];

      for (const p of authPages) {
        try {
          console.log(`Navigating to ${p.name}...`);
          await page.goto(p.url, { waitUntil: 'networkidle', timeout: 15000 });
          // Give dynamic DOM 500ms to stabilize
          await page.waitForTimeout(500);
          const filePath = path.join(OUTPUT_DIR, `${p.name}-${vp.name}.png`);
          await page.screenshot({ path: filePath, fullPage: false });
          console.log(`✅ Saved: ${filePath}`);
        } catch (err: unknown) {
          console.warn(`⚠️ Failed ${p.name}:`, (err as Error).message);
        }
      }
    } catch (err: unknown) {
      console.warn('⚠️ Login failed:', (err as Error).message);
    }

    await context.close();
  }

  await browser.close();
  console.log('\n🎉 Screenshot capture run completed!');
}

capture().catch((err) => {
  console.error('Fatal screenshot error:', err);
  process.exit(1);
});
