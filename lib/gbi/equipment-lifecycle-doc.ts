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

export type LifecycleDocumentType = 'entry' | 'checkpoint' | 'exit'
export type LifecycleMeasurement = 'hours' | 'mileage'

export type LifecycleSignatureFields = {
  lessorRepresentativeName: string
  operatorName: string
  operatorRole: string
  lessorWitnessName: string
  lessorWitnessRole: string
  lesseeRepresentativeName: string
  lesseePersonInCharge: string
  lesseePersonInChargeRole: string
  lesseeWitnessName: string
  lesseeWitnessRole: string
}

export type LifecycleDocumentItem = {
  machineId: string
  machineNumber: string
  equipment: string
  model: string
  currentReading: string
  actualUsed: string
}

export type EquipmentLifecycleDocumentData = LifecycleSignatureFields & {
  eventType: LifecycleDocumentType
  logo?: LogoChoice
  projectId: string
  project: string
  lessee: string
  eventDate: string
  measurement: LifecycleMeasurement
  items: LifecycleDocumentItem[]
  notes: string
}

const COMPANY = 'GOLDEN BAOBAB INVESTMENTS LTD'
const ADDRESS = 'Add: Great North Road, Lusaka, Zambia   Email: goldenbaobab2@gmail.com   Cell: 0979018888'
const FONT = 'Calibri'
const LOGO_FILES: Record<Exclude<LogoChoice, 'none'>, { src: string; width: number; height: number; type: 'png' | 'jpg' }> = {
  gbi: { src: GBI_LOGO_URL, width: 72, height: 104, type: 'png' },
  sdlg: { src: SDLG_LOGO_URL, width: 96, height: 98, type: 'png' },
}

export const LIFECYCLE_DOCUMENTS: Record<LifecycleDocumentType, { title: string; chinese: string; action: string }> = {
  entry: {
    title: 'Equipment Mobilization Confirmation Form',
    chinese: '设备入场确认单',
    action: 'Generate Entry Document',
  },
  checkpoint: {
    title: 'Equipment Key Time Node Confirmation Form',
    chinese: '设备关键时间节点确认单',
    action: 'Generate Checkpoint Document',
  },
  exit: {
    title: 'Equipment Demobilization Confirmation Form',
    chinese: '设备离场确认单',
    action: 'Generate Exit Document',
  },
}

function text(value: string, options: { bold?: boolean; size?: number } = {}) {
  return new TextRun({ text: value, font: FONT, size: options.size ?? 20, bold: options.bold })
}

function paragraph(value: string, options: { bold?: boolean; size?: number; after?: number } = {}) {
  return new Paragraph({
    spacing: { after: options.after ?? 100 },
    children: [text(value, options)],
  })
}

function itemTable(data: EquipmentLifecycleDocumentData) {
  const dateLabel = data.eventType === 'entry'
    ? 'MOBILIZATION DATE\n入场日期'
    : data.eventType === 'exit'
      ? 'DEMOBILIZATION DATE\n离场日期'
      : 'CHECK DATE\n检查日期'
  const readingLabel = data.eventType === 'entry'
    ? 'STARTING HOURS / MILEAGE\n设备起始里程 / 小时数'
    : 'CURRENT OPERATING HOURS / MILEAGE\n设备运行总里程 / 总小时'
  const columnLabels = [
    'EQUIPMENT\n设备名称',
    'MODEL\n设备型号',
    'QTY\n数量',
    dateLabel,
    readingLabel,
    ...(data.eventType === 'entry' ? [] : ['ACTUAL USED HOURS / MILEAGE\n设备实际运行里程 / 小时']),
  ]
  const widths = data.eventType === 'entry' ? [27, 20, 10, 22, 21] : [20, 15, 8, 16, 21, 20]
  const formattedDate = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${data.eventDate}T00:00:00Z`))
  const rows = [
    new TableRow({
      tableHeader: true,
      children: columnLabels.map((label, index) =>
        new TableCell({
          width: { size: widths[index], type: WidthType.PERCENTAGE },
          shading: { fill: 'F0F3F2' },
          children: [paragraph(label, { bold: true, size: 16, after: 0 })],
        }),
      ),
    }),
    ...data.items.map((item) => {
      const values = [
        item.equipment,
        item.model,
        '1',
        formattedDate,
        `${item.currentReading} ${data.measurement}`,
        ...(data.eventType === 'entry' ? [] : [`${item.actualUsed} ${data.measurement}`]),
      ]
      return new TableRow({
        children: values.map((value, index) =>
          new TableCell({
            width: { size: widths[index], type: WidthType.PERCENTAGE },
            children: [paragraph(value, { size: 18, after: 0 })],
          }),
        ),
      })
    }),
  ]
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: widths,
    rows,
  })
}

function signatureCell(title: string, representative: string, signatory: string, role: string, witness: string, witnessRole: string, lessor: boolean) {
  const representativeLabel = lessor ? 'For and on behalf of the Lessor 出租方代表' : 'For and on behalf of the Lessee 承租方代表'
  const signatoryLabel = lessor ? 'Operator Name 操作手姓名' : 'Name of person in charge 现场负责人姓名'
  return new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    margins: { top: 120, bottom: 120, left: 140, right: 140 },
    children: [
      paragraph(title, { bold: true }),
      paragraph(`${representativeLabel}: ${representative || '________________________'}`),
      paragraph('Signed 签字: ________________________'),
      paragraph(`${signatoryLabel}: ${signatory || '________________________'}`),
      paragraph(`In the capacity of 职务: ${role || '______________'}`),
      paragraph(`Witness 见证人: ${witness || '___________________'}`),
      paragraph('Signed 签字: ________________________'),
      paragraph(`In the capacity of 职务: ${witnessRole || '______________'}`, { after: 0 }),
    ],
  })
}

function signatureTable(data: EquipmentLifecycleDocumentData) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [50, 50],
    rows: [
      new TableRow({
        children: [
          signatureCell(
            `LESSOR 出租方: ${COMPANY}`,
            data.lessorRepresentativeName,
            data.operatorName,
            data.operatorRole,
            data.lessorWitnessName,
            data.lessorWitnessRole,
            true,
          ),
          signatureCell(
            `LESSEE 承租方: ${data.lessee || '____________________________'}`,
            data.lesseeRepresentativeName,
            data.lesseePersonInCharge,
            data.lesseePersonInChargeRole,
            data.lesseeWitnessName,
            data.lesseeWitnessRole,
            false,
          ),
        ],
      }),
    ],
  })
}

function eventStatement(data: EquipmentLifecycleDocumentData): Paragraph | null {
  if (data.eventType === 'checkpoint') return null
  const [year, month, day] = data.eventDate.split('-')
  if (data.eventType === 'entry') {
    return paragraph(
      `兹确认我方（承租人）于${year}年${month}月${day}日收到该设备，已确认该设备完好无损，可以正常使用。\n` +
        `We hereby confirm that we (the Lessee) received the equipment on ${day} (Day) ${month} (Month) ${year} (Year), and verify that the equipment is intact and in normal working condition.`,
      { after: 120 },
    )
  }
  return paragraph(
    `兹确认我方（承租人）于${year}年${month}月${day}日对该表格中涉及的设备已使用完毕，申请退回给出租方。\n` +
      `We hereby confirm that we (the Lessee) have completed the use of the equipment listed in this form on ${day} (Day) ${month} (Month) ${year} (Year), and apply to return the equipment to the Lessor.`,
    { after: 120 },
  )
}

function buildDocument(data: EquipmentLifecycleDocumentData, logo?: { data: ArrayBuffer; width: number; height: number }): Document {
  const details = LIFECYCLE_DOCUMENTS[data.eventType]
  const statement = eventStatement(data)
  const children: (Paragraph | Table)[] = [
    ...(logo
      ? [new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 40 },
          children: [new ImageRun({
            data: logo.data,
            type: logo.type,
            transformation: { width: logo.width, height: logo.height },
          })],
        })]
      : []),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 70 },
      children: [text(COMPANY, { bold: true, size: 28 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [text(ADDRESS, { size: 16 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 140 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000', space: 1 } },
      children: [text(`${details.title}\n${details.chinese}`, { bold: true, size: 25 })],
    }),
    paragraph(`LESSEE 承租方: ${data.lessee || '________________________________________'}`, { bold: true }),
    paragraph(`PROJECT 项目: ${data.project}`, { after: 60 }),
    itemTable(data),
    ...(data.notes.trim() ? [paragraph(`Notes / 备注: ${data.notes}`, { after: 120 })] : []),
    signatureTable(data),
    ...(statement ? [paragraph(''), statement] : []),
    paragraph('Signed 签字: ______________________________', { after: 0 }),
  ]

  return new Document({
    sections: [{
      properties: { page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
      children,
    }],
  })
}

export async function buildEquipmentLifecycleDocument(data: EquipmentLifecycleDocumentData): Promise<Blob> {
  let logo: { data: ArrayBuffer; width: number; height: number } | undefined
  const logoChoice = data.logo ?? 'gbi'
  if (logoChoice !== 'none') {
    const details = LOGO_FILES[logoChoice]
    const response = await fetch(details.src)
    if (!response.ok) throw new Error(`Could not load the selected ${logoChoice.toUpperCase()} logo.`)
    logo = {
      data: await response.arrayBuffer(),
      width: details.width,
      height: details.height,
      type: details.type,
    }
  }
  return Packer.toBlob(buildDocument(data, logo))
}
