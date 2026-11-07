import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'
import { GBI_LOGO_URL, SDLG_LOGO_URL, type LogoChoice } from '@/lib/gbi/contract-doc'

export type QuotationLineItem = {
  model: string
  specification: string
  rental: string // monthly rental
  qty: string
  hours: string // blank = calculated monthly
  total: string // blank = calculated monthly
}

export type QuotationDocData = {
  quotationNumber: string
  lessee: string
  address: string
  date: string
  currency: string
  mobilizationFee: string
  items: QuotationLineItem[]
  logo?: LogoChoice
}

type LoadedLogo = { data: ArrayBuffer; width: number; height: number; type: 'png' | 'jpg' }

const LOGO_FILES: Record<Exclude<LogoChoice, 'none'>, { src: string; width: number; height: number; type: 'png' | 'jpg' }> = {
  gbi: { src: GBI_LOGO_URL, width: 60, height: 87, type: 'png' },
  sdlg: { src: SDLG_LOGO_URL, width: 80, height: 82, type: 'png' },
}

const FONT = 'Calibri'
type Align = (typeof AlignmentType)[keyof typeof AlignmentType]

function toNumber(value: string): number {
  const n = Number.parseFloat(String(value).replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

function fmt(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function lines(texts: string[], opts: { bold?: boolean; align?: Align; size?: number } = {}) {
  return texts.map(
    (text) =>
      new Paragraph({
        alignment: opts.align ?? AlignmentType.CENTER,
        children: [new TextRun({ text, bold: opts.bold, font: FONT, size: opts.size ?? 16 })],
      }),
  )
}

function cell(texts: string[], opts: { bold?: boolean; align?: Align; width?: number; span?: number } = {}) {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    columnSpan: opts.span,
    margins: { top: 50, bottom: 50, left: 60, right: 60 },
    children: lines(texts, opts),
  })
}

function para(text: string, opts: { bold?: boolean; size?: number; after?: number; before?: number; align?: Align } = {}) {
  return new Paragraph({
    alignment: opts.align,
    spacing: { before: opts.before ?? 0, after: opts.after ?? 60 },
    children: [new TextRun({ text, bold: opts.bold, font: FONT, size: opts.size ?? 18 })],
  })
}

const NO_BORDERS = {
  top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
}

function infoTable(data: QuotationDocData) {
  const left = (label: string, value: string) =>
    new TableCell({
      width: { size: 50, type: WidthType.PERCENTAGE },
      children: [
        new Paragraph({
          spacing: { after: 60 },
          children: [
            new TextRun({ text: `${label} `, bold: true, font: FONT, size: 18 }),
            new TextRun({ text: value, font: FONT, size: 18 }),
          ],
        }),
      ],
    })
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NO_BORDERS,
    rows: [
      new TableRow({ children: [left('LEASEE 承租方:', data.lessee), left('NO 报价单编号:', data.quotationNumber)] }),
      new TableRow({ children: [left('ADDRESS 地址:', data.address), left('DATE 报价单日期:', data.date)] }),
    ],
  })
}

function itemsTable(data: QuotationDocData) {
  const cur = data.currency === 'USD' ? '$' : data.currency
  const header = new TableRow({
    tableHeader: true,
    children: [
      cell(['MODEL', '型号'], { bold: true, width: 18 }),
      cell(['SPECIFICATION', '规格'], { bold: true, width: 24 }),
      cell(['RENTAL', '租赁单价', `(${cur})/M`], { bold: true, width: 16 }),
      cell(['QTY', '数量'], { bold: true, width: 8 }),
      cell(['HOURS', '工作时长'], { bold: true, width: 16 }),
      cell([`TOTAL PRICE`, `总价(${cur})`], { bold: true, width: 18 }),
    ],
  })

  let grand = 0
  let hasTotals = false
  const rows = data.items.map((item) => {
    const rental = toNumber(item.rental)
    const total = toNumber(item.total)
    if (item.total.trim()) {
      grand += total
      hasTotals = true
    }
    return new TableRow({
      children: [
        cell([item.model]),
        cell([item.specification]),
        cell([rental ? fmt(rental) : item.rental]),
        cell([item.qty || '1']),
        cell(item.hours.trim() ? [item.hours] : ['CALCULATE', 'MONTHLY', '结束后计算']),
        cell(item.total.trim() ? [fmt(total)] : ['CALCULATE', 'MONTHLY', '待计算']),
      ],
    })
  })

  const tableRows = [header, ...rows]
  if (hasTotals) {
    tableRows.push(
      new TableRow({
        children: [
          cell(['TOTAL 合计'], { bold: true, span: 5, align: AlignmentType.RIGHT }),
          cell([`${data.currency} ${fmt(grand)}`], { bold: true }),
        ],
      }),
    )
  }
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: tableRows })
}

const CLAUSES: { title: string; lines: string[] }[] = [
  {
    title: '1. Leasing Clauses 租赁条件：',
    lines: [
      'A. Rental period is calculated for 26 days, a minimum of 8 hours per day will be charged, total hours will be 208 hours, then extra hours will be charged at hourly base rate. If lessee wants to extend the leasing period, lessor should be informed in advance.',
      'a) If the total actual usage exceeds 208 hours, the excess hours shall be charged on an hourly basis;',
      'b) If the equipment is used for less than 8 hours on any given working day, it shall still be counted as 8 hours;',
      'c) If the total actual usage in the month is less than 208 hours, the full 208 hours shall still be charged without any discount.',
      'A. 租赁时间 26 天计算，每天按8 小时计算，累计 208 小时，超出 208 小时之外的部分按时收费计算.如果承租方想继续使用设备，需提前通知出租方。',
      'a) 若实际使用总时长超过208小时，超出部分按小时计费；',
      'b) 若单日使用不足8 小时，亦按 8 小时计；',
      'c) 若整月实际使用不足 208 小时，仍按 208 小时计费，不予折扣。',
      'B. The machines can assure the work without any delay.',
      'B. 设备保证出勤率，不耽误工期。',
      'C. Operators and the food, accommodation will be provided by lessor，the safety for the driver and the machine should be under responsibility of lessee.',
      'C. 出租方提供司机，司机的吃饭和住宿需由出租方负责，司机及设备的安全由承租方自行负责。',
      'D. The service of the machine will be handled by lessor.',
      'D. 设备的保养维护由出租方负责，并做好维修保养记录。',
      'E. Diesel will be bought by lessee and clean diesel is required to make sure the engine running proper without any damage.',
      'E. 燃油由承租方承担，必须确保设备加的柴油干净，不损坏发动机。',
    ],
  },
  { title: '2. Price Terms 价格条件：', lines: ['All rates are exclusive of VAT.', '本价格不含增值税。'] },
  {
    title: '3. Payment Currency 付款货币：',
    lines: [
      'Payment can be made in US dollars or Zambia Kwacha, in case the payment is made by local currency, the exchange rate from USD to kwacha will be in accordance with Stanbic bank USD selling rate at the paying time.',
      '可以以美元或者 KWACHA 支付，如以KWACHA 支付，汇率按照当天银行美元卖出价计算。',
    ],
  },
  {
    title: '4. Payment Time 付款时间：',
    lines: [
      "The rental period is at least 5 months. Pay the next month's rent in advance every month.",
      '租期至少5 个月。每月提前支付下月租金。',
    ],
  },
  {
    title: '5. Delivery Way 交货方式：',
    lines: ["Handover and acceptance at the lessor's warehouse.", '在出租方仓库交接验收。'],
  },
  {
    title: '6. Expiration Date 有效期.',
    lines: [
      'The price of this offer is valid within 10 days, and the transaction is subject to actual negotiation.',
      '本次报价的价格 10 日内有效，交易以实际洽谈为准。',
    ],
  },
]

const ACCOUNT_LINES = [
  'ACCOUNT NAME: GOLDEN BAOBAB INVESTMENTS LTD',
  'BANK NAME: STANBIC BANK',
  'ACCOUNT NUMBER: 9130000835513(ZMW A/C)',
  'BRANCH: COSMOPOLITAN MALL BRANCH',
  'BRANCH CODE: 1002',
  'SORT CODE: 040002',
  'SWIFT CODE: SBICZMLX',
  'ADDRESS : COSMOPOLITAN MALL BRANCH, CHIPWENUPWENU ROAD, MAKENI, LUSAKA, ZAMBIA',
]

export function buildQuotationDoc(data: QuotationDocData, logo?: LoadedLogo): Document {
  const children: (Paragraph | Table)[] = []

  if (logo) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 40 },
        children: [new ImageRun({ data: logo.data, type: logo.type, transformation: { width: logo.width, height: logo.height } })],
      }),
    )
  }

  const fee = toNumber(data.mobilizationFee)
  const feeText = fee ? fee.toLocaleString('en-US') : '10,000'

  children.push(
    para('GOLDEN BAOBAB INVESTMENTS LTD', { bold: true, size: 28, align: AlignmentType.CENTER, after: 40 }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000', space: 1 } },
      children: [
        new TextRun({
          text: 'Add: Plot No.11960/M, 6 Miles, Great North Road, Lusaka, Zambia   Cell: +260975239999',
          font: FONT,
          size: 16,
        }),
      ],
    }),
    para('HIRING QUOTATION', { bold: true, size: 26, align: AlignmentType.CENTER, after: 0 }),
    para('租赁报价单', { bold: true, size: 24, align: AlignmentType.CENTER, after: 200 }),
    infoTable(data),
    para('', { after: 120 }),
    itemsTable(data),
    para(`进出场费每台设备${feeText}K。`, { before: 120, bold: true }),
    para(`Mobilization & demobilization fee: ZMW ${feeText}/unit`, { bold: true, after: 160 }),
  )

  for (const clause of CLAUSES) {
    children.push(para(clause.title, { bold: true, size: 20, before: 160, after: 80 }))
    for (const line of clause.lines) children.push(para(line))
  }

  children.push(
    para('GOLDEN BAOBAB INVESTMENTS LTD RESERVES THE RIGHT OF FINAL INTERPRETATION.', { bold: true, before: 240 }),
    para('GOLDEN BAOBAB INVESTMENTS LTD 拥有最终解释权。', { bold: true, after: 200 }),
    para('ACCOUNT INFORMATION：', { bold: true, size: 20, after: 80 }),
    ...ACCOUNT_LINES.map((l) => para(l)),
  )

  return new Document({
    sections: [{ properties: { page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } } }, children }],
  })
}

async function loadLogo(choice: LogoChoice): Promise<LoadedLogo | undefined> {
  if (choice === 'none') return undefined
  const meta = LOGO_FILES[choice]
  try {
    const res = await fetch(meta.src)
    if (!res.ok) return undefined
    return { data: await res.arrayBuffer(), width: meta.width, height: meta.height, type: meta.type }
  } catch {
    return undefined
  }
}

export async function downloadQuotationDoc(data: QuotationDocData): Promise<void> {
  const logo = await loadLogo(data.logo ?? 'gbi')
  const blob = await Packer.toBlob(buildQuotationDoc(data, logo))
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  const safe = (data.quotationNumber || data.lessee || 'draft').replace(/[^a-z0-9-_]+/gi, '-')
  anchor.download = `GBI-Hiring-Quotation-${safe}.docx`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
