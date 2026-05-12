-- CreateTable
CREATE TABLE "OtpCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "destinatario" TEXT NOT NULL,
    "codice" TEXT NOT NULL,
    "metodo" TEXT NOT NULL,
    "scadenza" DATETIME NOT NULL,
    "usato" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
