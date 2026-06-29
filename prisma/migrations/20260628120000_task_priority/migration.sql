-- 08_task_priority: the Priority enum + Task.priority column (R1).
--
-- Task.priority  Priority NOT NULL DEFAULT 'MEDIUM'. The column default backfills
-- every existing row to MEDIUM, so this migration is additive and non-destructive.
-- An index on priority supports the board's priority filter.
--
-- Covered by the existing Task RLS (08 adds no new policy — the column lives on
-- the already-RLS-protected Task table from 03).

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "priority" "Priority" NOT NULL DEFAULT 'MEDIUM';

-- CreateIndex
CREATE INDEX "Task_priority_idx" ON "Task"("priority");
