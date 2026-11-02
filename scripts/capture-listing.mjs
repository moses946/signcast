import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const base = 'https://si-eb3f0fb6d3914816a6229496e4cfa0e2.ecs.eu-west-1.on.aws';
const destination = 'assets/branding/twitch';
await mkdir(destination, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1080 },
    deviceScaleFactor: 1,
  });
  const dashboard = await context.newPage();
  await dashboard.goto(base);
  await dashboard.getByRole('button', { name: 'Try configured demo mode' }).click();
  await dashboard.getByRole('heading', { name: 'Demo broadcaster' }).waitFor();
  const start = dashboard.getByRole('button', { name: 'Start without a microphone' });
  if (await start.isVisible()) await start.click();
  await dashboard.getByRole('button', { name: 'Send fixture phrase' }).click();
  await dashboard.locator('.transcript-log p').first().waitFor();
  await dashboard
    .getByRole('button', { name: 'Send fixture phrase' })
    .waitFor({ state: 'visible' });
  await dashboard.waitForFunction(
    () => !document.querySelector('button:disabled')?.textContent?.includes('Connecting'),
  );
  // A browser zoom keeps the real dashboard readable within the required listing viewport.
  await dashboard.evaluate(() => {
    document.body.style.zoom = '0.64';
  });
  await dashboard.setViewportSize({ width: 1024, height: 768 });
  await dashboard.evaluate(() => window.scrollTo(0, 0));
  await dashboard.screenshot({
    path: `${destination}/signcast-screenshot-1024x768.png`,
    fullPage: false,
    mask: [dashboard.locator('#overlay-url')],
    maskColor: '#303d35',
  });
  await dashboard.getByRole('button', { name: 'Stop & clear' }).click();
} finally {
  await browser.close();
}
