// Sample module 2 — Purchasing (จัดซื้อ): vendors and purchase orders with an approval workflow. Depends on inventory.
const L = (th, en) => ({ th, en })
const f = (key, th, en, type = 'text', x = {}) => ({ key, type, label: L(th, en), ...x })
const all = ['view', 'create', 'edit', 'delete']

export default {
  formatVersion: 1,
  name: 'purchasing',
  version: '1.0.0',
  title: L('จัดซื้อ', 'Purchasing'),
  description: 'ผู้ขาย และใบสั่งซื้อพร้อมขั้นตอนอนุมัติ (ต้องใช้โมดูลสินค้า/คลัง)',
  dependsOn: [{ name: 'inventory', version: '>=1.0.0' }],
  entities: [
    {
      formatVersion: 1, key: 'vendor', label: L('ผู้ขาย', 'Vendor'), prefix: 'VEN', titleField: 'name',
      fields: [
        f('name', 'ชื่อผู้ขาย', 'Vendor name', 'text', { required: true }),
        f('taxId', 'เลขประจำตัวผู้เสียภาษี', 'Tax ID', 'text', { maxLength: 13 }),
        f('phone', 'โทรศัพท์', 'Phone', 'text'),
        f('email', 'อีเมล', 'Email', 'text'),
        { component: 'address', key: 'addr', label: L('ที่อยู่', 'Address') }
      ],
      list: { columns: ['name', 'taxId', 'phone', 'email'], filters: [] }
    },
    {
      formatVersion: 1, key: 'order', label: L('ใบสั่งซื้อ', 'Purchase order'), prefix: 'PO', titleField: 'orderDate',
      fields: [
        f('vendor', 'ผู้ขาย', 'Vendor', 'ref', { ref: 'vendor', required: true }),
        f('orderDate', 'วันที่สั่งซื้อ', 'Order date', 'date', { required: true, default: '@today' }),
        {
          key: 'lines', type: 'rows', label: L('รายการสินค้า', 'Lines'), required: true, component: 'lineItems',
          columns: [
            { key: 'product', type: 'ref', ref: 'inventory.product', label: L('สินค้า', 'Product'), required: true },
            { key: 'qty', type: 'number', label: L('จำนวน', 'Qty'), required: true, min: 0 },
            { key: 'unitPrice', type: 'money', label: L('ราคา/หน่วย', 'Unit price') },
            { key: 'amount', type: 'formula', formula: '{qty}*{unitPrice}', label: L('จำนวนเงิน', 'Amount') }
          ]
        },
        f('total', 'ยอดรวม', 'Total', 'formula', { formula: 'SUM({lines.qty*unitPrice})' }),
        f('note', 'หมายเหตุ', 'Note', 'textarea'),
        { component: 'approvalBlock', key: 'approval', label: L('การอนุมัติ', 'Approval') }
      ],
      rules: [
        { type: 'minRows', rows: 'lines', min: 1, on: ['submit'], message: L('ต้องมีรายการสินค้าอย่างน้อย 1 รายการก่อนส่งอนุมัติ', 'Add at least one line before submitting') },
        { type: 'compare', field: 'total', op: '>', value: 0, on: ['submit'], message: L('ยอดรวมต้องมากกว่า 0 ก่อนส่งอนุมัติ', 'Total must be greater than 0') }
      ],
      workflow: {
        initial: 'draft',
        states: [
          { key: 'draft', label: L('ร่าง', 'Draft') },
          { key: 'pending', label: L('รออนุมัติ', 'Pending approval') },
          { key: 'approved', label: L('อนุมัติแล้ว', 'Approved'), locked: true },
          { key: 'rejected', label: L('ไม่อนุมัติ', 'Rejected') },
          { key: 'cancelled', label: L('ยกเลิก', 'Cancelled'), locked: true, final: true }
        ],
        transitions: [
          { key: 'submit', label: L('ส่งขออนุมัติ', 'Submit for approval'), from: ['draft'], to: 'pending' },
          {
            key: 'approve', label: L('อนุมัติ', 'Approve'), from: ['pending'], to: 'approved',
            approvers: { roles: ['approver'] },
            set: { approval_approvedBy: '$user.name', approval_approvedAt: '$today', approval_approvalNote: '$comment' },
            emits: ['purchasing.order.approved']
          },
          { key: 'reject', label: L('ไม่อนุมัติ', 'Reject'), from: ['pending'], to: 'rejected', approvers: { roles: ['approver'] }, requireComment: true, set: { approval_approvalNote: '$comment' } },
          { key: 'reopen', label: L('แก้ไขใหม่', 'Reopen as draft'), from: ['rejected'], to: 'draft' },
          { key: 'cancel', label: L('ยกเลิกใบสั่งซื้อ', 'Cancel'), from: ['draft', 'pending', 'rejected'], to: 'cancelled', requireComment: true }
        ]
      },
      list: { columns: ['orderDate', 'vendor', 'total', 'status'], filters: ['status'] }
    }
  ],
  roles: [
    { key: 'buyer', label: L('เจ้าหน้าที่จัดซื้อ', 'Buyer'), perms: { vendor: all, order: all, 'inventory.product': ['view'] } },
    { key: 'requester', label: L('ผู้ขอซื้อ (เห็นเฉพาะของตัวเอง)', 'Requester (own orders only)'), perms: { vendor: ['view'], order: ['view', 'create', 'edit'], 'inventory.product': ['view'] }, scopes: { order: 'own' } },
    { key: 'approver', label: L('ผู้อนุมัติจัดซื้อ', 'Purchase approver'), perms: { vendor: ['view'], order: ['view'], 'inventory.product': ['view'] } }
  ],
  menu: [{ kind: 'entity', target: 'order' }, { kind: 'entity', target: 'vendor' }],
  reports: [],
  subscriptions: []
}
