// Client-side export helpers. Data is fetched through the normal Supabase
// client, so RLS applies exactly as it does everywhere else — an export only
// ever contains the rows the signed-in user's role is allowed to read.

export type ExportColumn<T> = {
  header: string
  value: (row: T) => string | number | null | undefined
}

export function buildMatrix<T>(data: T[], columns: ExportColumn<T>[]) {
  const headers = columns.map((c) => c.header)
  const rows = data.map((row) =>
    columns.map((c) => {
      const v = c.value(row)
      return v == null ? '' : v
    }),
  )
  return { headers, rows }
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function exportCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const escape = (value: string | number) => {
    const s = String(value)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [headers, ...rows].map((r) => r.map(escape).join(',')).join('\r\n')
  // Prepend a BOM so Excel opens UTF-8 CSVs with correct encoding.
  triggerDownload(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }), filename)
}

export async function exportXlsx(
  filename: string,
  headers: string[],
  rows: (string | number)[][],
  sheetName = 'Sheet1',
) {
  const XLSX = await import('xlsx')
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
  const output = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  triggerDownload(
    new Blob([output], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    filename,
  )
}
