-- CreateEnum
CREATE TYPE "public"."TaskHistoryAction" AS ENUM ('CREATED', 'UPDATED', 'MOVED', 'DELETED');

-- CreateEnum
CREATE TYPE "public"."TaskHistoryStatus" AS ENUM ('APPLIED', 'UNDONE');

-- CreateTable
CREATE TABLE "public"."TaskHistory" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "action" "public"."TaskHistoryAction" NOT NULL,
    "status" "public"."TaskHistoryStatus" NOT NULL DEFAULT 'APPLIED',
    "beforeState" JSONB,
    "afterState" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskHistory_userId_boardId_status_createdAt_idx" ON "public"."TaskHistory"("userId", "boardId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "TaskHistory_tenantId_boardId_createdAt_idx" ON "public"."TaskHistory"("tenantId", "boardId", "createdAt");

-- CreateIndex
CREATE INDEX "TaskHistory_taskId_idx" ON "public"."TaskHistory"("taskId");

-- AddForeignKey
ALTER TABLE "public"."TaskHistory" ADD CONSTRAINT "TaskHistory_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "public"."Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TaskHistory" ADD CONSTRAINT "TaskHistory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TaskHistory" ADD CONSTRAINT "TaskHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
