/** Reading participant lists from CSV or XLSX (first sheet), without external libraries. */

export type SheetRows = string[][];

export function parseCsv(text: string): SheetRows {
  const rows: SheetRows = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      row.push(cell); cell = '';
    } else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some(v => v.trim())) rows.push(row);
      row = []; cell = '';
    } else cell += ch;
  }
  row.push(cell);
  if (row.some(v => v.trim())) rows.push(row);
  return rows;
}

const WANTED_PARTS = /^xl\/(worksheets\/sheet1\.xml|sharedStrings\.xml)$/;

/** Minimal ZIP reader: extracts sheet1.xml and sharedStrings.xml. */
async function readXlsxParts(file: Blob): Promise<Record<string, string>> {
  const buf = await file.arrayBuffer();
  const dv = new DataView(buf), bytes = new Uint8Array(buf);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw Error('קובץ Excel לא תקין');
  const count = dv.getUint16(end + 10, true);
  let pos = dv.getUint32(end + 16, true);
  const files: Record<string, string> = {};
  const decoder = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(pos, true) !== 0x02014b50) break;
    const method = dv.getUint16(pos + 10, true), len = dv.getUint32(pos + 20, true);
    const nameLen = dv.getUint16(pos + 28, true), extraLen = dv.getUint16(pos + 30, true), commentLen = dv.getUint16(pos + 32, true);
    const localOffset = dv.getUint32(pos + 42, true);
    const name = decoder.decode(bytes.slice(pos + 46, pos + 46 + nameLen));
    pos += 46 + nameLen + extraLen + commentLen;
    if (!WANTED_PARTS.test(name)) continue;
    const base = localOffset + 30 + dv.getUint16(localOffset + 26, true) + dv.getUint16(localOffset + 28, true);
    const raw = bytes.slice(base, base + len);
    let output: Uint8Array;
    if (method === 0) output = raw;
    else if (method === 8) {
      if (typeof DecompressionStream === 'undefined') throw Error('הדפדפן אינו תומך בקריאת XLSX. שמרו מ־Excel כ־CSV.');
      const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      output = new Uint8Array(await new Response(stream).arrayBuffer());
    } else throw Error('סוג דחיסה לא נתמך');
    files[name] = decoder.decode(output);
  }
  return files;
}

export async function parseXlsx(file: Blob): Promise<SheetRows> {
  const files = await readXlsxParts(file);
  const parse = (x: string) => new DOMParser().parseFromString(x, 'application/xml');
  const sheet = files['xl/worksheets/sheet1.xml'];
  if (!sheet) throw Error('לא נמצאה גיליון ראשון בקובץ');
  const shared = files['xl/sharedStrings.xml'];
  const strings = shared
    ? Array.from(parse(shared).getElementsByTagName('si')).map(si => Array.from(si.getElementsByTagName('t')).map(t => t.textContent).join(''))
    : [];
  const rows: SheetRows = [];
  for (const node of Array.from(parse(sheet).getElementsByTagName('row'))) {
    const cells: string[] = [];
    for (const c of Array.from(node.getElementsByTagName('c'))) {
      const col = (c.getAttribute('r') || 'A').match(/^[A-Z]+/)?.[0] || 'A';
      let index = 0;
      for (const letter of col) index = index * 26 + letter.charCodeAt(0) - 64;
      const raw = c.getElementsByTagName('v')[0]?.textContent || '';
      const type = c.getAttribute('t');
      cells[index - 1] = type === 's' ? strings[Number(raw)] || '' : type === 'inlineStr' ? c.getElementsByTagName('t')[0]?.textContent || '' : raw;
    }
    rows.push(Array.from(cells, x => x || ''));
  }
  return rows;
}

export interface ImportedParticipant { name: string; birth: string; heatName: string; shirt: string; }

/** Maps sheet rows to participants by header names (Hebrew or English). Max 500 rows. */
export function rowsToParticipants(rows: SheetRows): ImportedParticipant[] {
  if (rows.length < 2) throw Error('לא נמצאו שורות משתתפים');
  const heads = rows[0].map(x => String(x || '').trim().toLowerCase());
  const column = (terms: string[], fallback: number) => {
    const i = heads.findIndex(h => terms.some(t => h.includes(t)));
    return i < 0 ? fallback : i;
  };
  const ni = column(['שם', 'name'], 0), di = column(['תאריך', 'birth', 'date'], 1);
  const hi = column(['מקצה', 'מסלול', 'heat', 'route'], 2), si = column(['חולצה', 'מידה', 'shirt', 'size'], 3);
  return rows.slice(1, 501)
    .map(row => ({ name: String(row[ni] || '').trim(), birth: String(row[di] || ''), heatName: String(row[hi] || '').trim(), shirt: String(row[si] || '') }))
    .filter(p => p.name);
}
