# MASAV partial/failed collection recovery

Local implementation only. Existing financial records and the business clock remain untouched.

The permanent MASAV section now shows immutable instructions with original amount, confirmed collection amount, current remaining debt, original billing periods, parent instruction references and payment allocations. These history amounts are not summed into the Statement-based financial summary.

Pending or partially recorded instructions stay locked. The administrator explicitly finalizes the bank result after recording all confirmed payments. A failed result with no collection creates no payment. Finalization is immutable and repeat-safe.

For a finalized partial/failed instruction, **הכן גבייה חוזרת ליתרה** opens inline confirmation. It prepares only new unpaid-balance proposals, preserving mandate approval, holds and unresolved-attempt checks. The proposals still need manual approval, unified preview and Excel export. The original instruction is never re-exported. Both future-export consolidation modes remain supported.

The existing collection resolver records confirmed payments; FIFO closes oldest debts first. Backend instruction/Statement locks and unique references prevent duplicate results, retries and exports. Errors remain visible, and loading terminates.

Tests: **33 isolated PostgreSQL/XLSX checks passed** (13 recovery, 13 consolidation, 7 manual-export compatibility). **33 Chrome tests passed**, including finalization without invented payments, confirmation before retry, status/amount display, API errors, current proposal selection and history/form layout at 375px and 1200px. TypeScript compilation passed; Angular development build is checked separately.

Before deployment: migration **081 then 082** and matching Backend/Frontend versions are required. Neither migration was applied to shared data during this task. Legacy exported instructions without journal metadata remain protected and cannot be automatically retried or inferred as failed.

No automatic bank submission. No shared pilot changes, live jobs, Commit, Push or Deploy.
