# JPG to WEBP Converter

Un'applicazione web elegante per convertire immagini da Google Drive dal formato JPG/PNG al formato WEBP con ridimensionamento automatico.

## 🚀 Deploy Veloce

### Opzione 1: Vercel (Consigliato)
1. Fai fork di questo repository
2. Vai su [vercel.com](https://vercel.com)
3. Clicca "New Project" e collega il tuo repository
4. Deploy automatico! ✨

### Opzione 2: Railway
1. Vai su [railway.app](https://railway.app)
2. Clicca "Deploy from GitHub repo"
3. Seleziona questo repository
4. Railway rileverà automaticamente Node.js

### Opzione 3: Render
1. Vai su [render.com](https://render.com)
2. Clicca "New Web Service"
3. Connetti il repository GitHub
4. Imposta:
   - Build Command: `cd backend && npm install`
   - Start Command: `cd backend && node server.js`

## 🛠 Sviluppo Locale

```bash
# Avvia backend
cd backend
npm install
node server.js

# Avvia frontend (in un'altra finestra del terminale)
cd frontend
python3 -m http.server 8080
```

## ✨ Funzionalità

- 🔍 Scansione ricorsiva di cartelle Google Drive
- 🖼️ Conversione JPG/PNG → WEBP
- 📏 Ridimensionamento automatico con preservazione proporzioni
- 📁 Mantenimento struttura cartelle
- 🎨 Interfaccia elegante e minimal
- 📱 Design responsive

## 👨‍💻 Autore

Realizzato da [Fabio Scalia](https://guacamole.team) 