import { createConsumer } from "@rails/actioncable"

console.log('[cable] Creating ActionCable consumer')
export const consumer = createConsumer()
console.log('[cable] Consumer created:', consumer)

// Expose consumer globally for debugging
if (typeof window !== 'undefined') {
  (window as any).debugConsumer = consumer
  console.log('[cable] Consumer exposed globally as window.debugConsumer')
}

