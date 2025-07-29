
class DebugService {
    constructor(editorService, storageService = null, debuggerInstance = null) {
        this.editorService = editorService;
        this.storageService = storageService;
        this.debuggerInstance = debuggerInstance;
        
        this.isDebugging = false;
        this.currentLocation = null;
        this.currentStackFrames = [];
        this.currentVariables = {};

    }

    /**
     * Initialize the debugging service
     * @returns {Promise<{success: boolean, message: string}>}
     */
    async initialize() {
        try {
                        
            if (!this.debuggerInstance.isReady()) {
                await this.debuggerInstance.initialize();
            }
            
            return { success: true, message: 'DebugService initialized successfully' };
            
        } catch (error) {
            console.error('❌ DebugService: Error initializing debugger:', error);
            return { success: false, message: `Failed to initialize debugger: ${error.message}` };
        }
    }

    /**
     * Check if debugger is ready
     * @returns {boolean}
     */
    isReady() {
        return this.debuggerInstance && this.debuggerInstance.isReady();
    }

    /**
     * Start debugging session
     * @param {string} filename 
     * @param {Array<string>} args 
     * @returns {Promise<{success: boolean, location: Object, variables: Object, stackFrames: Array, message: string}>}
     */
    async startDebugging( filename, args) {
        try {
            
            if (!this.isReady()) {
                return { success: false, message: 'Debugger not ready' };
            }

            this.isDebugging = true;
            
            const result = await this.debuggerInstance.debug(filename, args, this.storageService);
            
            if (result.success) {
                this.currentLocation = result.location;
                this.currentStackFrames = result.stackFrames || [];
                this.currentVariables = result.variables || {};
                
                if (this.editorService.breakpoints.has(filename)) {
                    const fileBreakpoints = this.editorService.breakpoints.get(filename);
                    if (fileBreakpoints.size > 0) {
                        await this.setBreakpoints(filename, Array.from(fileBreakpoints));
                    }
                }
                
                await this.loadBreakpointsForIncludedFiles();
                
                await this.navigateToLocation(this.currentLocation);
                
                return {
                    success: true,
                    location: this.currentLocation,
                    variables: this.currentVariables,
                    stackFrames: this.currentStackFrames,
                    message: 'Debug session started'
                };
            } else {
                this.isDebugging = false;
                return { success: false, message: result.message || 'Failed to start debugging' };
            }
            
        } catch (error) {
            this.isDebugging = false;
            console.error('❌ DebugService: Error starting debug:', error);
            return { success: false, message: `Debug start error: ${error.message}` };
        }
    }

    /**
     * Continue debugging execution
     * @returns {Promise<{success: boolean, location: Object, variables: Object, stackFrames: Array, finished: boolean}>}
     */
    async continueDebugging() {
        try {
            if (!this.isDebugging || !this.isReady()) {
                return { success: false, message: 'Not in debug session' };
            }

            const result = await this.debuggerInstance.continue();
            
            if (result.success) {
                this.currentLocation = result.location;
                this.currentStackFrames = result.stackFrames || [];
                this.currentVariables = result.variables || {};
                
                const finished = result.finished || result.isFinished || result.terminatedEvent || false;
                const stoppedAtBreakpoint = result.stoppedAtBreakpoint || false;
                
                if (finished) {
                    this.isDebugging = false;
                } 
                
                const finalResult = finished ? this.extractFinalResult(result.variables) : null;
                
                return {
                    success: true,
                    location: this.currentLocation,
                    variables: this.currentVariables,
                    stackFrames: this.currentStackFrames,
                    finished: finished,
                    stoppedAtBreakpoint: stoppedAtBreakpoint,
                    finalResult: finalResult
                };
            } else {
                if (result.message && result.message.includes('finished')) {
                    this.isDebugging = false;
                    return {
                        success: true,
                        location: null,
                        variables: {},
                        stackFrames: [],
                        finished: true
                    };
                }
                return { success: false, message: result.message || 'Continue failed' };
            }
            
        } catch (error) {
            console.error('❌ DebugService: Error in continue:', error);
            return { success: false, message: `Continue error: ${error.message}` };
        }
    }

    /**
     * Step over current line
     * @returns {Promise<{success: boolean, location: Object, variables: Object, stackFrames: Array}>}
     */
    async stepOver() {
        try {
            if (!this.isDebugging || !this.isReady()) {
                return { success: false, message: 'Not in debug session' };
            }

            const result = await this.debuggerInstance.stepOver();
            
            if (result.success) {
                this.currentLocation = result.location;
                this.currentStackFrames = result.stackFrames || [];
                this.currentVariables = result.variables || {};
                
                const finished = result.isFinished || result.terminatedEvent || false;
                
                if (finished) {
                    this.isDebugging = false;
                    
                    const finalResult = this.extractFinalResult(result.variables);
                    
                    return {
                        success: true,
                        location: null,
                        variables: {},
                        stackFrames: [],
                        finished: true,
                        finalResult: finalResult
                    };
                }
                
                return {
                    success: true,
                    location: this.currentLocation,
                    variables: this.currentVariables,
                    stackFrames: this.currentStackFrames
                };
            } else {
                if (result.message && result.message.includes('finished')) {
                    this.isDebugging = false;
                    
                    const finalResult = result.variables ? this.extractFinalResult(result.variables) : 'Program finished';
                    
                    return {
                        success: true,
                        location: null,
                        variables: {},
                        stackFrames: [],
                        finished: true,
                        finalResult: finalResult
                    };
                }
                return { success: false, message: result.message || 'Step over failed' };
            }
            
        } catch (error) {
            console.error('❌ DebugService: Error in step over:', error);
            return { success: false, message: `Step over error: ${error.message}` };
        }
    }

    /**
     * Step into current function
     * @returns {Promise<{success: boolean, location: Object, variables: Object, stackFrames: Array}>}
     */
    async stepInto() {
        
        try {
            if (!this.isDebugging || !this.isReady()) {
                console.error('❌ DebugService: Not in debug session or not ready');
                return { success: false, message: 'Not in debug session' };
            }

            const result = await this.debuggerInstance.step();
            
            if (result.success) {
                this.currentLocation = result.location;
                this.currentStackFrames = result.stackFrames || [];
                this.currentVariables = result.variables || {};
                
                const finished = result.isFinished || result.terminatedEvent || false;
                
                if (finished) {
                    
                    this.isDebugging = false;
                    
                    const finalResult = this.extractFinalResult(result.variables);
                    
                    
                    return {
                        success: true,
                        location: null,
                        variables: {},
                        stackFrames: [],
                        finished: true,
                        finalResult: finalResult
                    };
                }
                
                
                return {
                    success: true,
                    location: this.currentLocation,
                    variables: this.currentVariables,
                    stackFrames: this.currentStackFrames
                };
            } else {
                if (result.message && result.message.includes('finished')) {
                    this.isDebugging = false;
                    return {
                        success: true,
                        location: null,
                        variables: {},
                        stackFrames: [],
                        finished: true
                    };
                }
                return { success: false, message: result.message || 'Step into failed' };
            }
            
        } catch (error) {
            console.error('❌ DebugService: Error in step into:', error);
            return { success: false, message: `Step into error: ${error.message}` };
        }
    }

    /**
     * Step out of current function
     * @returns {Promise<{success: boolean, location: Object, variables: Object, stackFrames: Array}>}
     */
    async stepOut() {
        try {
            if (!this.isDebugging || !this.isReady()) {
                return { success: false, message: 'Not in debug session' };
            }

            const result = await this.debuggerInstance.stepOut();
            
            if (result.success) {
                this.currentLocation = result.location;
                this.currentStackFrames = result.stackFrames || [];
                this.currentVariables = result.variables || {};
                
                const finished = result.isFinished || result.terminatedEvent || false;
                
                if (finished) {
                    this.isDebugging = false;
                    
                    const finalResult = this.extractFinalResult(result.variables);
                    
                    return {
                        success: true,
                        location: null,
                        variables: {},
                        stackFrames: [],
                        finished: true,
                        finalResult: finalResult
                    };
                }
                
                return {
                    success: true,
                    location: this.currentLocation,
                    variables: this.currentVariables,
                    stackFrames: this.currentStackFrames
                };
            } else {
                if (result.message && result.message.includes('finished')) {
                    this.isDebugging = false;
                    
                    const finalResult = result.variables ? this.extractFinalResult(result.variables) : 'Program finished';
                    
                    return {
                        success: true,
                        location: null,
                        variables: {},
                        stackFrames: [],
                        finished: true,
                        finalResult: finalResult
                    };
                }
                return { success: false, message: result.message || 'Step out failed' };
            }
            
        } catch (error) {
            console.error('❌ DebugService: Error in step out:', error);
            return { success: false, message: `Step out error: ${error.message}` };
        }
    }

    /**
     * Stop debugging session
     * @returns {void}
     */
    stopDebugging() {
        this.isDebugging = false;
        this.currentLocation = null;
        this.currentStackFrames = [];
        this.currentVariables = {};
        
        this.clearCurrentLineHighlight();
        
        if (this.debuggerInstance && this.debuggerInstance.isReady()) {
            this.debuggerInstance.stop();
        }
        
    }

    /**
     * Toggle breakpoint at specified location
     * @param {string} filename 
     * @param {number} lineNumber 
     * @returns {Promise<{success: boolean, added: boolean, breakpoints: Set}>}
     */
    async toggleBreakpoint(filename, lineNumber) {
        try {
            

            if (!this.editorService.breakpoints.has(filename)) {
                this.editorService.breakpoints.set(filename, new Set());
            }

            const fileBreakpoints = this.editorService.breakpoints.get(filename);
            let added = false;

            if (fileBreakpoints.has(lineNumber)) {
                fileBreakpoints.delete(lineNumber);
                this.editorService.removeDecoration(lineNumber, 'breakpoint');
            } else {
                fileBreakpoints.add(lineNumber);
                this.editorService.addDecoration(lineNumber, 'breakpoint');
                added = true;
            }

            if (this.isDebugging && this.isReady()) {
                await this.setBreakpoints(filename, Array.from(fileBreakpoints));
            }

            if (this.storageService) {
                this.storageService.saveFileBreakpoints(filename, fileBreakpoints);
            }

            return {
                success: true,
                added: added,
                breakpoints: new Set(fileBreakpoints)
            };

        } catch (error) {
            console.error('❌ DebugService: Error toggling breakpoint:', error);
            return { success: false, message: `Breakpoint error: ${error.message}` };
        }
    }

    /**
     * Set breakpoints for a file
     * @param {string} filename 
     * @param {Array<number>} breakpoints 
     * @returns {Promise<{success: boolean, count: number}>}
     */
    async setBreakpoints(filename, breakpoints) {
        try {
            if (!this.isReady()) {
                return { success: false, message: 'Debugger not ready' };
            }

            const breakpointsArray = breakpoints.map(line => ({
                line: line,
                column: 1
            }));

            const result = await this.debuggerInstance.setBreakpoints(filename, breakpointsArray);
            
            if (result.success) {
                return { success: true, count: breakpointsArray.length };
            } else {
                return { success: false, message: result.message || 'Failed to set breakpoints' };
            }

        } catch (error) {
            console.error('❌ DebugService: Error setting breakpoints:', error);
            return { success: false, message: `Set breakpoints error: ${error.message}` };
        }
    }

    /**
     * Load breakpoints for a file from storage and apply them
     * @param {string} filename 
     * @returns {Promise<{success: boolean, breakpoints: Set<number>, count: number}>}
     */
    async loadBreakpointsForFile(filename) {
        try {
            if (!filename) {
                return { success: true, breakpoints: new Set(), count: 0 };
            }

            this.editorService.clearDecorations('breakpoint');
            
            let breakpoints = this.editorService.breakpoints.get(filename);
            
            if (!breakpoints?.size && this.storageService) {
                const stored = this.storageService.loadFileBreakpoints(filename);
                if (stored?.size) {
                    breakpoints = stored;
                    this.editorService.breakpoints.set(filename, new Set(stored));
                }
            }
            
            if (!this.editorService.breakpoints.has(filename)) {
                this.editorService.breakpoints.set(filename, new Set());
            }
            
            
            const finalBreakpoints = breakpoints || new Set();
            if (finalBreakpoints.size > 0) {
                for (const lineNumber of finalBreakpoints) {
                    this.editorService.addDecoration(lineNumber, 'breakpoint');
                }
            }
            
            return {
                success: true,
                breakpoints: new Set(finalBreakpoints),
                count: finalBreakpoints.size
            };
            
        } catch (error) {
            console.error('❌ DebugService: Error loading breakpoints for file:', error);
            return { success: false, message: `Load breakpoints error: ${error.message}` };
        }
    }

    /**
     * Highlight current execution line
     * @param {string} filename 
     * @param {number} lineNumber 
     */
    highlightCurrentLine(filename, lineNumber) {
        if (!filename || !lineNumber) {
            console.warn('⚠️ DebugService: Invalid highlighting parameters');
            return;
        }

        if (filename.startsWith('*') && filename.endsWith('*')) {
            return;
        }
        
        if (!filename.endsWith('.clsp') && !filename.endsWith('.clib')) {
            console.warn('⚠️ DebugService: Skipping highlight for non-.clsp file:', filename);
            return;
        }

        const currentFile = this.editorService.getCurrentFile();

        const currentBasename = currentFile ? currentFile.split('/').pop() : '';
        const debugBasename = filename ? filename.split('/').pop() : '';
        
        const isCurrentFile = currentFile === filename || 
                              currentBasename === debugBasename ||
                              (currentFile && filename && (
                                  currentFile.includes(debugBasename) ||
                                  filename.includes(currentBasename)
                              ));

        if (!isCurrentFile) {
            console.warn(`⚠️ DebugService: File mismatch - editor: ${currentFile} (${currentBasename}), debug: ${filename} (${debugBasename})`);
            
            setTimeout(() => {
                this.navigateToLocation({ filename, lineNumber }).catch(error => {
                    console.error('❌ DebugService: Error in auto-navigation:', error);
                });
            }, 0);
            return;
        }

        try {
            this.clearCurrentLineHighlight();
            this.editorService.addDecoration(lineNumber, 'currentLine');
            
            this.editorService.revealLineInCenter(lineNumber);
            
        } catch (error) {
            console.error('❌ DebugService: Error highlighting line:', error);
        }
    }

    /**
     * Clear current line highlight
     */
    clearCurrentLineHighlight() {
        try {
            this.editorService.clearDecorations('currentLine');
        } catch (error) {
            console.error('❌ DebugService: Error clearing highlight:', error);
        }
    }

    /**
     * Parse stack frame location information
     * @param {string} frameInfo 
     * @returns {{filename: string, lineNumber: number} | null}
     */
    parseStackFrameLocation(frameInfo) {
        try {
            if (!frameInfo) return null;

            const match = frameInfo.match(/Frame\s+\d+:\s*(.+\.clsp)\((\d+)\):\d+/);
            if (match) {
                return {
                    filename: match[1],
                    lineNumber: parseInt(match[2], 10)
                };
            }

            console.warn('⚠️ DebugService: Could not parse frame info:', frameInfo);
            return null;
            
        } catch (error) {
            console.error('❌ DebugService: Error parsing frame location:', error);
            return null;
        }
    }

    /**
     * Check if debug session is active
     * @returns {boolean}
     */
    isDebugSessionActive() {
        return this.isDebugging;
    }

    /**
     * Get current execution location
     * @returns {{filename: string, lineNumber: number} | null}
     */
    getCurrentLocation() {
        return this.currentLocation;
    }

    /**
     * Get current stack frames
     * @returns {Array}
     */
    getStackFrames() {
        return this.currentStackFrames;
    }

    /**
     * Get current variables
     * @returns {Object}
     */
    getVariables() {
        return this.currentVariables;
    }

    /**
     * Get breakpoints for a file
     * @param {string} filename 
     * @returns {Set<number>}
     */
    getBreakpoints(filename) {
        return this.editorService.breakpoints.get(filename) || new Set();
    }

    /**
     * Get all breakpoints
     * @returns {Map<string, Set<number>>}
     */
    getAllBreakpoints() {
        return new Map(this.editorService.breakpoints);
    }

    /**
     * Get debugger instance (for direct access if needed)
     * @returns {Debugger|null}
     */
    getDebuggerInstance() {
        return this.debuggerInstance;
    }

    /**
     * Navigate to debug location automatically
     * @param {Object} location 
     */
    async navigateToLocation(location) {
        if (!location || !location.filename) {
            return;
        }
        
        const { filename, lineNumber } = location;
        
        try {
            if (!this.editorService) {
                console.error('❌ DebugService: EditorService not available');
                return;
            }
            
            let targetFile = this.findOpenFileByName(filename);
            
            if (targetFile) {
                this.editorService.switchToFile(targetFile);
            } else {
                const currentFile = this.editorService.getCurrentFile();
                const sourceType = this.storageService.getSourceTypeFromFilename(currentFile);
                
                const fileData = await this.storageService.getFile(filename, sourceType);
                
                if (fileData) {
                    this.editorService.addFile(fileData.fullPath, {
                        content: fileData.content,
                        originalContent: fileData.content,
                        modified: false,
                        fileType: fileData.sourceType,
                        filePath: fileData.fullPath,
                        displayName: fileData.displayName
                    });
                    targetFile = fileData.fullPath;
                    this.loadBreakpointsForFile(targetFile);
                } else {
                    console.warn(`⚠️ DebugService: Could not load file: ${filename}`);
                    return;
                }
            }
            
            if (targetFile) {
                this.highlightCurrentLine(targetFile, lineNumber);
            }
            
        } catch (error) {
            console.error('❌ DebugService: Error navigating to location:', error);
        }
    }

    /**
     * Find open file by debug filename with flexible matching
     * @param {string} debugFilename 
     * @returns {string|null} 
     */
    findOpenFileByName(debugFilename) {
        const openFiles = this.editorService.getOpenFiles();
        
        for (const [editorPath, fileData] of openFiles) {
            const cleanName = editorPath
                .replace(/^(opened_|local_)/, '')
                .replace(/_/g, '/');
                
            const editorBasename = editorPath.split('/').pop();
            const cleanBasename = cleanName.split('/').pop();
            const debugBasename = debugFilename.split('/').pop();
            
            if (editorPath === debugFilename || cleanName === debugFilename) {
                return editorPath;
            }
            
            if (editorBasename === debugBasename || cleanBasename === debugBasename) {
                return editorPath;
            }
            
            if (cleanName.endsWith(`/${debugFilename}`) || editorPath.endsWith(`/${debugFilename}`)) {
                return editorPath;
            }

            if (editorPath.includes(debugBasename) || cleanName.includes(debugBasename)) {
                return editorPath;
            }
            
            
            if (debugFilename.includes(cleanBasename) || debugFilename.includes(editorBasename)) {
                return editorPath;
            }
        }
        
        return null;
    }

    /**
     * Load breakpoints for files that were included during compilation
     * @returns {Promise<void>}
     */
    async loadBreakpointsForIncludedFiles() {
        try {
            if (!this.debuggerInstance) {
                return;
            }

            const loadedIncludes = this.debuggerInstance.getLoadedIncludes();

            for (const includedFile of loadedIncludes) {
                let breakpointsToLoad = new Set();
                
                if (this.editorService.breakpoints.has(includedFile)) {
                    const fileBreakpoints = this.editorService.breakpoints.get(includedFile);
                    if (fileBreakpoints.size > 0) {
                        breakpointsToLoad = new Set([...breakpointsToLoad, ...fileBreakpoints]);
                    }
                }
                
                if (breakpointsToLoad.size === 0) {
                    const storedBreakpoints = this.storageService.loadFileBreakpoints(includedFile);
                    if (storedBreakpoints && storedBreakpoints.size > 0) {
                        breakpointsToLoad = new Set([...breakpointsToLoad, ...storedBreakpoints]);
                        
                        this.editorService.breakpoints.set(includedFile, new Set(breakpointsToLoad));
                    }
                }
                
                if (breakpointsToLoad.size > 0) {
                    await this.setBreakpoints(includedFile, Array.from(breakpointsToLoad));
                }
            }
        } catch (error) {
            console.error('❌ Error loading breakpoints for included files:', error);
        }
    }

    /**
     * Extract final result from debug variables
     * @param {Object} variables 
     * @returns {string} 
     */
    extractFinalResult(variables) {
        try {
            
            if (!variables || typeof variables !== 'object') {
                return 'No result available';
            }
            
            const possibleResultKeys = ['result', 'value', 'output', 'return'];
            
            for (const [filename, fileVars] of Object.entries(variables)) {
                if (Array.isArray(fileVars)) {
                    
                    for (const varItem of fileVars) {
                        if (varItem && typeof varItem === 'object') {
                            const varName = varItem.name || '';
                            const varValue = varItem.value || varItem.result || '';
                            const originalValue = varItem.originalValue;
                            
                            for (const resultKey of possibleResultKeys) {
                                if (varName.toLowerCase().includes(resultKey)) {
                                    const finalValue = (originalValue && varValue.includes('...')) ? originalValue : varValue;
                                    return finalValue;
                                }
                            }
                        }
                    }
                    
                    if (fileVars.length > 0) {
                        const lastVar = fileVars[fileVars.length - 1];
                        if (lastVar && (lastVar.value || lastVar.result)) {
                            const varValue = lastVar.value || lastVar.result;
                            const originalValue = lastVar.originalValue;
                            const finalValue = (originalValue && varValue.includes('...')) ? originalValue : varValue;
                            return finalValue;
                        }
                    }
                }
            }
            
            return JSON.stringify(variables, null, 2);
            
        } catch (error) {
            console.error('❌ DebugService: Error extracting final result:', error);
            return 'Error extracting result';
        }
    }
}