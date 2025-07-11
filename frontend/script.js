class JPGtoWEBPConverter {
    constructor() {
        console.log('🚀 Inizializzazione JPGtoWEBPConverter...');
        this.baseUrl = window.location.hostname === 'localhost' 
            ? 'http://localhost:5001' 
            : '/api';
        console.log('🌐 Base URL:', this.baseUrl);
        this.currentStep = 1;
        this.scanData = null;
        this.init();
    }

    init() {
        console.log('🔧 Inizializzazione componenti...');
        this.setupEventListeners();
        this.updateStepVisibility();
        console.log('✅ Inizializzazione completata');
    }

    setupEventListeners() {
        console.log('👂 Configurazione event listeners...');
        
        // Enter key nel campo URL
        document.getElementById('driveUrl').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                console.log('⌨️ Pressione Enter nel campo URL');
                this.scanFolder();
            }
        });

        // Aggiornamento qualità in tempo reale
        document.getElementById('quality').addEventListener('change', (e) => {
            console.log('🎚️ Cambio qualità:', e.target.value);
            this.updateQualityPreview();
        });

        // Aggiornamento dimensioni in tempo reale
        document.getElementById('maxSide').addEventListener('input', (e) => {
            console.log('📏 Cambio dimensioni:', e.target.value);
            this.updateSizePreview();
        });
        
        console.log('✅ Event listeners configurati');
    }

    updateStepVisibility() {
        console.log('👁️ Aggiornamento visibilità step:', this.currentStep);
        
        // Nascondi tutti i contenuti
        document.querySelectorAll('.step-content').forEach(content => {
            content.classList.remove('active');
        });

        // Mostra contenuto corrente
        document.getElementById(`step${this.currentStep}`).classList.add('active');

        // Aggiorna indicatori step
        document.querySelectorAll('.step').forEach((step, index) => {
            step.classList.remove('active', 'completed');
        
            if (index + 1 === this.currentStep) {
                step.classList.add('active');
            } else if (index + 1 < this.currentStep) {
                step.classList.add('completed');
        }
        });
    }

    goToStep(step) {
        console.log('🚶 Passaggio al step:', step);
        this.currentStep = step;
        this.updateStepVisibility();
    }

    showAlert(message, type = 'info') {
        console.log(`🚨 Alert [${type}]:`, message);
        const alerts = document.querySelectorAll('.alert');
        alerts.forEach(alert => {
            alert.textContent = message;
            alert.className = `alert alert-${type}`;
        });
    }

    updateProgress(percentage, text) {
        console.log(`📊 Progresso: ${percentage}% - ${text}`);
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        
        progressFill.style.width = `${percentage}%`;
        progressText.textContent = text;
    }

    async scanFolder() {
        console.log('🔍 Inizio scansione cartella...');
        const url = document.getElementById('driveUrl').value.trim();
        console.log('📎 URL inserito:', url);
        
        if (!url) {
            console.warn('❌ URL vuoto');
            this.showAlert('Inserisci un URL valido della cartella Google Drive', 'error');
            return;
        }

        if (!this.isValidGoogleDriveUrl(url)) {
            console.warn('❌ URL non valido:', url);
            this.showAlert('URL non valido. Deve essere un link di Google Drive.', 'error');
            return;
        }

        const scanBtn = document.getElementById('scanBtnText');
        const originalText = scanBtn.textContent;
        
        try {
            console.log('🔄 Avvio richiesta al backend...');
            // Disabilita il pulsante e mostra loading
            scanBtn.textContent = '🔍 Scansione...';

            console.log('📡 Invio richiesta POST a:', `${this.baseUrl}/scan-folder`);
            const response = await fetch(`${this.baseUrl}/scan-folder`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url })
            });

            console.log('📥 Risposta ricevuta:', response.status, response.statusText);
            const data = await response.json();
            console.log('📋 Dati ricevuti:', data);

            if (!response.ok) {
                throw new Error(data.error || `HTTP ${response.status}: ${data.message || 'Errore sconosciuto'}`);
            }
            
            if (data.success) {
                console.log('✅ Scansione completata con successo');
                this.scanData = data;
                this.displayScanResults(data);
                this.goToStep(2);
            } else {
                throw new Error(data.error || 'Errore durante la scansione');
            }

        } catch (error) {
            console.error('💥 Errore durante la scansione:', error);
            console.error('Stack trace:', error.stack);
            this.showAlert(this.getErrorMessage(error), 'error');
        } finally {
            console.log('🔄 Reset pulsante scansione');
            scanBtn.textContent = originalText;
        }
    }

    isValidGoogleDriveUrl(url) {
        const patterns = [
            /https:\/\/drive\.google\.com\/drive\/folders\/[a-zA-Z0-9-_]+/,
            /https:\/\/drive\.google\.com\/drive\/u\/\d+\/folders\/[a-zA-Z0-9-_]+/,
            /https:\/\/drive\.google\.com\/folderview\?id=[a-zA-Z0-9-_]+/
        ];
        
        return patterns.some(pattern => pattern.test(url));
    }

    getErrorMessage(error) {
        if (error.message.includes('404')) {
            return 'Cartella non trovata. Verifica che il link sia corretto e che la cartella sia pubblica.';
        }
        if (error.message.includes('403')) {
            return 'Accesso negato. Assicurati che la cartella sia condivisa pubblicamente.';
        }
        if (error.message.includes('NetworkError') || error.message.includes('fetch')) {
            return 'Errore di connessione. Verifica la tua connessione internet.';
        }
        return error.message || 'Errore sconosciuto durante la scansione.';
    }

    displayScanResults(data) {
        const totalImages = data.totalImages || 0;
        const structure = data.structure || { images: [], folders: {} };
        
        // Aggiorna statistiche
        document.getElementById('totalImagesCount').textContent = totalImages;
        document.getElementById('totalFoldersCount').textContent = this.countFolders(structure);
        document.getElementById('totalSizeCount').textContent = this.estimateSize(totalImages);

        // Genera albero delle cartelle
        this.generateFolderTree(structure);
    }

    countFolders(structure) {
        let count = Object.keys(structure.folders || {}).length;
        
        Object.values(structure.folders || {}).forEach(folder => {
            count += this.countFolders(folder);
        });
        
        return count;
    }

    estimateSize(imageCount) {
        const avgSizeMB = 2.5; // Stima media per immagine
        const totalMB = imageCount * avgSizeMB;
        
        if (totalMB < 1) return '< 1MB';
        if (totalMB < 1024) return `${Math.round(totalMB)}MB`;
        return `${(totalMB / 1024).toFixed(1)}GB`;
    }

    generateFolderTree(structure, container = null, level = 0) {
        if (!container) {
            container = document.getElementById('folderTree');
            container.innerHTML = '';
        }

        // Aggiungi immagini nella cartella corrente
        if (structure.images && structure.images.length > 0) {
            structure.images.forEach(image => {
                const imageElement = document.createElement('div');
                imageElement.className = 'folder-item image';
                imageElement.textContent = image.name;
                imageElement.style.marginLeft = `${level * 20}px`;
                container.appendChild(imageElement);
            });
        }

        // Aggiungi sottocartelle
        if (structure.folders) {
            Object.entries(structure.folders).forEach(([folderName, folderData]) => {
                const folderElement = document.createElement('div');
                folderElement.className = 'folder-item folder';
                folderElement.textContent = folderName;
                folderElement.style.marginLeft = `${level * 20}px`;
                container.appendChild(folderElement);

                // Ricorsione per sottocartelle
                this.generateFolderTree(folderData, container, level + 1);
            });
        }
    }

    async startConversion() {
        if (!this.scanData) {
            this.showAlert('Devi prima scansionare una cartella', 'error');
            return;
        }

        this.goToStep(3);
        this.updateProgress(0, 'Inizializzazione conversione multipla...');

        const quality = parseInt(document.getElementById('quality').value);
        const maxSide = parseInt(document.getElementById('maxSide').value);

        try {
            console.log('🚀 Avvio conversione multipla...');
            
            // Avvia la conversione multipla
            const conversionPromise = fetch(`${this.baseUrl}/convert-multiple-zip`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    folderId: this.scanData.folderId,
                    quality: quality,
                    maxSide: maxSide
                })
            });

            // Monitora il progresso in tempo reale
            const progressInterval = setInterval(async () => {
                try {
                    const progressResponse = await fetch(`${this.baseUrl}/convert-progress`);
                    const progressData = await progressResponse.json();
                    
                    console.log('📊 Progresso ricevuto:', progressData);
                    
                    if (progressData.isConverting) {
                        // Aggiorna UI con dati dettagliati per conversione multipla
                        let detailText = progressData.currentAction;
                        
                        if (progressData.totalZips > 0) {
                            detailText += ` (ZIP ${progressData.processedZips + 1}/${progressData.totalZips})`;
                        }
                        
                        if (progressData.currentFile) {
                            detailText += ` - ${progressData.currentFile}`;
                        }
                        
                        if (progressData.currentFolder) {
                            detailText += ` in ${progressData.currentFolder}`;
                        }
                        
                        if (progressData.processedFiles > 0) {
                            detailText += ` (${progressData.processedFiles}/${progressData.totalFiles} immagini)`;
                        }
                        
                        this.updateProgress(progressData.progress, detailText);
                    } else if (progressData.progress === 100) {
                        // Conversione completata
                        clearInterval(progressInterval);
                        this.updateProgress(100, 'Conversione completata! Preparazione download...');
                    }
                } catch (err) {
                    console.log('❌ Errore nel monitoraggio progresso:', err);
                }
            }, 1000);

            // Aspetta il completamento della conversione
            const response = await conversionPromise;
            clearInterval(progressInterval);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('💥 Errore risposta server:', errorText);
                throw new Error('Errore durante la conversione multipla');
            }

            const result = await response.json();
            console.log('✅ Conversione multipla completata:', result);

            this.updateProgress(100, 'Conversione completata!');
            this.showMultipleDownloads(result.zipFiles);

        } catch (error) {
            console.error('💥 Errore conversione:', error);
            this.showAlert(this.getErrorMessage(error), 'error');
        }
    }

    showMultipleDownloads(zipFiles) {
        const downloadSection = document.getElementById('downloadSection');
        
        // Crea la lista di download
        downloadSection.innerHTML = `
            <h3>📦 File ZIP Disponibili per il Download</h3>
            <p>La conversione è stata completata con successo! Sono stati creati <strong>${zipFiles.length} file ZIP</strong> separati:</p>
            <div class="download-list" id="downloadList"></div>
        `;
        
        const downloadList = document.getElementById('downloadList');
        
        zipFiles.forEach((zipFile, index) => {
            const downloadItem = document.createElement('div');
            downloadItem.className = 'download-item';
            downloadItem.innerHTML = `
                <div class="zip-info">
                    <h4>📁 ${zipFile.name}</h4>
                    <p>📊 ${zipFile.imageCount} immagini • ${zipFile.sizeFormatted}</p>
                </div>
                <button class="btn-primary download-btn" onclick="app.downloadZip('${zipFile.name}')">
                    📥 Scarica
                </button>
            `;
            downloadList.appendChild(downloadItem);
        });
        
        // Aggiungi bottone per scaricare tutto
        const downloadAllBtn = document.createElement('button');
        downloadAllBtn.className = 'btn-secondary download-all-btn';
        downloadAllBtn.innerHTML = '📦 Scarica Tutti i ZIP';
        downloadAllBtn.style.marginTop = '20px';
        downloadAllBtn.onclick = () => this.downloadAllZips(zipFiles);
        downloadList.appendChild(downloadAllBtn);
        
        downloadSection.style.display = 'block';
        this.showAlert(`Conversione completata! ${zipFiles.length} ZIP creati con successo.`, 'success');
    }

    async downloadZip(zipName) {
        try {
            console.log(`📥 Scaricamento ZIP: ${zipName}`);
            
            const response = await fetch(`${this.baseUrl}/download-zip/${encodeURIComponent(zipName)}`);
            
            if (!response.ok) {
                throw new Error('Errore nel download del file');
            }
            
            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = zipName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(downloadUrl);
            
            this.showAlert(`File ${zipName} scaricato con successo!`, 'success');
            
        } catch (error) {
            console.error('💥 Errore nel download:', error);
            this.showAlert(`Errore nel download di ${zipName}: ${error.message}`, 'error');
        }
    }

    async downloadAllZips(zipFiles) {
        this.showAlert('Avvio download di tutti i ZIP...', 'info');
        
        for (let i = 0; i < zipFiles.length; i++) {
            await new Promise(resolve => setTimeout(resolve, 500)); // Pausa tra download
            await this.downloadZip(zipFiles[i].name);
        }
        
        this.showAlert('Tutti i ZIP sono stati scaricati!', 'success');
    }



    updateQualityPreview() {
        const quality = document.getElementById('quality').value;
        const qualityText = document.querySelector('#quality option:checked').text;
        
        // Aggiorna anteprima se necessario
        console.log(`Qualità selezionata: ${quality}% (${qualityText})`);
    }

    updateSizePreview() {
        const maxSide = document.getElementById('maxSide').value;
        console.log(`Dimensione massima: ${maxSide}px`);
    }

    restart() {
        this.currentStep = 1;
        this.scanData = null;
        
        // Reset form
        document.getElementById('driveUrl').value = '';
        document.getElementById('quality').value = '80';
        document.getElementById('maxSide').value = '1920';
        
        // Reset UI
        document.getElementById('downloadSection').style.display = 'none';
        document.getElementById('totalImagesCount').textContent = '0';
        document.getElementById('totalFoldersCount').textContent = '0';
        document.getElementById('totalSizeCount').textContent = '~';
        document.getElementById('folderTree').innerHTML = '';
        
        this.updateProgress(0, 'Preparazione...');
        this.updateStepVisibility();
    }

    showFileList() {
        document.getElementById('fileListModal').style.display = 'flex';
        console.log('📁 Modale file list aperta');
    }

    hideFileList() {
        document.getElementById('fileListModal').style.display = 'none';
        console.log('📁 Modale file list chiusa');
    }
}

// Inizializza l'app quando il DOM è caricato
document.addEventListener('DOMContentLoaded', () => {
    window.app = new JPGtoWEBPConverter();
});
