// Built-in module packages shipped with the system (data only). Order = safe install order.
import inventory from './inventory.js'
import purchasing from './purchasing.js'
import accounting from './accounting.js'

export const BUILTIN_MODULES = [inventory, purchasing, accounting]
