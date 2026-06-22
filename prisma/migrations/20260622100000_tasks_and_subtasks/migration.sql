-- 03_task_board_core: the TaskState enum + Task and Subtask tables (R1, R2).
--
-- Task.categoryId  -> TaskCategory  ON DELETE RESTRICT  (an in-use category
--                     cannot be deleted; R10's referential backstop).
-- Task.assigneeId  -> User          ON DELETE SET NULL  (a deleted user's tasks
--                     are unassigned, never removed).
-- Subtask.taskId   -> Task          ON DELETE CASCADE   (R2: subtasks die with
--                     their task).
--
-- RLS is added in the following migration (tasks_and_subtasks_rls).

-- CreateEnum
CREATE TYPE "TaskState" AS ENUM ('BACKLOG', 'TODO', 'IN_PROGRESS', 'PENDING', 'BLOCKER', 'DONE');

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "categoryId" TEXT NOT NULL,
    "state" "TaskState" NOT NULL DEFAULT 'BACKLOG',
    "assigneeId" TEXT,
    "dueDate" TIMESTAMP(3),
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subtask" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,

    CONSTRAINT "Subtask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Task_state_position_idx" ON "Task"("state", "position");

-- CreateIndex
CREATE INDEX "Task_categoryId_idx" ON "Task"("categoryId");

-- CreateIndex
CREATE INDEX "Task_assigneeId_idx" ON "Task"("assigneeId");

-- CreateIndex
CREATE INDEX "Subtask_taskId_position_idx" ON "Subtask"("taskId", "position");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TaskCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subtask" ADD CONSTRAINT "Subtask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
