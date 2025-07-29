
class StorageService {
    constructor() {
        this.dbName = 'chialisp-playground-db';
        this.dbVersion = 1;
        this.db = null;
        
        this.apifolderHandle = null;
        this.apifolderTree = null;
        
        this.fileuploadedFilesList = new Map();
        this.apifolderFilesList = new Map();
    }

    /**
     * Initialize the storage service
     */
    async initialize() {
        try {
            await this.initDB();
        } catch (error) {
            console.error('❌ Error initializing StorageService:', error);
        }
    }

    /**
     * Initialize IndexedDB
     */
    async initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            
            request.onerror = () => {
                console.error('Error opening IndexedDB:', request.error);
                reject(request.error);
            };
            
            request.onsuccess = () => {
                this.db = request.result;
                resolve(request.result);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                if (!db.objectStoreNames.contains('folderHandles')) {
                    const folderStore = db.createObjectStore('folderHandles', { keyPath: 'id' });
                    folderStore.createIndex('timestamp', 'timestamp', { unique: false });
                    folderStore.createIndex('name', 'name', { unique: false });
                }
            };
        });
    }


    /**
     * Load specific file parameters
     * @param {string} filename 
     * @returns {Object|null} 
     */
    getFileParameters(filename) {
        try {
            const storageKey = `chialisp_params_${filename}`;
            const data = localStorage.getItem(storageKey);
            
            if (!data) return null;
            
            return JSON.parse(data);

        } catch (error) {
            console.error('Error loading file parameters:', error);
            return null;
        }
    }

    /**
     * Save file parameters
     * @param {string} filename 
     * @param {string} curriedParams 
     * @param {string} solutionParams 
     */
    saveFileParameters(filename, curriedParams, solutionParams) {
        try {
            const storageKey = `chialisp_params_${filename}`;
            const params = {
                curriedParams: curriedParams || '()',
                solutionParams: solutionParams || '()',
                lastUpdated: new Date().toISOString()
            };

            localStorage.setItem(storageKey, JSON.stringify(params));
        } catch (error) {
            console.error('Error saving file parameters:', error);
        }
    }


    /**
     * Load breakpoints for specific file
     * @param {string} filename 
     * @returns {Set<number>|null} 
     */
    loadFileBreakpoints(filename) {
        try {
            const storageKey = `chialisp_breakpoints_${filename}`;
            const data = localStorage.getItem(storageKey);
            
            if (!data) return null;
            
            const fileBreakpoints = JSON.parse(data);
            
            if (fileBreakpoints && Array.isArray(fileBreakpoints.breakpoints)) {
                return new Set(fileBreakpoints.breakpoints);
            }
            
            return null;

        } catch (error) {
            console.error('Error loading file breakpoints:', error);
            return null;
        }
    }

    /**
     * Save breakpoints for specific file
     * @param {string} filename 
     * @param {Set<number>} breakpoints 
     */
    saveFileBreakpoints(filename, breakpoints) {
        try {
            const storageKey = `chialisp_breakpoints_${filename}`;
            const breakpointsArray = Array.from(breakpoints);
            
            if (breakpointsArray.length > 0) {
                const breakpointData = {
                    breakpoints: breakpointsArray,
                    lastUpdated: new Date().toISOString()
                };
                localStorage.setItem(storageKey, JSON.stringify(breakpointData));
            } else {
                localStorage.removeItem(storageKey);
            }

        } catch (error) {
            console.error('Error saving file breakpoints:', error);
        }
    }

    /**
     * Save opened files list
     * @param {Map} openedFiles 
     */
    saveOpenedFilesList(openedFiles) {
        try {
            const openedFilesArray = Array.from(openedFiles.entries());
            localStorage.setItem('chialisp_opened_files_list', JSON.stringify(openedFilesArray));
            
        } catch (error) {
            console.error('Error saving opened files list:', error);
        }
    }

    /**
     * Load opened files list
     * @returns {Object} 
     */
    loadOpenedFilesList() {
        try {
            const data = localStorage.getItem('chialisp_opened_files_list');
            const openedFilesArray = data ? JSON.parse(data) : [];
            
            const openedFilesObject = {};
            openedFilesArray.forEach(([filename, fileData]) => {
                openedFilesObject[filename] = fileData;
            });
            
            this.fileuploadedFilesList = new Map(openedFilesArray);

        } catch (error) {
            console.error('Error loading opened files list:', error);
            return {};
        }
    }

    /**
     * Save uploaded file (fileuploaded files only)
     * @param {string} filename 
     * @param {Object} fileData 
     */
    saveUploadedFile(filename, fileData) {
        try {
            const storageKey = `chialisp_fileuploaded_${filename}`;
            const data = {
                content: fileData.content,
                lastSaved: new Date().toISOString(),
                originalFile: fileData.originalFile || null
            };

            localStorage.setItem(storageKey, JSON.stringify(data));

        } catch (error) {
            console.error('Error saving uploaded file:', error);
        }
    }

    /**
     * Load uploaded file (fileuploaded files only)
     * @param {string} filename 
     * @returns {Object|null} 
     */
    loadUploadedFile(filename) {
        try {
            const storageKey = `chialisp_fileuploaded_${filename}`;
            const data = localStorage.getItem(storageKey);
            
            if (data) {
                const parsed = JSON.parse(data);
                return { content: parsed.content };
            }
            
            return null;

        } catch (error) {
            console.error('Error loading uploaded file:', error);
            return null;
        }
    }

    /**
     * Remove uploaded file (fileuploaded files only)
     * @param {string} filename 
     */
    removeUploadedFile(filename) {
        try {
            const storageKey = `chialisp_fileuploaded_${filename}`;
            localStorage.removeItem(storageKey);
        } catch (error) {
            console.error('Error removing uploaded file:', error);
        }
    }

    /**
     * Save apifolder handle to IndexedDB
     * @param {Object} handleData 
     */
    async saveApifolderHandle() {
        try {
            const transaction = this.db.transaction(['folderHandles'], 'readwrite');
            const store = transaction.objectStore('folderHandles');
            
            const data = {
                id: 'apifolder_selected',
                type: 'folder',
                handle: this.apifolderHandle,
                name: this.apifolderHandle.name,
                timestamp: Date.now()
            };
            
            store.put(data);
            
            localStorage.setItem('apifolderName', this.apifolderHandle.name);
            localStorage.setItem('apifolderTimestamp', Date.now().toString());
            
        } catch (error) {
            console.warn('⚠️ Could not save apifolder handle:', error);
        }
    }

    /**
     * Load apifolder handle from IndexedDB
     * @returns {Object|null} 
     */
    async loadApifolderHandle() {
        try {
            const transaction = this.db.transaction(['folderHandles'], 'readonly');
            const store = transaction.objectStore('folderHandles');
            
            return new Promise((resolve, reject) => {
                const request = store.get('apifolder_selected');
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.warn('⚠️ Could not load apifolder handle:', error);
            return null;
        }
    }

    /**
     * Remove apifolder handle from IndexedDB
     */
    async removeApifolderHandle() {
        try {
            const transaction = this.db.transaction(['folderHandles'], 'readwrite');
            const store = transaction.objectStore('folderHandles');
            await store.delete('apifolder_selected');
            
            localStorage.removeItem('apifolderName');
            localStorage.removeItem('apifolderTimestamp');
            
        } catch (error) {
            console.warn('⚠️ Could not clear apifolder handle:', error);
        }
    }

    /**
     * Select a local folder using File System Access API
     * @returns {Promise<FileSystemDirectoryHandle|null>} 
     */
    async selectFolder() {
        try {
            if (!window.showDirectoryPicker) {
                throw new Error('File System Access API not supported in this browser');
            }
            
            this.apifolderHandle = await window.showDirectoryPicker();
            await this.saveApifolderHandle();
            
            return this.apifolderHandle;
        } catch (error) {
            console.warn('⚠️ Could not select folder:', error);
            return null;
        }
    }

    /**
     * Restore previously selected folder
     * @returns {Promise<FileSystemDirectoryHandle|null>} 
     */
    async restoreFolder() {
        try {
            const savedFolder = await this.loadApifolderHandle();
            if (savedFolder && savedFolder.handle) {
                this.apifolderHandle = savedFolder.handle;
                return this.apifolderHandle;
            }
            return null;
        } catch (error) {
            console.warn('⚠️ Could not restore folder:', error);
            return null;
        }
    }

    /**
     * Clear the current folder selection
     */
    async clearFolder() {
        try {
            this.apifolderHandle = null;
            this.apifolderTree = null;
            await this.removeApifolderHandle();
        } catch (error) {
            console.warn('⚠️ Could not clear folder:', error);
        }
    }

    /**
     * Get the current folder handle
     * @returns {FileSystemDirectoryHandle|null} 
     */
    getFolderHandle() {
        return this.apifolderHandle;
    }

    /**
     * Open file dialog and process selected files
     * @returns {Promise<Array>} 
     */
    async openFileDialog() {
        return new Promise((resolve, reject) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.clsp,.cl,.clib';
            input.multiple = true;
            
            input.onchange = async (e) => {
                try {
                    const files = Array.from(e.target.files);
                    const processedFiles = [];
                    
                    for (const file of files) {
                        try {
                            const content = await file.text();
                            const filename = `opened_${file.name}`;
                            
                            this.fileuploadedFilesList.set(filename, {
                                name: file.name,
                                content: content,
                                originalContent: content,
                                modified: false,
                                fileType: 'fileuploaded',
                                originalFile: file
                            });
                            
                            processedFiles.push({
                                filename,
                                originalName: file.name,
                                content,
                                fileType: 'fileuploaded'
                            });
                            
                        } catch (error) {
                            console.error(`❌ Error processing file ${file.name}:`, error);
                        }
                    }
                    
                    resolve(processedFiles);
                } catch (error) {
                    reject(error);
                }
            };
            
            input.onerror = () => reject(new Error('File dialog failed'));
            input.click();
        });
    }

    /**
     * Clear all opened files and return filenames that were cleared
     * @returns {Array} 
     */
    clearOpenedFiles() {
        const clearedFiles = Array.from(this.fileuploadedFilesList.keys());
        this.fileuploadedFilesList.clear();
        return clearedFiles;
    }

    /**
     * Load local file from folder and return processed data
     * @param {string} path 
     * @returns {Object} 
     */
    async loadLocalFile(path) {
        try {
            const fileData = this.apifolderFilesList.get(path);
            if (!fileData) {
                throw new Error(`Local file ${path} not found`);
            }

            const filename = `local_${path.replace(/[\/\\]/g, '_')}`;
            
            const processedFile = {
                filename,
                originalPath: path,
                content: fileData.content,
                fileType: 'apifolder',
                handle: fileData.handle
            };
            
            return processedFile;
            
        } catch (error) {
            console.error(`❌ Error loading local file ${path}:`, error);
            throw error;
        }
    }

    /**
     * Save local file to disk using File System Access API
     * @param {string} filename 
     * @param {Object} fileData 
     * @returns {Promise<void>}
     */
    async saveLocalFile(filename, fileData) {
        try {
            if (!fileData.handle) {
                throw new Error('File handle not found');
            }

            const permission = await fileData.handle.queryPermission({ mode: 'readwrite' });
            
            if (permission !== 'granted') {
                const newPermission = await fileData.handle.requestPermission({ mode: 'readwrite' });
                if (newPermission !== 'granted') {
                    throw new Error('Write permission denied');
                }
            }

            const writable = await fileData.handle.createWritable();
            
            await writable.truncate(0);
            await writable.write(fileData.content);
            await writable.close();
            
            if (fileData.localPath && this.apifolderFilesList.has(fileData.localPath)) {
                const localFileData = this.apifolderFilesList.get(fileData.localPath);
                localFileData.content = fileData.content;
            }
            
        } catch (error) {
            console.error(`❌ Error saving local file:`, error);
            throw new Error(`Failed to save local file: ${error.message}`);
        }
    }

    /**
     * Get opened files Map
     * @returns {Map} 
     */
    getOpenedFiles() {
        return this.fileuploadedFilesList;
    }

    /**
     * Get local files Map
     * @returns {Map} 
     */
    getLocalFiles() {
        return this.apifolderFilesList;
    }

    /**
     * Check if there are opened files
     * @returns {boolean} 
     */
    hasOpenedFiles() {
        return this.fileuploadedFilesList.size > 0;
    }

    /**
     * Clear local files cache
     */
    clearLocalFiles() {
        this.apifolderFilesList.clear();
        this.apifolderTree = null;
    }

    /**
     * Get the current file tree
     * @returns {Object|null} 
     */
    getFileTree() {
        return this.apifolderTree;
    }

    /**
     * Load local files and build file tree from current folder handle
     * @returns {Promise<void>}
     */
    async loadLocalFilesAndBuildTree() {
        if (!this.apifolderHandle) {
            console.warn('⚠️ No folder handle available');
            return;
        }

        try {
            this.clearLocalFiles();
            
            this.apifolderTree = await this.buildFileTree(this.apifolderHandle, '');
        } catch (error) {
            console.error('❌ Error loading local files and building tree:', error);
            throw error;
        }
    }

    /**
     * Build file tree from directory handle
     * @param {FileSystemDirectoryHandle} dirHandle 
     * @param {string} path 
     * @param {number} depth 
     * @returns {Promise<Object>} 
     */
    async buildFileTree(dirHandle, path, depth = 0) {
        const tree = {
            name: path ? path.split('/').pop() : dirHandle.name,
            path: path || '',
            type: 'folder',
            children: [],
            expanded: depth === 0
        };
        
        if (depth > 3) return tree;
        
        const entries = [];
        for await (const [name, handle] of dirHandle.entries()) {
            entries.push([name, handle]);
        }
        
        entries.sort((a, b) => {
            const [nameA, handleA] = a;
            const [nameB, handleB] = b;
            
            if (handleA.kind !== handleB.kind) {
                return handleA.kind === 'directory' ? -1 : 1;
            }
            return nameA.localeCompare(nameB);
        });
        
        for (const [name, handle] of entries) {
            const fullPath = path ? `${path}/${name}` : name;
            
            if (handle.kind === 'file' && (name.endsWith('.clsp') || name.endsWith('.cl') || name.endsWith('.clib'))) {
                try {
                    const file = await handle.getFile();
                    const content = await file.text();
                    
                    this.apifolderFilesList.set(fullPath, {
                        name: name,
                        content: content,
                        path: fullPath,
                        handle: handle,
                        icon: 'fas fa-file-code',
                        description: `Local file: ${fullPath}`,
                        isLocal: true
                    });
                    
                    tree.children.push({
                        name: name,
                        path: fullPath,
                        type: 'file',
                        handle: handle
                    });
                } catch (error) {
                    console.warn(`Could not read file ${fullPath}:`, error);
                }
            } else if (handle.kind === 'directory') {
                const subtree = await this.buildFileTree(handle, fullPath, depth + 1);
                
                if (this.hasClspFiles(subtree)) {
                    tree.children.push(subtree);
                }
            }
        }
        
        return tree;
    }
    
    /**
     * Check if tree contains .clsp files
     * @param {Object} tree 
     * @returns {boolean} 
     */
    hasClspFiles(tree) {
        for (const child of tree.children) {
            if (child.type === 'file') {
                return true;
            } else if (child.type === 'folder' && this.hasClspFiles(child)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Determine source type from filename based on prefix
     * @param {string} filename 
     * @returns {string} 
     */
    getSourceTypeFromFilename(filename) {
        if (filename.startsWith('opened_')) {
            return 'fileuploaded';
        }
        if (filename.startsWith('local_')) {
            return 'apifolder';
        }
        return 'example';
    }

    /**
     * Get file content by filename and source type
     * @param {string} filename 
     * @param {string} sourceType 
     * @returns {Object|null} 
     */
    async getFile(filename, sourceType) {
        try {
            switch (sourceType) {
                case 'fileuploaded': {
                    const fileKey = `opened_${filename}`;
                    const fileData = this.loadUploadedFile(fileKey);
                    if (fileData) {
                        return {
                            content: fileData.content,
                            fullPath: fileKey,
                            sourceType: 'fileuploaded',
                            displayName: filename.replace('opened_', '')
                        };
                    }
                    break;
                }
                
                case 'apifolder': {
                    const fileData = await this.loadLocalFile(filename);
                    if (fileData) {
                        return {
                            content: fileData.content,
                            fullPath: fileData.filename,
                            sourceType: 'apifolder',
                            displayName: filename.split('/').pop()
                        };
                    }
                    break;
                }
                
                case 'example': {
                    const fullPath = filename.startsWith('examples/') ? filename : `examples/${filename}`;
                    const response = await fetch(fullPath);
                    
                    if (!response.ok) {
                        throw new Error(`File not found: ${fullPath} (status: ${response.status})`);
                    }
                    
                    const content = await response.text();
                    return {
                        content: content,
                        fullPath: fullPath,
                        sourceType: 'example',
                        displayName: fullPath.split('/').pop()
                    };
                }
                
                default:
                    throw new Error(`Unknown source type: ${sourceType}`);
            }
            
            
            
            return null;
            
        } catch (error) {
            console.error(`❌ StorageService: Error loading file ${filename} from ${sourceType}:`, error);
            return null;
        }
    }
}