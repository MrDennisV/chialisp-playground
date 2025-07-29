
class ChialispPlayground {
    constructor() {
        this.debuggerInstance = new Debugger();
        this.storageService = new StorageService();
        this.editorService = new EditorService();
        this.conditionsService = new ConditionsService();
        this.examplesService = new ExamplesService();
        this.debugService = new DebugService(this.editorService, this.storageService, this.debuggerInstance);
        this.compilationService = new CompilationService(this.storageService, this.debuggerInstance);
        this.initialize();
    }

    async initialize() {
        this.editorService.on('fileChanged', (data) => {
            this.updateFileStatus();
            if (data.filename && this.debugService) {
                this.debugService.loadBreakpointsForFile(data.filename);
            }
        });
        
        await this.storageService.initialize();
        
        await this.examplesService.loadExamples();
        await this.editorService.initialize();
        await this.debugService.initialize();
        await this.compilationService.initialize();
        this.setupEditorEventHandlers();
        this.renderExamples();
        this.setupHotKeys();
        this.setupActivityBar();
        this.setupDraggableDebugToolbar();
        this.setupLocalFolderSupport();
        this.renderOpenedFiles();
        this.setupCollapsiblePanels();
        this.loadExample('welcome');
        this.updateFileStatus();
        this.updateStatus('Ready', 'success');
    }

    getFileParameters(filename) {
        if (!filename) return { curriedParams: '', solutionParams: '()' };
        
        const savedParams = this.storageService.getFileParameters(filename);
        if (savedParams) {
            return {
                curriedParams: savedParams.curriedParams,
                solutionParams: savedParams.solutionParams
            };
        }
        
        const defaultParams = this.examplesService.getDefaultParameters(filename);
        if (defaultParams) {
            return defaultParams;
        }
        
        return {
            curriedParams: '',
            solutionParams: '()'
        };
    }


    setupEditorEventHandlers() {
        this.editorService.editor.onDidChangeModelContent(() => {
            this.editorService.checkFileModification(this.editorService.getCurrentFile());
        });
        
        this.editorService.editor.onDidChangeCursorPosition(() => {
            this.updateFileStatus();
        });
        
        this.setupBreakpointHandling();
    }

    setupBreakpointHandling() {
        this.editorService.editor.onMouseDown((e) => {
            if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ||
                e.target.type === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS) {
                
                const lineNumber = e.target.position.lineNumber;
                this.handleToggleBreakpoint(this.editorService.getCurrentFile(), lineNumber);
            }
        });

        this.editorService.editor.addAction({
            id: 'toggle-breakpoint',
            label: 'Toggle Breakpoint',
            contextMenuGroupId: 'debug',
            contextMenuOrder: 1,
            run: (editor) => {
                const position = editor.getPosition();
                this.handleToggleBreakpoint(this.editorService.getCurrentFile(), position.lineNumber);
            }
        });
    }

    setupHotKeys() {        
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                this.saveFile();
            }
            if (e.ctrlKey && e.key === 'o') {
                e.preventDefault();
                this.openFile();
            }
            if (e.ctrlKey && e.shiftKey && e.key === 'B') {
                e.preventDefault();
                this.compileCode();
            }
            if (e.key === 'F9') {
                e.preventDefault();
                if (e.shiftKey) {
                    // Shift+F9 = Debug
                    if (this.debugService.isDebugSessionActive()) {
                        this.handleContinueDebugging();
                    } else {
                        this.handleStartDebugging();
                    }
                } else {
                    // F9 = Run
                    this.runCode();
                }
            }
        });        
    }
    
    renderExamples() {
        const examplesContainer = document.querySelector('.examples-tree');
        if (!examplesContainer) return;
        
        examplesContainer.innerHTML = '';
        
        this.renderExamplesTree();
        return;
    }
    
    
    sortExamplesByOrder(examples) {
        return examples
            .filter(([key, example]) => example && example.name)
            .sort((a, b) => {
                const orderA = a[1].order || 999;
                const orderB = b[1].order || 999;
                return orderA - orderB;
            });
    }
    
    setupDraggableDebugToolbar() {
        const debugToolbar = document.getElementById('debugToolbar');
        if (!debugToolbar) return;

        let isDragging = false;
        let dragStartX = 0;
        let dragStartY = 0;
        let initialX = 0;
        let initialY = 0;

        debugToolbar.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('debug-toolbar-action') || 
                e.target.closest('.debug-toolbar-action')) {
                return;
            }

            isDragging = true;
            dragStartX = e.clientX;
            dragStartY = e.clientY;

            const rect = debugToolbar.getBoundingClientRect();
            initialX = rect.left + rect.width / 2 - window.innerWidth / 2;
            initialY = rect.top;

            debugToolbar.classList.add('dragging');
            debugToolbar.style.transform = `translateX(calc(-50% + ${initialX}px))`;
            debugToolbar.style.left = '50%';
            debugToolbar.style.top = `${initialY}px`;
            
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            const deltaX = e.clientX - dragStartX;
            const deltaY = e.clientY - dragStartY;

            const newX = initialX + deltaX;
            const newY = Math.max(10, Math.min(window.innerHeight - 60, initialY + deltaY));

            debugToolbar.style.transform = `translateX(calc(-50% + ${newX}px))`;
            debugToolbar.style.top = `${newY}px`;
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                debugToolbar.classList.remove('dragging');
                
                const rect = debugToolbar.getBoundingClientRect();
                initialX = rect.left + rect.width / 2 - window.innerWidth / 2;
                initialY = rect.top;
            }
        });

        debugToolbar.addEventListener('debugReset', () => {
            debugToolbar.style.transform = 'translateX(-50%)';
            debugToolbar.style.left = '50%';
            debugToolbar.style.top = '80px';
        });
    }

    setupActivityBar() {
        const activityButtons = document.querySelectorAll('.activity-btn[data-view]');
        
        activityButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const viewName = button.dataset.view;
                this.switchSidebarView(viewName);
            });
        });
    }

    switchSidebarView(viewName) {
        document.querySelectorAll('.activity-btn[data-view]').forEach(btn => {
            btn.classList.remove('active');
        });
        
        const clickedButton = document.querySelector(`[data-view="${viewName}"]`);
        if (clickedButton) {
            clickedButton.classList.add('active');
        }
        
        document.querySelectorAll('.sidebar-view').forEach(view => {
            view.classList.remove('active');
        });
        
        const targetView = document.getElementById(viewName + 'View');
        if (targetView) {
            targetView.classList.add('active');
        }
    }

    async loadExample(exampleKey) {
        try {
            const example = this.examplesService.getExample(exampleKey);
            
            if (!example) {
                throw new Error(`Example ${exampleKey} not found`);
            }
            await this.loadExampleFile(example.file);
        } catch (error) {
            this.updateTerminal(`❌ Error loading example ${exampleKey}: ${error.message}`, 'output');
            console.error('Load example error:', error);
        }
    }

    async loadExampleFile(filePath) {
        try {
            if (this.editorService.openFiles.has(filePath)) {
                this.editorService.switchToFile(filePath);
                return;
            }

            this.updateTerminal(`Loading example file: ${filePath}`, 'output');
            
            let content = '';
            
            try {
                content = await this.examplesService.loadExampleFile(filePath);
            } catch (error) {
                this.updateTerminal(`⚠️ Example file not found, creating new: ${filePath}`, 'output');
                const filename = filePath.split('/').pop();
                content = `; Example file ${filename}
(mod ()
  ; Your ChiaLisp code here
  ()
)`;
            }

            this.editorService.addFile(filePath, {
                content: content,
                originalContent: content,
                fileType: 'example',
                displayName: filePath.split('/').pop()
            });
            
            this.debugService.loadBreakpointsForFile(filePath);
            this.updateTerminal(`✅ Example file ${filePath} loaded`, 'output');
        } catch (error) {
            this.updateTerminal(`❌ Error loading example file ${filePath}: ${error.message}`, 'output');
            console.error('Load example file error:', error);
        }
    }

    setupCollapsiblePanels() {
        const collapsibleHeaders = document.querySelectorAll('.collapsible-header');
        
        collapsibleHeaders.forEach(header => {
            header.addEventListener('click', (e) => {
                if (e.target.closest('.clear-folder-btn')) {
                    return;
                }
                
                const targetId = header.dataset.target;
                const content = document.getElementById(targetId);
                const chevron = header.querySelector('.header-chevron');
                
                if (content && chevron) {
                    const isCollapsed = content.classList.contains('collapsed');
                    
                    if (isCollapsed) {  
                        content.classList.remove('collapsed');
                        chevron.classList.remove('collapsed');
                        content.style.maxHeight = content.scrollHeight + 'px';
                    } else {
                        content.style.maxHeight = content.scrollHeight + 'px';
                        content.offsetHeight;
                        content.style.maxHeight = '0';
                        content.classList.add('collapsed');
                        chevron.classList.add('collapsed');
                    }
                }
            });
        });
        
        setTimeout(() => {
            document.querySelectorAll('.collapsible-content:not(.collapsed)').forEach(content => {
                content.style.maxHeight = content.scrollHeight + 'px';
            });
        }, 100);
        
        this.setupPanelSwitching();
        
        this.initializePanelResize();
    }

    updateCollapsiblePanelHeight(contentId) {
        const content = document.getElementById(contentId);
        if (content && !content.classList.contains('collapsed')) {
            content.style.maxHeight = content.scrollHeight + 'px';
        }
    }

    setupLocalFolderSupport() {
        const newFileBtn = document.getElementById('newFileBtn');
        const openFileBtn = document.getElementById('openFileBtn');
        const clearOpenedFilesBtn = document.getElementById('clearOpenedFilesBtn');
        
        newFileBtn.addEventListener('click', () => this.handleNewFile());
        openFileBtn.addEventListener('click', () => this.handleOpenFileDialog());
        clearOpenedFilesBtn.addEventListener('click', () => this.handleClearOpenedFiles());
        
        if ('showDirectoryPicker' in window) {
            const openFolderRow = document.querySelector('.open-folder-row');
            const selectFolderBtn = document.getElementById('selectFolderBtn');
            const clearFolderBtn = document.getElementById('clearLocalFolderBtn');
            
            openFolderRow.style.display = 'block';
            selectFolderBtn.style.display = 'flex';
            selectFolderBtn.addEventListener('click', () => this.selectLocalFolder());
            clearFolderBtn.addEventListener('click', () => this.clearLocalFolder());
            
            this.restorePreviousFolder();
        } 
    }

    async restorePreviousFolder() {
        try {
            const folderHandle = await this.storageService.restoreFolder();
            
            if (folderHandle) {
                const permission = await folderHandle.queryPermission({ mode: 'read' });
                
                if (permission === 'granted') {
                    await this.loadLocalFiles();
                    this.renderLocalFiles();
                    
                    this.updateTerminal(`✅ Restored previous folder: ${folderHandle.name}`, 'output');
                    return true; 
                }
            }
        } catch (error) {
            console.warn('⚠️ Could not restore previous folder:', error);
        }
        
        return false;
    }

    async selectLocalFolder() {
        try {
            const folderHandle = await this.storageService.selectFolder();
            
            if (folderHandle) {
                await this.loadLocalFiles();
                
                this.renderLocalFiles();
                
                const localFolderContent = document.getElementById('localFilesList');
                const localFolderChevron = document.querySelector('[data-target="localFilesList"] .header-chevron');
                if (localFolderContent && localFolderChevron) {
                    localFolderContent.classList.remove('collapsed');
                    localFolderChevron.classList.remove('collapsed');
                    this.updateCollapsiblePanelHeight('localFilesList');
                }
                
                this.updateTerminal(`✅ Loaded local folder: ${folderHandle.name}`, 'output');
            }
            
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Error selecting folder:', error);
                this.updateTerminal(`❌ Error selecting folder: ${error.message}`, 'output');
            }
        }
    }

    async clearLocalFolder() {
        this.storageService.clearLocalFiles();
        
        await this.storageService.clearFolder();
        
        const localFilesSection = document.getElementById('localFilesSection');
        if (localFilesSection) {
            localFilesSection.style.display = 'none';
        }
        
        const localFilesToClose = [];
        for (const [filename, fileData] of this.editorService.getOpenFiles().entries()) {
            if (fileData.fileType === 'apifolder') {
                localFilesToClose.push(filename);
            }
        }
        
        localFilesToClose.forEach(filename => {
            this.editorService.removeTab(filename);
            this.editorService.getOpenFiles().delete(filename);
            this.editorService.breakpoints.delete(filename);
        });
        
        if (localFilesToClose.includes(this.editorService.getCurrentFile())) {
            const remaining = Array.from(this.editorService.getOpenFiles().keys());
            if (remaining.length > 0) {
                this.editorService.switchToFile(remaining[0]);
            } else {
                this.editorService.currentFile = '';
                this.editorService.editor.setValue('');
            }
        }
        
        this.updateTerminal('✅ Local folder cleared', 'output');
    }

    async handleOpenFileDialog() {
        try {
            const processedFiles = await this.storageService.openFileDialog();
            
            if (processedFiles.length === 0) return;
            
            for (const fileInfo of processedFiles) {
                const fileData = {
                    content: fileInfo.content,
                    originalContent: fileInfo.content,
                    modified: false,
                    breakpoints: new Set(),
                    fileType: 'fileuploaded',
                    originalFile: this.storageService.getOpenedFiles().get(fileInfo.filename)?.originalFile,
                    displayName: fileInfo.originalName
                };
                
                this.editorService.addFile(fileInfo.filename, fileData);
                
                if (fileData.fileType === 'fileuploaded' && fileInfo.filename !== 'welcome' && !fileInfo.filename.startsWith('examples/')) {
                    this.saveFileToStorage(fileInfo.filename, fileData);
                }
                
                this.updateTerminal(`✅ File opened: ${fileInfo.originalName}`, 'output');
            }
            
            
            const openedFilesContent = document.getElementById('openedFilesList');
            const openedFilesChevron = document.querySelector('[data-target="openedFilesList"] .header-chevron');
            if (openedFilesContent && openedFilesChevron) {
                openedFilesContent.classList.remove('collapsed');
                openedFilesChevron.classList.remove('collapsed');
                this.updateCollapsiblePanelHeight('openedFilesList');
            }
            
            this.saveOpenedFilesList();
            this.renderOpenedFiles();
            
            for (const fileInfo of processedFiles) {
                this.debugService.loadBreakpointsForFile(fileInfo.filename);
            }
            
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Error opening files:', error);
                this.updateTerminal(`❌ Error opening files: ${error.message}`, 'output');
            }
        }
    }

    handleNewFile() {
        return new Promise((resolve, reject) => {
            const modal = new mdb.Modal(document.getElementById('newFileModal'));
            const createBtn = document.getElementById('createFileBtn');
            const filenameInput = document.getElementById('newFileNameInput');
            
            filenameInput.value = '';
            
            const handleCreate = () => {
                const filename = filenameInput.value.trim();
                
                if (!filename) {
                    alert('Please enter a filename');
                    return;
                }
                
                if (!/^[a-zA-Z0-9_-]+$/.test(filename)) {
                    alert('Filename can only contain letters, numbers, underscores and hyphens');
                    return;
                }
                
                const fullFilename = `${filename}.clsp`;
                const internalFilename = `opened_${filename}`;
                
                if (this.editorService.getOpenFiles().has(internalFilename)) {
                    alert('A file with this name already exists');
                    return;
                }
                
                const fileData = {
                    content: '(mod ()\n  (list "New File")\n)',
                    originalContent: '(mod ()\n  (list "New File")\n)',
                    modified: false,
                    breakpoints: new Set(),
                    fileType: 'fileuploaded',
                    originalFile: { name: fullFilename },
                    displayName: fullFilename
                };
                
                this.editorService.addFile(internalFilename, fileData);
                
                this.storageService.getOpenedFiles().set(internalFilename, {
                    content: fileData.content,
                    originalContent: fileData.originalContent,
                    modified: fileData.modified,
                    fileType: fileData.fileType,
                    name: fullFilename
                });
                
                const openedFilesContent = document.getElementById('openedFilesList');
                const openedFilesChevron = document.querySelector('[data-target="openedFilesList"] .header-chevron');
                if (openedFilesContent && openedFilesChevron) {
                    openedFilesContent.classList.remove('collapsed');
                    openedFilesChevron.classList.remove('collapsed');
                    this.updateCollapsiblePanelHeight('openedFilesList');
                }
                
                this.saveOpenedFilesList();
                this.renderOpenedFiles();
                this.debugService.loadBreakpointsForFile(internalFilename);
                
                this.updateTerminal(`✅ New file created: ${fullFilename}`, 'output');
                
                modal.hide();
                resolve(internalFilename);
            };
            
            const handleCancel = () => {
                modal.hide();
                reject(new Error('New file cancelled'));
            };
            
            createBtn.onclick = handleCreate;
            
            filenameInput.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    handleCreate();
                }
            };
            
            const modalElement = document.getElementById('newFileModal');
            const dismissButtons = modalElement.querySelectorAll('[data-mdb-dismiss="modal"]');
            dismissButtons.forEach(btn => {
                btn.addEventListener('click', handleCancel, { once: true });
            });
            
            modal.show();
            
            setTimeout(() => {
                filenameInput.focus();
            }, 100);
        });
    }

    handleClearOpenedFiles() {
        const openedFilesToClose = [];
        for (const [filename, fileData] of this.editorService.getOpenFiles().entries()) {
            if (fileData.fileType === 'fileuploaded' || fileData.fileType === 'apifolder') {
                openedFilesToClose.push(filename);
            }
        }
        
        const clearedFiles = this.storageService.clearOpenedFiles();
        
        openedFilesToClose.forEach(filename => {
            this.editorService.removeTab(filename);
            this.editorService.getOpenFiles().delete(filename);
            this.editorService.breakpoints.delete(filename);
        });
        
        this.saveOpenedFilesList();
        this.renderOpenedFiles();
        
        if (openedFilesToClose.includes(this.editorService.getCurrentFile())) {
            const remaining = Array.from(this.editorService.getOpenFiles().keys());
            if (remaining.length > 0) {
                this.editorService.switchToFile(remaining[0]);
            } else {
                this.editorService.currentFile = '';
                this.editorService.editor.setValue('');
            }
        }
        
        this.updateTerminal('✅ Opened files cleared', 'output');
    }

    closeFromOpenedFilesList(filename) {
        const fileData = this.editorService.getOpenFiles().get(filename);
        const openedFileData = this.storageService.getOpenedFiles().get(filename);
        
        if (this.storageService.getOpenedFiles().has(filename)) {
            this.storageService.getOpenedFiles().delete(filename);
        }
        
        if ((fileData && fileData.fileType === 'fileuploaded') || (openedFileData && openedFileData.fileType === 'fileuploaded')) {
            this.removeFileFromStorage(filename);
        }
        
        this.editorService.getOpenFiles().delete(filename);
        this.editorService.breakpoints.delete(filename);
        
        if (this.editorService.getCurrentFile() === filename) {
            const remaining = Array.from(this.editorService.getOpenFiles().keys());
            if (remaining.length > 0) {
                this.editorService.switchToFile(remaining[0]);
            } else {    
                this.editorService.currentFile = '';
                this.editorService.editor.setValue('');
            }
        }
        
        this.saveOpenedFilesList();
        
        this.editorService.removeTab(filename);
        this.renderOpenedFiles();
        this.updateTerminal(`File ${filename} closed from opened files list`, 'output');
    }

    openFromOpenedFilesList(filename, fileData) {
        if (this.editorService.getOpenFiles().has(filename)) {
            this.editorService.switchToFile(filename);
        } else {
            let contentToUse = fileData.content;
            let originalContentToUse = fileData.originalContent || fileData.content;
            let modifiedToUse = fileData.modified || false;
            
            if (fileData.fileType === 'fileuploaded') {
                const savedContent = this.loadFileFromStorage(filename);
                if (savedContent !== null) {
                    originalContentToUse = savedContent;
                    modifiedToUse = contentToUse !== savedContent;
                } else {
                    originalContentToUse = contentToUse;
                    modifiedToUse = false;
                }
            }
            
            const fileDataForEditor = {
                content: contentToUse,
                originalContent: originalContentToUse,
                modified: modifiedToUse,
                breakpoints: new Set(),
                fileType: fileData.fileType || 'fileuploaded',
                originalFile: fileData.originalFile || { name: this.getFileDisplayName(filename, fileData) },
                displayName: this.getFileDisplayName(filename, fileData)
            };
            
            this.editorService.addFile(filename, fileDataForEditor);
            
            this.updateTerminal(`✅ Reopened file: ${this.getFileDisplayName(filename, fileData)}`, 'output');
        }
    }

    renderOpenedFiles() {
        const openedFilesSection = document.getElementById('openedFilesSection');
        const openedFilesList = document.getElementById('openedFilesList');
        
        if (!openedFilesSection || !openedFilesList) return;
        this.storageService.loadOpenedFilesList();
        if (this.storageService.hasOpenedFiles()) {
            openedFilesSection.style.display = 'block';
            
            const header = openedFilesSection.querySelector('.collapsible-header');
            const content = openedFilesSection.querySelector('.collapsible-content');
            header.classList.add('expanded');
            content.classList.add('expanded');
            const chevron = header.querySelector('.header-chevron');
            if (chevron) {
                chevron.classList.remove('fa-chevron-right');
                chevron.classList.add('fa-chevron-down');
            }
            
            openedFilesList.innerHTML = '';
            
            const sortedFiles = Array.from(this.storageService.getOpenedFiles().entries()).sort((a, b) => {
                return a[1].name.localeCompare(b[1].name);
            });
            
            sortedFiles.forEach(([filename, fileData]) => {
                const item = this.createOpenedFileItem(filename, fileData);
                openedFilesList.appendChild(item);
            });
        } else {
            openedFilesSection.style.display = 'none';
        }
        
        this.updateCollapsiblePanelHeight('openedFilesList');
    }

    createOpenedFileItem(filename, fileData) {
        const item = document.createElement('div');
        item.className = 'opened-file-item';
        item.dataset.filename = filename;
        
        if (filename === this.editorService.getCurrentFile()) {
            item.classList.add('active');
        }
        
        item.innerHTML = `
            <i class="file-icon fas fa-file-import"></i>
            <span class="file-name">${this.getFileDisplayName(filename, fileData)}</span>
            ${fileData.modified ? '<span class="file-modified">●</span>' : ''}
            <span class="file-close" title="Close file">×</span>
        `;
        
        item.addEventListener('click', () => {
            this.openFromOpenedFilesList(filename, fileData);
            this.updateOpenedFilesActiveState(filename);
        });
        
        const closeBtn = item.querySelector('.file-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.closeFromOpenedFilesList(filename);
            });
        }
        
        return item;
    }

    updateOpenedFilesActiveState(activeFilename) {
        document.querySelectorAll('.opened-file-item').forEach(item => {
            item.classList.remove('active');
        });
        
        const activeItem = document.querySelector(`[data-filename="${activeFilename}"]`);
        if (activeItem) {
            activeItem.classList.add('active');
        }
    }

    async loadLocalFiles() {
        try {
            await this.storageService.loadLocalFilesAndBuildTree();
            
        } catch (error) {
            console.error('Error loading local files:', error);
            this.updateTerminal(`❌ Error loading local files: ${error.message}`, 'output');
        }
    }


    renderLocalFiles() {
        const localFilesSection = document.getElementById('localFilesSection');
        const localFilesList = document.getElementById('localFilesList');
        
        if (!localFilesSection || !localFilesList) return;
        
        const fileTree = this.storageService.getFileTree();
        
        if (this.storageService.getLocalFiles().size > 0 && fileTree) {
            localFilesSection.style.display = 'block';
            
            localFilesList.innerHTML = '';
            
            if (fileTree.children && fileTree.children.length > 0) {
                fileTree.children.forEach(child => {
                    this.renderFileTreeNode(child, localFilesList);
                });
            }
        } else {
            localFilesSection.style.display = 'none';
        }
        
        this.updateCollapsiblePanelHeight('localFilesList');
    }

    renderFileTreeNode(node, container) {
        const nodeElement = document.createElement('div');
        nodeElement.className = 'file-tree-node';
        
        if (node.type === 'folder') {
            const folderElement = document.createElement('div');
            folderElement.className = `file-tree-folder ${node.expanded ? 'expanded' : ''}`;
            
            folderElement.innerHTML = `
                <div class="folder-chevron ${node.expanded ? 'expanded' : ''}">
                    <i class="fas fa-chevron-right"></i>
                </div>
                <i class="folder-icon fas fa-folder${node.expanded ? '-open' : ''}"></i>
                <span class="folder-name">${node.name}</span>
            `;
            
            folderElement.addEventListener('click', () => {
                node.expanded = !node.expanded;
                this.renderLocalFiles();
            });
            
            nodeElement.appendChild(folderElement);
            
            if (node.children.length > 0) {
                const childrenContainer = document.createElement('div');
                childrenContainer.className = `file-tree-children ${node.expanded ? 'expanded' : ''}`;
                
                node.children.forEach(child => {
                    this.renderFileTreeNode(child, childrenContainer);
                });
                
                nodeElement.appendChild(childrenContainer);
            }
        } else if (node.type === 'file') {
            const fileElement = document.createElement('div');
            fileElement.className = 'file-tree-file';
            fileElement.dataset.path = node.path;
            fileElement.title = `Local file: ${node.path}`;
            
            fileElement.innerHTML = `
                <i class="file-icon fas fa-file-code"></i>
                <span class="file-name">${node.name}</span>
            `;

            fileElement.addEventListener('click', () => {
                this.loadLocalFile(node.path);
                this.updateFileTreeActiveState(node.path);
            });
            
            nodeElement.appendChild(fileElement);
        }
        
        container.appendChild(nodeElement);
    }
    
    updateFileTreeActiveState(activePath) {
        document.querySelectorAll('.file-tree-file').forEach(file => {
            file.classList.remove('active');
        });
        
        const activeFile = document.querySelector(`[data-path="${activePath}"]`);
        if (activeFile) {
            activeFile.classList.add('active');
        }
    }

    async loadLocalFile(path) {
        try {
            const fileData = this.storageService.getLocalFiles().get(path);
            if (!fileData) {
                throw new Error(`Local file ${path} not found`);
            }

            const filename = `local_${path.replace(/[\/\\]/g, '_')}`;
            
            const fileDataForEditor = {
                content: fileData.content,
                originalContent: fileData.content,
                modified: false,
                breakpoints: new Set(),
                fileType: 'apifolder',
                localPath: path,
                handle: fileData.handle,
                displayName: path.split('/').pop()
            };
            
            this.editorService.addFile(filename, fileDataForEditor);
            
            this.debugService.loadBreakpointsForFile(filename);
            
            this.updateFileTreeActiveState(path);
            
            this.renderOpenedFiles();
            
            this.updateTerminal(`✅ Local file ${path} loaded`, 'output');
            
        } catch (error) {
            this.updateTerminal(`❌ Error loading local file ${path}: ${error.message}`, 'output');
            console.error('Load local file error:', error);
        }
    }

    updateCurrentLineDisplay(debugResult) {
        
        this.debugService.clearCurrentLineHighlight();
        
        let location = null;
        
        if (debugResult && debugResult.location) {
            location = {
                filename: debugResult.location.file,
                lineNumber: debugResult.location.line
            };
        }   
        else if (debugResult && debugResult.stackFrames && debugResult.stackFrames.length > 0) {
            const currentFrame = debugResult.stackFrames[0];
            location = this.debugService.parseStackFrameLocation(currentFrame);
        }
        
        
        if (location && location.filename && location.lineNumber) {
            this.debugService.highlightCurrentLine(location.filename, location.lineNumber);
        } 
    }

    updateFileStatus() {
        const statusItem = document.getElementById('statusBarPosition');
        if (statusItem) {
            const position = this.editorService.getCurrentPosition();
            statusItem.textContent = `Ln ${position?.lineNumber || 1}, Col ${position?.column || 1}`;
        }
        
        document.querySelectorAll('.example-item').forEach(item => {
            item.classList.toggle('active', item.dataset.file === this.editorService.getCurrentFile());
        });
    }

    updateStatus(message, type = 'info') {
        const statusBar = document.getElementById('statusBarInfo');
        const icons = {
            success: 'check-circle',
            error: 'exclamation-triangle',
            warning: 'exclamation-triangle',
            info: 'info-circle',
            loading: 'spinner'
        };
        const iconClass = type === 'loading' ? 'fas fa-spinner fa-spin' : `fas fa-${icons[type]}`;
        if (statusBar) {
            statusBar.innerHTML = `<i class="${iconClass}"></i> ${message}`;
        }
    }

    updateTerminal(message, terminal = null) {
        if (this.editorService.outputEditor) {
            const timestamp = new Date().toLocaleTimeString();
            const currentContent = this.editorService.outputEditor.getValue();
            const newContent = currentContent + `\n[${timestamp}] ${message}`;
            this.editorService.outputEditor.setValue(newContent);
            
            const lineCount = this.editorService.outputEditor.getModel().getLineCount();
            this.editorService.outputEditor.revealLine(lineCount);
            this.editorService.outputEditor.setPosition({ lineNumber: lineCount, column: 1 });
        }
    }

    /**
     * Clear output terminal
     */
    clearOutput() {
        this.editorService.clearOutput();
    }
    

    clearOutputEditor() {
        if (this.editorService.outputEditor) {
            this.editorService.outputEditor.setValue('');
            this.updateTerminal('✨ Output cleared', 'output');
        }
        this.clearEducationalPanel();
    }

    clearEducationalPanel() {
        this.updateEducationalPanel('');
    }

    displayEducationalResult(result, inputParams = null) {
        if (!this.editorService.getCurrentFile()?.includes('examples/')) return;
        
        let parsedResult = result || 'No output';
        if (result && result.match(/^\s*\(/)) {
            try {
                parsedResult = this.parseChialispToJson(result);
            } catch (e) {
                parsedResult = result;
            }
        }
        
        let content = `<div class="educational-json-content">`;
        
        if (inputParams?.curriedParams) {
            content += `Curry: ${inputParams.curriedParams}\n`;
        }
        content += `Solution: ${inputParams?.solutionParams || '()'}\n`;
        if (inputParams?.cost !== undefined && inputParams?.cost !== null) {
            content += `Cost: ${inputParams.cost}\n`;
        }
        
        content += `\n${parsedResult}`;
        
        if (result && parsedResult !== result) {
            content += `\n\nRaw Result:\n${result}`;
        }
        
        content += `</div>`;
        
        this.showEducationalPanel();
        document.getElementById('educational-output').innerHTML = content;
    }

    parseChialispToJson(result) {
        const trimmed = result.trim();
        if (!trimmed.startsWith('(') || !trimmed.endsWith(')')) {
            return result;
        }
        
        const stringListMatch = trimmed.match(/^\(\s*(".*?"(?:\s+".*?")*)\s*\)$/);
        if (stringListMatch) {
            const strings = stringListMatch[1].match(/".*?"/g) || [];
            const jsonData = {};
            strings.forEach((str, i) => {
                jsonData[`${i + 1}`] = str.slice(1, -1);
            });
            return this.conditionsService.formatJSON(jsonData);
        }
        
        const labelValueMatch = trimmed.match(/^\(\s*(\(.*?\)(?:\s*\(.*?\))*)\s*\)$/);
        if (labelValueMatch) {
            const pairs = this.conditionsService.extractPairs(labelValueMatch[1]);
            const hasQuotedKeys = pairs.some(pair => 
                pair.match(/\(\s*"[^"]*":?\s+/)
            );
            
            if (hasQuotedKeys) {
                const jsonData = {};
                pairs.forEach(pair => {
                    const pairMatch = pair.match(/\(\s*"([^"]*):?"\s+(.*)\s*\)$/);
                    if (pairMatch) {
                        const key = pairMatch[1].replace(/:$/, '');
                        let value = pairMatch[2].trim();
                        
                        if (value.startsWith('(') && value.endsWith(')')) {
                            if (value.includes('"')) {
                                const parts = value.match(/"[^"]*"|\([^)]*\)|[^()\s]+/g) || [];
                                value = parts.join(' ');
                            }
                        } else if (value === '()') {
                            value = '()';
                        } else if (value.startsWith('"') && value.endsWith('"')) {
                            value = value.slice(1, -1);
                        }
                        jsonData[key] = value;
                    }
                });
                return this.conditionsService.formatJSON(jsonData);
            }
        }
        
        const conditionCodesResult = this.conditionsService.parseConditionCodes(trimmed);
        if (conditionCodesResult) {
            return conditionCodesResult;
        }
        
        return result;
    }

    updateEducationalPanel(html) {
        const educationalOutput = document.getElementById('educational-output');
        if (educationalOutput) {
            educationalOutput.innerHTML = html;
        }
    }

    hideEducationalTab() {
        const educationalTab = document.querySelector('[data-panel="educational"]');
        if (educationalTab) {
            educationalTab.classList.remove('show');
            if (educationalTab.classList.contains('active')) {
                const outputTab = document.querySelector('[data-panel="output"]');
                if (outputTab) {
                    outputTab.click();
                }
            }
        }
    }

    /**
     * Show and switch to educational panel in one operation
     */
    showEducationalPanel() {
        const educationalTab = document.querySelector('[data-panel="educational"]');
        if (educationalTab) {
            educationalTab.classList.add('show');
            educationalTab.click();
        }
    }

    async saveFile() {

        const fileData = this.editorService.getOpenFiles().get(this.editorService.getCurrentFile());
        if (!fileData) {
            this.updateTerminal('⚠️ No file to save', 'output');
            return;
        }

        try {
            const currentContent = this.editorService.editor.getValue();
            fileData.content = currentContent;

            switch (fileData.fileType) {
                case 'example':
                    this.updateTerminal('⚠️ Example changes are temporary and will reset on page reload', 'output');
                    break;
                    
                case 'apifolder':
                    if (fileData.handle) {
                        await this.saveLocalFile(this.editorService.getCurrentFile(), fileData);
                    } else {
                        this.updateTerminal('❌ No file handle available for local file', 'output');
                    }
                    break;
                    
                case 'fileuploaded':
                    this.saveCurrentFile();
                    break;
                    
                default:
                    this.updateTerminal('❌ Unknown file type', 'output');
            }
        } catch (error) {
            this.updateTerminal(`❌ Error saving file: ${error.message}`, 'output');
            console.error('Save error:', error);
        }
    }

    saveCurrentFile() {
        if (!this.editorService.getCurrentFile()) return;
        
        const fileData = this.editorService.getOpenFiles().get(this.editorService.getCurrentFile());
        if (!fileData) return;
        
        const currentContent = this.editorService.editor.getValue();
        
        fileData.content = currentContent;
        
        if (this.storageService.getOpenedFiles().has(this.editorService.getCurrentFile())) {
            const openedFileData = this.storageService.getOpenedFiles().get(this.editorService.getCurrentFile());
            openedFileData.content = currentContent;
        }
        
        if (fileData.fileType === 'fileuploaded') {
            this.saveFileToStorage(this.editorService.getCurrentFile(), fileData);
        }
        
        this.saveOpenedFilesList();
        
        this.updateTerminal(`✅ File saved: ${this.getFileDisplayName(this.editorService.getCurrentFile(), fileData)}`, 'output');
    }

    saveOpenedFilesList() {
        this.storageService.saveOpenedFilesList(this.storageService.getOpenedFiles());
    }

    downloadCurrentFile() {
        if (!this.editorService.getCurrentFile()) {
            this.updateTerminal('❌ No file selected for download', 'output');
            return;
        }

        const fileData = this.editorService.getOpenFiles().get(this.editorService.getCurrentFile());
        if (!fileData) {
            this.updateTerminal('❌ File data not found', 'output');
            return;
        }

        let downloadName;
        const filename = this.editorService.getCurrentFile();
        
        if (fileData.originalFile && fileData.originalFile.name) {
            downloadName = fileData.originalFile.name;
        } else if (fileData.displayName) {
            downloadName = fileData.displayName.endsWith('.clsp') ? fileData.displayName : `${fileData.displayName}.clsp`;
        } else if (filename) {
            const cleanName = filename.replace(/^(file_|opened_|local_)/, '');
            downloadName = cleanName.endsWith('.clsp') ? cleanName : `${cleanName}.clsp`;
        } else {
            downloadName = 'chialisp_file.clsp';
        }
        
        const blob = new Blob([fileData.content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = (downloadName && downloadName.endsWith('.clsp')) ? downloadName : `${downloadName || 'file'}.clsp`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        URL.revokeObjectURL(url);
        
        this.updateTerminal(`✅ File downloaded: ${a.download}`, 'output');
    }

    getFileDisplayName(filename, fileData) {
        if (fileData?.originalFile?.name) {
            return fileData.originalFile.name;
        }
        
        if (fileData?.name) {
            return fileData.name.replace(/^(opened_|file_|folder_|example_)/, '');
        }
        
        let cleanName = filename.replace(/^(opened_|file_|folder_|example_)/, '');
        
        if (cleanName.includes('/')) {
            cleanName = cleanName.split('/').pop();
        }
        
        return cleanName;
    }

    saveFileToStorage(filename, fileData) {
        try {
            if (fileData.fileType !== 'fileuploaded') return;
            
            this.storageService.saveUploadedFile(filename, fileData);
            
            fileData.originalContent = fileData.content;
            fileData.modified = false;
            
            if (this.storageService.getOpenedFiles().has(filename)) {
                const openedFileData = this.storageService.getOpenedFiles().get(filename);
                openedFileData.originalContent = fileData.content;
                openedFileData.modified = false;
            }
            
            this.editorService.markTabModified(filename, false);
            
        } catch (error) {
            console.warn('⚠️ Error saving file to localStorage:', error);
        }
    }

    loadFileFromStorage(filename) {
        try {
            if (this.editorService.getOpenFiles().has(filename)) {
                return this.editorService.getOpenFiles().get(filename).content;
            }
            
            const fileData = this.storageService.loadUploadedFile(filename);
            return fileData ? fileData.content : null;
            
        } catch (error) {
            console.warn('⚠️ Error loading file from localStorage:', error);
            return null;
        }
    }

    removeFileFromStorage(filename) {
        this.storageService.removeUploadedFile(filename);
    }

    async saveLocalFile(filename, fileData) {
        try {
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
            
            if (this.storageService.getLocalFiles().has(fileData.localPath)) {
                const localFileData = this.storageService.getLocalFiles().get(fileData.localPath);
                localFileData.content = fileData.content;
            }
            
            fileData.modified = false;
            fileData.originalContent = fileData.content;
            
            this.editorService.markTabModified(filename, false);
            this.updateTerminal(`✅ File saved: ${fileData.localPath}`, 'output');
            
        } catch (error) {
            throw new Error(`Failed to save local file: ${error.message}`);
        }
    }


    async compileCode() {
        
        try {
            const defaultParams = this.getFileParameters(this.editorService.getCurrentFile());
            const sourceCode = this.editorService.editor.getValue();
            const filename = this.editorService.getCurrentFile();
            
            const buildParams = await this.compilationService.showBuildModal(defaultParams,
                (userParams) => this.compileCodeOperation(sourceCode, filename, userParams)
            );
            
            const result = buildParams.result;
            
            this.updateTerminal('✅ Compilation successful', 'output');
            this.updateTerminal('', 'output');
            
            if (result.curriedHash) {
                this.updateTerminal(`🧩 Puzzle hash: ${result.curriedHash}`, 'output');
            }
            else{
                this.updateTerminal(`🧩 Puzzle hash: ${result.originalHash}`, 'output');
            }
                
            
            this.updateTerminal('', 'output');
            this.updateTerminal(`📋 Compiled hex output (${result.hex.length} characters):`, 'output');
            this.updateTerminal(result.hex, 'output');
            this.updateTerminal('', 'output');
            this.updateTerminal(`Symbol count: ${Object.keys(result.symbols || {}).length}`, 'output');
            
            
            const clvmOutput = document.getElementById('clvmPanel');
            if (clvmOutput) {
                const compiledResult = `; Build result for: ${this.editorService.getCurrentFile()}
; Curry params: ${buildParams.curriedParams || '(none)'}

; Compiled hex (${result.hex.length} characters):
${result.hex}

; Puzzle Hash:
${result.hash}

; Symbols (${Object.keys(result.symbols || {}).length} entries):
${JSON.stringify(result.symbols || {}, null, 2)}`;
                clvmOutput.querySelector('.clvm-output').textContent = compiledResult;
            }
            
        } catch (error) {
            if (error.message === 'Modal cancelled') {
                this.updateTerminal('Build cancelled by user', 'output');
                this.updateStatus('Build cancelled', 'info');
            } else {
                this.updateTerminal(`❌ Build error: ${error.message}`, 'output');
                this.updateStatus('Compilation failed', 'error');
                console.error('Build error:', error);
            }
        }
    }

    /**
     * Execute run code operation - called from modal callback
     */
    async runCodeOperation(sourceCode, filename, { curriedParams, solutionParams }) {
        this.storageService.saveFileParameters(filename, curriedParams, solutionParams);
        
        this.updateTerminal('🚀 Running program...', 'output');
        this.updateTerminal(`Curry params: ${curriedParams || '(none)'}`, 'output');
        this.updateTerminal(`Solution params: ${solutionParams}`, 'output');

        return await this.compilationService.runCode(sourceCode, filename, { curriedParams, solutionParams });
    }

    /**
     * Execute compile code operation - called from modal callback
     */
    async compileCodeOperation(sourceCode, filename, { curriedParams }) {
        this.updateTerminal('🔨 Compiling...', 'output');
        
        if (curriedParams) {
            this.updateTerminal(`Curry params: ${curriedParams}`, 'output');
        }
        
        return await this.compilationService.compileCode(sourceCode, filename, { curriedParams });
    }

    /**
     * Execute debug operation - called from modal callback
     */
    async debugOperation( filename, { curriedParams, solutionParams }) {
        this.storageService.saveFileParameters(filename, curriedParams, solutionParams);
        
        let args = [];
        if (solutionParams && solutionParams !== '()') {
            args.push(solutionParams);
        }
        
        this.updateTerminal('🚀 Starting debug session...', 'output');
        this.updateTerminal(`Arguments: ${args.length > 0 ? args.join(', ') : '(none)'}`, 'output');
        
        return await this.debugService.startDebugging( filename, args);
    }
    
    async runCode() {
       
        let result = null;
        let params = null;
        try {
            const defaultParams = this.getFileParameters(this.editorService.getCurrentFile());
            const sourceCode = this.editorService.editor.getValue();
            const filename = this.editorService.getCurrentFile();
            
            params = await this.compilationService.showArgumentsModal(false, defaultParams, 
                (userParams) => this.runCodeOperation(sourceCode, filename, userParams)
            );
            
            result = params.result;
            
            this.updateTerminal('✅ Program executed successfully', 'output');
            
            if (result.hash !== result.compilation.hash) {
                this.updateTerminal(`🧩 Puzzle hash: ${result.hash}`, 'output');
            }
            else{
                this.updateTerminal(`🧩 Puzzle hash: ${result.compilation.hash}`, 'output');
            }
            
            this.updateTerminal(`Cost: ${result.cost || 'unknown'}`, 'output');
            this.updateTerminal(`Result: ${result.result}`, 'output');
            
            this.displayEducationalResult(result.result, {
                curriedParams: params.curriedParams,
                solutionParams: params.solutionParams,
                cost: result.cost
            });
            
            const clvmOutput = document.getElementById('clvmPanel');
            if (clvmOutput) {
                let hashSection = `; Original puzzle hash:
${result.compilation.hash}`;
                
                if (result.hash !== result.compilation.hash) {
                    hashSection += `

; Curried puzzle hash:
${result.hash}`;
                }
                
                const clvmResult = `; Execution result for: ${this.editorService.getCurrentFile()}
; Curry params: ${params.curriedParams || '(none)'}
; Solution params: ${params.solutionParams}

; Compiled hex:
${result.compilation.hex}

${hashSection}

; Execution result:
; Output: ${result.result}
; Cost: ${result.cost}
; Result hex: ${result.hex}`;
                clvmOutput.querySelector('.clvm-output').textContent = clvmResult;
            }

        } catch (error) {
            if (error.message === 'Modal cancelled') {
                this.updateTerminal('Execution cancelled by user', 'output');
                this.updateStatus('Run cancelled', 'info');
            } else {
                this.updateTerminal(`❌ Error running program: ${error.message}`, 'output');
                this.updateStatus('Execution failed', 'error');
                console.error('Execution error:', error);
                this.displayEducationalResult(error.message, {
                    curriedParams: "",
                    solutionParams: "",
                    cost: "unknown"
                });
            }
        }
    }



    /**
     * Handle start debugging - Promise-based UI coordination
     */
    async handleStartDebugging() {
       

        try {
            this.switchSidebarView('debug');
            
            const defaultParams = this.getFileParameters(this.editorService.getCurrentFile());
            
            const filename = this.editorService.getCurrentFile();
            
            const params = await this.compilationService.showArgumentsModal(true, defaultParams,
                (userParams) => this.debugOperation( filename, userParams)
            );
            
            const result = params.result;
            
            if (result.success) {
                
                if (result.location) {
                    this.updateTerminal(`Location: ${result.location.filename}:${result.location.lineNumber}`, 'output');
                }
                
                this.showDebugToolbar();
                
                
                this.updateDebugViews(result);
                
            } else {
                this.updateTerminal(`❌ Debug error: ${result.message}`, 'output');
                this.updateStatus('Debug failed', 'error');
            }
            
        } catch (error) {
            if (error.message === 'Modal cancelled') {
                this.updateTerminal('Debug cancelled by user', 'output');
                this.updateStatus('Debug cancelled', 'info');
            } else {
                this.updateTerminal(`❌ Error starting debug: ${error.message}`, 'output');
                this.updateStatus('Debug failed', 'error');
                console.error('Debug start error:', error);
            }
        }
    }

    /**
     * Handle continue debugging - Promise-based UI coordination
     */
    async handleContinueDebugging() {
        try {
            this.updateTerminal('▶️ Continue...', 'output');
            
            const result = await this.debugService.continueDebugging();
            this.switchSidebarView('explorer');
            if (result.success) {
                if (result.finished) {
                    this.updateTerminal('✅ Program execution completed', 'output');
                    this.updateDebugViews(result);
                } else {
                    this.updateTerminal('Execution resumed', 'output');
                    this.updateDebugViews(result);
                }
            } else {
                this.updateTerminal(`❌ Continue error: ${result.message}`, 'output');
            }
            
        } catch (error) {
            this.updateTerminal(`❌ Continue error: ${error.message}`, 'output');
            console.error('Continue debug error:', error);
        }
    }

    /**
     * Handle step over - Promise-based UI coordination
     */
    async handleStepOver() {
        try {
            this.updateTerminal('👆 Step Over...', 'output');
            
            const result = await this.debugService.stepOver();
            
            if (result.success) {
                if (result.finished) {
                    this.updateTerminal('✅ Program execution completed', 'output');
                    this.updateDebugViews(result);
                } else {
                    this.updateTerminal('Step over completed', 'output');
                    this.updateDebugViews(result);
                }
            } else {
                this.updateTerminal(`❌ Step over error: ${result.message}`, 'output');
            }
            
        } catch (error) {
            this.updateTerminal(`❌ Step over error: ${error.message}`, 'output');
            console.error('Step over error:', error);
        }
    }

    /**
     * Handle step into - Promise-based UI coordination
     */
    async handleStepInto() {
        try {
            this.updateTerminal('👇 Step Into...', 'output');
            
            const result = await this.debugService.stepInto();
            
            if (result.success) {
                if (result.finished) {
                    this.updateTerminal('✅ Program execution completed', 'output');
                    this.updateDebugViews(result);
                } else {
                    this.updateTerminal('Step into completed', 'output');
                    this.updateDebugViews(result);
                }
            } else {
                this.updateTerminal(`❌ Step into error: ${result.message}`, 'output');
            }
            
        } catch (error) {
            this.updateTerminal(`❌ Step into error: ${error.message}`, 'output');
            console.error('Step into error:', error);
        }
    }

    async handleStopDebugging() {
        this.debugService.stopDebugging();
        this.hideDebugToolbar();
        this.clearDebugViews();
        this.switchSidebarView('explorer');

    }

    /**
     * Handle step out - Promise-based UI coordination
     */
    async handleStepOut() {
        try {
            this.updateTerminal('👆 Step Out...', 'output');
            
            const result = await this.debugService.stepOut();
            
            if (result.success) {
                if (result.finished) {
                    this.updateTerminal('✅ Program execution completed', 'output');
                    this.updateDebugViews(result);
                } else {
                    this.updateTerminal('Step out completed', 'output');
                    this.updateDebugViews(result);
                }
            } else {
                this.updateTerminal(`❌ Step out error: ${result.message}`, 'output');
            }
            
        } catch (error) {
            this.updateTerminal(`❌ Step out error: ${error.message}`, 'output');
            console.error('Step out error:', error);
        }
    }



    /**
     * Handle toggle breakpoint - Promise-based UI coordination
     */
    async handleToggleBreakpoint(filename, lineNumber) {
        try {
            const result = await this.debugService.toggleBreakpoint(filename, lineNumber);
            
            if (result.success) {
                const action = result.added ? 'added' : 'removed';
                this.updateTerminal(`Breakpoint ${action} at line ${lineNumber}`, 'output');
                
                this.updateBreakpointsView();
            } else {
                this.updateTerminal(`❌ Breakpoint error: ${result.message}`, 'output');
            }
            
        } catch (error) {
            this.updateTerminal(`❌ Breakpoint error: ${error.message}`, 'output');
            console.error('Breakpoint error:', error);
        }
    }

    /**
     * Show debug toolbar
     */
    showDebugToolbar() {
        const debugToolbar = document.getElementById('debugToolbar');
        if (debugToolbar) {
            debugToolbar.style.display = 'block';
            debugToolbar.dispatchEvent(new Event('debugReset'));
        }
    }

    /**
     * Hide debug toolbar
     */
    hideDebugToolbar() {
        const debugToolbar = document.getElementById('debugToolbar');
        if (debugToolbar) {
            debugToolbar.style.display = 'none';
        }
    }
    

    updateDebugViews(debugResult) {
        
        
        if (debugResult?.finished) {
            this.handleDebugFinished(debugResult);
            return;
        } 
        
        const debugView = document.getElementById('debugView');
        
        if (debugView && !debugView.classList.contains('active')) {
            this.switchSidebarView('debug');
        }
        
        this.updateCurrentLineDisplay(debugResult);
        
        const variablesView = document.getElementById('variablesView');
        if (variablesView) {
            variablesView.innerHTML = '';
            
            if (debugResult.variables && Object.keys(debugResult.variables).length > 0) {
                for (const [scopeName, variables] of Object.entries(debugResult.variables)) {
                    const scopeDiv = document.createElement('div');
                    scopeDiv.innerHTML = `<strong>${scopeName}:</strong>`;
                    variablesView.appendChild(scopeDiv);
                    
                    if (Array.isArray(variables)) {
                        variables.forEach(variable => {
                            const varDiv = document.createElement('div');
                            varDiv.className = 'variable-item';
                            
                            const displayName = variable.displayName || variable.name;
                            const displayValue = variable.value;
                            
                            varDiv.innerHTML = `<span class="debug-variable-name">${displayName}</span>: <span class="debug-variable-value">${displayValue}</span>`;
                            
                            if (variable.originalName && variable.originalName !== variable.name) {
                                varDiv.title = `Original: ${variable.originalName}`;
                            }
                            
                            if (variable.isLongValue) {
                                varDiv.classList.add('expandable');
                                varDiv.addEventListener('click', () => {
                                    const valueSpan = varDiv.querySelector('.debug-variable-value');
                                    if (valueSpan.textContent.includes('...')) {
                                        valueSpan.textContent = variable.originalValue;
                                        varDiv.title = 'Click to collapse';
                                    } else {
                                        valueSpan.textContent = variable.value;
                                        varDiv.title = 'Click to expand';
                                    }
                                });
                                varDiv.title = 'Click to expand full value';
                            }
                            
                            variablesView.appendChild(varDiv);
                        });
                    }
                }
            } else {
                variablesView.innerHTML = '<div style="font-size: 12px; color: #858585; font-style: italic;">No variables</div>';
            }
        } 
        const callStackView = document.getElementById('callStackView');
        if (callStackView) {
            callStackView.innerHTML = '';
            
            if (debugResult.stackFrames && debugResult.stackFrames.length > 0) {
                debugResult.stackFrames.forEach((frame, index) => {
                    const frameDiv = document.createElement('div');
                    frameDiv.className = 'debug-callstack-item';
                    frameDiv.innerHTML = `
                        <div class="debug-callstack-function">Frame ${index}: ${frame.name || 'unknown'}</div>
                        <div class="debug-callstack-location">Line ${frame.line || '?'}</div>
                    `;
                    callStackView.appendChild(frameDiv);
                });
            } else {
                callStackView.innerHTML = '<div style="font-size: 12px; color: #858585; font-style: italic;">No stack frames</div>';
            }
        }
        
        this.updateBreakpointsView();
        
        if (debugResult.location) {
            this.updateTerminal(`📍 Current location: ${debugResult.location.file}:${debugResult.location.line}:${debugResult.location.column}`, 'output');
        }
        
    }

    /**
     * Handle debug session finished
     * @param {Object} debugResult - Debug result containing final result
     */
    handleDebugFinished(debugResult) {
        try {
            if (debugResult.finalResult) {
                const finalMessage = `🎉 Debug session completed successfully!\n\nFinal Result:\n${debugResult.finalResult}`;
                this.updateTerminal(finalMessage, 'output');
            } else {
                this.updateTerminal('🎉 Debug session completed successfully!', 'output');
            }
            
            this.debugService.clearCurrentLineHighlight();
            
            this.hideDebugToolbar();
            
            this.clearDebugViews();
            
            this.isDebugging = false;
            this.updateStatus('Ready', 'success');
            
        } catch (error) {
            console.error('❌ Error handling debug finished:', error);
            this.updateTerminal(`❌ Error finishing debug session: ${error.message}`, 'output');
        }
    }

    /**
     * Clear debug views when session ends
     */
    clearDebugViews() {
        
        const variablesView = document.getElementById('variablesView');
        if (variablesView) {
            variablesView.innerHTML = '<div style="font-size: 12px; color: #858585; font-style: italic;">Not debugging</div>';
        }
        
        const callStackView = document.getElementById('callStackView');
        if (callStackView) {
            callStackView.innerHTML = '<div style="font-size: 12px; color: #858585; font-style: italic;">Not debugging</div>';
        }
        
        const breakpointsList = document.getElementById('breakpointsList');
        if (breakpointsList) {
            breakpointsList.innerHTML = '<div style="font-size: 12px; color: #858585; font-style: italic;">No breakpoints</div>';
        }
    }
    
    updateBreakpointsView() {
        const breakpointsList = document.getElementById('breakpointsList');
        if (!breakpointsList) return;
        
        breakpointsList.innerHTML = '';
        
        let hasBreakpoints = false;
        for (const [filename, fileBreakpoints] of this.editorService.breakpoints.entries()) {
            if (fileBreakpoints.size > 0) {
                hasBreakpoints = true;
                
                const fileDiv = document.createElement('div');
                fileDiv.className = 'breakpoint-file';
                fileDiv.textContent = filename;
                breakpointsList.appendChild(fileDiv);
                
                Array.from(fileBreakpoints)
                    .sort((a, b) => a - b)
                    .forEach(lineNumber => {
                        const bpDiv = document.createElement('div');
                        bpDiv.className = 'breakpoint-item';
                        bpDiv.dataset.filename = filename;
                        bpDiv.dataset.lineNumber = lineNumber;
                        bpDiv.innerHTML = `
                            <span class="breakpoint-indicator">🔴</span>
                            <span class="breakpoint-location">Line ${lineNumber}</span>
                            <span class="breakpoint-remove">×</span>
                        `;
                        breakpointsList.appendChild(bpDiv);
                    });
            }
        }
        
        if (!hasBreakpoints) {
            breakpointsList.innerHTML = '<div style="font-size: 12px; color: #858585; font-style: italic;">No breakpoints</div>';
        }
        
        this._setupBreakpointEvents();
    }

    /**
     * Setup event delegation for breakpoint interactions
     * @private
     */
    _setupBreakpointEvents() {
        const breakpointsList = document.getElementById('breakpointsList');
        if (!breakpointsList) return;
        
        breakpointsList.removeEventListener('click', this._handleBreakpointClick);
        
        this._handleBreakpointClick = (e) => {
            const breakpointItem = e.target.closest('.breakpoint-item');
            if (!breakpointItem) return;
            
            const filename = breakpointItem.dataset.filename;
            const lineNumber = parseInt(breakpointItem.dataset.lineNumber);
            
            if (e.target.classList.contains('breakpoint-remove')) {
                e.stopPropagation();
                this.handleToggleBreakpoint(filename, lineNumber);
            } else {
                if (this.editorService.getCurrentFile() === filename) {
                    this.editorService.editor.revealLineInCenter(lineNumber);
                    this.editorService.editor.setPosition({ lineNumber, column: 1 });
                }
            }
        };
        
        breakpointsList.addEventListener('click', this._handleBreakpointClick);
    }

    showFinalResult(result) {
        
        if (result.variables && Object.keys(result.variables).length > 0) {
            
            for (const [scopeName, scopeVars] of Object.entries(result.variables)) {
                
                if (Array.isArray(scopeVars)) {
                    const resultVar = scopeVars.find(variable => variable.name === '_result');
                    if (resultVar) {
                        this.updateTerminal(`📊 Final Result: ${resultVar.value}`, 'output');
                        return;
                    }
                    
                    const possibleResultVars = scopeVars.filter(variable => 
                        variable.name.toLowerCase().includes('result') ||
                        variable.name.toLowerCase().includes('output') ||
                        variable.name.toLowerCase().includes('return') ||
                        variable.name.toLowerCase().includes('value')
                    );
                    
                    if (possibleResultVars.length > 0) {
                        for (const variable of possibleResultVars) {
                            this.updateTerminal(`📊 ${variable.name}: ${variable.value}`, 'output');
                        }
                        return;
                    }
                }
            }
            
            this.updateTerminal('📊 Final Variables:', 'output');
            for (const [scopeName, scopeVars] of Object.entries(result.variables)) {
                if (Array.isArray(scopeVars) && scopeVars.length > 0) {
                    this.updateTerminal(`  ${scopeName}:`, 'output');
                    for (const variable of scopeVars) {
                        this.updateTerminal(`    ${variable.name}: ${variable.value}`, 'output');
                    }
                }
            }
        } else {
            this.updateTerminal('📊 Program completed (no final variables available)', 'output');
        }

        if (result.terminatedEvent) {
            this.updateTerminal('📋 Program terminated successfully', 'output');
        }
    }

    renderExamplesTree() {
        const examplesContainer = document.querySelector('.examples-tree');
        if (!examplesContainer) return;
        
        examplesContainer.innerHTML = '';
        
        const examplesData = this.examplesService.getExamplesData();
        
        if (examplesData.welcome) {
            const welcomeItem = this.createExampleTreeNode('welcome', examplesData.welcome, 'file');
            examplesContainer.appendChild(welcomeItem);
        }
        
        const sortedModules = Object.entries(examplesData.modules)
            .sort((a, b) => {
                const levelA = a[1].level || 0;
                const levelB = b[1].level || 0;
                if (levelA !== levelB) return levelA - levelB;
                
                const nameA = a[1].name || '';
                const nameB = b[1].name || '';
                return nameA.localeCompare(nameB);
            });
        
        sortedModules.forEach(([moduleKey, module]) => {
            if (!module.examples) return;
            
            const moduleNode = this.createExampleTreeNode(moduleKey, module, 'folder');
            examplesContainer.appendChild(moduleNode);
        });
    }
    
    createExampleTreeNode(key, data, type) {
        const nodeElement = document.createElement('div');
        nodeElement.className = 'example-tree-node';
        
        if (type === 'folder') {
            const folderElement = document.createElement('div');
            folderElement.className = 'example-tree-folder';
            folderElement.dataset.moduleKey = key;
            
            folderElement.innerHTML = `
                <div class="folder-chevron">
                    <i class="fas fa-chevron-right"></i>
                </div>
                <i class="folder-icon fas fa-folder"></i>
                <span class="folder-name">${data.name || key}</span>
                <span class="example-count">(${Object.keys(data.examples).length})</span>
            `;
            
            folderElement.addEventListener('click', (e) => {
                e.stopPropagation();
                const childrenContainer = folderElement.nextElementSibling;
                const chevron = folderElement.querySelector('.folder-chevron');
                const icon = folderElement.querySelector('.folder-icon');
                
                if (childrenContainer.style.display === 'none') {
                    childrenContainer.style.display = 'block';
                    chevron.classList.add('expanded');
                    icon.className = 'folder-icon fas fa-folder-open';
                    folderElement.classList.add('expanded');
                } else {
                    childrenContainer.style.display = 'none';
                    chevron.classList.remove('expanded');
                    icon.className = 'folder-icon fas fa-folder';
                    folderElement.classList.remove('expanded');
                }
            });
            
            nodeElement.appendChild(folderElement);
            
            if (data.examples && Object.keys(data.examples).length > 0) {
                const childrenContainer = document.createElement('div');
                childrenContainer.className = 'example-tree-children';
                childrenContainer.style.display = 'none';
                
                const sortedExamples = this.sortExamplesByOrder(Object.entries(data.examples));
                
                sortedExamples.forEach(([exampleKey, example]) => {
                    const fullKey = `${key}_${exampleKey}`;
                    const exampleNode = this.createExampleTreeNode(fullKey, {
                        ...example,
                        moduleKey: key,
                        moduleName: data.name
                    }, 'file');
                    childrenContainer.appendChild(exampleNode);
                });
                
                nodeElement.appendChild(childrenContainer);
            }
        } else if (type === 'file') {
            const fileElement = document.createElement('div');
            fileElement.className = 'example-tree-file';
            fileElement.dataset.exampleKey = key;
            fileElement.title = `Example: ${data.name || key}`;
            
            const displayName = data.name || key;
            const icon = data.icon || 'fas fa-file-code';
            
            fileElement.innerHTML = `
                <i class="file-icon ${icon}"></i>
                <span class="file-name">${displayName}</span>
            `;
            
            fileElement.addEventListener('click', (e) => {
                e.stopPropagation();
                this.loadExample(key);
                this.updateExampleTreeActiveState(key);
            });
            
            nodeElement.appendChild(fileElement);
        }
        
        return nodeElement;
    }
    
    updateExampleTreeActiveState(activeKey) {   
        document.querySelectorAll('.example-tree-file').forEach(file => {
            file.classList.remove('active');
        });
        
        const activeFile = document.querySelector(`[data-example-key="${activeKey}"]`);
        if (activeFile) {
            activeFile.classList.add('active');
        }
    }

    /**
     * Setup panel switching for output/educational panels
     */
    setupPanelSwitching() {
        document.querySelectorAll('.panel-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.panel-section').forEach(p => p.classList.remove('active'));
                
                tab.classList.add('active');
                const panelId = tab.dataset.panel + 'Panel';
                document.getElementById(panelId)?.classList.add('active');
            });
        });
    }

    /**
     * Initialize panel resize functionality
     */
    initializePanelResize() {
        const resizeHandle = document.getElementById('panelResizeHandle');
        const bottomPanel = document.querySelector('.bottom-panel');
        const editorArea = document.querySelector('.editor-area');
        const collapseBtn = document.getElementById('collapseBtn');

        this.isResizing = false;
        this.startY = 0;
        this.startHeight = 0;
        this.isCollapsed = false;
        this.lastHeight = 250;

        if (resizeHandle && bottomPanel && editorArea) {
            resizeHandle.addEventListener('mousedown', (e) => {
                if (e.target.closest('.collapse-btn')) return;
                
                this.isResizing = true;
                this.startY = e.clientY;
                this.startHeight = parseInt(document.defaultView.getComputedStyle(bottomPanel).height, 10);
                document.addEventListener('mousemove', this.doResize.bind(this));
                document.addEventListener('mouseup', this.stopResize.bind(this));
                document.body.style.userSelect = 'none';
                e.preventDefault();
            });

            if (collapseBtn) {
                collapseBtn.addEventListener('click', this.toggleCollapse.bind(this));
            }
        }
    }

    /**
     * Handle panel resize during drag
     */
    doResize(e) {
        if (!this.isResizing) return;
        
        const bottomPanel = document.querySelector('.bottom-panel');
        const deltaY = this.startY - e.clientY;
        let newHeight = this.startHeight + deltaY;
        const minHeight = 48;
        const maxHeight = window.innerHeight * 0.7;
        
        if (newHeight > maxHeight) {
            newHeight = maxHeight;
        }
        
        if (newHeight >= minHeight) {
            bottomPanel.style.height = newHeight + 'px';
            this.lastHeight = newHeight;
            
            if (newHeight > minHeight && bottomPanel.classList.contains('collapsed')) {
                const mainContent = document.querySelector('.main-content');
                bottomPanel.classList.remove('collapsed');
                mainContent.classList.remove('panel-collapsed');
                const collapseBtn = document.getElementById('collapseBtn');
                if (collapseBtn) {
                    collapseBtn.classList.remove('collapsed');
                    collapseBtn.title = 'Collapse Panel';
                }
                this.isCollapsed = false;
            }
        } else if (newHeight < minHeight) {
            const mainContent = document.querySelector('.main-content');
            bottomPanel.style.height = minHeight + 'px';
            bottomPanel.classList.add('collapsed');
            mainContent.classList.add('panel-collapsed');
            const collapseBtn = document.getElementById('collapseBtn');
            if (collapseBtn) {
                collapseBtn.classList.add('collapsed');
                collapseBtn.title = 'Expand Panel';
            }
            this.isCollapsed = true;
            this.lastHeight = minHeight;
        }
        
    }

    /**
     * Stop panel resize
     */
    stopResize() {
        this.isResizing = false;
        document.removeEventListener('mousemove', this.doResize.bind(this));
        document.removeEventListener('mouseup', this.stopResize.bind(this));
        document.body.style.userSelect = '';
    }

    /**
     * Toggle panel collapse/expand
     */
    toggleCollapse() {
        const bottomPanel = document.querySelector('.bottom-panel');
        const collapseBtn = document.getElementById('collapseBtn');
        const mainContent = document.querySelector('.main-content');
        
        if (this.isCollapsed) {
            bottomPanel.style.height = this.lastHeight + 'px';
            bottomPanel.classList.remove('collapsed');
            collapseBtn.classList.remove('collapsed');
            collapseBtn.title = 'Collapse Panel';
            mainContent.classList.remove('panel-collapsed');
            this.isCollapsed = false;
        } else {
            this.lastHeight = parseInt(document.defaultView.getComputedStyle(bottomPanel).height, 10);
            bottomPanel.style.height = '48px';
            bottomPanel.classList.add('collapsed');
            collapseBtn.classList.add('collapsed');
            collapseBtn.title = 'Expand Panel';
            mainContent.classList.add('panel-collapsed');
            this.isCollapsed = true;
        }
        
        
        
    }
}

let playground = null;

document.addEventListener('DOMContentLoaded', () => {
    playground = new ChialispPlayground();
    window.playground = playground; // Make playground available globally
});