# CHANGELOG - Viltrum Fitness V6.1

## V6.1 - Ottimizzazione Nutrition Cache (Novembre 2025)

### 🎯 Obiettivo
Caricare il piano nutrizionale UNA SOLA VOLTA al momento del login, usando la stessa logica di caching già implementata per i workout.

### ✨ Nuove Funzionalità
- **Caricamento Unico**: Il piano nutrizionale viene caricato insieme ai workout al momento del login
- **Cache Intelligente**: Dati nutrition disponibili istantaneamente senza fetch ripetute
- **Consistenza**: Stessa logica di caching per workout e nutrition

### 🔄 File Modificati

#### `session-cache.js`
- ✅ Aggiunto supporto per `nutritionPdfUrl` nel sistema di cache
- ✅ Aggiunto supporto per `nutritionScadenza` nel sistema di cache
- ✅ Log migliorato che mostra disponibilità nutrition plan
- ✅ Tutto caricato in una singola fetch al login

#### `nutrition-app.js`
- ❌ Rimossa la variabile `GOOGLE_APPS_SCRIPT_URL` (non più necessaria)
- ❌ Rimossa la fetch separata in `loadNutritionData()`
- ✅ Ora usa `SessionCache.getCurrentUserInfo()` per ottenere i dati
- ✅ Caricamento istantaneo dalla cache
- ✅ Log migliorato con emoji per debugging

### 📊 Performance

**Prima (V6)**:
- Login: 1 fetch
- Apri nutrition: 1 fetch
- Riapri nutrition: 1 fetch
- **Totale: 3+ fetch**

**Dopo (V6.1)**:
- Login: 1 fetch (include tutto)
- Apri nutrition: 0 fetch (usa cache)
- Riapri nutrition: 0 fetch (usa cache)
- **Totale: 1 fetch**

### ⚡ Vantaggi
1. **Velocità**: Nutrition si apre istantaneamente
2. **Efficienza**: -66% chiamate API al Google Apps Script
3. **UX Migliorata**: Nessun loading quando si apre nutrition
4. **Consistenza**: Logica unificata per tutti i dati utente

### 🔧 Requisiti Google Sheets
Assicurati che la tabella utenti abbia queste colonne:
- `Email`
- `Full Name`
- `Scadenza`
- `Workouts`
- **`nutritionPdfUrl`** (NUOVO)
- **`nutritionScadenza`** (NUOVO)

### 📝 Note Tecniche
- Cache valida per 5 minuti
- Dati nutrition opzionali (null-safe)
- Compatibile con tutte le versioni precedenti
- Nessuna breaking change

### 🐛 Bug Fix
- Risolto: fetch multipla inutile per nutrition data
- Migliorato: gestione errori nel caricamento dati

### 📖 Documentazione
- Aggiunto `README-V6.1-Nutrition-Cache.md` con guida completa
- Istruzioni deploy
- Guida testing
- Troubleshooting

---

## V6.0 - Versione Precedente
- Sistema di cache per workout
- Autenticazione Supabase
- Nutrition app con database alimenti
- PWA support
- Google Cloud TTS integration

---

**Per informazioni dettagliate**, vedi `README-V6.1-Nutrition-Cache.md`
