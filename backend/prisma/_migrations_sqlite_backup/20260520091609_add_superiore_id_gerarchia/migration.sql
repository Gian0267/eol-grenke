-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Utente_NSM" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "cognome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "ruolo" TEXT NOT NULL,
    "attivo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "superiore_id" TEXT,
    CONSTRAINT "Utente_NSM_superiore_id_fkey" FOREIGN KEY ("superiore_id") REFERENCES "Utente_NSM" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Utente_NSM" ("attivo", "cognome", "created_at", "email", "id", "nome", "password", "ruolo") SELECT "attivo", "cognome", "created_at", "email", "id", "nome", "password", "ruolo" FROM "Utente_NSM";
DROP TABLE "Utente_NSM";
ALTER TABLE "new_Utente_NSM" RENAME TO "Utente_NSM";
CREATE UNIQUE INDEX "Utente_NSM_email_key" ON "Utente_NSM"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
