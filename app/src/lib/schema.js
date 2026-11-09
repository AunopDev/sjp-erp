// Entity metadata + default (editable) configuration
export const ACTIONS = [
  ['view', 'ดู'], ['create', 'สร้าง'], ['edit', 'แก้ไข'], ['assign', 'มอบหมาย'],
  ['approve', 'อนุมัติ'], ['export', 'ส่งออก'], ['close', 'ปิดรายการ'], ['delete', 'ยกเลิก/ซ่อน']
]
export const RESOURCES = [
  ['master', 'ลูกค้า/ผู้ขาย/ผู้ติดต่อ/ไซต์'], ['assets', 'สินค้า/อุปกรณ์/Serial'], ['projects', 'โครงการ'],
  ['tickets', 'Service Ticket'], ['purchase', 'จัดซื้อ'], ['warehouse', 'คลังสินค้า'], ['pm', 'งาน PM'],
  ['reports', 'รายงาน'], ['settings', 'ตั้งค่าระบบ']
]

export const ENT = {
  customers: { label: 'ลูกค้า', res: 'master', prefix: 'CUS', title: 'name', cols: ['code', 'name', 'type', 'phone', 'owner'], filters: ['type'] },
  vendors: { label: 'ผู้ขาย', res: 'master', prefix: 'VEN', title: 'name', cols: ['code', 'name', 'category', 'phone', 'email'], filters: ['category'] },
  contacts: { label: 'ผู้ติดต่อ', res: 'master', prefix: 'CON', title: 'name', cols: ['name', 'position', 'customer', 'vendor', 'phone', 'email'], filters: [] },
  sites: { label: 'ไซต์งาน/สถานที่', res: 'master', prefix: 'SITE', title: 'name', cols: ['code', 'name', 'customer', 'province', 'team'], filters: ['team', 'customer'] },
  items: { label: 'สินค้า/อุปกรณ์/อะไหล่', res: 'assets', prefix: 'ITM', title: 'name', cols: ['sku', 'name', 'category', 'kind', 'brand', 'model', 'trackSerial'], filters: ['category', 'kind'] },
  serials: { label: 'Serial Number', res: 'assets', prefix: 'SER', title: 'serialNo', cols: ['serialNo', 'item', 'status', 'customer', 'site', 'warrantyEnd'], filters: ['status'] },
  projects: { label: 'โครงการ', res: 'projects', prefix: 'PRJ', title: 'name', cols: ['code', 'name', 'customer', 'type', 'manager', 'stepLabel'], filters: ['type'] },
  tickets: { label: 'Service Ticket', res: 'tickets', prefix: 'TK', title: 'title', cols: ['code', 'title', 'customer', 'site', 'category', 'priority', 'status', 'assignee'], filters: ['status', 'category', 'priority'] },
  purchaseOrders: { label: 'ใบสั่งซื้อ', res: 'purchase', prefix: 'PO', title: 'code', cols: ['code', 'vendor', 'project', 'orderDate', 'dueDate', 'status'], filters: ['status'] },
  warehouses: { label: 'คลังสินค้า', res: 'warehouse', prefix: 'WH', title: 'name', cols: ['code', 'name', 'kind'], filters: [] },
  stockMoves: { label: 'รายการเคลื่อนไหวสต็อก', res: 'warehouse', prefix: 'MV', title: 'code', cols: ['code', 'date', 'type', 'item', 'qty'], filters: ['type'] },
  pmTemplates: { label: 'แม่แบบรายการตรวจ PM', res: 'pm', prefix: 'PMT', title: 'name', cols: ['name', 'category'], filters: [] },
  pmPlans: { label: 'แผน PM', res: 'pm', prefix: 'PMP', title: 'name', cols: ['code', 'name', 'site', 'frequency', 'template', 'active'], filters: ['frequency'] },
  pmRecords: { label: 'งาน PM', res: 'pm', prefix: 'PMR', title: 'code', cols: ['code', 'plan', 'site', 'dueDate', 'status'], filters: ['status'] }
}

const f = (key, label, type = 'text', x = {}) => ({ key, label, type, system: true, ...x })
const TEAM = { optionsFrom: 'teams' }

export function defaultFields() {
  return {
    customers: [
      f('name', 'ชื่อลูกค้า', 'text', { required: true }),
      f('taxId', 'เลขประจำตัวผู้เสียภาษี'),
      f('type', 'ประเภท', 'select', { options: ['ภาครัฐ', 'รัฐวิสาหกิจ', 'เอกชน', 'อื่นๆ'] }),
      f('phone', 'โทรศัพท์'), f('email', 'อีเมล'),
      f('address', 'ที่อยู่', 'textarea'),
      f('owner', 'ผู้รับผิดชอบบัญชี', 'ref', { ref: 'users' }),
      f('note', 'หมายเหตุ', 'textarea'),
      f('attachments', 'ไฟล์แนบ', 'file')
    ],
    vendors: [
      f('name', 'ชื่อผู้ขาย', 'text', { required: true }),
      f('taxId', 'เลขประจำตัวผู้เสียภาษี'),
      f('category', 'หมวดสินค้า/บริการ', 'select', { options: ['อุปกรณ์ CCTV', 'อุปกรณ์เครือข่าย/Fiber', 'จอ LED', 'เสียงประกาศ (PA)', 'เซนเซอร์/ตรวจวัด', 'โดรน', 'ผู้รับเหมาช่วง', 'อื่นๆ'] }),
      f('phone', 'โทรศัพท์'), f('email', 'อีเมล'),
      f('address', 'ที่อยู่', 'textarea'),
      f('paymentTerms', 'เงื่อนไขการชำระเงิน'),
      f('note', 'หมายเหตุ', 'textarea'),
      f('attachments', 'ไฟล์แนบ', 'file')
    ],
    contacts: [
      f('name', 'ชื่อผู้ติดต่อ', 'text', { required: true }),
      f('position', 'ตำแหน่ง'),
      f('customer', 'ลูกค้า', 'ref', { ref: 'customers' }),
      f('vendor', 'ผู้ขาย', 'ref', { ref: 'vendors' }),
      f('phone', 'โทรศัพท์'), f('email', 'อีเมล'), f('line', 'LINE ID'),
      f('note', 'หมายเหตุ', 'textarea')
    ],
    sites: [
      f('name', 'ชื่อไซต์/สถานที่', 'text', { required: true }),
      f('customer', 'ลูกค้า', 'ref', { ref: 'customers', required: true }),
      f('address', 'ที่อยู่', 'textarea'),
      f('province', 'จังหวัด/เขต'),
      f('lat', 'ละติจูด', 'number'), f('lng', 'ลองจิจูด', 'number'),
      f('contact', 'ผู้ติดต่อประจำไซต์', 'ref', { ref: 'contacts' }),
      f('team', 'ทีมดูแล', 'select', TEAM),
      f('note', 'หมายเหตุ', 'textarea')
    ],
    items: [
      f('name', 'ชื่อสินค้า/อุปกรณ์', 'text', { required: true }),
      f('sku', 'รหัสสินค้า (SKU)', 'text', { required: true, unique: true }),
      f('category', 'หมวดผลิตภัณฑ์', 'select', { options: ['Smart MS-Box', 'CCTV/เฝ้าระวัง', 'เสียงประกาศ (PA)', 'ตรวจวัดอากาศ/สิ่งแวดล้อม', 'จอ LED', 'เครือข่าย/Fiber Optic', 'โดรนและอุปกรณ์', 'Smart City/Monitoring', 'อะไหล่', 'อื่นๆ'] }),
      f('kind', 'ชนิด', 'select', { options: ['สินค้า', 'อุปกรณ์', 'อะไหล่', 'วัสดุสิ้นเปลือง'] }),
      f('brand', 'ยี่ห้อ'), f('model', 'รุ่น'),
      f('unit', 'หน่วยนับ'),
      f('trackSerial', 'ติดตาม Serial Number', 'boolean'),
      f('warrantyMonths', 'ระยะรับประกัน (เดือน)', 'number'),
      f('minStock', 'จุดสั่งซื้อ/สต็อกขั้นต่ำ', 'number'),
      f('vendor', 'ผู้ขายหลัก', 'ref', { ref: 'vendors' }),
      f('note', 'หมายเหตุ', 'textarea')
    ],
    serials: [
      f('serialNo', 'Serial Number', 'text', { required: true, unique: true }),
      f('item', 'สินค้า/รุ่น', 'ref', { ref: 'items', required: true }),
      f('status', 'สถานะ', 'select', { options: ['ในคลัง', 'ส่งออกไปหน้างาน', 'ติดตั้งแล้ว', 'ส่งซ่อม', 'เปลี่ยนแล้ว', 'ปลดระวาง'], required: true }),
      f('warehouse', 'คลังปัจจุบัน', 'ref', { ref: 'warehouses' }),
      f('customer', 'ลูกค้า', 'ref', { ref: 'customers' }),
      f('project', 'โครงการ', 'ref', { ref: 'projects' }),
      f('site', 'ไซต์', 'ref', { ref: 'sites' }),
      f('location', 'จุดติดตั้ง'),
      f('receivedDate', 'วันที่รับเข้า', 'date'),
      f('installedDate', 'วันที่ติดตั้ง', 'date'),
      f('warrantyStart', 'เริ่มรับประกัน', 'date'),
      f('warrantyEnd', 'สิ้นสุดรับประกัน', 'date'),
      f('note', 'หมายเหตุ', 'textarea')
    ],
    projects: [
      f('name', 'ชื่อโครงการ', 'text', { required: true }),
      f('customer', 'ลูกค้า', 'ref', { ref: 'customers', required: true }),
      f('type', 'ประเภทโครงการ', 'select', { options: ['โครงการขนาดใหญ่', 'งานใช้อุปกรณ์พิเศษ', 'ติดตั้งทั่วไป', 'อื่นๆ'] }),
      f('site', 'ไซต์หลัก', 'ref', { ref: 'sites' }),
      f('manager', 'ผู้จัดการโครงการ', 'ref', { ref: 'users' }),
      f('team', 'ทีมรับผิดชอบ', 'select', TEAM),
      f('contractNo', 'เลขที่สัญญา'),
      f('poNo', 'เลขที่ PO ลูกค้า'),
      f('value', 'มูลค่าโครงการ (บาท)', 'number'),
      f('boq', 'BOQ (รายการอุปกรณ์ที่ต้องใช้)', 'rows', { cols: [
        { key: 'item', label: 'สินค้า/อุปกรณ์', type: 'ref', ref: 'items' },
        { key: 'desc', label: 'รายละเอียด', type: 'text' },
        { key: 'qty', label: 'จำนวน', type: 'number' }
      ] }),
      f('note', 'หมายเหตุ', 'textarea')
    ],
    tickets: [
      f('title', 'หัวข้อ/ชื่อจุด', 'text', { required: true }),
      f('reportedBy', 'ผู้แจ้ง', 'text', { required: true }),
      f('channel', 'ช่องทางแจ้ง', 'select', { options: ['โทรศัพท์', 'LINE', 'อีเมล', 'เว็บ/ระบบ', 'หน้างาน', 'อื่นๆ'] }),
      f('receivedAt', 'วันเวลาที่รับเรื่อง', 'datetime', { required: true }),
      f('customer', 'ลูกค้า', 'ref', { ref: 'customers', required: true }),
      f('project', 'โครงการ', 'ref', { ref: 'projects' }),
      f('site', 'ไซต์', 'ref', { ref: 'sites', required: true }),
      f('point', 'จุดติดตั้ง'),
      f('circuitNo', 'หมายเลขวงจร'),
      f('item', 'อุปกรณ์/รุ่น', 'ref', { ref: 'items' }),
      f('serial', 'Serial Number', 'ref', { ref: 'serials' }),
      f('category', 'หมวดงาน', 'select', { options: ['IT Support', 'Hardware', 'Software', 'Network', 'CCTV', 'PA', 'Spare Part', 'PM', 'อื่นๆ'], required: true }),
      f('priority', 'ความเร่งด่วน', 'select', { options: ['ต่ำ', 'ปกติ', 'สูง', 'เร่งด่วน'], required: true }),
      f('symptom', 'อาการ', 'textarea', { required: true }),
      f('description', 'รายละเอียดเพิ่มเติม', 'textarea'),
      f('initialFinding', 'ผลตรวจเบื้องต้น', 'textarea'),
      f('cause', 'สาเหตุ', 'textarea'),
      f('resolution', 'วิธีแก้ไข', 'textarea'),
      f('remarks', 'ข้อสังเกต', 'textarea'),
      f('team', 'ทีมรับผิดชอบ', 'select', TEAM),
      f('assignee', 'ผู้รับผิดชอบ', 'ref', { ref: 'users' }),
      f('attachments', 'รูปถ่าย/เอกสาร/หลักฐาน', 'file')
    ],
    purchaseOrders: [
      f('vendor', 'ผู้ขาย', 'ref', { ref: 'vendors', required: true }),
      f('project', 'โครงการ', 'ref', { ref: 'projects' }),
      f('orderDate', 'วันที่สั่งซื้อ', 'date'),
      f('dueDate', 'กำหนดส่ง', 'date'),
      f('lines', 'รายการสั่งซื้อ', 'rows', { required: true, cols: [
        { key: 'item', label: 'สินค้า', type: 'ref', ref: 'items' },
        { key: 'qty', label: 'จำนวน', type: 'number' },
        { key: 'unitPrice', label: 'ราคา/หน่วย', type: 'number' }
      ] }),
      f('note', 'หมายเหตุ', 'textarea'),
      f('attachments', 'ไฟล์แนบ', 'file')
    ],
    warehouses: [
      f('name', 'ชื่อคลัง', 'text', { required: true }),
      f('kind', 'ประเภทคลัง', 'select', { options: ['คลังกลาง', 'คลังโครงการ', 'คลังรอซ่อม', 'คลังรถช่าง'] }),
      f('note', 'หมายเหตุ', 'textarea')
    ],
    stockMoves: [],
    pmTemplates: [
      f('name', 'ชื่อแม่แบบ', 'text', { required: true }),
      f('category', 'ประเภทอุปกรณ์', 'select', { options: ['CCTV/เฝ้าระวัง', 'เสียงประกาศ (PA)', 'ตรวจวัดอากาศ/สิ่งแวดล้อม', 'จอ LED', 'เครือข่าย/Fiber Optic', 'Smart MS-Box', 'โดรนและอุปกรณ์', 'อื่นๆ'] })
    ],
    pmPlans: [
      f('name', 'ชื่อแผน', 'text', { required: true }),
      f('site', 'ไซต์', 'ref', { ref: 'sites', required: true }),
      f('customer', 'ลูกค้า', 'ref', { ref: 'customers' }),
      f('contractNo', 'สัญญาบริการ'),
      f('frequency', 'รอบการตรวจ', 'select', { options: ['รายวัน', 'รายสัปดาห์', 'รายเดือน', 'รายไตรมาส'], required: true }),
      f('template', 'แม่แบบรายการตรวจ', 'ref', { ref: 'pmTemplates', required: true }),
      f('team', 'ทีมรับผิดชอบ', 'select', TEAM),
      f('assignee', 'ผู้รับผิดชอบ', 'ref', { ref: 'users' }),
      f('startDate', 'เริ่มรอบแรก', 'date', { required: true }),
      f('active', 'ใช้งาน', 'boolean')
    ],
    pmRecords: []
  }
}

const ticketStatuses = () => [
  { key: 'received', label: 'รับเรื่อง', color: 'blue', next: ['triage'], requiredFields: [] },
  { key: 'triage', label: 'คัดแยก/ตรวจสอบเบื้องต้น', color: 'blue', next: ['remote', 'wait_info', 'wait_parts', 'wait_ext', 'wait_appt', 'appt', 'inprogress', 'verify'], requiredFields: [] },
  { key: 'remote', label: 'กำลังแก้ไขระยะไกล', color: 'indigo', next: ['triage', 'wait_info', 'wait_parts', 'wait_ext', 'wait_appt', 'appt', 'verify'], requiredFields: [] },
  { key: 'wait_info', label: 'รอข้อมูล', color: 'amber', next: ['triage', 'remote', 'appt', 'inprogress', 'verify'], requiredFields: [] },
  { key: 'wait_parts', label: 'รออะไหล่', color: 'amber', next: ['triage', 'remote', 'appt', 'inprogress', 'verify'], requiredFields: [] },
  { key: 'wait_ext', label: 'รอทีมภายนอก', color: 'amber', next: ['triage', 'remote', 'appt', 'inprogress', 'verify'], requiredFields: [] },
  { key: 'wait_appt', label: 'รอนัดหมายช่าง', color: 'amber', next: ['triage', 'appt', 'inprogress'], requiredFields: [] },
  { key: 'appt', label: 'นัดหมายเข้าหน้างาน', color: 'violet', next: ['inprogress', 'wait_info', 'wait_parts', 'wait_ext', 'wait_appt'], requiredFields: [] },
  { key: 'inprogress', label: 'กำลังดำเนินการ', color: 'indigo', next: ['wait_parts', 'wait_ext', 'appt', 'verify'], requiredFields: [] },
  { key: 'verify', label: 'รอตรวจสอบผล', color: 'teal', next: ['inprogress', 'informed'], requiredFields: ['resolution'] },
  { key: 'informed', label: 'แจ้งผลผู้ใช้', color: 'teal', next: ['closed', 'inprogress'], requiredFields: ['resolution'] },
  { key: 'closed', label: 'ปิดเคส', color: 'green', next: ['triage'], requiredFields: ['cause', 'resolution'], final: true, needClosePerm: true }
].map(s => ({ enabled: true, approverRole: '', approverUser: '', ...s }))

const poStatuses = () => [
  { key: 'draft', label: 'ร่าง', color: 'gray', next: ['ordered', 'cancelled'] },
  { key: 'ordered', label: 'สั่งซื้อแล้ว', color: 'blue', next: ['partial', 'received', 'cancelled'] },
  { key: 'partial', label: 'รับบางส่วน', color: 'amber', next: ['received', 'cancelled'] },
  { key: 'received', label: 'รับครบ', color: 'teal', next: ['closed'] },
  { key: 'closed', label: 'ปิด', color: 'green', next: [], final: true, needClosePerm: true },
  { key: 'cancelled', label: 'ยกเลิก', color: 'red', next: [], final: true }
].map(s => ({ enabled: true, approverRole: '', approverUser: '', requiredFields: [], ...s }))

const D = (key, label) => ({ key, label })
const S = (key, label, desc, fields = [], docs = [], x = {}) => ({
  key, label, desc, fields, docs, enabled: true, requireDocs: false,
  approvalRequired: false, approverRole: '', approverUser: '', source: 'document', ...x
})
const sel = (key, label, options, x = {}) => ({ key, label, type: 'select', options, ...x })
const txt = (key, label, type = 'text', x = {}) => ({ key, label, type, ...x })

const projectSteps = () => [
  S('req', '1. รับ Requirement จากลูกค้า', 'เก็บช่องทางรับเรื่อง ผู้ติดต่อ รายละเอียดความต้องการ เอกสารแนบ และผู้รับผิดชอบ',
    [sel('channel', 'ช่องทางรับเรื่อง', ['โทรศัพท์', 'LINE', 'อีเมล', 'หนังสือราชการ', 'พบลูกค้า', 'อื่นๆ']),
     txt('contact', 'ผู้ติดต่อ', 'ref', { ref: 'contacts' }),
     txt('requirement', 'รายละเอียดความต้องการ', 'textarea', { required: true })],
    [D('req_files', 'เอกสารแนบจากลูกค้า')]),
  S('assess', '2. ประเมินประเภทและขอบเขตโครงการ', 'รองรับโครงการขนาดใหญ่ งานใช้อุปกรณ์พิเศษ และงานประเภทอื่น',
    [sel('kind', 'ประเภทงาน', ['โครงการขนาดใหญ่', 'งานใช้อุปกรณ์พิเศษ', 'ติดตั้งทั่วไป', 'อื่นๆ']),
     txt('scope', 'สรุปขอบเขตงาน', 'textarea', { required: true })], []),
  S('proposal', '3. จัดทำเอกสารเสนอและประเมินงาน', 'Requirement Form/Card, BOQ, ใบเสนอราคา, TOR และเอกสารประกวดราคา/ประมูลตามที่ใช้จริง',
    [txt('submitDate', 'วันที่ยื่นเอกสาร', 'date'), txt('quoteNo', 'เลขที่ใบเสนอราคา')],
    [D('req_form', 'Requirement Form / Requirement Card'), D('boq', 'BOQ'), D('quote', 'ใบเสนอราคา'), D('tor', 'TOR'), D('bid_docs', 'เอกสารประกวดราคา/ประมูล (ถ้ามี)')]),
  S('bid', '4. บันทึกผลการเสนอราคา/ประมูล', 'บันทึกชนะ/ไม่ชนะ เหตุผล และเอกสารอ้างอิง',
    [sel('bidResult', 'ผลการเสนอราคา/ประมูล', ['รอผล', 'ชนะ', 'ไม่ชนะ'], { required: true }),
     txt('bidReason', 'เหตุผล', 'textarea'), txt('bidRef', 'เลขที่เอกสารอ้างอิง')],
    [D('bid_result', 'เอกสารผลการพิจารณา')]),
  S('kickoff', '5. เริ่มโครงการ (สัญญา/PO/Kickoff)', 'บันทึกสัญญา PO ผู้เกี่ยวข้อง และ Project Kickoff',
    [txt('contractNo', 'เลขที่สัญญา'), txt('poNo', 'เลขที่ PO'), txt('signDate', 'วันที่ลงนามสัญญา', 'date'),
     txt('kickoffDate', 'วันประชุม Kickoff', 'date'), txt('stakeholders', 'ผู้เกี่ยวข้อง', 'textarea')],
    [D('contract', 'สัญญา'), D('po', 'PO'), D('kickoff_minutes', 'บันทึกการประชุม Kickoff')]),
  S('survey', '6. สำรวจไซต์งาน', 'บันทึกผู้เข้าร่วม และเก็บ Site Survey, Shop Drawing, แปลน, ตำแหน่งติดตั้ง และข้อกำหนดหน้างาน',
    [txt('surveyDate', 'วันที่สำรวจ', 'date'),
     { key: 'attendees', label: 'ผู้เข้าร่วมสำรวจ', type: 'rows', cols: [
       { key: 'name', label: 'ชื่อ', type: 'text' },
       { key: 'party', label: 'สังกัด', type: 'select', options: ['ลูกค้า', 'ผู้ให้บริการเครือข่าย', 'SJP', 'ผู้รับเหมาช่วง', 'อื่นๆ'] }] },
     txt('siteReq', 'ข้อกำหนดหน้างาน', 'textarea')],
    [D('survey', 'Site Survey'), D('shop', 'Shop Drawing'), D('plan', 'แปลน'), D('positions', 'ตำแหน่งติดตั้ง')]),
  S('design', '7. ออกแบบและวางแผน', 'เก็บ System Diagram, Network Diagram, Project Plan และ Schedule',
    [txt('planStart', 'กำหนดเริ่มติดตั้ง', 'date'), txt('planEnd', 'กำหนดแล้วเสร็จ', 'date')],
    [D('sys_diag', 'System Diagram'), D('net_diag', 'Network Diagram'), D('proj_plan', 'Project Plan'), D('schedule', 'Schedule')]),
  S('procure', '8. จัดซื้อ/นำเข้าและเตรียมอุปกรณ์', 'บันทึกรายการที่ต้องใช้ ผู้ขาย สถานะสั่งซื้อ กำหนดส่ง และการตรวจรับ (ดู BOQ เทียบ PO ด้านล่าง)',
    [txt('procNote', 'หมายเหตุการจัดซื้อ', 'textarea')], []),
  S('preconfig', '9. Pre-Configuration', 'บันทึกการตั้งค่าและตรวจความพร้อมของอุปกรณ์ก่อนส่งไปไซต์',
    [txt('cfgDate', 'วันที่ตั้งค่า', 'date'),
     { key: 'cfgRows', label: 'ผลตรวจความพร้อมอุปกรณ์', type: 'rows', cols: [
       { key: 'device', label: 'อุปกรณ์/Serial', type: 'text' },
       { key: 'result', label: 'ผล', type: 'select', options: ['พร้อม', 'ไม่พร้อม'] },
       { key: 'note', label: 'หมายเหตุ', type: 'text' }] }],
    [D('cfg_sheet', 'ใบบันทึกการตั้งค่า')]),
  S('dispatch', '10. เบิกและส่งอุปกรณ์ไปหน้างาน', 'เก็บรายการ จำนวน รุ่น Serial ผู้รับ และหลักฐานส่งมอบ (เบิกผ่านหน้าคลังสินค้า)',
    [txt('receiver', 'ผู้รับของ'), txt('deliveryDate', 'วันที่ส่งมอบ', 'date')],
    [D('delivery_proof', 'หลักฐานการส่งมอบ')]),
  S('install', '11. ติดตั้งและทดสอบ', 'บันทึกความก้าวหน้า ผลทดสอบ ปัญหา วิธีแก้ และผู้ปฏิบัติงาน',
    [txt('progress', 'ความก้าวหน้า (%)', 'number'), sel('testResult', 'ผลการทดสอบ', ['ผ่าน', 'ผ่านแบบมีเงื่อนไข', 'ไม่ผ่าน']),
     txt('issues', 'ปัญหาที่พบ', 'textarea'), txt('fixes', 'วิธีแก้ไข', 'textarea'), txt('workers', 'ผู้ปฏิบัติงาน')],
    [D('test_report', 'รายงานผลทดสอบ')]),
  S('handover', '12. ส่งมอบและตรวจรับ', 'รายงานติดตั้งจริง, รายการอุปกรณ์/Serial, As-built, พิกัด/ภาพถ่าย, คู่มือ, เอกสารฝึกอบรม, เอกสารส่งมอบ/ผลตรวจรับ',
    [txt('handoverDate', 'วันที่ส่งมอบ', 'date'), sel('acceptResult', 'ผลตรวจรับ', ['รอตรวจรับ', 'ผ่าน', 'ผ่านแบบมีเงื่อนไข', 'ไม่ผ่าน']),
     { key: 'trainees', label: 'รายชื่อผู้เข้าอบรม', type: 'rows', cols: [
       { key: 'name', label: 'ชื่อ', type: 'text' }, { key: 'org', label: 'หน่วยงาน', type: 'text' }] }],
    [D('install_report', 'รายงานติดตั้งจริง'), D('asbuilt', 'As-built Drawing'), D('asbuilt_net', 'Network Diagram (As-built)'),
     D('photos', 'จุดพิกัดและภาพถ่ายหน้างาน'), D('manual', 'คู่มือระบบ'), D('training', 'เอกสารฝึกอบรม'),
     D('handover_doc', 'เอกสารส่งมอบ'), D('acceptance', 'ผลตรวจรับตามข้อกำหนดโครงการ')]),
  S('after', '13. บริการหลังส่งมอบ', 'บันทึกสัญญาบริการ งาน PM/CM และรายงานประจำเดือน ถ้าอยู่ในขอบเขตสัญญา',
    [txt('svcContract', 'เลขที่สัญญาบริการ'), txt('svcStart', 'เริ่มสัญญาบริการ', 'date'), txt('svcEnd', 'สิ้นสุดสัญญาบริการ', 'date'),
     { key: 'includePM', label: 'รวมงาน PM', type: 'boolean' }, { key: 'monthlyReport', label: 'ต้องมีรายงานประจำเดือน', type: 'boolean' }],
    [D('svc_contract', 'สัญญาบริการ')])
]

export function defaultConfig() {
  const allActs = ACTIONS.map(a => a[0])
  const mk = (map) => {
    const p = {}
    RESOURCES.forEach(([r]) => { p[r] = {}; (map[r] || []).forEach(a => { p[r][a] = true }) })
    return p
  }
  const V = ['view'], VC = ['view', 'create'], VCE = ['view', 'create', 'edit'], VCEA = ['view', 'create', 'edit', 'assign']
  return {
    fields: defaultFields(),
    lists: {
      teams: ['ทีมโครงการ', 'ทีมบริการ/ซ่อมบำรุง', 'ทีมเครือข่าย', 'ศูนย์รับแจ้ง', 'ทีมคลัง/พัสดุ'],
      depts: ['โครงการ', 'บริการหลังการขาย', 'จัดซื้อ/คลัง', 'บริหาร']
    },
    workflows: {
      project: { confirmed: false, steps: projectSteps() },
      ticket: { confirmed: false, statuses: ticketStatuses() },
      po: { confirmed: false, statuses: poStatuses(), limits: [] }
    },
    roles: [
      { id: 'admin', name: 'ผู้ดูแลระบบ', isAdmin: true, scope: 'all', perms: mk(Object.fromEntries(RESOURCES.map(([r]) => [r, allActs]))) },
      { id: 'pm', name: 'ผู้จัดการโครงการ', scope: 'all', perms: mk({ master: VCE, assets: VCE, projects: [...VCEA, 'close'], tickets: VCEA, purchase: VCE, warehouse: VCE, pm: VCEA, reports: ['view', 'export'] }) },
      { id: 'helpdesk', name: 'ศูนย์รับแจ้ง', scope: 'all', perms: mk({ master: V, assets: V, projects: V, tickets: [...VCEA, 'close'], warehouse: V, pm: V, reports: ['view'] }) },
      { id: 'tech', name: 'ช่างบริการ/เทคนิค', scope: 'team', perms: mk({ master: V, assets: ['view', 'edit'], projects: V, tickets: ['view', 'edit'], warehouse: VC, pm: VCE, reports: V }) },
      { id: 'store', name: 'พัสดุ/คลัง', scope: 'all', perms: mk({ master: V, assets: VCE, projects: V, tickets: V, purchase: V, warehouse: [...VCE, 'close'], reports: ['view', 'export'] }) },
      { id: 'buyer', name: 'จัดซื้อ', scope: 'all', perms: mk({ master: VCE, assets: V, projects: V, purchase: [...VCE, 'close'], warehouse: V, reports: ['view', 'export'] }) },
      { id: 'exec', name: 'ผู้บริหาร (ดู/ส่งออก)', scope: 'all', perms: mk({ master: V, assets: V, projects: V, tickets: V, purchase: V, warehouse: V, pm: V, reports: ['view', 'export'] }) }
    ],
    escalation: {
      confirmed: false, enabled: false,
      buckets: [6, 12, 24, 48, 60],
      rules: [
        { id: 'r1', afterHours: 6, label: 'ช่วงติดตามตัวอย่าง 6–12 ชม.', action: 'ไฮไลต์ในรายการ', toRole: '', example: true },
        { id: 'r2', afterHours: 24, label: 'ช่วงติดตามตัวอย่าง 24 ชม.', action: 'แจ้งเตือนผู้รับผิดชอบ', toRole: '', example: true },
        { id: 'r3', afterHours: 48, label: 'ช่วงติดตามตัวอย่าง 48 ชม.', action: 'แจ้งเตือนหัวหน้าทีม', toRole: '', example: true },
        { id: 'r4', afterHours: 60, label: 'ช่วงติดตามตัวอย่าง 60 ชม. ขึ้นไป', action: 'ยกระดับเคส', toRole: '', example: true }
      ]
    },
    modules: [],
    nav: { hidden: [] },
    confirmations: defaultConfirmations()
  }
}

export function defaultConfirmations() {
  const q = (id, topic, kind, ask, answer = '') => ({ id, topic, kind, ask, answer, status: answer ? 'ยืนยันแล้ว' : 'รอยืนยัน' })
  return [
    q('c1', 'ผู้อนุมัติของแต่ละขั้นตอนโครงการ', 'ต้องยืนยัน', 'ใครเป็นผู้อนุมัติในแต่ละขั้นตอนโครงการ (ระบบยังไม่ตั้งผู้อนุมัติใดๆ)'),
    q('c2', 'วงเงินอนุมัติใบสั่งซื้อ', 'ต้องยืนยัน', 'วงเงินและผู้อนุมัติ PO แต่ละช่วง (ตั้งได้ที่ ตั้งค่า > Workflow ใบสั่งซื้อ)'),
    q('c3', 'SLA และเวลาตอบสนอง/แก้ไข', 'ต้องยืนยัน', 'SLA จริงของแต่ละความเร่งด่วน/สัญญา (ช่วง 6–12, 24, 48, 60 ชม. เป็นเพียงตัวอย่างจากเอกสาร ปิดการแจ้งเตือนอยู่)'),
    q('c4', 'ชุดสถานะ Service Ticket จริง', 'ข้อเสนอ', 'ยืนยัน/แก้ชุดสถานะเริ่มต้น 12 สถานะ และเงื่อนไขการเปลี่ยนสถานะ'),
    q('c5', 'ทีมและแผนก', 'ข้อเสนอ', 'รายชื่อทีม/แผนกจริง (ตอนนี้เป็นค่าเสนอ ปรับได้ที่ ตั้งค่า > รายการตัวเลือก)'),
    q('c6', 'รอบ PM และรายการตรวจจริง', 'ต้องยืนยัน', 'ความถี่ PM ต่อประเภทอุปกรณ์/สัญญา และรายการตรวจ (แม่แบบตอนนี้เป็นตัวอย่างจำลอง)'),
    q('c7', 'เอกสารที่ต้องใช้ในแต่ละขั้นตอนโครงการ', 'ต้องยืนยัน', 'เอกสารบังคับต่อขั้นตอนตามข้อกำหนดโครงการ (ตอนนี้แสดงรายการตามเอกสารแต่ไม่บังคับ)'),
    q('c8', 'การนับเวลาเคส', 'ต้องยืนยัน', 'นับเวลาต่อเนื่องหรือหยุดเมื่อรอข้อมูล/รออะไหล่ และนับเวลาทำการหรือ 24 ชม.'),
    q('c9', 'ข้อบังคับภายในอื่นๆ', 'ต้องยืนยัน', 'เงื่อนไขการรับประกัน การตรวจรับสินค้า การปิดโครงการ ที่เอกสารไม่ได้ระบุ')
  ]
}

// ---- user-built modules are registered into ENT so every generic page can use them ----
export const entKey = slug => 'm_' + slug
export const isCustom = entity => typeof entity === 'string' && entity.startsWith('m_')
export const resourcesOf = cfg => [...RESOURCES, ...(cfg.modules || []).map(m => [m.key, m.name + ' (โมดูลที่สร้างเอง)'])]
export function syncModules(cfg) {
  const keep = new Set((cfg.modules || []).map(m => m.key))
  Object.keys(ENT).forEach(k => { if (isCustom(k) && !keep.has(k)) delete ENT[k] })
  for (const m of cfg.modules || []) {
    ENT[m.key] = {
      label: m.name, res: m.key, prefix: m.prefix || 'MOD', title: m.titleField || 'code', custom: true,
      cols: ['code', ...(m.cols || []), ...(cfg.workflows[m.key] ? ['status'] : [])], filters: m.filters || []
    }
  }
}

export const PRESET_NAV = [
  ['ภาพรวม', [['/', 'หน้าแรก (ภาพรวม)', null], ['/my', 'งานของฉัน / รออนุมัติ', null]]],
  ['งานขาย/โครงการ', [['/projects', 'โครงการ', 'projects'], ['/calendar', 'ปฏิทินงาน', null]]],
  ['บริการ', [['/tickets', 'แจ้งซ่อม / Service Ticket', 'tickets'], ['/pm', 'งาน PM', 'pm']]],
  ['คลัง/จัดซื้อ', [['/purchaseOrders', 'ใบสั่งซื้อ', 'purchase'], ['/warehouse', 'คลังสินค้า', 'warehouse']]],
  ['ข้อมูลหลัก', [['/customers', 'ลูกค้า', 'master'], ['/vendors', 'ผู้ขาย', 'master'], ['/contacts', 'ผู้ติดต่อ', 'master'], ['/sites', 'ไซต์งาน', 'master'], ['/items', 'สินค้า/อุปกรณ์/อะไหล่', 'assets'], ['/serials', 'Serial Number', 'assets']]],
  ['ระบบ', [['/reports', 'รายงานและส่งออก', 'reports'], ['/review', 'ขอบเขตและรอยืนยัน', null], ['/settings', 'ตั้งค่าและสร้างโมดูล', 'settings']]]
]
