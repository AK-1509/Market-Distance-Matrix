import { expect, test, type Download, type Locator, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ARTIFACTS = path.resolve('test-results', 'exports');
mkdirSync(ARTIFACTS, { recursive: true });

const panel = (page: Page) => page.getByTestId('side-panel');
const form = (page: Page) => page.getByTestId('product-form');
const bars = (page: Page) => page.getByTestId('distance-chart');

async function addProduct(page: Page, p: { name: string; description: string; sam: string; pick?: string[]; create?: string[] }) {
  const f = form(page);
  await f.getByLabel('Name', { exact: true }).fill(p.name);
  await f.getByLabel('Short description').fill(p.description);
  await f.getByLabel(/^SAM/).fill(p.sam);
  for (const s of p.pick ?? []) await f.getByRole('button', { name: s, exact: true }).click();
  for (const s of p.create ?? []) {
    await f.getByLabel('New segment name').fill(s);
    await f.getByRole('button', { name: 'Add segment' }).click();
  }
  await f.getByRole('button', { name: 'Add product' }).click();
  await expect(form(page)).toHaveCount(0);
}

async function waitSaved(page: Page) {
  await expect(page.getByTestId('save-status')).toHaveText(/^Saved/);
}

function pngSize(buf: Buffer): { width: number; height: number } {
  expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(buf.subarray(12, 16).toString('ascii')).toBe('IHDR');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

async function exportFile(page: Page, item: string): Promise<{ download: Download; file: string; buf: Buffer }> {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: new RegExp(`^${item}`) }).click()]);
  const file = path.join(ARTIFACTS, download.suggestedFilename());
  await download.saveAs(file);
  const buf = readFileSync(file);
  expect(buf.length).toBeGreaterThan(500);
  await page.keyboard.press('Escape');
  return { download, file, buf };
}

/** Bounding boxes of product name labels in the radial chart must not overlap. */
async function expectReadableLabels(chart: Locator, names: string[]) {
  const boxes = await chart.evaluate((svg, wanted) => {
    const out: { text: string; x: number; y: number; w: number; h: number }[] = [];
    svg.querySelectorAll('text').forEach((t) => {
      const text = t.textContent ?? '';
      if (wanted.some((n) => text.startsWith(n))) {
        const b = (t as SVGTextElement).getBBox();
        out.push({ text, x: b.x, y: b.y, w: b.width, h: b.height });
      }
    });
    return out;
  }, names);
  for (const n of names) expect(boxes.some((b) => b.text.startsWith(n)), `label for ${n}`).toBe(true);
  for (const b of boxes) expect(b.h, `${b.text} font height`).toBeGreaterThanOrEqual(10);
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const c = boxes[j];
      const overlap = a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h;
      expect(overlap, `${a.text} overlaps ${c.text}`).toBe(false);
    }
  }
}

test('create, edit through the chart, persist, recover from invalid input, keyboard and injection safety', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');

  // 1. Create a project, the IDV and two competitors.
  await page.getByRole('button', { name: 'Create project' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Project name').fill('Field service software');
  await dialog.getByLabel('Market description').fill('Scheduling tools for field-service businesses.');
  await dialog.getByLabel('TAM').fill('10,000');
  await dialog.getByLabel('Market-size unit').selectOption('organizations');
  await dialog.getByLabel('Reference date or year').fill('2026');
  await dialog.getByRole('button', { name: 'Create project' }).click();

  await expect(panel(page).getByRole('heading', { name: 'Add your IDV' })).toBeVisible();
  await expect(form(page).getByLabel(/This is the IDV/)).toBeChecked();
  await addProduct(page, { name: 'FieldPro', description: 'Our scheduling product.', sam: '4000', create: ['Enterprise', 'SMB'] });
  await page.getByRole('button', { name: 'Close panel' }).click();

  await page.getByRole('button', { name: 'Add competitor' }).first().click();
  await addProduct(page, { name: 'RouteMate', description: 'Route planning for small crews.', sam: '3k', pick: ['SMB'] });
  await page.getByRole('button', { name: 'Close panel' }).click();
  await page.getByRole('button', { name: 'Add competitor' }).first().click();
  await addProduct(page, { name: 'Dispatchly', description: 'Fast & "simple" < 5 min setup.', sam: '2000', pick: ['Enterprise'], create: ['Mid-market'] });
  await page.getByRole('button', { name: 'Close panel' }).click();

  // d(RouteMate) = sqrt(1 - 2000/sqrt(4000*3000)) = 0.650; d(Dispatchly) = sqrt(1 - 1000/sqrt(4000*2000)) = 0.804
  await expect(bars(page).getByTestId('distance-bar')).toHaveCount(2);
  await expect(bars(page)).toContainText('0.650');
  await expect(bars(page)).toContainText('0.804');
  await expect(page.getByTestId('radial-chart').getByTestId('product-marker')).toHaveCount(2);
  await expect(page.getByTestId('idv-marker')).toBeVisible();
  await expect(page.getByTestId('summary')).toContainText('RouteMate is closest to FieldPro, at a modelled distance of 0.650');
  await expect(page.getByTestId('fit-note')).toContainText('Map distance error');

  // 2. Edit a product through the chart; both graphs and the summary update.
  await page.getByRole('button', { name: /^RouteMate, modelled distance 0\.650/ }).click();
  await expect(panel(page).getByTestId('panel-metrics')).toContainText('0.650');
  await panel(page).getByRole('button', { name: 'Edit', exact: true }).click();
  await form(page).getByLabel(/^SAM/).fill('2000'); // d = sqrt(1 - 2000/sqrt(8e6)) = 0.541
  await form(page).getByRole('button', { name: 'Save changes' }).click();
  await expect(bars(page)).toContainText('0.541');
  await expect(page.getByRole('button', { name: /^RouteMate, modelled distance 0\.541/ })).toBeVisible();
  await expect(page.getByTestId('summary')).toContainText('at a modelled distance of 0.541');
  await expect(panel(page).getByTestId('panel-metrics')).toContainText('0.541');

  // 3. Refresh: the project persists.
  await waitSaved(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Field service software' })).toBeVisible();
  await expect(bars(page)).toContainText('0.541');
  await expect(page.getByTestId('products-table')).toContainText('Dispatchly');

  // 4. Invalid SAM and allocation: useful errors, then recovery without losing input.
  await page.getByTestId('products-table').getByRole('button', { name: 'RouteMate' }).click();
  await panel(page).getByRole('button', { name: 'Edit', exact: true }).click();
  await form(page).getByLabel(/^SAM/).fill('abc');
  await form(page).getByRole('button', { name: 'Save changes' }).click();
  await expect(form(page)).toContainText('Enter a number such as 350000');
  await expect(form(page).getByLabel(/^SAM/)).toHaveValue('abc'); // input kept
  await form(page).getByLabel(/^SAM/).fill('50000');
  await expect(form(page)).toContainText('exceeds the project TAM (10,000 organizations)');
  await form(page).getByRole('button', { name: 'Save changes' }).click(); // saving an invalid draft is allowed
  const banner = page.getByTestId('analysis-errors');
  await expect(banner).toContainText('The analysis is not current');
  await expect(banner).toContainText('SAM (50,000 organizations) exceeds the project TAM');
  await expect(page.locator('.badge.stale').first()).toBeVisible();

  await page.getByTestId('products-table').getByRole('button', { name: 'Dispatchly' }).click();
  await panel(page).getByRole('button', { name: 'Edit', exact: true }).click();
  await form(page).getByText('Adjust segment split').click();
  await form(page).getByLabel('Custom percentages').check();
  await form(page).getByLabel('Enterprise percent').fill('60');
  await form(page).getByLabel('Mid-market percent').fill('30');
  await expect(form(page).getByTestId('split-total')).toHaveText('90%');
  await expect(form(page)).toContainText('Custom segment split totals 90.00%; it must total 100%.');
  await form(page).getByRole('button', { name: 'Save changes' }).click();
  await expect(banner).toContainText('Custom segment split totals 90.00%');

  // Recover both, keeping the other inputs.
  await panel(page).getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(form(page).getByLabel('Enterprise percent')).toHaveValue('60');
  await form(page).getByLabel('Mid-market percent').fill('40');
  await form(page).getByRole('button', { name: 'Save changes' }).click();
  await banner.getByRole('button', { name: 'Edit' }).first().click();
  await expect(form(page).getByLabel('Short description')).toHaveValue('Route planning for small crews.');
  await form(page).getByLabel(/^SAM/).fill('2000');
  await form(page).getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByTestId('analysis-errors')).toHaveCount(0);
  // Dispatchly 60/40: overlap min(2000, 1200) = 1200 -> d = sqrt(1 - 1200/sqrt(8e6)) = 0.759
  await expect(bars(page)).toContainText('0.759');
  await expect(bars(page)).toContainText('0.541');
  await expect(page.locator('.badge.stale')).toHaveCount(0);

  // 8a. Keyboard access to editing via the chart.
  await page.getByRole('button', { name: 'Close panel' }).click();
  const marker = page.getByRole('button', { name: /^Dispatchly, modelled distance/ });
  await expect(marker).toHaveAttribute('tabindex', '0');
  await marker.focus();
  await page.keyboard.press('Enter');
  await expect(panel(page).getByRole('heading', { name: /Dispatchly/ })).toBeFocused();
  await page.keyboard.press('Tab'); // close button
  await page.keyboard.press('Tab'); // first control after the heading area
  const editBtn = panel(page).getByRole('button', { name: 'Edit', exact: true });
  await editBtn.focus();
  await page.keyboard.press('Enter');
  await expect(form(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await form(page).getByRole('button', { name: 'Cancel' }).click();

  // 8b. Injected markup in names and source links is shown as text, never executed.
  await page.getByRole('button', { name: 'Close panel' }).click();
  await page.getByRole('button', { name: 'Add competitor' }).first().click();
  const evil = '<img src=x onerror="window.__xss=1">';
  await form(page).getByLabel('Name', { exact: true }).fill(evil);
  await form(page).getByLabel('Short description').fill('<script>window.__xss=2</script>');
  await form(page).getByLabel(/^SAM/).fill('1000');
  await form(page).getByRole('button', { name: 'SMB', exact: true }).click();
  await form(page).getByText(/^References/).click();
  await form(page).getByRole('button', { name: 'Add reference' }).click();
  await form(page).getByLabel('Reference 1 URL').fill('javascript:window.__xss=3');
  await expect(form(page)).toContainText('Use an http:// or https:// link.');
  await expect(form(page)).toContainText('contains HTML-like markup');
  await form(page).getByRole('button', { name: 'Add product' }).click();
  await expect(page.getByTestId('products-table')).toContainText(evil);
  await expect(panel(page).locator('#panel-title')).toContainText(evil);
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  expect(await page.locator('img[src="x"]').count()).toBe(0);
  expect(await page.locator('a[href^="javascript"]').count()).toBe(0);
  // Remove the hostile product again so the project is clean.
  await panel(page).getByRole('button', { name: 'Edit', exact: true }).click();
  await form(page).getByRole('button', { name: 'Delete product' }).click();
  await form(page).getByRole('group', { name: 'Delete this product?' }).getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByTestId('products-table')).not.toContainText('onerror');
  await expect(page.getByTestId('analysis-errors')).toHaveCount(0);
  await waitSaved(page);

  // The escaped description survives into the report.
  const report = await exportFile(page, 'Report');
  const html = report.buf.toString('utf8');
  expect(html).toContain('Fast &amp; &quot;simple&quot; &lt; 5 min setup.');
  expect(html).not.toMatch(/<script/i);
  expect(errors).toEqual([]);
});

test('fictional demo: readable labels, exports, and JSON import as a new project', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const names = ['ChatGPT', 'Claude', 'Gemini', 'Grok', 'DeepSeek'];
  const expected = ['0.532', '0.673', '0.801', '0.847'];

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open example' }).click();
  await expect(page.getByRole('heading', { name: 'AI assistants — fictional market footprints' })).toBeVisible();
  const chart = page.getByTestId('radial-chart');
  await expect(chart.getByTestId('product-marker')).toHaveCount(4);
  for (const d of expected) await expect(bars(page)).toContainText(d);
  await expect(page.getByTestId('fit-note')).toContainText('Map distance error');

  // 5. Readable labels at desktop and narrow widths, with and without segments.
  await expectReadableLabels(chart, names);
  await page.screenshot({ path: path.join(ARTIFACTS, 'demo-desktop.png'), fullPage: true });
  await page.getByLabel('Show segments').check();
  await expect(chart.getByTestId('segment-marker')).toHaveCount(4);
  await expectReadableLabels(chart, names);
  await chart.getByTestId('segment-marker').first().click();
  await expect(panel(page)).toContainText('modelled segment center');
  await page.getByRole('button', { name: 'Close panel' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expectReadableLabels(chart, names);
  await chart.screenshot({ path: path.join(ARTIFACTS, 'demo-narrow-map.png') });
  await page.screenshot({ path: path.join(ARTIFACTS, 'demo-narrow.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await waitSaved(page);

  // 6. Exports: correct types, dimensions and content.
  const lpng = await exportFile(page, 'Landscape PNG');
  expect(lpng.download.suggestedFilename()).toMatch(/landscape\.png$/);
  expect(pngSize(lpng.buf)).toEqual({ width: 1920, height: 1080 });

  const lsvg = await exportFile(page, 'Landscape SVG');
  const svgText = lsvg.buf.toString('utf8');
  expect(svgText.startsWith('<?xml')).toBe(true);
  expect(svgText).toContain('viewBox="0 0 1920 1080"');
  expect(svgText).toContain('<style>');
  for (const n of names) expect(svgText).toContain(n);
  expect(svgText).toContain('Modelled segment center');
  expect(svgText).not.toMatch(/<script|<image|@import|url\(|xlink:href|href="http/i);

  const dpng = await exportFile(page, 'Distance chart PNG');
  const dsize = pngSize(dpng.buf);
  expect(dsize.width).toBe(1920);
  expect(dsize.height).toBeGreaterThanOrEqual(1080);
  const dsvg = await exportFile(page, 'Distance chart SVG');
  const dsvgText = dsvg.buf.toString('utf8');
  for (const n of names.slice(1)) expect(dsvgText).toContain(n);
  for (const d of expected) expect(dsvgText).toContain(d);
  expect(dsvgText).toContain('Near IDV');
  expect(dsvgText).toContain('Farther');

  // Clean presentation variant keeps a minimal model footnote and every name.
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByLabel('Clean presentation variant (charts)').check();
  await page.keyboard.press('Escape');
  const clean = await exportFile(page, 'Landscape SVG');
  const cleanText = clean.buf.toString('utf8');
  expect(clean.download.suggestedFilename()).toMatch(/landscape-clean\.svg$/);
  for (const n of names) expect(cleanText).toContain(n);
  expect(cleanText).toContain('nested-overlap assumption');
  const cleanPng = await exportFile(page, 'Landscape PNG');
  expect(pngSize(cleanPng.buf)).toEqual({ width: 1920, height: 1080 });

  const report = await exportFile(page, 'Report');
  const html = report.buf.toString('utf8');
  expect(report.download.suggestedFilename()).toMatch(/report\.html$/);
  expect(html.startsWith('<!doctype html>')).toBe(true);
  expect(html).toContain("Content-Security-Policy");
  expect(html).not.toMatch(/<script/i);
  expect((html.match(/<svg/g) ?? []).length).toBe(2);
  for (const heading of ['Summary', 'Competitive landscape', 'Methodology', 'References', 'Distance matrix']) expect(html).toContain(heading);
  for (const n of names) expect(html).toContain(n);
  expect(html).toContain('Gemini</strong> is closest to ChatGPT, at a modelled distance of 0.532');

  const json = await exportFile(page, 'Project JSON');
  const envelope = JSON.parse(json.buf.toString('utf8'));
  expect(envelope.format).toBe('market-landscape-project');
  expect(envelope.schemaVersion).toBe(1);
  expect(envelope.modelVersion).toBe('nested-overlap-1.0');
  expect(envelope.project.products).toHaveLength(5);
  expect(envelope.layoutCache.positions).toBeTruthy();

  // Visual inspection copies: open the report in the browser and screenshot it.
  const reportPage = await page.context().newPage();
  await reportPage.goto(`file://${report.file}`);
  await reportPage.screenshot({ path: path.join(ARTIFACTS, 'report.png'), fullPage: true });
  await reportPage.emulateMedia({ media: 'print' });
  const pdf = await reportPage.pdf({ format: 'A4' });
  writeFileSync(path.join(ARTIFACTS, 'report-print.pdf'), pdf);
  expect(pdf.length).toBeGreaterThan(10_000);
  await reportPage.close();

  // 7. Import the JSON as a new project: same metrics, editable fields, original untouched.
  await page.goto('/');
  await page.getByTestId('import-input').setInputFiles(json.file);
  await expect(page.getByTestId('projects-message')).toContainText('as a new project');
  await expect(page.getByTestId('project-card')).toHaveCount(2);
  await page.getByTestId('projects-message').getByRole('link', { name: 'Open it' }).click();
  await expect(page.getByRole('heading', { name: 'AI assistants — fictional market footprints (imported)' })).toBeVisible();
  for (const d of expected) await expect(bars(page)).toContainText(d);
  await expect(page.getByTestId('relationship-table')).toContainText('300,000');
  await page.getByTestId('products-table').getByRole('button', { name: 'Claude' }).click();
  await panel(page).getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(form(page).getByLabel('Name', { exact: true })).toHaveValue('Claude');
  await expect(form(page).getByLabel(/^SAM/)).toHaveValue('350000');

  // Invalid import is rejected with a useful message and changes nothing.
  await page.goto('/');
  const bad = path.join(ARTIFACTS, 'future.json');
  writeFileSync(bad, JSON.stringify({ ...envelope, schemaVersion: 99 }));
  await page.getByTestId('import-input').setInputFiles(bad);
  await expect(page.getByTestId('projects-message')).toContainText('newer version');
  await expect(page.getByTestId('project-card')).toHaveCount(2);
  expect(errors).toEqual([]);
});
