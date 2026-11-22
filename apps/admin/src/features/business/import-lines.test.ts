import { describe, expect, it } from 'vitest';
import { parseCsv, parseNumber, parseRows } from './import-lines';

describe('document line import', () => {
  it('reads the required columns in any order and case, with Serbian numbers', () => {
    const rows = parseCsv(
      String.fromCharCode(0xfeff) +
        'JM;Naziv;KOLIČINA;Cena bez PDV;PDV %\r\nkom;Coca Cola 0,5 l;24;54,00;20\r\nKG;Proteinski prah;1,5;3.200,00;10\r\n;;;;\r\n',
    );
    const r = parseRows(rows);
    expect(r.errors).toEqual([]);
    expect(r.lines).toEqual([
      { name: 'Coca Cola 0,5 l', qty: 24, unit: 'kom', price: 54, vatRate: 20, discountPct: null },
      {
        name: 'Proteinski prah',
        qty: 1.5,
        unit: 'kg',
        price: 3200,
        vatRate: 10,
        discountPct: null,
      },
    ]);
  });

  it('reports missing columns and bad rows with their row number', () => {
    expect(parseRows([['Naziv', 'Cena']]).errors[0]!.key).toBe(
      'admin.business.import.missing_columns',
    );
    const r = parseRows([
      ['Naziv', 'Kolicina', 'JM'],
      ['Voda', '0', 'kom'],
      ['Sok', '5', 'boca'],
      ['', '2', 'kom'],
      ['Mleko', '2', 'L'],
    ]);
    expect(r.errors).toEqual([
      { row: 2, key: 'admin.business.import.bad_qty' },
      { row: 3, key: 'admin.business.import.bad_unit' },
      { row: 4, key: 'admin.business.import.no_name' },
    ]);
    expect(r.lines).toEqual([
      { name: 'Mleko', qty: 2, unit: 'l', price: null, vatRate: null, discountPct: null },
    ]);
  });

  it('parses numbers from Excel cells and text', () => {
    expect(parseNumber(12)).toBe(12);
    expect(parseNumber('1.234,50')).toBe(1234.5);
    expect(parseNumber('20%')).toBe(20);
    expect(parseNumber('abc')).toBeNull();
  });

  it('keeps quoted CSV fields with separators', () => {
    expect(parseCsv('Naziv,Kolicina,JM\n"Voda, 0,5 l",24,kom\n')).toEqual([
      ['Naziv', 'Kolicina', 'JM'],
      ['Voda, 0,5 l', '24', 'kom'],
    ]);
  });
});
