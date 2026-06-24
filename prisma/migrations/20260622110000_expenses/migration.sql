-- 05_expense_tracking: the Expense table (R1).
--
-- cost            DECIMAL(10,2)  exact two-decimal money; never a JS float.
-- supplyTypeId -> SupplyType     ON DELETE RESTRICT  (an in-use SupplyType cannot
--                                be deleted; R1's referential backstop, paired
--                                with the catalog delete-guard counter).
--
-- Indexed by date (list order / future per-month reports) and supplyTypeId
-- (future per-type reports). RLS is added in the following migration
-- (expenses_rls).

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "cost" DECIMAL(10,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "purchaseUrl" TEXT,
    "supplyTypeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Expense_date_idx" ON "Expense"("date");

-- CreateIndex
CREATE INDEX "Expense_supplyTypeId_idx" ON "Expense"("supplyTypeId");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_supplyTypeId_fkey" FOREIGN KEY ("supplyTypeId") REFERENCES "SupplyType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
