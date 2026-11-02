import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.argv[2];
if (!base || new URL(base).protocol !== 'https:')
  throw new Error('Supply the deployed HTTPS origin. This check requires labeled demo mode.');
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const report = {
  checkedAt: new Date().toISOString(),
  origin: new URL(base).origin,
  health: false,
  demo: false,
  sharedPlayback: false,
  personalReplay: false,
  ok: false,
};
try {
  const health = await page.request.get(new URL('/healthz', base).href);
  report.health = health.ok();
  if (!report.health) throw new Error('Hosted health is not ready.');
  await page.goto(base);
  await page.getByRole('button', { name: 'Try configured demo mode' }).click();
  await page.getByRole('heading', { name: 'Demo broadcaster' }).waitFor();
  report.demo = true;
  await page.getByRole('button', { name: 'Start without a microphone' }).click();
  const viewers = [];
  for (let i = 0; i < 2; i++) {
    const viewer = await context.newPage();
    await viewer.route('https://extension-files.twitch.tv/**', (route) =>
      route.fulfill({ body: '', contentType: 'application/javascript' }),
    );
    await viewer.goto(new URL('/extension-preview/viewer.html?demo=1', base).href);
    await viewer.getByRole('button', { name: 'Authorize demo viewer' }).click();
    viewers.push(viewer);
  }
  await page.getByRole('button', { name: 'Send fixture phrase' }).click();
  for (const viewer of viewers)
    await viewer.locator('video.active').waitFor({ state: 'visible', timeout: 15000 });
  report.sharedPlayback = true;
  await viewers[0].getByRole('button', { name: '↶ Replay phrase' }).waitFor();
  for (
    let tries = 0;
    tries < 30 && !(await viewers[0].getByRole('button', { name: '↶ Replay phrase' }).isEnabled());
    tries++
  )
    await new Promise((r) => setTimeout(r, 100));
  await viewers[0].getByRole('button', { name: '↶ Replay phrase' }).click();
  await viewers[0].getByText('REPLAY', { exact: true }).waitFor();
  report.personalReplay = (await viewers[1].getByText('REPLAY', { exact: true }).count()) === 0;
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/hosted-dashboard.png', fullPage: true });
  await page.getByRole('button', { name: 'Stop & clear' }).click();
  report.ok = report.health && report.demo && report.sharedPlayback && report.personalReplay;
} catch (error) {
  report.error = error instanceof Error ? error.message : 'Hosted check failed.';
} finally {
  await browser.close();
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/hosted-check.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}
