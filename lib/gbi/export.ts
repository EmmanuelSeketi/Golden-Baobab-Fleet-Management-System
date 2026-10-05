// Client-side export helpers. Data is fetched through the normal Supabase
// client, so RLS applies exactly as it does everywhere else : an export only
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

// A named block of rows sharing the same headers : one per Excel worksheet, or
// one per labelled CSV section.
export type ExportSection = {
  name: string
  headers: string[]
  rows: (string | number)[][]
}

// Excel worksheet names are capped at 31 chars, cannot contain : \ / ? * [ ],
// cannot be blank, and must be unique within the workbook.
function sanitizeSheetName(name: string, used: Set<string>): string {
  const base = (name || 'Sheet').replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31) || 'Sheet'
  let candidate = base
  let n = 2
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${n})`
    candidate = base.slice(0, 31 - suffix.length) + suffix
    n++
  }
  used.add(candidate.toLowerCase())
  return candidate
}

// Multi-sheet workbook : each section becomes its own worksheet.
export async function exportXlsxSheets(filename: string, sections: ExportSection[]) {
  const XLSX = await import('xlsx')
  const workbook = XLSX.utils.book_new()
  const used = new Set<string>()
  for (const section of sections) {
    const worksheet = XLSX.utils.aoa_to_sheet([section.headers, ...section.rows])
    XLSX.utils.book_append_sheet(workbook, worksheet, sanitizeSheetName(section.name, used))
  }
  if (workbook.SheetNames.length === 0) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([]), 'Sheet1')
  }
  const output = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  triggerDownload(
    new Blob([output], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    filename,
  )
}

// CSV has no concept of sheets, so each section is written as a labelled block
// separated by a blank line : the closest single-file equivalent.
export function exportCsvSections(filename: string, sections: ExportSection[]) {
  const escape = (value: string | number) => {
    const s = String(value)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const blocks = sections.map((section) =>
    [[`Site location: ${section.name}`], section.headers, ...section.rows]
      .map((r) => r.map(escape).join(','))
      .join('\r\n'),
  )
  const csv = blocks.join('\r\n\r\n')
  // Prepend a BOM so Excel opens UTF-8 CSVs with correct encoding.
  triggerDownload(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }), filename)
}
