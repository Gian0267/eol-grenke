-- Anagrafica delle agenzie con il link di registrazione a un nuovo noleggio.
CREATE TABLE "Agenzia" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "link_onboarding" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Agenzia_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Agenzia_nome_key" ON "Agenzia"("nome");
