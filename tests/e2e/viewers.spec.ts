import { test, expect } from '@playwright/test';
test('two personal players replay shared bytes independently', async ({ browser, page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try configured demo mode' }).click();
  await expect(page.getByRole('heading', { name: 'Demo broadcaster' })).toBeVisible();
  await page.getByRole('button', { name: 'Start without a microphone' }).click();
  const url = await page.locator('#overlay-url').inputValue();
  const first = await browser.newPage(),
    second = await browser.newPage();
  await first.goto(url);
  await second.goto(url);
  await page.getByRole('button', { name: 'Send fixture phrase' }).click();
  await expect(first.locator('video.active')).toBeVisible();
  await expect(second.locator('video.active')).toBeVisible();
  await expect(first.getByText('DEMO DATA', { exact: false })).toBeVisible();
  const viewer1 = await page.context().newPage(),
    viewer2 = await page.context().newPage();
  for (const viewer of [viewer1, viewer2]) {
    await viewer.route('https://extension-files.twitch.tv/**', (route) =>
      route.fulfill({ body: '', contentType: 'application/javascript' }),
    );
    await viewer.goto('/extension-preview/viewer.html?demo=1');
    await viewer.getByRole('button', { name: 'Authorize demo viewer' }).click();
  }
  await page.getByRole('button', { name: 'Send fixture phrase' }).click();
  await expect(viewer1.locator('video.active')).toBeVisible();
  await expect(viewer2.locator('video.active')).toBeVisible();
  await expect(viewer1.getByRole('button', { name: '↶ Replay phrase' })).toBeEnabled({
    timeout: 10000,
  });
  await viewer1.getByRole('button', { name: '↶ Replay phrase' }).click();
  await expect(viewer1.getByText('REPLAY', { exact: true })).toBeVisible();
  await expect(viewer2.getByText('REPLAY', { exact: true })).toHaveCount(0);
  await viewer1.getByLabel('Show signing').uncheck();
  await expect(viewer1.locator('.video-stage')).toBeHidden();
  await expect(viewer2.locator('.video-stage')).toBeVisible();
  await page.getByRole('button', { name: 'Stop & clear' }).click();
  await expect(first.locator('video.active')).toHaveCount(0);
  await first.close();
  await second.close();
});
test('complete-MP4 fallback works without MediaSource', async ({ page, browser }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try configured demo mode' }).click();
  await page.getByRole('button', { name: 'Start without a microphone' }).click();
  const url = await page.locator('#overlay-url').inputValue();
  const context = await browser.newContext();
  await context.addInitScript(() =>
    Object.defineProperty(window, 'MediaSource', { value: undefined, configurable: true }),
  );
  const viewer = await context.newPage();
  await viewer.goto(url);
  await page.getByRole('button', { name: 'Send fixture phrase' }).click();
  await expect(viewer.locator('video.active')).toBeVisible();
  await expect(viewer.getByText('Complete-video playback adds delay.')).toBeVisible();
  await page.getByRole('button', { name: 'Stop & clear' }).click();
  await context.close();
});
test('dashboard is keyboard accessible and explains input scope', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Let your audience');
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toHaveCount(1);
  await page.getByRole('button', { name: 'Try configured demo mode' }).click();
  await expect(
    page.getByText('Only the selected microphone is captured.', { exact: false }),
  ).toBeVisible();
  await page.screenshot({ path: 'artifacts/dashboard.png', fullPage: true });
});
test('AudioWorklet captures synthetic microphone PCM and cleans up on pause', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try configured demo mode' }).click();
  await page.getByRole('button', { name: 'Start interpretation', exact: true }).click();
  await expect(page.getByText('MICROPHONE LIVE', { exact: false })).toBeVisible();
  await expect(page.locator('.transcript-log')).toContainText('Welcome to SignCast.', {
    timeout: 15000,
  });
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByText('Microphone off', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Stop & clear' }).click();
});
