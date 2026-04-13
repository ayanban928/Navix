import { useSharedTripState, Message as SharedMessage, AuditLog as SharedAuditLog } from '../contexts/TripContext';

// Re-export type for compatibility
export type Message = SharedMessage;
export type AuditLog = SharedAuditLog;

export function useTripState(initialBudget: number = 1000) {
  // Now consumes the shared state instead of defining local state
  return useSharedTripState();
}
