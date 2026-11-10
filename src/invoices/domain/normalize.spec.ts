import { normalizeKey, normalizeProductKey, normalizeVendorKey } from './normalize.js';

describe('normalizers', () => {
  it('ignores case, accents, punctuation and spacing', () => {
    expect(normalizeKey('Café Molido 1kg')).toBe(normalizeKey('CAFE  MOLIDO 1 KG'));
  });

  it('identifies vendors by tax id first', () => {
    expect(normalizeVendorKey('Iberdrola Clientes, S.A.U.', 'A-95758389')).toBe('tax:A95758389');
    expect(normalizeVendorKey('IBERDROLA CLIENTES', 'a95758389')).toBe('tax:A95758389');
  });

  it('drops legal suffixes when there is no tax id', () => {
    expect(normalizeVendorKey('Papelería López S.L.', null)).toBe(normalizeVendorKey('PAPELERIA LOPEZ', null));
  });

  it('identifies products by SKU, otherwise by description', () => {
    expect(normalizeProductKey('Whatever', 'SKU-001')).toBe('sku:sku 001');
    expect(normalizeProductKey('Leche entera 1L', null)).toBe('name:leche entera 1l');
  });
});
