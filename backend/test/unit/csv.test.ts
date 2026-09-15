import { describe, expect, it } from 'vitest';
import { toCsv } from '../../src/lib/csv.js';

describe('toCsv', () => {
  it('writes a BOM, ";" delimiters and CRLF lines for Turkish Excel', () => {
    expect(toCsv(['Ürün', 'Açıklama'], [['Lahmacun', 'İnce hamur']])).toBe('﻿Ürün;Açıklama\r\nLahmacun;İnce hamur\r\n');
    expect(toCsv(['a'], [['b']], { bom: false })).toBe('a\r\nb\r\n');
  });

  it('quotes cells with delimiters, quotes and line breaks', () => {
    expect(toCsv(['x'], [['a;b'], ['say "hi"'], ['line\nbreak']], { bom: false })).toBe(
      'x\r\n"a;b"\r\n"say ""hi"""\r\n"line\nbreak"\r\n',
    );
  });

  it('neutralizes cells Excel would run as formulas', () => {
    expect(toCsv(['x'], [['=HYPERLINK("http://evil")'], ['+1'], ['-2'], ['@SUM(A1)']], { bom: false })).toBe(
      'x\r\n"\'=HYPERLINK(""http://evil"")"\r\n\'+1\r\n\'-2\r\n\'@SUM(A1)\r\n',
    );
  });
});
