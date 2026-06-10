-- ============================================================
-- RLS deny-by-default su tutte le tabelle (NSM EOL Grenke)
-- ============================================================
-- Abilita Row Level Security su ogni tabella SENZA policy.
-- Effetto: la REST API pubblica (anon key) NON può leggere/scrivere
-- nulla. Il backend Prisma continua a funzionare perché si connette
-- come owner del database (bypassa RLS by default).
-- Da eseguire nell'SQL Editor di Supabase.
-- ============================================================

ALTER TABLE "Contratto_EOL"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Cliente"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Decisione_Cliente"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Pagamento"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Comunicazione"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Richiesta_Contatto" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Audit_Event"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OtpCode"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Counter"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Utente_NSM"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Impostazione"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Task_Escalation"    ENABLE ROW LEVEL SECURITY;

-- Verifica: tutte devono risultare rowsecurity = true
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
