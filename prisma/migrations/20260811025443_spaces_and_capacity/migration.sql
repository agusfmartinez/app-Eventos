-- AlterTable
ALTER TABLE "events" ADD COLUMN     "max_guests" INTEGER,
ADD COLUMN     "space_id" UUID;

-- CreateTable
CREATE TABLE "spaces" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "spaces_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "spaces_name_key" ON "spaces"("name");

-- CreateIndex
CREATE INDEX "events_space_id_event_date_idx" ON "events"("space_id", "event_date");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
