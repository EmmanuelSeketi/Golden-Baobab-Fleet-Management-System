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

export type ContractLineItem = {
  description: string
  model: string
  qty: string
  amount: string // monthly amount, without VAT
  period: string // months (equipment only)
  delivery: string // transport only
}

export type ContractDocData = {
  contractNumber: string
  lessee: string
  date: string
  equipment: ContractLineItem[]
  transport: ContractLineItem[]
}

const VAT_RATE = 0.16

function toNumber(value: string): number {
  const n = Number.parseFloat(String(value).replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

function fmt(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const FONT = 'Calibri'

function cell(text: string, opts: { bold?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; width?: number } = {}) {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 40, bottom: 40, left: 60, right: 60 },
    children: [
      new Paragraph({
        alignment: opts.align ?? AlignmentType.LEFT,
        children: [new TextRun({ text, bold: opts.bold, font: FONT, size: 16 })],
      }),
    ],
  })
}

function heading(text: string) {
  return new Paragraph({
    spacing: { before: 200, after: 80 },
    children: [new TextRun({ text, bold: true, font: FONT, size: 20 })],
  })
}

function body(text: string, opts: { bold?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; spacingAfter?: number } = {}) {
  return new Paragraph({
    alignment: opts.align,
    spacing: { after: opts.spacingAfter ?? 60 },
    children: [new TextRun({ text, bold: opts.bold, font: FONT, size: 18 })],
  })
}

function equipmentTable(items: ContractLineItem[]) {
  const header = new TableRow({
    tableHeader: true,
    children: [
      cell('', { bold: true, width: 4 }),
      cell('DESCRIPTION 货品', { bold: true, width: 24 }),
      cell('MODEL 型号', { bold: true, width: 14 }),
      cell('QTY 数量', { bold: true, width: 8, align: AlignmentType.CENTER }),
      cell('TOTAL (USD)/MONTH (WITHOUT VAT)', { bold: true, width: 16, align: AlignmentType.CENTER }),
      cell('16% VAT', { bold: true, width: 12, align: AlignmentType.CENTER }),
      cell('PERIOD (MONTH)', { bold: true, width: 10, align: AlignmentType.CENTER }),
      cell('TOTAL (USD) (WITH VAT)', { bold: true, width: 12, align: AlignmentType.CENTER }),
    ],
  })

  let grand = 0
  const rows = items.map((item, index) => {
    const amount = toNumber(item.amount)
    const vat = amount * VAT_RATE
    const withVat = amount + vat
    const period = toNumber(item.period)
    const lineTotal = withVat * (period || 1)
    grand += lineTotal
    return new TableRow({
      children: [
        cell(String(index + 1), { align: AlignmentType.CENTER }),
        cell(item.description),
        cell(item.model),
        cell(item.qty, { align: AlignmentType.CENTER }),
        cell(amount ? fmt(amount) : '', { align: AlignmentType.RIGHT }),
        cell(amount ? fmt(vat) : '', { align: AlignmentType.RIGHT }),
        cell(item.period, { align: AlignmentType.CENTER }),
        cell(amount ? fmt(withVat) : '', { align: AlignmentType.RIGHT }),
      ],
    })
  })

  const totalRow = new TableRow({
    children: [
      new TableCell({
        columnSpan: 7,
        margins: { top: 40, bottom: 40, left: 60, right: 60 },
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: 'TOTAL PRICE (WITH TAX) 总价(含税)', bold: true, font: FONT, size: 16 })],
          }),
        ],
      }),
      cell(`USD ${fmt(grand)}`, { bold: true, align: AlignmentType.RIGHT }),
    ],
  })

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [header, ...rows, totalRow],
  })
}

function transportTable(items: ContractLineItem[]) {
  const header = new TableRow({
    tableHeader: true,
    children: [
      cell('', { bold: true, width: 4 }),
      cell('DESCRIPTION', { bold: true, width: 26 }),
      cell('MODEL', { bold: true, width: 16 }),
      cell('QTY', { bold: true, width: 8, align: AlignmentType.CENTER }),
      cell('TOTAL (ZMW) (WITHOUT VAT)', { bold: true, width: 16, align: AlignmentType.CENTER }),
      cell('16% VAT', { bold: true, width: 12, align: AlignmentType.CENTER }),
      cell('DELIVERY', { bold: true, width: 10, align: AlignmentType.CENTER }),
      cell('TOTAL (ZMW) (WITH VAT)', { bold: true, width: 12, align: AlignmentType.CENTER }),
    ],
  })

  const rows = items.map((item, index) => {
    const amount = toNumber(item.amount)
    const vat = amount * VAT_RATE
    const withVat = amount + vat
    return new TableRow({
      children: [
        cell(String(index + 1), { align: AlignmentType.CENTER }),
        cell(item.description),
        cell(item.model),
        cell(item.qty, { align: AlignmentType.CENTER }),
        cell(amount ? fmt(amount) : '', { align: AlignmentType.RIGHT }),
        cell(amount ? fmt(vat) : '', { align: AlignmentType.RIGHT }),
        cell(item.delivery || 'ONE WAY', { align: AlignmentType.CENTER }),
        cell(amount ? fmt(withVat) : '', { align: AlignmentType.RIGHT }),
      ],
    })
  })

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [header, ...rows],
  })
}

const CLAUSES: { title: string; lines: string[] }[] = [
  {
    title: '3. Leasing Clauses 挖机租赁条件：',
    lines: [
      '租赁时间每月按 26 天工作时间计算，每天按 8 小时计算，累计 208 小时，超出 208 小时之外的部分按时收费计算。如果承租方想继续使用设备，需提前通知出租方。',
      'a) 若实际使用总时长超过 208 小时，超出部分按小时计费；',
      'b) 若单日使用不足 8 小时，亦按 8 小时计；',
      'c) 若整月实际使用不足 208 小时，仍按 208 小时计费，不予折扣。',
      'd) 本合同租赁期限为两个月，自租赁设备进场并正式开工之日起计算。租赁期满后，经双方协商一致可续签，续签条件及期限另行约定，租金以实际发生费用为准。',
      'e) 租赁期间，若因租赁机械自身故障原因导致当月实际使用天数不足26天，承租方有权按不足天数相应扣减租金。',
      'Rental period is calculated for 26 working days, a minimum of 8 hours per day will be charged, total hours will be 208 hours, then extra hours will be charged at hourly base rate. If lessee wants to extend the leasing period, lessor should be informed in advance.',
      'a) If the total actual usage exceeds 208 hours, the excess hours shall be charged on an hourly basis;',
      'b) If the equipment is used for less than 8 hours on any given working day, it shall still be counted as 8 hours;',
      'c) If the total actual usage in the month is less than 208 hours, the full 208 hours shall still be charged without any discount.',
      'd) The lease term under this Contract shall be two months, commencing from the date the leased equipment arrives at the site and officially commences operation. Upon expiration of the lease term, the Contract may be renewed by mutual agreement of both parties, and the renewal terms and period shall be separately agreed. The rental amount shall be based on the actual costs incurred.',
      'e) During the lease period, if the actual number of operating days in a month is less than 26 days due to mechanical failure of the leased equipment, the Lessee shall be entitled to deduct the rental amount corresponding to the shortfall days.',
      'B. 设备保证出勤率，不耽误工期。若承租方需延长租赁时间，应提前通知出租方，出租方有权拒绝延期请求。',
      'The machines can assure the work without any delay. If the Lessee wishes to extend the lease period, they shall notify the Lessor in advance. The Lessor reserves the right to refuse the extension request.',
      'C. 出租方提供操作手，操作手的吃饭和住宿需由承租方负责，操作手及设备的安全由承租方自行负责。若承租方未能按约定提供基本食宿条件，应向操作手发放相应的生活补助，补助标准另行协商确定。',
      "Operators will be provided by lessor, the food and accommodation be under responsibility of lessee, the safety for the machine should be under responsibility of lessee. If the lessee fails to provide basic accommodation and meals as agreed, a corresponding living allowance shall be provided to the operators, with the specific amount to be determined through separate negotiation.",
      'D. 设备的保养维护由出租方负责，并做好维修保养记录。出租方仅负责提供易损件的更换，因承租方的原因造成的设备损耗，维修费用应由承租方承担。',
      "The service of the machine will be handled by lessor. The lessor is only responsible for providing the replacement of consumable parts. Any equipment damage caused by the lessee's reasons shall be borne by the lessee for the maintenance costs.",
      'E. 燃油由承租方承担，必须确保设备加的柴油干净，不损坏发动机。',
      'Diesel will be bought by lessee and clean diesel is required to make sure the engine running proper without any damage.',
    ],
  },
  {
    title: '4. 付款货币 Payment Currency',
    lines: [
      '可以以美元或者 KWACHA 支付，如以 KWACHA 支付，汇率按照当天银行美元卖出价计算；',
      'Payment can be made in US dollars or Zambia Kwacha, in case the payment is made by local currency, the exchange rate from USD to kwacha will be in accordance with Stanbic bank USD selling rate at the paying time.',
    ],
  },
  {
    title: '5. 付款时间 Payment Time',
    lines: [
      '设备租赁费从起租日起，以月为单位，按月及时结算。',
      'The equipment lease fee shall be settled in a timely manner on a monthly basis from the date of rental.',
    ],
  },
  {
    title: '6. 交货方式 Delivery',
    lines: [
      '在出租方仓库交接验收；出租方可以安排运输，运费由承租方承担。',
      'All the machines will be tested before delivery to the site. The lessor can arrange the transportation and the freight shall be borne by the lessee.',
    ],
  },
  {
    title: '7. DETAILS FOR THE BANK ACCOUNT',
    lines: [
      'Company Name: GOLDEN BAOBAB INVESTMENTS LTD',
      'Bank Name: STANBIC BANK',
      'Branch: Cosmopolitan Mall Branch',
      'Swift code: SBICZMLX',
      'Branch Code: 1002',
      'Sort Code: 040002',
      'USD Account No: 9130000835580',
      'Kwacha Account No: 9130000835513',
    ],
  },
  {
    title: '8. 免责声明 Disclaimer',
    lines: [
      '自合同签订日起，与出租设备有关的所有风险与损失，均由承租方承担，出租方概不负责，直达租赁结束。',
      'From the date of signing this Contract, all risks and losses related to the leased equipment shall be borne by the lessee, and the lessor shall not be responsible until the end of the lease.',
    ],
  },
]

export function buildContractDoc(data: ContractDocData, logo?: ArrayBuffer): Document {
  const children: (Paragraph | Table)[] = []

  if (logo) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 40 },
        children: [
          new ImageRun({
            data: logo,
            type: 'png',
            transformation: { width: 90, height: 90 },
          }),
        ],
      }),
    )
  }

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [new TextRun({ text: 'GOLDEN BAOBAB INVESTMENTS LTD', bold: true, font: FONT, size: 28 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: 'Add: Great North Road, Lusaka, Zambia   Email: goldenbaobab2@gmail.com   Cell: +260975239999',
          font: FONT,
          size: 16,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000', space: 1 } },
      children: [new TextRun({ text: 'CONTRACT', bold: true, font: FONT, size: 24 })],
    }),
    body(`NO: ${data.contractNumber || '……………………….'}`, { bold: true }),
    body(`TO: ${data.lessee || '………………………………………………'}`, { bold: true, spacingAfter: 160 }),
  )

  children.push(heading('1. Description and Price 货品和价格：'))
  children.push(equipmentTable(data.equipment))

  children.push(heading('2. Transportation 运输费'))
  children.push(transportTable(data.transport))

  for (const clause of CLAUSES) {
    children.push(heading(clause.title))
    for (const line of clause.lines) children.push(body(line))
  }

  children.push(
    new Paragraph({ spacing: { before: 320 }, children: [new TextRun({ text: '', font: FONT })] }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Lessor 出租方: GOLDEN BAOBAB INVESTMENTS LTD', bold: true, font: FONT, size: 18 }),
        new TextRun({ text: '          Lessee 承租方: ', bold: true, font: FONT, size: 18 }),
        new TextRun({ text: data.lessee || '……………………………………', font: FONT, size: 18 }),
      ],
    }),
    new Paragraph({
      spacing: { before: 200 },
      children: [
        new TextRun({ text: `Date: ${data.date || '                '}`, font: FONT, size: 18 }),
        new TextRun({ text: '                                   Date:', font: FONT, size: 18 }),
      ],
    }),
  )

  return new Document({
    sections: [
      {
        properties: { page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
        children,
      },
    ],
  })
}

async function loadLogo(): Promise<ArrayBuffer | undefined> {
  try {
    const res = await fetch('/gbi-logo.png')
    if (!res.ok) return undefined
    return await res.arrayBuffer()
  } catch {
    return undefined
  }
}

export async function downloadContractDoc(data: ContractDocData): Promise<void> {
  const logo = await loadLogo()
  const doc = buildContractDoc(data, logo)
  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  const safe = (data.contractNumber || 'draft').replace(/[^a-z0-9-_]+/gi, '-')
  anchor.download = `GBI-Hire-Contract-${safe}.docx`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
