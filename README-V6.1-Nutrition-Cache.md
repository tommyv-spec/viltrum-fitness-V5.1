# Ottimizzazione Caricamento Nutrition Plan - V6.1

## 🎯 Obiettivo
Caricare il piano nutrizionale **UNA SOLA VOLTA** al momento del login, usando la stessa logica di caching già implementata per i workout.

## 📦 Cosa È Cambiato

### Prima (V6)
❌ **Problema**: Ogni volta che aprivi `nutrition.html`, veniva fatta una nuova fetch al Google Apps Script:
```javascript
// nutrition-app.js (VECCHIO)
async function loadNutritionData() {
  const response = await fetch(GOOGLE_APPS_SCRIPT_URL);  // ❌ Fetch ad ogni apertura!
  const data = await response.json();
  // ...
}
```

### Dopo (V6.1)
✅ **Soluzione**: Ora usa `SessionCache` che carica i dati una volta sola al login:
```javascript
// nutrition-app.js (NUOVO)
async function loadNutritionData() {
  userData = await SessionCache.getCurrentUserInfo();  // ✅ Usa cache!
  // Dati già caricati al login, nessuna fetch qui
}
```

## 📁 File Modificati

### 1. `session-cache.js` ⭐ AGGIORNATO
**Cosa fa**: Aggiunge i campi nutrition al sistema di cache

**Cambiamenti**:
- ✅ Aggiunto `nutritionPdfUrl` all'oggetto userData
- ✅ Aggiunto `nutritionScadenza` all'oggetto userData
- ✅ Log migliorato che mostra se il nutrition plan è disponibile

```javascript
return {
  email: userEmail,
  fullName: userInfo.fullName || localStorage.getItem('userName') || 'User',
  scadenza: userInfo.scadenza,
  workouts: userInfo.workouts || [],
  allWorkoutsData: data.workouts || {},
  // ⭐ NUOVO: Nutrition data from Google Sheets
  nutritionPdfUrl: userInfo.nutritionPdfUrl || null,
  nutritionScadenza: userInfo.nutritionScadenza || null
};
```

### 2. `nutrition-app.js` ⭐ AGGIORNATO
**Cosa fa**: Usa SessionCache invece di fare fetch separate

**Cambiamenti**:
- ❌ Rimossa la variabile `GOOGLE_APPS_SCRIPT_URL` (non serve più)
- ❌ Rimossa la fetch in `loadNutritionData()` 
- ✅ Usa `SessionCache.getCurrentUserInfo()` per ottenere i dati
- ✅ Log migliorato: mostra che usa la cache

```javascript
// PRIMA:
const response = await fetch(GOOGLE_APPS_SCRIPT_URL);  // ❌
const data = await response.json();
userData = data.userWorkouts[userEmail];

// DOPO:
userData = await SessionCache.getCurrentUserInfo();  // ✅
```

## 🔄 Come Funziona il Flusso

```
1. 🔐 LOGIN
   └─> SessionCache.init()
       └─> Fetch UNICA al Google Apps Script
       └─> Salva tutto in sessionStorage:
           - Workouts
           - Nutrition data
           - User info
           - Expiration dates

2. 📱 Apri DASHBOARD
   └─> SessionCache.getCurrentUserInfo()
       └─> ✅ Legge da sessionStorage (NO fetch)

3. 🥗 Apri NUTRITION
   └─> SessionCache.getCurrentUserInfo()
       └─> ✅ Legge da sessionStorage (NO fetch)

4. 💪 Apri WORKOUT
   └─> SessionCache.getCurrentUserInfo()
       └─> ✅ Legge da sessionStorage (NO fetch)
```

## ⚡ Vantaggi

1. **Performance**: Una sola fetch al login invece di fetch multiple
2. **Velocità**: Nutrition si apre istantaneamente (dati già in memoria)
3. **Efficienza**: Meno chiamate al Google Apps Script = meno quota API utilizzata
4. **Consistenza**: Stessa logica per workout e nutrition
5. **Offline**: I dati rimangono disponibili per 5 minuti anche senza connessione

## 🔧 Struttura Dati nel Google Sheets

Assicurati che il tuo Google Sheets abbia queste colonne per gli utenti:

```
| Email | Full Name | Scadenza | Workouts | nutritionPdfUrl | nutritionScadenza |
|-------|-----------|----------|----------|-----------------|-------------------|
| user@ | John      | 2025-... | [...]    | https://...     | 2025-...          |
```

**Note**:
- `nutritionPdfUrl`: URL del piano nutrizionale (può essere null)
- `nutritionScadenza`: Data di scadenza del piano nutrition (può essere null)

## 📊 Cache Duration

La cache rimane valida per **5 minuti** come definito in `session-cache.js`:
```javascript
CACHE_DURATION: 5 * 60 * 1000, // 5 minutes
```

Dopo 5 minuti, viene automaticamente ricaricata al prossimo accesso.

## 🚀 Deploy

### Step 1: Sostituisci i file
```bash
# Copia i file aggiornati nella tua directory
cp session-cache.js /path/to/viltrum-fitness/
cp nutrition-app.js /path/to/viltrum-fitness/
```

### Step 2: Commit e push su GitHub
```bash
git add session-cache.js nutrition-app.js
git commit -m "V6.1: Optimize nutrition plan loading with SessionCache"
git push origin main
```

### Step 3: Verifica Cloudflare
Cloudflare Pages farà il deploy automaticamente in ~1-2 minuti.

## ✅ Testing

Dopo il deploy, testa così:

1. **Logout completo** (per pulire la cache)
2. **Login**
   - Apri DevTools Console (F12)
   - Dovresti vedere: `🚀 Initializing session cache...`
   - Dovresti vedere: `✅ Session initialized for user@email.com`
   - Se hai nutrition: `🥗 Nutrition plan available`
3. **Apri Nutrition**
   - Console dovrebbe mostrare: `📊 Loading nutrition data from session cache...`
   - Console dovrebbe mostrare: `✅ Using session cache (age: Xs)`
   - **NON** dovrebbe esserci una nuova fetch al Google Apps Script
4. **Chiudi e riapri Nutrition**
   - Dovrebbe usare ancora la cache (verifica in Network tab - nessuna chiamata al Google Apps Script)

## 🐛 Troubleshooting

### Problema: Nutrition non si carica
**Soluzione**: 
1. Verifica che il Google Sheets abbia le colonne `nutritionPdfUrl` e `nutritionScadenza`
2. Controlla la Console per errori
3. Fai logout/login per ricaricare la cache

### Problema: Dati non aggiornati
**Soluzione**:
1. La cache dura 5 minuti
2. Fai logout/login per forzare il refresh
3. Oppure attendi 5 minuti e ricarica la pagina

## 📝 Note Tecniche

- I dati nutrition sono opzionali: se `nutritionPdfUrl` è null o vuoto, l'app mostra "Nessun Piano Disponibile"
- La scadenza nutrition (`nutritionScadenza`) è indipendente dalla scadenza workout (`scadenza`)
- Il piano nutrizionale stesso (JSON con i pasti) è ancora salvato in `localStorage` per personalizzazione utente
- Solo i metadati (URL e scadenza) vengono caricati dal Google Sheets

## 🎉 Risultato

Ora il piano nutrizionale si carica **istantaneamente** perché i dati sono già in memoria dal login!

---

**Versione**: V6.1  
**Data**: Novembre 2025  
**Autore**: Claude + Kaveno
