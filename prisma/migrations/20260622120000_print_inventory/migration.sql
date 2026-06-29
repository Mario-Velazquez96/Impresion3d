-- 06_print_inventory: the Print table and the PrintColor M2M join (R1, R2).
--
-- Print.printTypeId -> PrintType  ON DELETE RESTRICT  (an in-use print type cannot
--                                 be deleted; paired with the catalog delete-guard
--                                 counter registered in lib/services/prints.ts).
-- PrintColor.printId -> Print     ON DELETE CASCADE    (deleting a print removes its
--                                 color rows).
-- PrintColor.colorId -> Color     ON DELETE RESTRICT   (a color in use by any print
--                                 cannot be deleted; paired with a delete-guard
--                                 counter).
--
-- photoPath holds the Storage object KEY in the private print-photos bucket — never
-- a public URL. Indexed by printTypeId (type filter) and name (search). RLS is
-- added in the following migration (print_inventory_rls); the private bucket +
-- policies arrive in print_photos_bucket.

-- CreateTable
CREATE TABLE "Print" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "printTimeMinutes" INTEGER NOT NULL,
    "filamentGrams" INTEGER NOT NULL,
    "photoPath" TEXT,
    "documentUrl" TEXT,
    "printTypeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Print_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrintColor" (
    "printId" TEXT NOT NULL,
    "colorId" TEXT NOT NULL,

    CONSTRAINT "PrintColor_pkey" PRIMARY KEY ("printId","colorId")
);

-- CreateIndex
CREATE INDEX "Print_printTypeId_idx" ON "Print"("printTypeId");

-- CreateIndex
CREATE INDEX "Print_name_idx" ON "Print"("name");

-- CreateIndex
CREATE INDEX "PrintColor_colorId_idx" ON "PrintColor"("colorId");

-- AddForeignKey
ALTER TABLE "Print" ADD CONSTRAINT "Print_printTypeId_fkey" FOREIGN KEY ("printTypeId") REFERENCES "PrintType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintColor" ADD CONSTRAINT "PrintColor_printId_fkey" FOREIGN KEY ("printId") REFERENCES "Print"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintColor" ADD CONSTRAINT "PrintColor_colorId_fkey" FOREIGN KEY ("colorId") REFERENCES "Color"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
