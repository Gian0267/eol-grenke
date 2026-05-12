-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Audit_Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contratto_eol_id" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attore_tipo" TEXT NOT NULL,
    "attore_id" TEXT NOT NULL,
    "azione" TEXT NOT NULL,
    "dati_json" TEXT NOT NULL,
    "hash_precedente" TEXT NOT NULL,
    "hash_corrente" TEXT NOT NULL,
    CONSTRAINT "Audit_Event_contratto_eol_id_fkey" FOREIGN KEY ("contratto_eol_id") REFERENCES "Contratto_EOL" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Audit_Event" ("attore_id", "attore_tipo", "azione", "contratto_eol_id", "dati_json", "hash_corrente", "hash_precedente", "id", "timestamp") SELECT "attore_id", "attore_tipo", "azione", "contratto_eol_id", "dati_json", "hash_corrente", "hash_precedente", "id", "timestamp" FROM "Audit_Event";
DROP TABLE "Audit_Event";
ALTER TABLE "new_Audit_Event" RENAME TO "Audit_Event";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
