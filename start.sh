#!/bin/bash

echo "🚀 Avvio JPG to WEBP Converter - Web Version"
echo "=============================================="

# Controlla se Node.js è installato
if ! command -v node &> /dev/null; then
    echo "❌ Node.js non trovato. Installalo prima di continuare."
    exit 1
fi

# Controlla se Python è installato per il frontend
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 non trovato. Installalo prima di continuare."
    exit 1
fi

# Installa le dipendenze Node.js se necessario
echo "📦 Installazione dipendenze Node.js..."
cd backend
if [ ! -d "node_modules" ]; then
    npm install
fi
cd ..

# Avvia il backend Node.js in background
echo "🔧 Avvio backend Node.js..."
cd backend
node server.js &
BACKEND_PID=$!
cd ..

# Aspetta che il backend sia pronto
echo "⏳ Attendo che il backend sia pronto..."
sleep 5

# Controlla se il backend è attivo
if curl -s http://localhost:5001/health > /dev/null; then
    echo "✅ Backend pronto!"
else
    echo "❌ Errore nell'avvio del backend"
    kill $BACKEND_PID 2>/dev/null
    exit 1
fi

# Avvia il frontend
echo "🌐 Avvio frontend..."
cd frontend
python3 -m http.server 8080 &
FRONTEND_PID=$!
cd ..

# Aspetta che il frontend sia pronto
echo "⏳ Attendo che il frontend sia pronto..."
sleep 3

echo ""
echo "🎉 Applicazione avviata con successo!"
echo "📱 Frontend: http://localhost:8080"
echo "🔧 Backend:  http://localhost:5001"
echo ""
echo "🌐 Apri il browser su http://localhost:8080 per iniziare"
echo ""
echo "⚠️  Premi Ctrl+C per fermare l'applicazione"

# Funzione per terminare i processi
cleanup() {
    echo ""
    echo "🛑 Terminazione applicazione..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    echo "✅ Applicazione terminata"
    exit 0
}

# Gestione segnali di terminazione
trap cleanup SIGINT SIGTERM

# Apri il browser automaticamente (solo su macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
    sleep 2
    open http://localhost:8080
fi

# Mantieni lo script in esecuzione
wait
