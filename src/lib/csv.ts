function cell(value: string) {
  const safe = /^[\s\u0000-\u001f]*[=+@-]|^[\t\r\n]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

// Formato de planilla local: UTF-8/BOM, punto y coma y campos entre comillas.
export function csvDocument(rows: string[][]): string {
  return '\uFEFF' + rows.map((row) => row.map(cell).join(';')).join('\r\n');
}
