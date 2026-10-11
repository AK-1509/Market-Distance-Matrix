import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../fixtures/example';
import { checkProductForm, formFromProduct, productFromForm } from './productForm';

describe('product form round trip', () => {
  it('saving an untouched form preserves every stored value exactly', () => {
    const p = createExampleProject();
    for (const prod of p.products) {
      const f = formFromProduct(prod, prod.id === p.idvProductId);
      expect(checkProductForm(f, { tam: p.tam, unit: p.marketUnit }).errors).toEqual({});
      expect(productFromForm(f)).toEqual(prod);
    }
  });

  it('keeps invalid raw input in the form and reports useful errors', () => {
    const p = createExampleProject();
    const f = formFromProduct(p.products[1], false);
    f.sam = '35O,000';
    f.percents[f.segmentIds[0]] = '50';
    const check = checkProductForm(f, { tam: p.tam, unit: p.marketUnit });
    expect(check.errors.sam).toMatch(/number/);
    expect(check.errors.split).toMatch(/totals/);
    expect(f.sam).toBe('35O,000');
  });

  it('allows a draft without SAM or segments but warns', () => {
    const p = createExampleProject();
    const f = formFromProduct(p.products[1], false);
    f.sam = '';
    f.segmentIds = [];
    const check = checkProductForm(f, { tam: p.tam, unit: p.marketUnit });
    expect(check.errors).toEqual({});
    expect(check.warnings.sam).toBeTruthy();
    expect(check.warnings.segments).toBeTruthy();
    expect(productFromForm(f).sam).toBeNull();
  });
});
