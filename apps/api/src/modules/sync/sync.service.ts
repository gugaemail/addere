// Barril do módulo de sync — a implementação vive em arquivos por entidade:
//   products.sync.ts / customers.sync.ts / references.sync.ts (transp + condpag)
//   orders.sync.ts / metas.sync.ts
// apoiados por paginated-fetch.ts, upsert-chunked.ts, order-payload.ts e utils.ts
export { syncProducts } from './products.sync'
export { syncCustomers } from './customers.sync'
export { syncTransportadoras, syncCondPags } from './references.sync'
export { syncOrderToProtheus, consultOrderStatus, testOrderSync } from './orders.sync'
export { fetchMetaVendedor } from './metas.sync'
