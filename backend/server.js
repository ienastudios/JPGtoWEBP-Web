const express = require('express');
const cors = require('cors');
const axios = require('axios');
const sharp = require('sharp');
const JSZip = require('jszip');
const path = require('path');

const app = express();
const PORT = 5001;

app.use(cors());
app.use(express.json());

// Middleware per gestire i path /api/* in produzione
app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
        req.url = req.url.replace('/api', '');
    }
    next();
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
            const response = await this.session.get(folderUrl);
            const html = response.data;
            
            console.log(`Scansionando cartella: ${folderId}`);
            
            // Estrai il titolo della cartella
            const titleMatch = html.match(/<title>(.*?) - Google Drive<\/title>/);
            if (titleMatch) {
                console.log(`Cartella trovata: ${titleMatch[1].replace(/&#39;/g, "'")}`);
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
            
            // Cerca anche cartelle
            const folderPatterns = [
                /data-id="([^"]+)"[^>]*>[^<]*<[^>]*class="[^"]*folder[^"]*"[^>]*>([^<]+)/gi,
                /aria-label="([^"]+)"[^>]*data-id="([^"]+)"[^>]*>[^<]*folder/gi
            ];
            
            // Estrai immagini
            for (const pattern of patterns) {
                let match;
                while ((match = pattern.exec(html)) !== null) {
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
                        
                        console.log(`Trovata immagine: ${name} (ID: ${id})`);
                    }
                }
            }
            
            // Estrai cartelle
            for (const pattern of folderPatterns) {
                let match;
                while ((match = pattern.exec(html)) !== null) {
                    const [, id, name] = match;
                    if (id && name && !items.find(item => item.id === id)) {
                        items.push({
                            id: id,
                            name: name.trim(),
                            type: 'folder',
                            mimeType: 'application/vnd.google-apps.folder'
                        });
                        
                        console.log(`Trovata cartella: ${name} (ID: ${id})`);
                    }
                }
            }
            
            // Se non troviamo nulla con i pattern, proviamo un approccio più aggressivo
            if (items.length === 0) {
                console.log('Nessun pattern trovato, provo approccio alternativo...');
                
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
            
            console.log(`Totale elementi trovati: ${items.length}`);
            return items;
            
        } catch (error) {
            console.error('Errore nella scansione alternativa:', error.message);
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

    async addFolderToZip(zip, folderData, currentPath, quality, maxSide = null) {
        for (const imageInfo of folderData.images) {
            console.log(`Scaricando: ${imageInfo.name}`);
            
            const imageBuffer = await this.downloadImage(imageInfo.id);
            if (imageBuffer) {
                const webpBuffer = await this.convertToWebP(imageBuffer, quality, maxSide);
                if (webpBuffer) {
                    const nameWithoutExt = path.parse(imageInfo.name).name;
                    const webpName = `${nameWithoutExt}.webp`;
                    
                    const zipPath = currentPath ? `${currentPath}/${webpName}` : webpName;
                    
                    zip.file(zipPath, webpBuffer);
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
        
        console.log(`Scansione cartella: ${folderId}`);
        const folderStructure = await processor.scanFolderRecursive(folderId);
        
        const totalImages = processor.countImages(folderStructure);
        
        res.json({
            success: true,
            folderId: folderId,
            totalImages: totalImages,
            structure: folderStructure
        });
        
    } catch (error) {
        console.error('Errore nella scansione:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/convert-and-download', async (req, res) => {
    try {
        const { folderId, quality = 80, maxSide = null } = req.body;
        
        if (!folderId) {
            return res.status(400).json({ error: 'folderId richiesto' });
        }
        
        console.log(`Conversione cartella: ${folderId} (qualità: ${quality}${maxSide ? `, ridimensionamento: ${maxSide}px` : ''})`);
        const folderStructure = await processor.scanFolderRecursive(folderId);
        
        const zipBuffer = await processor.createZipWithConvertedImages(folderStructure, quality, maxSide);
        
        if (zipBuffer) {
            res.set({
                'Content-Type': 'application/zip',
                'Content-Disposition': 'attachment; filename="converted_images.zip"',
                'Content-Length': zipBuffer.length
            });
            
            res.send(zipBuffer);
        } else {
            res.status(500).json({ error: 'Errore nella creazione del ZIP' });
        }
        
    } catch (error) {
        console.error('Errore nella conversione:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server Node.js avviato su http://localhost:${PORT}`);
    console.log(`📊 Endpoint disponibili:`);
    console.log(`   GET  /health - Controllo stato`);
    console.log(`   POST /scan-folder - Scansione cartella`);
    console.log(`   POST /convert-and-download - Conversione e download`);
});

process.on('SIGINT', () => {
    console.log('\n🛑 Terminazione server...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Terminazione server...');
    process.exit(0);
});
