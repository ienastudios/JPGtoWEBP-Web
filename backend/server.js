const express = require('express');
const cors = require('cors');
const axios = require('axios');
const sharp = require('sharp');
const JSZip = require('jszip');
const path = require('path');

const app = express();
const PORT = 5001;

// Variabili globali per il progresso della conversione
let         conversionProgress = {
            isConverting: false,
            progress: 0,
            currentFile: '',
            currentAction: '',
            totalFiles: 0,
            processedFiles: 0,
            currentFolder: '',
            totalZips: 0,
            processedZips: 0,
            zipList: []
        };

app.use(cors());
app.use(express.json());

// Middleware per gestire i path /api/* in produzione
app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
        req.url = req.url.replace('/api', '');
    }
    next();
});

// Endpoint per ottenere il progresso della conversione
app.get('/convert-progress', (req, res) => {
    res.json(conversionProgress);
});

class DriveImageProcessor {
    constructor() {
        this.session = axios.create({
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            }
        });
    }

    extractFolderId(url) {
        const patterns = [
            /folders\/([a-zA-Z0-9-_]+)/,
            /id=([a-zA-Z0-9-_]+)/,
            /folderview\?id=([a-zA-Z0-9-_]+)/
        ];
        
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) {
                return match[1];
            }
        }
        return null;
    }

    async getFolderContents(folderId) {
        try {
            // Usa l'API pubblica di Google Drive
            const apiUrl = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&key=YOUR_API_KEY`;
            
            // Alternativa: prova a scaricare direttamente le immagini usando l'approccio pubblico
            const publicUrl = `https://drive.google.com/uc?id=${folderId}&export=download`;
            
            // Per ora, simula la scansione con un approccio diverso
            const items = await this.scanFolderAlternative(folderId);
            return items;
            
        } catch (error) {
            console.error('Errore nel recupero contenuti:', error.message);
            return [];
        }
    }

    async scanFolderAlternative(folderId) {
        try {
            // Prova a accedere alla pagina della cartella e cercare link diretti
            const folderUrl = `https://drive.google.com/drive/folders/${folderId}`;
            console.log(`🌐 Accesso alla pagina: ${folderUrl}`);
            
            const response = await this.session.get(folderUrl);
            const html = response.data;
            
            console.log(`📄 Pagina scaricata: ${html.length} caratteri`);
            console.log(`🔍 Scansionando cartella: ${folderId}`);
            
            // Estrai il titolo della cartella
            const titleMatch = html.match(/<title>(.*?) - Google Drive<\/title>/);
            if (titleMatch) {
                console.log(`📁 Cartella trovata: ${titleMatch[1].replace(/&#39;/g, "'")}`);
            } else {
                console.log(`❌ Titolo cartella non trovato`);
            }
            
            const items = [];
            
            // Cerca pattern per file e cartelle nell'HTML
            // Google Drive usa diversi pattern per i file
            const patterns = [
                // Pattern per file con data-id
                /data-id="([^"]+)"[^>]*>[^<]*<[^>]*>([^<]+\.(?:jpg|jpeg|png|gif|bmp|webp))/gi,
                // Pattern per link diretti ai file
                /\/file\/d\/([a-zA-Z0-9-_]+)\/[^"]*"[^>]*>([^<]+\.(?:jpg|jpeg|png|gif|bmp|webp))/gi,
                // Pattern alternativo con aria-label
                /aria-label="([^"]+\.(?:jpg|jpeg|png|gif|bmp|webp))"[^>]*data-id="([^"]+)"/gi
            ];
            
            // Cerca anche cartelle - pattern aggiornati per Google Drive moderno
            const folderPatterns = [
                // Pattern per cartelle con data-id e icona folder
                /data-id="([^"]+)"[^>]*>[^<]*<[^>]*class="[^"]*folder[^"]*"[^>]*>([^<]+)/gi,
                /aria-label="([^"]+)"[^>]*data-id="([^"]+)"[^>]*>[^<]*folder/gi,
                // Pattern per cartelle con nome e data-id
                /"([^"]+)","([^"]+)","[^"]*","[^"]*","folder"/g,
                // Pattern per cartelle nel JSON embeddato
                /\["([^"]+)","([a-zA-Z0-9-_]+)","[^"]*","[^"]*","application\/vnd\.google-apps\.folder"/g,
                // Pattern per cartelle con tipo folder
                /data-id="([a-zA-Z0-9-_]+)"[^>]*data-type="folder"[^>]*>([^<]+)/gi,
                // Pattern alternativo per cartelle
                /\["([^"]+)","folder","([a-zA-Z0-9-_]+)"/g
            ];
            
            // Estrai immagini
            console.log(`🔍 Inizio ricerca immagini con ${patterns.length} pattern...`);
            for (let i = 0; i < patterns.length; i++) {
                const pattern = patterns[i];
                console.log(`🔍 Test pattern ${i + 1}/${patterns.length}: ${pattern}`);
                
                let match;
                let matchCount = 0;
                while ((match = pattern.exec(html)) !== null) {
                    matchCount++;
                    const [, id, name] = match;
                    if (id && name && !items.find(item => item.id === id)) {
                        const ext = name.toLowerCase().split('.').pop();
                        const mimeType = this.getMimeType(ext);
                        
                                        items.push({
                            id: id,
                            name: name.trim(),
                                            type: 'image',
                            mimeType: mimeType
                                        });
                        
                        console.log(`✅ Trovata immagine: ${name} (ID: ${id})`);
                    }
                }
                console.log(`📊 Pattern ${i + 1} ha trovato ${matchCount} match`);
            }
            
            // Estrai cartelle
            console.log(`🔍 Inizio ricerca cartelle con ${folderPatterns.length} pattern...`);
            for (let i = 0; i < folderPatterns.length; i++) {
                const pattern = folderPatterns[i];
                console.log(`🔍 Test pattern cartelle ${i + 1}/${folderPatterns.length}: ${pattern}`);
                
                let match;
                let matchCount = 0;
                while ((match = pattern.exec(html)) !== null) {
                    matchCount++;
                    const [, first, second] = match;
                    
                    // Determina quale è l'ID e quale è il nome basandosi sul pattern
                    let id, name;
                    if (i === 2 || i === 3) {
                        // Pattern 3 and 4: nome viene prima dell'ID
                        name = first;
                        id = second;
                    } else {
                        // Pattern 1, 2, 5, 6: ID viene prima del nome
                        id = first;
                        name = second;
                    }
                    
                    if (id && name && !items.find(item => item.id === id)) {
                        items.push({
                            id: id,
                            name: name.trim(),
                            type: 'folder',
                            mimeType: 'application/vnd.google-apps.folder'
                        });
                        
                        console.log(`✅ Trovata cartella: ${name} (ID: ${id})`);
                    }
                }
                console.log(`📊 Pattern cartelle ${i + 1} ha trovato ${matchCount} match`);
            }
                
            // Se non troviamo nulla con i pattern, proviamo un approccio più aggressivo
            if (items.length === 0) {
                console.log('🔍 Nessun pattern trovato, provo approccio alternativo...');
                
                // Cerca nel JSON embeddato con pattern specifici per Google Drive
                console.log(`🔍 Cerca pattern Google Drive nel JSON embeddato...`);
                
                // Pattern per cartelle nel formato Google Drive
                const folderPatterns = [
                    // Pattern per array JSON con ID, parent, nome, tipo folder
                    /\["([a-zA-Z0-9-_]+)",\["[^"]*"\],"([^"]+)","application\/vnd\.google-apps\.folder"/g,
                    // Pattern alternativo per cartelle
                    /\["([^"]+)","([a-zA-Z0-9-_]+)","[^"]*","[^"]*","application\/vnd\.google-apps\.folder"/g,
                    // Pattern per struttura window['_DRIVE_ivd']
                    /\["([a-zA-Z0-9-_]+)","[^"]*","([^"]+)","application\/vnd\.google-apps\.folder"/g
                ];
                
                for (let i = 0; i < folderPatterns.length; i++) {
                    const pattern = folderPatterns[i];
                    console.log(`🔍 Pattern cartelle JSON ${i + 1}: ${pattern}`);
                    
                    let folderMatches = [...html.matchAll(pattern)];
                    console.log(`📊 Pattern ${i + 1} ha trovato ${folderMatches.length} cartelle`);
                    
                    for (const folderMatch of folderMatches) {
                        let id, name;
                        
                        // Primo pattern: ID prima del nome
                        if (i === 0 || i === 2) {
                            [, id, name] = folderMatch;
                        } else {
                            // Secondo pattern: nome prima dell'ID
                            [, name, id] = folderMatch;
                        }
                        
                        if (id && name && !items.find(item => item.id === id)) {
                            items.push({
                                id: id,
                                name: name.trim(),
                                type: 'folder',
                                mimeType: 'application/vnd.google-apps.folder'
                            });
                            console.log(`✅ Trovata cartella nel JSON: ${name} (ID: ${id})`);
                        }
                    }
                }
                
                // Cerca anche immagini nel JSON
                console.log(`🔍 Cerca immagini nel JSON embeddato...`);
                const imagePatterns = [
                    /\["([a-zA-Z0-9-_]+)",\["[^"]*"\],"([^"]+\.(?:jpg|jpeg|png|gif|bmp|webp))","image\/[^"]*"/gi,
                    /\["([^"]+\.(?:jpg|jpeg|png|gif|bmp|webp))","([a-zA-Z0-9-_]+)","[^"]*","[^"]*","image\/[^"]*"/gi
                ];
                
                for (let i = 0; i < imagePatterns.length; i++) {
                    const pattern = imagePatterns[i];
                    console.log(`🔍 Pattern immagini JSON ${i + 1}: ${pattern}`);
                    
                    let imageMatches = [...html.matchAll(pattern)];
                    console.log(`📊 Pattern ${i + 1} ha trovato ${imageMatches.length} immagini`);
                    
                    for (const imageMatch of imageMatches) {
                        let id, name;
                        
                        // Primo pattern: ID prima del nome
                        if (i === 0) {
                            [, id, name] = imageMatch;
                        } else {
                            // Secondo pattern: nome prima dell'ID
                            [, name, id] = imageMatch;
                        }
                        
                        if (id && name && !items.find(item => item.id === id)) {
                            const ext = name.toLowerCase().split('.').pop();
                            const mimeType = this.getMimeType(ext);
                            
                            items.push({
                                id: id,
                                name: name.trim(),
                                type: 'image',
                                mimeType: mimeType
                            });
                            console.log(`✅ Trovata immagine nel JSON: ${name} (ID: ${id})`);
                        }
                    }
                }
                
                // Se ancora non troviamo nulla, prova approccio ID
                if (items.length === 0) {
                    console.log('🔍 Provo approccio ID...');
                    
                    // Cerca tutti i possibili ID di file/cartelle
                    const allIds = [...html.matchAll(/data-id="([a-zA-Z0-9-_]{20,})"/g)]
                        .map(match => match[1])
                        .filter((id, index, self) => self.indexOf(id) === index);
                    
                    console.log(`Trovati ${allIds.length} ID potenziali`);
                    
                    // Per ogni ID, prova a determinare se è un file o una cartella
                    for (const id of allIds.slice(0, 10)) { // Limita a 10 per evitare sovraccarico
                        try {
                            const itemInfo = await this.getFileInfo(id);
                            if (itemInfo) {
                                items.push(itemInfo);
                            }
                        } catch (error) {
                            console.log(`Errore nel recupero info per ${id}: ${error.message}`);
                        }
                    }
                }
            }
            
            console.log(`📊 Totale elementi trovati: ${items.length}`);
            console.log(`   - Immagini: ${items.filter(item => item.type === 'image').length}`);
            console.log(`   - Cartelle: ${items.filter(item => item.type === 'folder').length}`);
            
            if (items.length === 0) {
                console.log(`❌ Nessun elemento trovato. Possibili cause:`);
                console.log(`   - La cartella è vuota`);
                console.log(`   - La cartella non è pubblica`);
                console.log(`   - I pattern HTML sono cambiati`);
                console.log(`   - Problema di accesso alla cartella`);
            }
            
            return items;
            
        } catch (error) {
            console.error('💥 Errore nella scansione alternativa:', error.message);
            console.error('Stack trace:', error.stack);
            return [];
        }
    }
    
    getMimeType(extension) {
        const mimeTypes = {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'bmp': 'image/bmp',
            'webp': 'image/webp'
        };
        return mimeTypes[extension] || 'application/octet-stream';
    }
    
    async getFileInfo(fileId) {
        try {
            // Prima prova come file
            let infoUrl = `https://drive.google.com/file/d/${fileId}/view`;
            let response = await this.session.get(infoUrl, { timeout: 5000 });
            let html = response.data;
            
            // Estrai il nome dal titolo
            let titleMatch = html.match(/<title>(.*?) - Google Drive<\/title>/);
            if (titleMatch) {
                const fileName = titleMatch[1].replace(/&#39;/g, "'").trim();
                
                // Determina se è un'immagine
                const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];
                const ext = fileName.toLowerCase().split('.').pop();
                
                if (imageExtensions.includes(ext)) {
                    return {
                        id: fileId,
                        name: fileName,
                        type: 'image',
                        mimeType: this.getMimeType(ext)
                    };
                }
            }
            
            // Se non è un'immagine, prova come cartella
            try {
                infoUrl = `https://drive.google.com/drive/folders/${fileId}`;
                response = await this.session.get(infoUrl, { timeout: 5000 });
                html = response.data;
                
                titleMatch = html.match(/<title>(.*?) - Google Drive<\/title>/);
                if (titleMatch) {
                    const folderName = titleMatch[1].replace(/&#39;/g, "'").trim();
                    
                    // Se il titolo non contiene estensioni di file, probabilmente è una cartella
                    if (!folderName.match(/\.(jpg|jpeg|png|gif|bmp|webp|pdf|doc|docx|txt)$/i)) {
                        console.log(`Identificata cartella: ${folderName} (ID: ${fileId})`);
                        return {
                            id: fileId,
                            name: folderName,
                            type: 'folder',
                            mimeType: 'application/vnd.google-apps.folder'
                        };
                    }
                }
            } catch (folderError) {
                // Se fallisce come cartella, non è né file né cartella accessibile
                console.log(`ID ${fileId} non accessibile come cartella`);
            }
            
            return null;
            
        } catch (error) {
            return null;
        }
    }

    async scanFolderRecursive(folderId, currentPath = '') {
        const items = await this.getFolderContents(folderId);
        const result = {
            images: [],
            folders: {}
        };
        
        for (const item of items) {
            if (item.type === 'image') {
                result.images.push({
                    id: item.id,
                    name: item.name,
                    path: currentPath,
                    mimeType: item.mimeType
                });
            } else if (item.type === 'folder') {
                const folderPath = currentPath ? `${currentPath}/${item.name}` : item.name;
                result.folders[item.name] = await this.scanFolderRecursive(item.id, folderPath);
            }
        }
        
        return result;
    }

    async downloadImage(fileId) {
        // Prova diversi URL di download
        const urls = [
            `https://drive.google.com/uc?id=${fileId}&export=download`,
            `https://drive.google.com/file/d/${fileId}/view?usp=sharing`,
            `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000-h1000`
        ];
        
        for (const url of urls) {
        try {
            const response = await this.session.get(url, {
                    responseType: 'arraybuffer',
                    maxRedirects: 5
            });
            
                if (response.data && response.data.byteLength > 0) {
            return Buffer.from(response.data);
                }
        } catch (error) {
                console.log(`Tentativo fallito per ${url}: ${error.message}`);
            }
        }
        
        console.error(`Impossibile scaricare l'immagine ${fileId}`);
            return null;
    }

    async convertToWebP(imageBuffer, quality = 80, maxSide = null) {
        try {
            let sharpInstance = sharp(imageBuffer);
            
            // Ridimensiona se specificato
            if (maxSide && maxSide > 0) {
                const metadata = await sharpInstance.metadata();
                const currentWidth = metadata.width;
                const currentHeight = metadata.height;
                
                // Calcola le nuove dimensioni mantenendo le proporzioni
                if (currentWidth > maxSide || currentHeight > maxSide) {
                    if (currentWidth > currentHeight) {
                        // Landscape: ridimensiona basandosi sulla larghezza
                        sharpInstance = sharpInstance.resize(maxSide, null, {
                            withoutEnlargement: true
                        });
                    } else {
                        // Portrait: ridimensiona basandosi sull'altezza
                        sharpInstance = sharpInstance.resize(null, maxSide, {
                            withoutEnlargement: true
                        });
                    }
                }
            }
            
            const webpBuffer = await sharpInstance
                .webp({ quality: quality })
                .toBuffer();
            
            return webpBuffer;
            
        } catch (error) {
            console.error('Errore nella conversione:', error.message);
            return null;
        }
    }

    async createZipWithConvertedImages(folderStructure, quality = 80, maxSide = null) {
        const zip = new JSZip();
        
        await this.addFolderToZip(zip, folderStructure, '', quality, maxSide);
        
        try {
            const zipBuffer = await zip.generateAsync({
                type: 'nodebuffer',
                compression: 'DEFLATE',
                compressionOptions: {
                    level: 6
                }
            });
            
            return zipBuffer;
            
        } catch (error) {
            console.error('Errore nella creazione ZIP:', error.message);
            return null;
        }
    }

    async createMultipleZips(folderStructure, quality = 80, maxSide = null) {
        const zipList = [];
        
        try {
            console.log(`🔄 Inizio creazione ZIP multipli. Struttura:`, Object.keys(folderStructure.folders));
            
            // Se ci sono immagini nella root, crea un ZIP separato
            if (folderStructure.images && folderStructure.images.length > 0) {
                console.log(`🗂️ Creando ZIP per immagini root (${folderStructure.images.length} immagini)`);
                
                try {
                    const rootZip = new JSZip();
                    const rootFolder = { images: folderStructure.images, folders: {} };
                    await this.addFolderToZip(rootZip, rootFolder, '', quality, maxSide);
                    
                    const zipBuffer = await rootZip.generateAsync({
                        type: 'nodebuffer',
                        compression: 'DEFLATE',
                        compressionOptions: { level: 6 }
                    });
                    
                    zipList.push({
                        name: 'Root_Images.zip',
                        buffer: zipBuffer,
                        size: zipBuffer.length,
                        imageCount: folderStructure.images.length
                    });
                    
                    console.log(`✅ ZIP root creato con successo: ${(zipBuffer.length / 1024 / 1024).toFixed(2)} MB`);
                } catch (error) {
                    console.error(`💥 Errore nella creazione ZIP root:`, error);
                    throw new Error(`Errore nel creare ZIP per immagini root: ${error.message}`);
                }
            }
            
            // Crea un ZIP per ogni cartella principale
            let zipIndex = 0;
            const totalFolders = Object.keys(folderStructure.folders).length;
            
            for (const [folderName, folderData] of Object.entries(folderStructure.folders)) {
                zipIndex++;
                console.log(`🗂️ Creando ZIP ${zipIndex}/${totalFolders}: ${folderName}`);
                
                try {
                    conversionProgress.currentAction = `Creando ZIP: ${folderName}`;
                    conversionProgress.currentFolder = folderName;
                    
                    const zip = new JSZip();
                    await this.addFolderToZip(zip, folderData, '', quality, maxSide);
                    
                    const zipBuffer = await zip.generateAsync({
                        type: 'nodebuffer',
                        compression: 'DEFLATE',
                        compressionOptions: { level: 6 }
                    });
                    
                    const imageCount = this.countImages(folderData);
                    const sanitizedName = folderName.replace(/[^a-zA-Z0-9_-]/g, '_');
                    
                    zipList.push({
                        name: `${sanitizedName}.zip`,
                        buffer: zipBuffer,
                        size: zipBuffer.length,
                        imageCount: imageCount
                    });
                    
                    conversionProgress.processedZips++;
                    conversionProgress.progress = Math.round((conversionProgress.processedZips / conversionProgress.totalZips) * 100);
                    
                    console.log(`✅ ZIP creato: ${sanitizedName}.zip (${imageCount} immagini, ${(zipBuffer.length / 1024 / 1024).toFixed(2)} MB)`);
                } catch (error) {
                    console.error(`💥 Errore nella creazione ZIP per cartella ${folderName}:`, error);
                    throw new Error(`Errore nel creare ZIP per cartella "${folderName}": ${error.message}`);
                }
            }
            
            console.log(`🎉 Creazione ZIP multipli completata! ${zipList.length} ZIP creati in totale`);
            return zipList;
            
        } catch (error) {
            console.error('💥 Errore generale nella creazione ZIP multipli:', error);
            throw new Error(`Errore nella creazione ZIP multipli: ${error.message}`);
        }
    }

    async addFolderToZip(zip, folderData, currentPath, quality, maxSide = null) {
        // Aggiorna cartella corrente
        conversionProgress.currentFolder = currentPath || 'Root';
        
        for (const imageInfo of folderData.images) {
            conversionProgress.currentFile = imageInfo.name;
            conversionProgress.currentAction = `Scaricando`;
            console.log(`Scaricando: ${imageInfo.name}`);
            
            const imageBuffer = await this.downloadImage(imageInfo.id);
            if (imageBuffer) {
                conversionProgress.currentAction = `Convertendo`;
                const webpBuffer = await this.convertToWebP(imageBuffer, quality, maxSide);
                if (webpBuffer) {
                    const nameWithoutExt = path.parse(imageInfo.name).name;
                    const webpName = `${nameWithoutExt}.webp`;
                    
                    const zipPath = currentPath ? `${currentPath}/${webpName}` : webpName;
                    
                    zip.file(zipPath, webpBuffer);
                    
                    // Aggiorna progresso
                    conversionProgress.processedFiles++;
                    conversionProgress.progress = Math.round((conversionProgress.processedFiles / conversionProgress.totalFiles) * 100);
                    conversionProgress.currentAction = `Completato`;
                    
                    console.log(`Convertito: ${webpName} ${maxSide ? `(ridimensionato a ${maxSide}px)` : ''}`);
                }
            }
        }
        
        for (const [folderName, subFolderData] of Object.entries(folderData.folders)) {
            const folderPath = currentPath ? `${currentPath}/${folderName}` : folderName;
            await this.addFolderToZip(zip, subFolderData, folderPath, quality, maxSide);
        }
    }

    countImages(structure) {
        let count = structure.images.length;
        for (const subfolder of Object.values(structure.folders)) {
            count += this.countImages(subfolder);
        }
        return count;
    }
}

const processor = new DriveImageProcessor();

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', message: 'API Node.js è operativa' });
});

app.post('/scan-folder', async (req, res) => {
    try {
        const { url } = req.body;
        
        if (!url) {
            return res.status(400).json({ error: 'URL richiesto' });
        }
        
        const folderId = processor.extractFolderId(url);
        if (!folderId) {
            return res.status(400).json({ error: 'URL non valido' });
        }
        
        console.log(`🔍 Scansione cartella: ${folderId}`);
        console.log(`📎 URL originale: ${url}`);
        
        const folderStructure = await processor.scanFolderRecursive(folderId);
        
        const totalImages = processor.countImages(folderStructure);
        
        console.log(`📊 Risultati scansione:`);
        console.log(`   - Immagini totali: ${totalImages}`);
        console.log(`   - Struttura:`, JSON.stringify(folderStructure, null, 2));
        
        res.json({
            success: true,
            folderId: folderId,
            totalImages: totalImages,
            structure: folderStructure
        });
        
    } catch (error) {
        console.error('💥 Errore nella scansione:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/convert-and-download', async (req, res) => {
    try {
        const { folderId, quality = 80, maxSide = null } = req.body;
        
        if (!folderId) {
            return res.status(400).json({ error: 'folderId richiesto' });
        }
        
        // Inizializza il progresso
        conversionProgress.isConverting = true;
        conversionProgress.progress = 0;
        conversionProgress.currentAction = 'Inizializzazione...';
        conversionProgress.processedFiles = 0;
        conversionProgress.currentFile = '';
        conversionProgress.currentFolder = '';
        
        console.log(`Conversione cartella: ${folderId} (qualità: ${quality}${maxSide ? `, ridimensionamento: ${maxSide}px` : ''})`);
        
        conversionProgress.currentAction = 'Scansione struttura cartelle...';
        const folderStructure = await processor.scanFolderRecursive(folderId);
        conversionProgress.totalFiles = processor.countImages(folderStructure);
        
        console.log(`📊 Totale immagini da convertire: ${conversionProgress.totalFiles}`);
        
        conversionProgress.currentAction = 'Avvio conversione immagini...';
        const zipBuffer = await processor.createZipWithConvertedImages(folderStructure, quality, maxSide);
        
        if (zipBuffer) {
            conversionProgress.isConverting = false;
            conversionProgress.progress = 100;
            conversionProgress.currentAction = 'Conversione completata!';
            
            res.set({
                'Content-Type': 'application/zip',
                'Content-Disposition': 'attachment; filename="converted_images.zip"',
                'Content-Length': zipBuffer.length
            });
            
            res.send(zipBuffer);
            
            // Reset del progresso dopo invio
            setTimeout(() => {
                conversionProgress.isConverting = false;
                conversionProgress.progress = 0;
                conversionProgress.currentAction = '';
                conversionProgress.currentFile = '';
                conversionProgress.processedFiles = 0;
                conversionProgress.totalFiles = 0;
                conversionProgress.currentFolder = '';
            }, 5000);
            
        } else {
            conversionProgress.isConverting = false;
            conversionProgress.currentAction = 'Errore nella conversione';
            res.status(500).json({ error: 'Errore nella creazione del ZIP' });
        }
        
    } catch (error) {
        console.error('Errore nella conversione:', error);
        conversionProgress.isConverting = false;
        conversionProgress.currentAction = `Errore: ${error.message}`;
        res.status(500).json({ error: error.message });
    }
});

// Nuovo endpoint per conversione multipla ZIP (una per cartella principale)
app.post('/convert-multiple-zip', async (req, res) => {
    try {
        const { folderId, quality = 80, maxSide = null } = req.body;
        
        if (!folderId) {
            return res.status(400).json({ error: 'folderId richiesto' });
        }
        
        console.log(`🔄 Inizio conversione multipla ZIP - folderId: ${folderId}, qualità: ${quality}, maxSide: ${maxSide}`);
        
        // Reset progresso per conversione multipla
        conversionProgress = {
            isConverting: true,
            progress: 0,
            currentFile: '',
            currentAction: 'Inizializzazione conversione multipla...',
            totalFiles: 0,
            processedFiles: 0,
            currentFolder: '',
            totalZips: 0,
            processedZips: 0,
            zipList: []
        };
        
        console.log(`🔄 Conversione multipla ZIP: ${folderId} (qualità: ${quality}${maxSide ? `, ridimensionamento: ${maxSide}px` : ''})`);
        
        // Scansiona struttura
        console.log('📁 Inizio scansione struttura cartelle...');
        conversionProgress.currentAction = 'Scansione struttura cartelle...';
        
        let folderStructure;
        try {
            folderStructure = await processor.scanFolderRecursive(folderId);
            console.log(`✅ Scansione completata. Struttura:`, {
                images: folderStructure.images ? folderStructure.images.length : 0,
                folders: Object.keys(folderStructure.folders).length
            });
        } catch (error) {
            console.error('💥 Errore durante la scansione:', error);
            conversionProgress.isConverting = false;
            conversionProgress.currentAction = `Errore scansione: ${error.message}`;
            return res.status(500).json({ error: `Errore durante la scansione: ${error.message}` });
        }
        
        conversionProgress.totalFiles = processor.countImages(folderStructure);
        
        // Calcola numero di ZIP da creare
        conversionProgress.totalZips = Object.keys(folderStructure.folders).length;
        if (folderStructure.images && folderStructure.images.length > 0) {
            conversionProgress.totalZips += 1; // ZIP per root images
        }
        
        console.log(`📊 Totale immagini: ${conversionProgress.totalFiles}, ZIP da creare: ${conversionProgress.totalZips}`);
        
        if (conversionProgress.totalFiles === 0) {
            console.log('⚠️ Nessuna immagine trovata nella cartella');
            conversionProgress.isConverting = false;
            conversionProgress.currentAction = 'Nessuna immagine trovata';
            return res.status(400).json({ error: 'Nessuna immagine trovata nella cartella specificata' });
        }
        
        // Avvia conversione multipla
        console.log('🔄 Inizio creazione ZIP multipli...');
        conversionProgress.currentAction = 'Creazione ZIP multipli...';
        
        let zipList;
        try {
            zipList = await processor.createMultipleZips(folderStructure, quality, maxSide);
            console.log(`✅ Creazione ZIP multipli completata! ${zipList.length} ZIP creati.`);
        } catch (error) {
            console.error('💥 Errore durante la creazione ZIP multipli:', error);
            conversionProgress.isConverting = false;
            conversionProgress.currentAction = `Errore creazione ZIP: ${error.message}`;
            return res.status(500).json({ error: `Errore durante la creazione ZIP: ${error.message}` });
        }
        
        conversionProgress.isConverting = false;
        conversionProgress.progress = 100;
        conversionProgress.currentAction = 'Conversione completata!';
        conversionProgress.zipList = zipList;
        
        // Restituisce informazioni sui ZIP creati (non i file stessi)
        const zipInfo = zipList.map(zip => ({
            name: zip.name,
            size: zip.size,
            imageCount: zip.imageCount,
            sizeFormatted: `${(zip.size / 1024 / 1024).toFixed(2)} MB`
        }));
        
        res.json({
            success: true,
            totalZips: zipList.length,
            totalImages: conversionProgress.totalFiles,
            zipFiles: zipInfo
        });
        
        console.log(`🎉 Conversione multipla completata! ${zipList.length} ZIP creati.`);
        
    } catch (error) {
        console.error('💥 Errore generale nella conversione multipla:', error);
        conversionProgress.isConverting = false;
        conversionProgress.currentAction = `Errore generale: ${error.message}`;
        res.status(500).json({ error: `Errore generale: ${error.message}` });
    }
});

// Endpoint per scaricare un singolo ZIP dalla lista
app.get('/download-zip/:zipName', (req, res) => {
    try {
        const { zipName } = req.params;
        
        if (!conversionProgress.zipList || conversionProgress.zipList.length === 0) {
            return res.status(404).json({ error: 'Nessun ZIP disponibile per il download' });
        }
        
        const zipFile = conversionProgress.zipList.find(zip => zip.name === zipName);
        
        if (!zipFile) {
            return res.status(404).json({ error: 'ZIP non trovato' });
        }
        
        console.log(`📥 Download ZIP: ${zipName} (${(zipFile.size / 1024 / 1024).toFixed(2)} MB)`);
        
        res.set({
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="${zipName}"`,
            'Content-Length': zipFile.size
        });
        
        res.send(zipFile.buffer);
        
    } catch (error) {
        console.error('💥 Errore nel download ZIP:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server Node.js avviato su http://localhost:${PORT}`);
    console.log(`📊 Endpoint disponibili:`);
    console.log(`   GET  /health - Controllo stato`);
    console.log(`   GET  /convert-progress - Progresso conversione`);
    console.log(`   POST /scan-folder - Scansione cartella`);
    console.log(`   POST /convert-and-download - Conversione singola ZIP`);
    console.log(`   POST /convert-multiple-zip - Conversione multipla ZIP`);
    console.log(`   GET  /download-zip/:zipName - Download ZIP specifico`);
});

process.on('SIGINT', () => {
    console.log('\n🛑 Terminazione server...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Terminazione server...');
    process.exit(0);
});
