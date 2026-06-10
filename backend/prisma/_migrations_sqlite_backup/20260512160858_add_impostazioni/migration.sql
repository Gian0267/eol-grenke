-- CreateTable
CREATE TABLE "Impostazione" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chiave" TEXT NOT NULL,
    "valore" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "descrizione" TEXT NOT NULL,
    "valore_default" TEXT NOT NULL,
    "updated_at" DATETIME NOT NULL,
    "updated_by_id" TEXT,
    CONSTRAINT "Impostazione_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "Utente_NSM" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Impostazione_chiave_key" ON "Impostazione"("chiave");

-- CreateIndex
CREATE INDEX "Impostazione_categoria_idx" ON "Impostazione"("categoria");
