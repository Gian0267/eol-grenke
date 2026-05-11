# Scenari di test — NSM EOL Grenke

> **Stato:** placeholder — verrà popolato nella **Missione 10** con 10+ scenari di test guidati end-to-end.

Questo documento contiene gli scenari di test da eseguire manualmente per verificare che il template funzioni correttamente in tutti i suoi flussi.

## Indice scenari

1. [Setup iniziale del progetto](#scenario-1-setup-iniziale)
2. [Importazione lista Grenke + riconciliazione](#scenario-2-importazione-grenke)
3. [Invio comunicazione iniziale ai clienti](#scenario-3-invio-comunicazione)
4. [Cliente accede all'area self-service](#scenario-4-accesso-cliente)
5. [Cliente sceglie "Restituisci il bene"](#scenario-5-restituzione)
6. [Cliente sceglie "Acquista il bene" — flusso completo con pagamento](#scenario-6-riacquisto-completo)
7. [Cliente sceglie "Acquista il bene" — con step "Hai dubbi?"](#scenario-7-riacquisto-hai-dubbi)
8. [Cliente sceglie "Rinnova"](#scenario-8-rinnovo)
9. [Cliente sceglie "Contatto personalizzato"](#scenario-9-contatto)
10. [Solleciti automatici email + escalation telefonica](#scenario-10-solleciti)
11. [Backoffice: gestione outlier riconciliazione](#scenario-11-outlier)
12. [Backoffice: pratica a rischio silenzio](#scenario-12-rischio-silenzio)
13. [Backoffice: export lista riacquisti per Grenke](#scenario-13-export-grenke)
14. [Verifica integrità audit log](#scenario-14-audit)

---

## Template per scenari

[DA POPOLARE NELLA MISSIONE 10]

Ogni scenario seguirà questo formato:

### Scenario N: [Titolo]

**Obiettivo:** Cosa stiamo testando

**Prerequisiti:**
- Stato iniziale del DB
- Configurazioni necessarie
- Utenti coinvolti

**Passi:**
1. [Azione concreta]
2. [Azione concreta]
3. ...

**Risultato atteso:**
- [Cosa deve succedere]
- [Cosa deve essere visibile in UI]
- [Cosa deve essere registrato nel DB]

**Eventuali variant:**
- Cosa cambia se faccio X invece di Y
