import { expect, test, type Download, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

/** Expected modeled distances for the journey project (computed by hand from the overlap model):
 *  Atlas (IDV) 400k = Engineering 200k + Design 200k.
 *  Beacon 300k = Engineering 150k + Sales 150k → overlap 150k → d = √(1 − 150/√(400·300)) = 0.753
 *  Comet 200k = Design 200k → overlap 200k → d = √(1 − 200/√(400·200)) = 0.541
 *  Comet edited to 100k → d = √(1 − 100/√(400·100)) = 0.707
 *  Beacon custom split 70/30 → Engineering 210k → overlap 200k → d = √(1 − 200/√(400·300)) = 0.650 */

const dialog = (page: Page) => page.locator('dialog[open]');
const radial = (page: Page) => page.getByTestId('radial-chart');
const bars = (page: Page) => page.getByTestId('distance-chart');

async function svgTexts(chart: Locator): Promise<string[]> {
  return chart.locator('svg text').allTextContents();
}

async function addSegment(page: Page, name: string) {
  await dialog(page).getByLabel('New segment name').fill(name);
  await dialog(page).getByRole('button', { name: 'Add segment' }).click();
}

async function saveProduct(page: Page) {
  await dialog(page).getByRole('button', { name: 'Save product' }).click();
  await expect(dialog(page)).toHaveCount(0);
}

function pngSize(buf: Buffer): { width: number; height: number } {
  expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

async function readDownload(d: Download): Promise<Buffer> {
  const p = await d.path();
  return readFile(p as string);
}

test('create → analyze → edit via chart → persist → invalid input recovery', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create project' }).click();
  await dialog(page).locator('input[name="projectName"]').fill('Team chat tools');
  await dialog(page).locator('textarea[name="marketDescription"]').fill('Small teams choosing a chat tool');
  await dialog(page).locator('input[name="tam"]').fill('1,000,000');
  await dialog(page).getByRole('button', { name: 'Create project' }).click();

  // IDV
  await page.getByRole('button', { name: 'Add main product (IDV)' }).first().click();
  await expect(dialog(page).getByRole('checkbox', { name: /This is the IDV/ })).toBeChecked();
  await dialog(page).locator('input[name="name"]').fill('Atlas');
  await dialog(page).locator('textarea[name="description"]').fill('Our product');
  await dialog(page).locator('input[name="sam"]').fill('400,000');
  await addSegment(page, 'Engineering');
  await addSegment(page, 'Design');
  await expect(dialog(page).getByText(/Equal split assumption: 50% of SAM/)).toBeVisible();
  await saveProduct(page);

  // Two competitors
  await page.getByRole('button', { name: 'Add competitor' }).click();
  await dialog(page).locator('input[name="name"]').fill('Beacon');
  await dialog(page).locator('textarea[name="description"]').fill('Engineering-focused chat');
  await dialog(page).locator('input[name="sam"]').fill('300000');
  await dialog(page).locator('.chip', { hasText: 'Engineering' }).click();
  await addSegment(page, 'Sales');
  await saveProduct(page);

  await page.getByRole('button', { name: 'Add competitor' }).click();
  await dialog(page).locator('input[name="name"]').fill('Comet');
  await dialog(page).locator('textarea[name="description"]').fill('Design-team chat');
  await dialog(page).locator('input[name="sam"]').fill('200,000');
  await dialog(page).locator('.chip', { hasText: 'Design' }).click();
  await saveProduct(page);

  // Both graphs and the summary
  await expect(radial(page).locator('svg')).toBeVisible();
  await expect.poll(() => svgTexts(radial(page))).toEqual(expect.arrayContaining(['Atlas (IDV)', 'Beacon', 'Comet']));
  await expect.poll(() => svgTexts(bars(page))).toEqual(expect.arrayContaining(['Beacon', 'Comet', '0.541', '0.753']));
  await expect(page.locator('.summary')).toContainText('Nearest by modeled distance: Comet (0.541) and Beacon (0.753)');

  // Edit through the chart: select Comet's marker, then Edit in the side panel.
  await radial(page).getByRole('button', { name: /^Comet, distance/ }).click();
  await expect(page.getByTestId('side-panel-product')).toContainText('Comet');
  await page.getByTestId('side-panel-product').getByRole('button', { name: 'Edit Comet' }).click();
  await dialog(page).locator('input[name="sam"]').fill('100,000');
  await saveProduct(page);
  await expect.poll(() => svgTexts(bars(page))).toContain('0.707');
  expect(await svgTexts(bars(page))).not.toContain('0.541');
  await expect(page.locator('.summary')).toContainText('Comet (0.707)');
  await expect(radial(page).getByRole('button', { name: /^Comet, distance 0\.707/ })).toBeVisible();
  await expect(page.getByTestId('save-state')).toHaveText(/Saved/);

  // Refresh: the project persists.
  await page.reload();
  await expect.poll(() => svgTexts(bars(page))).toEqual(expect.arrayContaining(['Beacon', 'Comet', '0.707', '0.753']));
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Team chat tools');

  // Invalid SAM and allocation values: useful errors, input preserved, then recovery.
  await page.locator('.products-table').getByRole('button', { name: 'Edit Beacon' }).click();
  const sam = dialog(page).locator('input[name="sam"]');
  await sam.fill('3OO,000');
  await expect(dialog(page).getByText('Enter SAM as a number, for example 350,000.')).toBeVisible();
  await dialog(page).getByText('Adjust segment split').click();
  await dialog(page).getByRole('button', { name: 'Use a custom split' }).click();
  await dialog(page).getByLabel('Share of SAM for Engineering (percent)').fill('70');
  await expect(dialog(page).getByText(/custom split totals 120%/)).toBeVisible();
  await dialog(page).getByRole('button', { name: 'Save product' }).click();
  await expect(dialog(page).getByText('Please fix the highlighted fields. Your entries are kept.')).toBeVisible();
  await expect(sam).toHaveValue('3OO,000');
  await expect(dialog(page).getByLabel('Share of SAM for Engineering (percent)')).toHaveValue('70');
  await sam.fill('300,000');
  await dialog(page).getByLabel('Share of SAM for Sales (percent)').fill('30');
  await expect(dialog(page).getByText(/Total: 100%/)).toBeVisible();
  await saveProduct(page);
  await expect.poll(() => svgTexts(bars(page))).toContain('0.650');

  // Project-level reconciliation: modeled union above TAM pauses the analysis without rescaling.
  await page.locator('.ws-header').getByRole('button', { name: 'Edit project' }).click();
  await dialog(page).locator('input[name="tam"]').fill('450,000');
  await dialog(page).getByRole('button', { name: 'Save project' }).click();
  await expect(page.getByTestId('analysis-errors')).toContainText('The modeled footprints cover 500,000');
  await expect(page.getByTestId('stale-banner')).toBeVisible();
  await page.getByTestId('analysis-errors').getByRole('button', { name: 'Edit project' }).click();
  await dialog(page).locator('input[name="tam"]').fill('1,000,000');
  await dialog(page).getByRole('button', { name: 'Save project' }).click();
  await expect(page.getByTestId('analysis-errors')).toHaveCount(0);
  await expect(page.getByTestId('stale-banner')).toHaveCount(0);
  await expect.poll(() => svgTexts(bars(page))).toContain('0.650');
});

async function expectReadableLabels(page: Page, names: string[]) {
  const texts = radial(page).locator('svg g.viz-target text');
  await expect.poll(async () => (await texts.allTextContents()).join('|')).toContain(names[names.length - 1]);
  const boxes: { text: string; x: number; y: number; w: number; h: number }[] = [];
  for (const t of await texts.all()) {
    const text = (await t.textContent()) ?? '';
    if (!names.some((n) => text.startsWith(n))) continue;
    const b = await t.boundingBox();
    expect(b).not.toBeNull();
    const size = Number(await t.getAttribute('font-size'));
    expect(size).toBeGreaterThanOrEqual(11);
    boxes.push({ text, x: b!.x, y: b!.y, w: b!.width, h: b!.height });
  }
  for (const n of names) expect(boxes.some((b) => b.text.startsWith(n))).toBe(true);
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      expect(ox > 1 && oy > 1, `labels "${a.text}" and "${b.text}" overlap`).toBe(false);
    }
  }
}

test('fictional demo: readable labels, exports, and JSON import as a new project', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open example' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('AI assistants — fictional market footprints');
  const names = ['ChatGPT (IDV)', 'Claude', 'Gemini', 'Grok', 'DeepSeek'];
  await expectReadableLabels(page, names);
  await expect.poll(() => svgTexts(bars(page))).toEqual(expect.arrayContaining(['0.532', '0.673', '0.801', '0.847']));
  await page.screenshot({ path: 'test-results/demo-desktop.png', fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await expectReadableLabels(page, names);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/demo-narrow.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });

  // Exports
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const grab = async (label: string) => {
    const [d] = await Promise.all([page.waitForEvent('download'), dialog(page).getByRole('button', { name: label, exact: true }).click()]);
    return { name: d.suggestedFilename(), data: await readDownload(d) };
  };
  const landscapePng = await grab('Landscape PNG');
  expect(landscapePng.name).toMatch(/landscape\.png$/);
  expect(pngSize(landscapePng.data)).toEqual({ width: 1920, height: 1080 });
  expect(landscapePng.data.length).toBeGreaterThan(30_000);

  const landscapeSvg = await grab('Landscape SVG');
  const svgText = landscapeSvg.data.toString('utf8');
  expect(svgText).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="1920" height="1080"/);
  for (const n of ['ChatGPT (IDV)', 'Claude', 'Gemini', 'Grok', 'DeepSeek', 'Legend', 'Fictional example']) expect(svgText).toContain(n);
  expect(svgText).not.toMatch(/<image|<script|href=/);

  const distPng = await grab('Distance PNG');
  expect(pngSize(distPng.data)).toEqual({ width: 1920, height: 1080 });
  const distSvg = (await grab('Distance SVG')).data.toString('utf8');
  for (const n of ['Claude', 'Gemini', 'Grok', 'DeepSeek', '0.532', '0.847', 'Near IDV']) expect(distSvg).toContain(n);

  const report = (await grab('HTML report')).data.toString('utf8');
  expect(report).toMatch(/^<!doctype html>/);
  expect(report.match(/<svg /g)?.length).toBe(2);
  expect(report).not.toMatch(/<script/i);
  for (const s of ['Summary', 'Methodology', 'References', 'Nearest by modeled distance']) expect(report).toContain(s);

  const json = await grab('Project JSON');
  const parsed = JSON.parse(json.data.toString('utf8'));
  expect(parsed.format).toBe('market-landscape-project');
  expect(parsed.project.products).toHaveLength(5);
  expect(parsed.layoutCache?.inputHash).toMatch(/^[0-9a-f]{16}$/);
  await page.keyboard.press('Escape');

  // Open a representative exported report for visual inspection.
  const reportPage = await page.context().newPage();
  await reportPage.setContent(report);
  await expect(reportPage.locator('h1')).toContainText('AI assistants');
  await reportPage.screenshot({ path: 'test-results/report.png', fullPage: false });
  await reportPage.close();

  // Import as a new project; metrics are equal and fields stay editable.
  await page.getByRole('button', { name: '← All projects' }).click();
  await page.getByTestId('import-input').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: json.data });
  await expect(page.getByTestId('import-message')).toContainText('as a new project');
  const items = page.locator('.project-item');
  await expect(items).toHaveCount(2);
  await page.getByRole('button', { name: 'AI assistants — fictional market footprints (imported)' }).click();
  await expect.poll(() => svgTexts(bars(page))).toEqual(expect.arrayContaining(['0.532', '0.673', '0.801', '0.847']));
  await page.locator('.products-table').getByRole('button', { name: 'Edit Grok' }).click();
  await expect(dialog(page).locator('input[name="sam"]')).toHaveValue('250,000');
  await expect(dialog(page).getByLabel('Share of SAM for Designers (percent)')).toHaveValue('60');
  await dialog(page).getByRole('button', { name: 'Cancel' }).click();

  // A malformed import is rejected without touching storage.
  await page.getByRole('button', { name: '← All projects' }).click();
  const bad = JSON.parse(json.data.toString('utf8'));
  bad.project.products[1].name = '<script>alert(1)</script>';
  await page.getByTestId('import-input').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bad)) });
  await expect(page.getByTestId('import-message')).toContainText('failed validation');
  await expect(items).toHaveCount(2);
});

test('keyboard editing and injected markup stays inert', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open example' }).click();
  await expect(radial(page).locator('svg')).toBeVisible();

  // Keyboard only: Tab reaches chart markers; Enter opens details; Edit opens the form.
  let reached = false;
  for (let i = 0; i < 40 && !reached; i++) {
    await page.keyboard.press('Tab');
    reached = await page.evaluate(() => document.activeElement?.closest('[data-testid="radial-chart"] .viz-target') !== null);
  }
  expect(reached).toBe(true);
  await page.keyboard.press('Enter');
  const edit = page.getByRole('button', { name: /^Edit / }).first();
  await expect(page.locator('.ws-side h2').first()).not.toHaveText('Details');
  await edit.focus();
  await page.keyboard.press('Enter');
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);

  // Executable markup is refused by the form; harmless markup is shown as literal text.
  await page.locator('.products-table').getByRole('button', { name: 'Edit Claude' }).click();
  const name = dialog(page).locator('input[name="name"]');
  await name.fill('<img src=x onerror="window.__pwned=1">');
  await dialog(page).getByRole('button', { name: 'Save product' }).click();
  await expect(dialog(page).getByText(/Remove script-like markup/).first()).toBeVisible();
  await name.fill('Claude <b>Pro</b> & Co');
  await dialog(page).getByText(/References and notes/).click();
  await dialog(page).getByRole('button', { name: '+ Add reference' }).click();
  await dialog(page).locator('input[type="url"]').fill('javascript:alert(1)');
  await dialog(page).getByRole('button', { name: 'Save product' }).click();
  await expect(dialog(page).getByText('Only http:// or https:// links are allowed.')).toBeVisible();
  await dialog(page).locator('input[type="url"]').fill('https://example.com/pricing?a=1&b=2');
  await saveProduct(page);

  await expect(page.getByTestId('side-panel-product')).toContainText('Claude <b>Pro</b> & Co');
  expect(await page.locator('.ws-side b').count()).toBe(0);
  const link = page.getByTestId('side-panel-product').getByRole('link', { name: 'https://example.com/pricing?a=1&b=2' });
  await expect(link).toHaveAttribute('rel', /noopener/);
  await expect.poll(() => svgTexts(radial(page))).toContain('Claude <b>Pro</b> & Co');
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
});
