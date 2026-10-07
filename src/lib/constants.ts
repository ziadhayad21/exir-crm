// src/lib/constants.ts
// Phase 4B: Centralized Application Constants

/**
 * Maximum number of active/uncompleted backlog leads (status = 'in_progress') a Sales employee can hold at a time.
 * This is a workload batching constraint for unassigned backlog leads.
 */
export const BACKLOG_BATCH_LIMIT = 5;
