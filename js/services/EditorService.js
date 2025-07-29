
class EditorService {
    constructor() {
        this.editor = null;
        this.outputEditor = null;
        
        this.openFiles = new Map();
        this.breakpoints = new Map();
        this.currentFile = null;
        
        this.decorations = {
            breakpoints: new Map(),
            currentLine: []
        };
        
        this.config = null;
        
        this.events = {};
    }

    /**
     * Initialize Monaco Editor with ChiaLisp support
     * @returns {Promise<void>}
     */
    async initialize() {
        await this._loadConfig();
        
        return new Promise((resolve, reject) => {
            require.config({ 
                paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs' }
            });

            window.MonacoEnvironment = {
                getWorkerUrl: function(workerId, label) {
                    return `data:text/javascript;charset=utf-8,${encodeURIComponent(`
                        self.MonacoEnvironment = {
                            baseUrl: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/'
                        };
                        importScripts('https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs/base/worker/workerMain.js');
                    `)}`;
                }
            };

            require(['vs/editor/editor.main'], () => {
                try {
                    this._setupChialispLanguage();
                    this._createMainEditor();
                    this._createOutputEditor();
                    resolve();
                } catch (error) {
                    console.error(`❌ EditorService: Error initializing Monaco: ${error.message}`);
                    reject(error);
                }
            });
        });
    }

    /**
     * Load language configuration from JSON file
     * @private
     */
    async _loadConfig() {
        try {
            const response = await fetch('js/config/chialisp-language-config.json');
            this.config = await response.json();
        } catch (error) {
            console.error('❌ EditorService: Failed to load config:', error);
            throw error;
        }
    }

    /**
     * Setup ChiaLisp language configuration
     * @private
     */
    _setupChialispLanguage() {
        if (!this.config) {
            throw new Error('Configuration not loaded');
        }

        const { language, theme, hover } = this.config;
        
        monaco.languages.register({ id: language.id });
        
        monaco.languages.setLanguageConfiguration(language.id, language.configuration);
        
        monaco.languages.setMonarchTokensProvider(language.id, {
            tokenizer: language.tokenizer
        });

        monaco.editor.defineTheme(theme.name, {
            base: theme.base,
            inherit: theme.inherit,
            rules: theme.rules,
            colors: theme.colors
        });

        if (hover && hover.keywords) {
            monaco.languages.registerHoverProvider(language.id, {
                provideHover: (model, position) => {
                    const word = model.getWordAtPosition(position);
                    if (word && hover.keywords[word.word]) {
                        return {
                            range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
                            contents: [
                                { value: `**${word.word}**` },
                                { value: hover.keywords[word.word] }
                            ]
                        };
                    }
                    return null;
                }
            });
        }
    }

    /**
     * Create main editor
     * @private
     */
    _createMainEditor() {
        const container = document.getElementById('monaco-editor');
        const editorConfig = { ...this.config.editorConfigs.main, value: '' };
        
        this.editor = monaco.editor.create(container, editorConfig);
    }

    /**
     * Create output editor
     * @private
     */
    _createOutputEditor() {
        const container = document.getElementById('output-editor');
        
        const welcomeMessage = `ChiaLisp Playground `;
        
        const outputConfig = { ...this.config.editorConfigs.output, value: welcomeMessage };
        this.outputEditor = monaco.editor.create(container, outputConfig);
    }


    /**
     * Get content from main editor
     * @returns {string} Editor content
     */
    getContent() {
        return this.editor ? this.editor.getValue() : '';
    }

    /**
     * Set content in main editor
     * @param {string} content 
     */
    setContent(content) {
        if (this.editor) {
            this.editor.setValue(content || '');
        }
    }

    /**
     * Set output text (replaces all content and scrolls to bottom)
     * @param {string} text - Text to set
     */
    setOutput(text) {
        if (this.outputEditor) {
            this.outputEditor.setValue(text || '');
            
            const lineCount = this.outputEditor.getModel().getLineCount();
            this.outputEditor.revealLine(lineCount);
            this.outputEditor.setPosition({ lineNumber: lineCount, column: 1 });
        }
    }


    /**
     * Clear output editor
     */
    clearOutput() {
        this.outputEditor.setValue('');
    }

    /**
     * Update main editor options
     * @param {Object} options - Monaco editor options
     */
    updateOptions(options) {
        if (this.editor) {
            this.editor.updateOptions(options);
        }
    }

    /**
     * Get current cursor position
     * @returns {Object} Position object with lineNumber and column
     */
    getPosition() {
        return this.editor ? this.editor.getPosition() : null;
    }

    /**
     * Add decoration (breakpoint or current line highlight)
     * @param {number} lineNumber - Line number
     * @param {string} type - 'breakpoint' or 'currentLine'
     */
    addDecoration(lineNumber, type) {
        if (!this.editor) return;

        if (type === 'breakpoint') {
            const decorations = this.editor.deltaDecorations([], [{
                range: new monaco.Range(lineNumber, 1, lineNumber, 1),
                options: {
                    isWholeLine: false,
                    className: 'breakpoint-decoration',
                    glyphMarginClassName: 'breakpoint-glyph',
                    glyphMarginHoverMessage: { value: 'Breakpoint' }
                }
            }]);
            
            this.decorations.breakpoints.set(lineNumber, decorations[0]);
            
        } else if (type === 'currentLine') {
            const decorations = this.editor.deltaDecorations([], [{
                range: new monaco.Range(lineNumber, 1, lineNumber, Number.MAX_SAFE_INTEGER),
                options: {
                    className: 'current-execution-line',
                    isWholeLine: true
                }
            }]);
            
            this.decorations.currentLine = decorations;
            
            this.editor.revealLineInCenter(lineNumber);
        }
    }

    /**
     * Remove decoration
     * @param {number} lineNumber - Line number
     * @param {string} type - 'breakpoint' or 'currentLine'
     */
    removeDecoration(lineNumber, type) {
        if (!this.editor) return;

        if (type === 'breakpoint' && this.decorations.breakpoints.has(lineNumber)) {
            const decorationId = this.decorations.breakpoints.get(lineNumber);
            this.editor.deltaDecorations([decorationId], []);
            this.decorations.breakpoints.delete(lineNumber);
            
        } else if (type === 'currentLine' && this.decorations.currentLine.length > 0) {
            this.editor.deltaDecorations(this.decorations.currentLine, []);
            this.decorations.currentLine = [];
        }
    }

    /**
     * Clear all decorations of a specific type
     * @param {string} type 
     */
    clearDecorations(type) {
        if (!this.editor) return;

        if (type === 'breakpoint' || type === 'all') {
            const decorationIds = Array.from(this.decorations.breakpoints.values());
            this.editor.deltaDecorations(decorationIds, []);
            this.decorations.breakpoints.clear();
        }
        
        if (type === 'currentLine' || type === 'all') {
            this.editor.deltaDecorations(this.decorations.currentLine, []);
            this.decorations.currentLine = [];
        }
    }


    /**
     * Add action to editor (for keyboard shortcuts)
     * @param {Object} action 
     */
    addAction(action) {
        if (this.editor) {
            this.editor.addAction(action);
        }
    }

    /**
     * Set position in editor
     * @param {Object} position 
     */
    setPosition(position) {
        if (this.editor) {
            this.editor.setPosition(position);
        }
    }

    /**
     * Reveal line in center
     * @param {number} lineNumber 
     */
    revealLineInCenter(lineNumber) {
        if (this.editor) {
            this.editor.revealLineInCenter(lineNumber);
        }
    }

    /**
     * Add a new tab for a file
     * @param {string} filename 
     * @param {Object} fileData 
     */
    addTab(filename, fileData) {
        const container = document.getElementById('fileTabs');
        if (!container) {
            console.error('fileTabs container not found');
            return;
        }
        
        const existingTab = container.querySelector(`[data-filename="${filename}"]`);
        if (existingTab) {
            return; 
        }
        
        const icon = this._getFileIcon(filename, fileData);
        const displayName = this.getFileDisplayName(filename, fileData);
        const newTab = this._createTab(filename, fileData, icon, displayName);
        newTab.dataset.filename = filename;
        container.appendChild(newTab);
    }
    
    /**
     * Remove a tab for a file
     * @param {string} filename 
     */
    removeTab(filename) {
        const container = document.getElementById('fileTabs');
        if (!container) return;
        
        const tab = container.querySelector(`[data-filename="${filename}"]`);
        if (tab) {
            tab.remove();
        }
    }
    
    /**
     * Set the active tab
     * @param {string} filename - File name to make active
     */
    setActiveTab(filename) {
        const container = document.getElementById('fileTabs');
        if (!container) return;
        
        Array.from(container.children).forEach(tab => {
            tab.classList.remove('active');
        });
        
        const activeTab = container.querySelector(`[data-filename="${filename}"]`);
        if (activeTab) {
            activeTab.classList.add('active');
        }
    }
    
    /**
     * Mark a tab as modified or unmodified
     * @param {string} filename 
     * @param {boolean} modified 
     */
    markTabModified(filename, modified) {
        const container = document.getElementById('fileTabs');
        if (!container) return;
        
        const tab = container.querySelector(`[data-filename="${filename}"]`);
        if (!tab || !this.openFiles.has(filename)) return;
        
        const fileData = this.openFiles.get(filename);
        const displayName = this.getFileDisplayName(filename, fileData);
        const icon = this._getFileIcon(filename, fileData);
        const modifiedIndicator = modified ? ' ●' : '';
        
        const closeButton = tab.querySelector('.tab-close');
        tab.innerHTML = `
            <i class="${icon} me-1"></i>
            ${displayName}${modifiedIndicator}
        `;
        
        if (closeButton) {
            tab.appendChild(closeButton);
        } else {
            const newCloseButton = document.createElement('span');
            newCloseButton.className = 'tab-close';
            newCloseButton.textContent = '×';
            newCloseButton.onclick = (e) => {
                e.stopPropagation();
                this.closeTab(filename);
            };
            tab.appendChild(newCloseButton);
        }
    }

    /**
     * Create a tab element
     * @private
     */
    _createTab(filename, fileData, icon, displayName) {
        const tab = document.createElement('div');
        const isActive = this.currentFile === filename;
        const modified = fileData?.modified ? ' ●' : '';
        
        tab.className = `tab ${isActive ? 'active' : ''}`;
        
        const iconElement = document.createElement('i');
        iconElement.className = `${icon} me-1`;
        
        const textSpan = document.createElement('span');
        textSpan.textContent = `${displayName}${modified}`;
        
        const closeButton = document.createElement('span');
        closeButton.className = 'tab-close';
        closeButton.textContent = '×';
        closeButton.onclick = (e) => {
            e.stopPropagation();
            this.closeTab(filename);
        };
        
        tab.appendChild(iconElement);
        tab.appendChild(textSpan);
        tab.appendChild(closeButton);
        
        tab.onclick = (e) => {
            if (!e.target.classList.contains('tab-close')) {
                this.switchToFile(filename);
            }
        };
        
        return tab;
    }

    /**
     * Get file icon
     * @private
     */
    _getFileIcon(filename, fileData) {
        return (fileData?.fileType === 'example' && fileData.icon) || 'fas fa-file-code';
    }

    /**
     * Switch to a different file
     * @param {string} filename 
     */
    switchToFile(filename) {
        if (this.currentFile === filename) return;

        this.currentFile = filename;

        if (this.openFiles.has(filename)) {
            const fileData = this.openFiles.get(filename);
            this.editor.setValue(fileData.content);
            this.editor.updateOptions({ readOnly: false });
        }
        
        this.setActiveTab(filename);
        this.emit('fileChanged', { 
            filename, 
            fileData: this.openFiles.get(filename) 
        });
    }

    /**
     * Add a file to open files
     * @param {string} filename 
     * @param {Object} fileData 
     */
    addFile(filename, fileData) {
        if (!this.openFiles.has(filename)) {
            this.openFiles.set(filename, {
                content: fileData.content,
                originalContent: fileData.content || fileData.originalContent,
                modified: false,
                breakpoints: new Set(),
                fileType: fileData.fileType || 'fileuploaded',
                filePath: fileData.filePath || filename,
                ...fileData
            });
            
            if (!this.breakpoints.has(filename)) {
                this.breakpoints.set(filename, new Set());
            }
            
            this.addTab(filename, this.openFiles.get(filename));
        } else {
            const existing = this.openFiles.get(filename);
            existing.content = fileData.content;
            existing.originalContent = fileData.originalContent || fileData.content;
            existing.modified = false;
        }
        
        this.currentFile = filename;
        this.editor.setValue(fileData.content);
        this.editor.updateOptions({ readOnly: false });
        this.setActiveTab(filename);
    }

    /**
     * Get file display name
     * @param {string} filename 
     * @param {Object} fileData 
     * @returns {string} 
     */
    getFileDisplayName(filename, fileData) {
        return fileData?.displayName || 
               (fileData?.fileType === 'apifolder' ? filename.split('/').pop() : 
               (filename.endsWith('.clsp') ? filename.replace(/\.clsp$/, '') : filename));
    }

    /**
     * Close a tab and handle file switching
     * @param {string} filename 
     */
    closeTab(filename) {
        this.removeTab(filename);
        this.openFiles.delete(filename);
        this.breakpoints.delete(filename);
        
        if (this.currentFile === filename) {
            const remaining = Array.from(this.openFiles.keys());
            if (remaining.length > 0) {
                this.switchToFile(remaining[0]);
            } else {
                this.currentFile = null;
                if (this.editor) {
                    this.editor.setValue('// No files open\n// Open a file from the explorer or create a new one');
                    this.editor.updateOptions({ readOnly: true });
                }
            }
        }
        
        if (window.playground) {
            window.playground.updateTerminal(`File ${filename} closed`, 'output');
        }
    }

    /**
     * Get current file
     * @returns {string|null} 
     */
    getCurrentFile() {
        return this.currentFile;
    }

    /**
     * Get open files map
     * @returns {Map} 
     */
    getOpenFiles() {
        return this.openFiles;
    }

    /**
     * Register event listener
     * @param {string} event 
     * @param {Function} callback 
     */
    on(event, callback) {
        if (!this.events[event]) this.events[event] = [];
        this.events[event].push(callback);
    }

    /**
     * Emit event to listeners
     * @param {string} event 
     * @param {*} data 
     */
    emit(event, data) {
        if (this.events[event]) {
            this.events[event].forEach(callback => callback(data));
        }
    }

    /**
     * Check if current file content has been modified
     * @param {string} filename 
     * @returns {boolean} 
     */
    checkFileModification(filename) {
        if (!filename || !this.openFiles.has(filename)) {
            return false;
        }
        
        const fileData = this.openFiles.get(filename);
        const currentContent = this.editor ? this.editor.getValue() : '';
        const isModified = currentContent !== fileData.originalContent;
        
        if (fileData.modified !== isModified) {
            fileData.modified = isModified;
            fileData.content = currentContent;
            this.markTabModified(filename, isModified);
        } else {
            fileData.content = currentContent;
        }
        
        return isModified;
    }

    /**
     * Get current cursor position from editor
     * @returns {Object|null} 
     */
    getCurrentPosition() {
        return this.editor ? this.editor.getPosition() : null;
    }
}