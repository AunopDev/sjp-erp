// Sample module 3 — Basic accounting (บัญชีเบื้องต้น): chart of accounts and double-entry journals (debit must equal credit).
const L = (th, en) => ({ th, en })
const f = (key, th, en, type = 'text', x = {}) => ({ key, type, label: L(th, en), ...x })
const all = ['view', 'create', 'edit', 'delete']
const acct = (code, th, en, type) => ({ code, name: th, type })

export default {
  formatVersion: 1,
  name: 'accounting',
  version: '1.0.0',
  title: L('บัญชีเบื้องต้น', 'Basic accounting'),
  description: 'ผังบัญชี และบันทึกบัญชีคู่ (เดบิตต้องเท่ากับเครดิตเสมอ) พร้อมงบทดลอง',
  dependsOn: [],
  entities: [
    {
      formatVersion: 1, key: 'account', label: L('ผังบัญชี', 'Account'), prefix: 'ACC', titleField: 'name',
      fields: [
        f('code', 'เลขที่บัญชี', 'Account no.', 'text', { required: true, unique: true, maxLength: 20 }),
        f('name', 'ชื่อบัญชี', 'Account name', 'text', { required: true }),
        f('type', 'หมวดบัญชี', 'Type', 'select', {
          required: true,
          options: [{ value: 'asset', label: L('สินทรัพย์', 'Asset') }, { value: 'liability', label: L('หนี้สิน', 'Liability') }, { value: 'equity', label: L('ทุน', 'Equity') }, { value: 'revenue', label: L('รายได้', 'Revenue') }, { value: 'expense', label: L('ค่าใช้จ่าย', 'Expense') }]
        })
      ],
      list: { columns: ['code', 'name', 'type'], filters: ['type'] }
    },
    {
      formatVersion: 1, key: 'journal', label: L('บันทึกบัญชี', 'Journal entry'), prefix: 'JV', titleField: 'memo',
      fields: [
        f('date', 'วันที่', 'Date', 'date', { required: true, default: '@today' }),
        f('memo', 'คำอธิบายรายการ', 'Memo', 'text', { required: true }),
        {
          key: 'lines', type: 'rows', label: L('รายการบัญชี', 'Lines'), required: true,
          columns: [
            { key: 'account', type: 'ref', ref: 'account', label: L('บัญชี', 'Account'), required: true },
            { key: 'description', type: 'text', label: L('รายละเอียด', 'Description') },
            { key: 'debit', type: 'money', label: L('เดบิต', 'Debit') },
            { key: 'credit', type: 'money', label: L('เครดิต', 'Credit') }
          ]
        },
        f('totalDebit', 'เดบิตรวม', 'Total debit', 'formula', { formula: 'SUM({lines.debit})' }),
        f('totalCredit', 'เครดิตรวม', 'Total credit', 'formula', { formula: 'SUM({lines.credit})' })
      ],
      // checked on every save and again when posting — an unbalanced entry can never be stored
      rules: [{ type: 'balanced', rows: 'lines', debit: 'debit', credit: 'credit' }],
      workflow: {
        initial: 'draft',
        states: [{ key: 'draft', label: L('ร่าง', 'Draft') }, { key: 'posted', label: L('ลงบัญชีแล้ว', 'Posted'), locked: true, final: true }],
        transitions: [{ key: 'post', label: L('ลงบัญชี', 'Post'), from: ['draft'], to: 'posted', approvers: { roles: ['accountant'] } }]
      },
      list: { columns: ['date', 'memo', 'totalDebit', 'totalCredit', 'status'], filters: ['status'] }
    }
  ],
  roles: [
    { key: 'accountant', label: L('นักบัญชี', 'Accountant'), perms: { account: all, journal: all } },
    { key: 'auditor', label: L('ผู้ตรวจสอบบัญชี (ดูอย่างเดียว)', 'Auditor (read only)'), perms: { account: ['view'], journal: ['view'] } }
  ],
  reports: [
    {
      key: 'trialBalance', label: L('งบทดลอง', 'Trial balance'), type: 'rowsSum', entity: 'journal', rows: 'lines', groupBy: 'account', groupEntity: 'account',
      values: ['debit', 'credit'], where: { status: 'posted' }, columns: ['label', 'debit', 'credit', 'balance']
    }
  ],
  menu: [{ kind: 'entity', target: 'journal' }, { kind: 'entity', target: 'account' }, { kind: 'report', target: 'trialBalance' }],
  seed: {
    account: [
      acct('1100', 'เงินสด', 'Cash', 'asset'), acct('1200', 'ลูกหนี้การค้า', 'Accounts receivable', 'asset'), acct('1300', 'สินค้าคงเหลือ', 'Inventory', 'asset'),
      acct('2100', 'เจ้าหนี้การค้า', 'Accounts payable', 'liability'), acct('3100', 'ทุนเรือนหุ้น', 'Share capital', 'equity'),
      acct('4100', 'รายได้จากการขาย', 'Sales revenue', 'revenue'), acct('5100', 'ต้นทุนขาย', 'Cost of goods sold', 'expense'), acct('5200', 'ค่าใช้จ่ายในการขายและบริหาร', 'Operating expenses', 'expense')
    ]
  },
  subscriptions: []
}
