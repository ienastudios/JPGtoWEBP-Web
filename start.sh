#!/bin/bash

echo "�� Avvio JPG to WEBP Converter - Web Version"
echo "=============================================="

# Controlla se Python è installato
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 non trovato. Installalo prima di continuare."
    exit 1
fi

# Installa le dipendenze se necessario
echo "📦 Installazione dipendenze..."
cd backend
pip3 install -r requirements.txt
cd ..

# Avvia il backend in background
echo "🔧 Avvio backend Flask..."
cd backend
python3 app.py &
BACKEND_PID=$!
cd ..

# Aspetta che il backend sia pronto
echo "⏳ Attendo che il backend sia pronto..."
sleep 5

# Controlla se il backend è attivo
if curl -s http://localhost:5000/health > /dev/null; then
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
echo "🔧 Backend:  http://localhost:5000"
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
