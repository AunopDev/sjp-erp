// Sample module 1 — Inventory (สินค้า/คลัง). Plain data only: no code, no direct calls to other modules.
const L = (th, en) => ({ th, en })
const f = (key, th, en, type = 'text', x = {}) => ({ key, type, label: L(th, en), ...x })
const positive = { type: 'compare', field: 'qty', op: '>', value: 0, message: L('จำนวนต้องมากกว่า 0', 'Quantity must be greater than 0') }

export default {
  formatVersion: 1,
  name: 'inventory',
  version: '1.0.0',
  title: L('สินค้า/คลัง', 'Inventory'),
  description: 'สินค้า รับเข้า จ่ายออก ยอดคงเหลือ และรายการรอรับของจากการสั่งซื้อ',
  dependsOn: [],
  entities: [
    {
      formatVersion: 1, key: 'product', label: L('สินค้า', 'Product'), prefix: 'PRD', titleField: 'name',
      fields: [
        f('sku', 'รหัสสินค้า (SKU)', 'SKU', 'text', { required: true, unique: true, maxLength: 40 }),
        f('name', 'ชื่อสินค้า', 'Name', 'text', { required: true }),
        f('unit', 'หน่วยนับ', 'Unit', 'select', { options: [{ value: 'pcs', label: L('ชิ้น', 'pcs') }, { value: 'box', label: L('กล่อง', 'box') }, { value: 'set', label: L('ชุด', 'set') }, { value: 'm', label: L('เมตร', 'm') }], default: 'pcs' }),
        f('category', 'หมวดหมู่', 'Category', 'text'),
        f('minStock', 'จุดสั่งซื้อขั้นต่ำ', 'Reorder level', 'number', { min: 0, default: 0 }),
        f('note', 'หมายเหตุ', 'Note', 'textarea')
      ],
      list: { columns: ['sku', 'name', 'unit', 'category', 'minStock'], filters: ['unit'] }
    },
    {
      formatVersion: 1, key: 'receipt', label: L('รับเข้า', 'Goods receipt'), prefix: 'GR',
      fields: [
        f('product', 'สินค้า', 'Product', 'ref', { ref: 'product', required: true }),
        f('qty', 'จำนวน', 'Quantity', 'number', { required: true }),
        f('date', 'วันที่รับ', 'Date', 'date', { required: true, default: '@today' }),
        f('source', 'แหล่งที่มา/อ้างอิง', 'Source / reference', 'text'),
        f('note', 'หมายเหตุ', 'Note', 'textarea')
      ],
      rules: [positive],
      list: { columns: ['date', 'product', 'qty', 'source'], filters: [] }
    },
    {
      formatVersion: 1, key: 'issue', label: L('จ่ายออก', 'Goods issue'), prefix: 'GI',
      fields: [
        f('product', 'สินค้า', 'Product', 'ref', { ref: 'product', required: true }),
        f('qty', 'จำนวน', 'Quantity', 'number', { required: true }),
        f('date', 'วันที่จ่าย', 'Date', 'date', { required: true, default: '@today' }),
        f('reason', 'เหตุผล/ผู้รับ', 'Reason / recipient', 'text'),
        f('note', 'หมายเหตุ', 'Note', 'textarea')
      ],
      rules: [positive, { type: 'maxByReport', report: 'balance', key: 'product', value: 'qty' }],
      list: { columns: ['date', 'product', 'qty', 'reason'], filters: [] }
    },
    {
      formatVersion: 1, key: 'pendingReceipt', label: L('รายการรอรับของ', 'Pending receipt'), prefix: 'PR', titleField: 'po',
      fields: [
        f('po', 'อ้างอิงใบสั่งซื้อ', 'PO reference', 'text'),
        f('vendorName', 'ผู้ขาย', 'Vendor', 'text'),
        f('product', 'สินค้า', 'Product', 'ref', { ref: 'product', required: true }),
        f('qty', 'จำนวนที่รอรับ', 'Qty expected', 'number', { required: true })
      ],
      workflow: {
        initial: 'waiting',
        states: [
          { key: 'waiting', label: L('รอรับของ', 'Waiting') },
          { key: 'received', label: L('รับของแล้ว', 'Received'), locked: true, final: true },
          { key: 'cancelled', label: L('ยกเลิก', 'Cancelled'), locked: true, final: true }
        ],
        transitions: [
          {
            key: 'receive', label: L('ตรวจรับเข้าคลัง', 'Receive into stock'), from: ['waiting'], to: 'received',
            actions: [{ type: 'createRecord', entity: 'receipt', map: { product: '$record.product', qty: '$record.qty', source: '$record.po', note: 'รับตามใบสั่งซื้อ' } }]
          },
          { key: 'cancel', label: L('ยกเลิก', 'Cancel'), from: ['waiting'], to: 'cancelled', requireComment: true }
        ]
      },
      list: { columns: ['po', 'vendorName', 'product', 'qty', 'status'], filters: ['status'] }
    }
  ],
  roles: [
    { key: 'keeper', label: L('เจ้าหน้าที่คลัง', 'Storekeeper'), perms: { product: ['view', 'create', 'edit', 'delete'], receipt: ['view', 'create', 'edit', 'delete'], issue: ['view', 'create', 'edit', 'delete'], pendingReceipt: ['view', 'create', 'edit', 'delete'] } },
    { key: 'viewer', label: L('ผู้ดูคลัง', 'Stock viewer'), perms: { product: ['view'], receipt: ['view'], issue: ['view'], pendingReceipt: ['view'] } }
  ],
  reports: [
    {
      key: 'balance', label: L('ยอดคงเหลือ', 'Stock balance'), type: 'sum', groupBy: 'product', groupEntity: 'product', value: 'qty',
      valueLabel: L('คงเหลือ', 'On hand'), sources: [{ entity: 'receipt', sign: 1 }, { entity: 'issue', sign: -1 }]
    }
  ],
  menu: [
    { kind: 'entity', target: 'product' }, { kind: 'entity', target: 'pendingReceipt' },
    { kind: 'entity', target: 'receipt' }, { kind: 'entity', target: 'issue' }, { kind: 'report', target: 'balance' }
  ],
  // React to the purchasing module's event without knowing (or needing) that module.
  subscriptions: [
    {
      event: 'purchasing.order.approved',
      action: { type: 'createRecord', entity: 'pendingReceipt', forEach: '$record.lines', map: { po: '$record.code', vendorName: '$labels.vendor', product: '$line.product', qty: '$line.qty' } }
    }
  ]
}
