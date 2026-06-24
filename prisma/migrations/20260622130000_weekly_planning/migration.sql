-- 07_weekly_planning: the Weekday enum + WeekPlan, WeekPlanColor, and WeekPlanItem
-- tables (R1). The portal's central planning tool.
--
-- WeekPlan.weekStartDate is the Monday of the week and is UNIQUE (one plan per
-- week). WeekPlan.createdById -> User  ON DELETE RESTRICT  (a user who authored a
-- plan cannot be deleted).
-- WeekPlanColor (weekPlanId, colorId composite PK) is the week's available colors:
--   weekPlanId -> WeekPlan  ON DELETE CASCADE   (deleting a plan removes its colors)
--   colorId    -> Color     ON DELETE RESTRICT  (a color used by any plan is locked;
--                            paired with the planning delete-guard counter)
-- WeekPlanItem assigns a print to a day with an integer position:
--   weekPlanId -> WeekPlan  ON DELETE CASCADE   (deleting a plan removes its items)
--   printId    -> Print     ON DELETE RESTRICT  (a planned print cannot be deleted;
--                            paired with a delete-guard counter)
-- Indexed by (weekPlanId, dayOfWeek, position) for the per-day ordered read.
--
-- RLS is added in the following migration (weekly_planning_rls).

-- CreateEnum
CREATE TYPE "Weekday" AS ENUM ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN');

-- CreateTable
CREATE TABLE "WeekPlan" (
    "id" TEXT NOT NULL,
    "weekStartDate" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeekPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeekPlanColor" (
    "weekPlanId" TEXT NOT NULL,
    "colorId" TEXT NOT NULL,

    CONSTRAINT "WeekPlanColor_pkey" PRIMARY KEY ("weekPlanId","colorId")
);

-- CreateTable
CREATE TABLE "WeekPlanItem" (
    "id" TEXT NOT NULL,
    "weekPlanId" TEXT NOT NULL,
    "printId" TEXT NOT NULL,
    "dayOfWeek" "Weekday" NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "WeekPlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WeekPlan_weekStartDate_key" ON "WeekPlan"("weekStartDate");

-- CreateIndex
CREATE INDEX "WeekPlanColor_colorId_idx" ON "WeekPlanColor"("colorId");

-- CreateIndex
CREATE INDEX "WeekPlanItem_weekPlanId_dayOfWeek_position_idx" ON "WeekPlanItem"("weekPlanId", "dayOfWeek", "position");

-- AddForeignKey
ALTER TABLE "WeekPlan" ADD CONSTRAINT "WeekPlan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeekPlanColor" ADD CONSTRAINT "WeekPlanColor_weekPlanId_fkey" FOREIGN KEY ("weekPlanId") REFERENCES "WeekPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeekPlanColor" ADD CONSTRAINT "WeekPlanColor_colorId_fkey" FOREIGN KEY ("colorId") REFERENCES "Color"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeekPlanItem" ADD CONSTRAINT "WeekPlanItem_weekPlanId_fkey" FOREIGN KEY ("weekPlanId") REFERENCES "WeekPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeekPlanItem" ADD CONSTRAINT "WeekPlanItem_printId_fkey" FOREIGN KEY ("printId") REFERENCES "Print"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
