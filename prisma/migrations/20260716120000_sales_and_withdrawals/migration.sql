-- 10_sales_and_balance: the Sale and Withdrawal tables (R7, R8, R15).
--
-- Two ledgers — money IN (Sale) and money OUT (Withdrawal). THE BALANCE IS NOT
-- STORED: there is deliberately NO balance column here or anywhere else. It is
-- derived on every read as sum(Sale.amount) - sum(Withdrawal.amount), via
-- Postgres aggregates (lib/services/finances.ts). A stored total would drift out
-- of sync with the rows it summarizes.
--
-- EXPENSES ARE DELIBERATELY EXCLUDED from that balance — a product decision, not
-- a bug. The balance answers "how much revenue came in that hasn't been taken
-- out yet", NOT "what is truly in the bank". The Expense table is never read by
-- this feature.
--
-- amount           DECIMAL(10,2)  exact two-decimal money; never a JS float (the
--                                 Expense.cost convention).
-- printId       -> Print          ON DELETE RESTRICT  (a print that has been sold
--                                 cannot be deleted; R9's referential backstop,
--                                 paired with the print reference-counter
--                                 pre-check in actions/prints.ts).
-- recordedById  -> User           ON DELETE RESTRICT  (the audit trail of who
--                                 took money out; set server-side from the
--                                 authenticated actor, never from client input).
--
-- Both tables are indexed by date (list order / future per-period reports), Sale
-- additionally by printId (future per-print revenue reports) and Withdrawal by
-- recordedById (per-user audit). RLS is added in the following migration
-- (sales_and_withdrawals_rls).

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "printId" TEXT NOT NULL,
    "buyer" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Withdrawal" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Withdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Sale_date_idx" ON "Sale"("date");

-- CreateIndex
CREATE INDEX "Sale_printId_idx" ON "Sale"("printId");

-- CreateIndex
CREATE INDEX "Withdrawal_date_idx" ON "Withdrawal"("date");

-- CreateIndex
CREATE INDEX "Withdrawal_recordedById_idx" ON "Withdrawal"("recordedById");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_printId_fkey" FOREIGN KEY ("printId") REFERENCES "Print"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
