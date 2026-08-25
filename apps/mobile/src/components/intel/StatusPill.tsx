// Pill de status do motor (E13) — cor do token + rótulo PT.
import { Badge } from '../ui/Badge'
import { statusColor, statusLabel } from '../../utils/customerStatus'
import type { CustomerStatus } from '@addere/types'

export function StatusPill({ status, testID }: { status: CustomerStatus; testID?: string }) {
  return (
    <Badge color={statusColor(status)} testID={testID}>
      {statusLabel(status)}
    </Badge>
  )
}
