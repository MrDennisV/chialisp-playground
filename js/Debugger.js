
class Debugger {
    constructor() {
        
        this.state = {
            debugService: null,
            isInitialized: false,
            isDebugging: false,
            seqNumber: 1,
            currentLocation: null,
            stackFrames: [],
            variables: {},
            lastStepResult: null
        };

        this.wasmModules = null;
        this.loadedIncludes = [];
        this.stepperTick = undefined;
    }

    /**
     * Initialize the debugger 
     * @param {string} wasmPath 
     */
    async initialize(wasmPath = 'js/vscode-chialisp-lsp') {
        try {
            
            const wasmModule = await import(`/${wasmPath}/clvm_tools_lsp.js?v=${Date.now()}`);
            await wasmModule.default(`/${wasmPath}/clvm_tools_lsp_bg.wasm`);
            
            this.wasmModules = {
                create_dbg_service: wasmModule.create_dbg_service,
                dbg_service_handle_msg: wasmModule.dbg_service_handle_msg,
                destroy_dbg_service: wasmModule.destroy_dbg_service,
                compile: wasmModule.compile,
                run: wasmModule.run,
                curry: wasmModule.curry 
            };
            
            this.state.isInitialized = true;
            return true;
            
        } catch (error) {
            console.error('❌ Error loading debugger WASM:', error);
            throw new Error(`Failed to initialize debugger WASM: ${error.message}`);
        }
    }

    /**
     * Start automatic stepper for continue 
     */
    startStepper() {
        if (this.stepperTick !== undefined) {
            return;
        }

        this.stepperTick = setInterval(() => {
            try {
                const stepMsg = {
                    seq: 0, 
                    type: 'request',
                    command: 'stepIn',
                    arguments: { threadId: 1 } 
                };

                const result = this.wasmModules.dbg_service_handle_msg(
                    this.state.debugService,
                    JSON.stringify(stepMsg)
                );

                const allEvents = this.processDebugResult(result);
                
                const stoppedEvent = allEvents.find(e => e.event === 'stopped');
                const terminatedEvent = allEvents.find(e => e.event === 'terminated');

                if (terminatedEvent) {
                    this.state.isDebugging = false;
                    this.stopStepper();
                    return;
                }

                if (stoppedEvent) {
                    const stopReason = stoppedEvent.body?.reason;
                    
                    if (stopReason === 'breakpoint') {
                        this.stopStepper();
                        return;
                    }
                    
                    if (stopReason === 'step') {
                        return;
                    }
                    
                    this.stopStepper();
                    return;
                }

                if (!result || result.length === 0 || (Array.isArray(result) && result.every(r => !r || r.trim() === ''))) {
                    this.state.isDebugging = false;
                    this.stopStepper();
                    return;
                }

                for (const event of allEvents) {
                    if (event.event === 'output' && event.body?.output) {
                        const output = event.body.output;
                        if (output.includes('Step returned None') || output.includes('program ended')) {
                            this.state.isDebugging = false;
                            this.stopStepper();
                            return;
                        }
                    }
                }

            } catch (error) {
                console.error('❌ Error in stepper:', error);
                this.stopStepper();
            }
        }, 0); 
    }

    /**
     * Stop automatic stepper
     */
    stopStepper() {
        if (this.stepperTick === undefined) {
            return;
        }

        clearInterval(this.stepperTick);
        this.stepperTick = undefined;
    }

    /**
     * Check if the debugger is ready to use
     * @returns {boolean} 
     */
    isReady() {
        return this.state.isInitialized && this.wasmModules !== null;
    }

    /**
     * Start debugging from source code
     * @param {string} filename 
     * @param {Array} args 
     * @returns {Promise<Object>} 
     */
    async debug( filename , args, storageService = null) {
        if (!this.isReady()) {
            throw new Error('Debugger not initialized - call initialize() first');
        }

        try {
            this.loadedIncludes = [];
            
            const fileReader = this.createFileReader(filename, storageService);
            const errWriter = (msg) => console.log(`[DebugWasm] ${msg}`);

            this.state.debugService = this.wasmModules.create_dbg_service(fileReader, errWriter);

            await this.initializeDAP();
            
            await this.launchProgram(filename, args, {});

            this.state.isDebugging = true;

            const compilationInfo = this.state.compilationInfo || {};

            return {
                success: true,
                message: 'Debug session started',
                location: this.state.currentLocation,
                hex: compilationInfo.hex || '',
                symbols: compilationInfo.symbols || {},
                compilerType: 'debugger-internal',
                symbolCount: compilationInfo.symbolCount || 0
            };

        } catch (error) {
            throw new Error(`Failed to start debugging: ${error.message}`);
        }
    }

    /**
     * Execute a debugging step
     * @returns {Promise<Object>} 
     */
    async step() {
        if (!this.isReady()) {
            throw new Error('Debugger not initialized');
        }
        if (!this.state.isDebugging) {
            throw new Error('Not debugging');
        }

        try {
            const stepMsg = {
                seq: this.state.seqNumber++,
                type: 'request',
                command: 'stepIn',
                arguments: { threadId:1 }
            };

            const result = this.wasmModules.dbg_service_handle_msg(
                this.state.debugService,
                JSON.stringify(stepMsg)
            );

            const events = this.processDebugResult(result);
            
            const terminatedEvent = events.find(e => e.event === 'terminated');
            const stoppedEvent = events.find(e => e.event === 'stopped');
            
            const isFinished = terminatedEvent !== undefined;
            
            if (stoppedEvent && stoppedEvent.body?.reason !== 'entry') {
                await this.updateCurrentState();
            }

            if (isFinished) {
                this.state.isDebugging = false;
            }

            const stepResult = {
                success: true,
                location: this.state.currentLocation,
                variables: this.state.variables,
                stackFrames: this.state.stackFrames,
                events: events,
                isFinished: isFinished,
                terminatedEvent: terminatedEvent
            };
            
            return stepResult;

        } catch (error) {
            throw new Error(`Step failed: ${error.message}`);
        }
    }

    /**
     * Execute Step Over - advance to the next line without entering functions
     * @returns {Promise<Object>} Current step information
     */
    async stepOver() {
        if (!this.state.isDebugging) {
            throw new Error('Not debugging');
        }

        try {
            
            const stepMsg = {
                seq: this.state.seqNumber++,
                type: 'request',
                command: 'next',
                arguments: { threadId: 1 }
            };

            let result = this.wasmModules.dbg_service_handle_msg(
                this.state.debugService,
                JSON.stringify(stepMsg)
            );

            let initialEvents = this.processDebugResult(result);

            const runMessage = initialEvents.find(e => 
                e.message && typeof e.message === 'string' && e.message.startsWith('run next')
            );

            if (runMessage) {                
                return await this.stepUntilTarget();

            } else {
                const terminatedEvent = initialEvents.find(e => e.event === 'terminated');
                const stoppedEvent = initialEvents.find(e => e.event === 'stopped');
                const isFinished = terminatedEvent !== undefined;
                
                if (stoppedEvent && stoppedEvent.body?.reason !== 'entry') {
                    await this.updateCurrentState();
                }

                if (isFinished) {
                    this.state.isDebugging = false;
                }

                return {
                    success: true,
                    location: this.state.currentLocation,
                    variables: this.state.variables,
                    stackFrames: this.state.stackFrames,
                    events: initialEvents,
                    isFinished: isFinished,
                    stoppedAtBreakpoint: stoppedEvent?.body?.reason === 'breakpoint'
                };
            }

        } catch (error) {
            throw new Error(`Step Over failed: ${error.message}`);
        }
    }

    /**
     * Execute Step Out - exit the current function
     * @returns {Promise<Object>} 
     */
    async stepOut() {
        if (!this.state.isDebugging) {
            throw new Error('Not debugging');
        }

        try {
            
            const stepMsg = {
                seq: this.state.seqNumber++,
                type: 'request',
                command: 'stepOut',
                arguments: { threadId: 1 }
            };

            let result = this.wasmModules.dbg_service_handle_msg(
                this.state.debugService,
                JSON.stringify(stepMsg)
            );

            let initialEvents = this.processDebugResult(result);

            const runMessage = initialEvents.find(e => 
                e.message && typeof e.message === 'string' && e.message.startsWith('run step out')
            );

            if (runMessage) {
                return await this.stepUntilTarget();

            } else {
                const terminatedEvent = initialEvents.find(e => e.event === 'terminated');
                const stoppedEvent = initialEvents.find(e => e.event === 'stopped');
                const isFinished = terminatedEvent !== undefined;
                
                if (stoppedEvent && stoppedEvent.body?.reason !== 'entry') {
                    await this.updateCurrentState();
                }

                if (isFinished) {
                    this.state.isDebugging = false;
                }

                return {
                    success: true,
                    location: this.state.currentLocation,
                    variables: this.state.variables,
                    stackFrames: this.state.stackFrames,
                    events: initialEvents,
                    isFinished: isFinished,
                    stoppedAtBreakpoint: stoppedEvent?.body?.reason === 'breakpoint'
                };
            }

        } catch (error) {
            throw new Error(`Step Out failed: ${error.message}`);
        }
    }

    /**
     * Continue execution until breakpoint or termination
     * @returns {Promise<Object>} 
     */
    async continue() {
        if (!this.state.isDebugging) {
            throw new Error('Not debugging');
        }

        try {
            
            const continueMsg = {
                seq: this.state.seqNumber++,
                type: 'request',
                command: 'continue',
                arguments: { threadId: 1 }
            };

            let result = this.wasmModules.dbg_service_handle_msg(
                this.state.debugService,
                JSON.stringify(continueMsg)
            );

            let initialEvents = this.processDebugResult(result);

            const runMessage = initialEvents.find(e => 
                e.message && typeof e.message === 'string' && e.message.startsWith('run')
            );

            if (runMessage) {
                
                this.startStepper();

                return new Promise((resolve) => {
                    const checkStepper = setInterval(() => {
                        if (this.stepperTick === undefined) {
                            clearInterval(checkStepper);
                            
                            this.updateCurrentState().then(() => {
                                const isFinished = !this.state.isDebugging;
                                
                                resolve({
                                    success: true,
                                    location: this.state.currentLocation,
                                    variables: this.state.variables,
                                    stackFrames: this.state.stackFrames,
                                    events: initialEvents,
                                    isFinished: isFinished,
                                    stoppedAtBreakpoint: !isFinished, 
                                    message: isFinished ? 'Program terminated' : 'Stopped at breakpoint'
                                });
                            });
                        }
                    }, 10); 
                });

            } else {    
                
                return {
                    success: false,
                    message: 'Continue command did not return expected "run" message',
                    location: this.state.currentLocation,
                    variables: this.state.variables,
                    stackFrames: this.state.stackFrames,
                    events: initialEvents,
                    isFinished: false,
                    stoppedAtBreakpoint: false
                };
            }

        } catch (error) {
            this.stopStepper();
            throw new Error(`Continue failed: ${error.message}`);
        }
    }

    /**
     * Helper function to step automatically until a condition is met
     * Used for Step Over and Step Out operations
     * @returns {Promise<Object>} 
     */
    async stepUntilTarget() {
        if (!this.state.isDebugging) {
            throw new Error('Not debugging');
        }

        try {
            
            return new Promise((resolve, reject) => {
                const autoStepInterval = setInterval(async () => {
                    try {
                        const stepMsg = {
                            seq: 0, 
                            type: 'request',
                            command: 'stepIn',
                            arguments: { threadId: 1 } 
                        };

                        const result = this.wasmModules.dbg_service_handle_msg(
                            this.state.debugService,
                            JSON.stringify(stepMsg)
                        );

                        const allEvents = this.processDebugResult(result);
                        
                        
                        const stoppedEvent = allEvents.find(e => e.event === 'stopped');
                        const terminatedEvent = allEvents.find(e => e.event === 'terminated');

                        if (terminatedEvent) {
                            
                            this.state.isDebugging = false;
                            clearInterval(autoStepInterval);
                            
                            await this.updateCurrentState();
                            resolve({
                                success: true,
                                location: this.state.currentLocation,
                                variables: this.state.variables,
                                stackFrames: this.state.stackFrames,
                                events: allEvents,
                                isFinished: true,
                                message: 'Program terminated'
                            });
                            return;
                        }

                        if (stoppedEvent) {
                            const stopReason = stoppedEvent.body?.reason;
                            
                            if (stopReason === 'breakpoint') {
                                
                                clearInterval(autoStepInterval);
                                
                                await this.updateCurrentState();
                                resolve({
                                    success: true,
                                    location: this.state.currentLocation,
                                    variables: this.state.variables,
                                    stackFrames: this.state.stackFrames,
                                    events: allEvents,
                                    isFinished: false,
                                    stoppedAtBreakpoint: true,
                                    message: 'Stopped at breakpoint'
                                });
                                return;
                            }
                            
                            if (stopReason === 'step') {
                                
                                clearInterval(autoStepInterval);
                                
                                await this.updateCurrentState();
                                resolve({
                                    success: true,
                                    location: this.state.currentLocation,
                                    variables: this.state.variables,
                                    stackFrames: this.state.stackFrames,
                                    events: allEvents,
                                    isFinished: false,
                                    stoppedAtBreakpoint: false,
                                    message: 'Target reached'
                                });
                                return;
                            }
                            
                            
                            clearInterval(autoStepInterval);
                            
                            await this.updateCurrentState(); 
                            resolve({
                                success: true,
                                location: this.state.currentLocation,
                                variables: this.state.variables,
                                stackFrames: this.state.stackFrames,
                                events: allEvents,
                                isFinished: false,
                                stoppedAtBreakpoint: false,
                                message: `Stopped: ${stopReason}`
                            });
                            return;
                        }

                        if (!result || result.length === 0 || (Array.isArray(result) && result.every(r => !r || r.trim() === ''))) {
                            
                            this.state.isDebugging = false;
                            clearInterval(autoStepInterval);
                            
                            resolve({
                                success: true,
                                location: this.state.currentLocation,
                                variables: this.state.variables,
                                stackFrames: this.state.stackFrames,
                                events: allEvents,
                                isFinished: true,
                                message: 'Program ended'
                            });
                            return;
                        }

                        for (const event of allEvents) {
                            if (event.event === 'output' && event.body?.output) {
                                const output = event.body.output;
                                if (output.includes('Step returned None') || output.includes('program ended')) {
                                    this.state.isDebugging = false;
                                    clearInterval(autoStepInterval);
                                    
                                    resolve({
                                        success: true,
                                        location: this.state.currentLocation,
                                        variables: this.state.variables,
                                        stackFrames: this.state.stackFrames,
                                        events: allEvents,
                                        isFinished: true,
                                        message: 'Program ended'
                                    });
                                    return;
                                }
                            }
                        }

                    } catch (error) {
                        console.error('❌ Error in auto-step:', error);
                        clearInterval(autoStepInterval);
                        reject(new Error(`Auto-step failed: ${error.message}`));
                    }
                }, 0);
            });

        } catch (error) {
            throw new Error(`Step until target failed: ${error.message}`);
        }
    }

    /**
     * Set breakpoints in a file
     * @param {string} file 
     * @param {Array} breakpoints 
     * @returns {Promise<Object>}   
     */
    async setBreakpoints(file, breakpoints = []) {
        if (!this.state.isDebugging) {
            throw new Error('Not debugging - cannot set breakpoints');
        }
        file = file.replace('local_', '').replace('opened_', '');
        try {
            
            
            const setBreakpointsMsg = {
                seq: this.state.seqNumber++,
                type: 'request',
                command: 'setBreakpoints',
                arguments: {
                    source: { 
                        name: file, 
                        path: file 
                    },
                    breakpoints: breakpoints.map(bp => ({
                        line: bp.line,
                        column: bp.column || 1
                    }))
                }
            };

            const result = this.wasmModules.dbg_service_handle_msg(
                this.state.debugService,
                JSON.stringify(setBreakpointsMsg)
            );

            const events = this.processDebugResult(result);

            const response = events.find(e => e.type === 'response' && e.command === 'setBreakpoints');
            
            if (response && response.success && response.body?.breakpoints) {
                
                
                return {
                    success: true,
                    breakpoints: response.body.breakpoints,
                    events: events
                };
            } else {
                
                return {
                    success: false,
                    message: response?.message || 'Unknown error setting breakpoints',
                    events: events
                };
            }

        } catch (error) {
            throw new Error(`Set breakpoints failed: ${error.message}`);
        }
    }

    /**
     * Remove all breakpoints from a file
     * @param {string} file 
     * @returns {Promise<Object>} 
     */
    async removeBreakpoints(file) {
        return await this.setBreakpoints(file, []); // Array vacío = remover todos
    }

    /**
     * Get current state
     * @returns {Object} 
     */
    getState() {
        return {
            isDebugging: this.state.isDebugging,
            location: this.state.currentLocation,
            variables: this.state.variables,
            stackFrames: this.state.stackFrames
        };
    }

    /**
     * Get list of files that were loaded during compilation 
     * @returns {Array<string>} 
     */
    getLoadedIncludes() {
        return [...this.loadedIncludes];
    }

    /**
     * Check if a file should be registered as an include
     * @param {string} filepath 
     * @param {string} filename 
     * @returns {boolean} 
     */
    shouldRegisterInclude(filepath, filename) {
        if (filepath === filename) {
            return false;
        }
        
        return filepath.endsWith('.clsp') || filepath.endsWith('.clib');
    }

    /**
     * Stop debugging
     */
    stop() {
        if (this.state.debugService) {
            this.wasmModules.destroy_dbg_service(this.state.debugService);
            this.state.debugService = null;
        }
        this.state.isDebugging = false;
        this.state.currentLocation = null;
        this.state.variables = {};
        this.state.stackFrames = [];
    }

    /**
     * Compile source code
     */
    async compile(sourceCode, filename, storageService = null) {
        if (!this.wasmModules.compile) {
            throw new Error('Compile function not available');
        }

        const includePaths = this.getContextualIncludePaths(filename, storageService);
        
        const fileReader = this.createFileReader(filename, storageService);
        const result = this.wasmModules.compile(sourceCode, filename, includePaths, fileReader);
        
        if (result[0] === "error") {
            throw new Error(`Compilation failed: ${result[1]}`);
        }
        
        if (result[0] === "success") {
            return {
                hex: result[1],
                symbols: JSON.parse(result[2]),
                compilerType: result[3],
                hash: result[4] ? result[4][1] : null 
            };
        }
        
        throw new Error('Unexpected compilation result');
    }

    /**
     * Run compiled program with curry and solution params  
     * @param {string} compiledHex 
     * @param {string} curryParams 
     * @param {string} solutionParams 
     * @returns {Promise<Object>} 
     */
    async run(compiledHex, curryParams = '', solutionParams = '()') {
        if (!this.isReady()) {
            throw new Error('Debugger not initialized - call initialize() first');
        }
        
        if (!this.wasmModules.run) {
            throw new Error('Run function not available');
        }

        try {
            let hexToRun = compiledHex;

            if (curryParams && curryParams.trim() !== '' && curryParams.trim() !== '()') {
                const curryResult = this.wasmModules.curry(compiledHex, curryParams);
                if (curryResult.hex) {
                    hexToRun = curryResult.hex;
                } else {
                    throw new Error('Error currying program: ' + (curryResult.readable || 'Unknown error'));
                }
            }

            const result = this.wasmModules.run(hexToRun, solutionParams);

            if (result[0] === "error") {
                throw new Error(`Runtime error: ${result[1]}`);
            }

            if (result[0] === "success") {
                const resultHex = result[1];
                const cost = result[2];
                const executionType = result[3] || 'clvm_execution';
                const readableResult = result[4] || resultHex;

                return {
                    success: true,
                    resultHex: resultHex,
                    resultParsed: readableResult,
                    cost: cost,
                    executionType: executionType
                };
            }

            throw new Error(`Unexpected run result: ${JSON.stringify(result)}`);

        } catch (error) {
            throw new Error(`Failed to run program: ${error.message}`);
        }
    }

    /**
     * Currify compiled program
     * @param {string} compiledHex 
     * @param {string} curryParams 
     * @returns {Promise<Object>} 
     */
    async curry(compiledHex, curryParams) {
        if (!this.isReady()) {
            throw new Error('Debugger not initialized - call initialize() first');
        }

        try {
            const result = this.wasmModules.curry(compiledHex, curryParams);
            
            if (!result.hex) {
                throw new Error(`Curry error: ${result}`);
            }

            return {
                success: true,
                hex: result.hex,
                readable: result.readable,
                hash: result.hash
            };

        } catch (error) {
            throw new Error(`Failed to curry program: ${error.message}`);
        }
    }

    /**
     * Calculate tree hash of a compiled program
     * @param {string} compiledHex 
     * @returns {Promise<Object>} 
     */
    async getTreeHash(compiledHex) {
        if (!this.isReady()) {
            throw new Error('Debugger not initialized - call initialize() first');
        }

        try {
            const result = this.wasmModules.get_tree_hash(compiledHex);
            
            if (!Array.isArray(result) || result[0] !== 'success') {
                throw new Error(`Hash calculation error: ${result[1] || result}`);
            }

            return {
                success: true,
                hash: result[1]
            };

        } catch (error) {
            throw new Error(`Failed to calculate tree hash: ${error.message}`);
        }
    }

    /**
     * Get contextual include paths based on file type
     */
    getContextualIncludePaths(filename, storageService) {
        

        const sourceType = storageService.getSourceTypeFromFilename(filename);
        
        switch (sourceType) {
            case 'fileuploaded':
                return ["."];
                
            case 'example':
                return ["examples", ".", "examples/includes", "includes"];
                
            case 'apifolder':
                return this.getExpandedFolderPaths(storageService);
                
            default:
                return [".", "includes"];
        }
    }

    /**
     * Get expanded folder paths for apifolder include resolution
     */
    getExpandedFolderPaths(storageService) {
        const fileTree = storageService.getFileTree();
        const expandedPaths = ["."];  
        
        if (fileTree && fileTree.children) {
            this.collectAllFolderPaths(fileTree.children, "", expandedPaths);
        }
        
        expandedPaths.push("..", "../includes");
        
        return expandedPaths;
    }

    /**
     * Recursively collect all folder paths from file tree
     */
    collectAllFolderPaths(nodes, basePath, expandedPaths) {
        
        for (const node of nodes) {
            
            if (node.type === 'folder') {
                const folderPath = basePath ? `${basePath}/${node.name}` : node.name;
                expandedPaths.push(folderPath);
                
                if (node.children && node.children.length > 0) {
                    this.collectAllFolderPaths(node.children, folderPath, expandedPaths);
                }
            }
        }
    }

    /**
     * Create synchronous file reader using StorageService with flexible search logic
     */
    createFileReader(filename, storageService = null) {
        const self = this;
        return function(filepath) {
 
            
            const sourceType = storageService.getSourceTypeFromFilename(filename);
            
            let content = null;
            switch (sourceType) {
                case 'fileuploaded':
                    content = self.findInUploadedFilesSync(filepath, storageService);
                    break;
                case 'apifolder':
                    content = self.findInLocalFilesSync(filepath, storageService);
                    break;
                case 'example':
                default:
                    break;
            }
            
            if (content !== null) {
                
                if (self.shouldRegisterInclude(filepath, filename) && !self.loadedIncludes.includes(filepath)) {
                    self.loadedIncludes.push(filepath);
                }
                
                return content;
            }
            
            try {
                const xhr = new XMLHttpRequest();
                xhr.open('GET', filepath, false);
                xhr.send();
                if (xhr.status === 200) {
                    
                    let fixedName = filepath.replace('./examples/', 'examples/');
                    if (self.shouldRegisterInclude(fixedName, filename) && !self.loadedIncludes.includes(fixedName)) {
                        self.loadedIncludes.push(fixedName);
                    }
                    
                    return xhr.responseText;
                }
            } catch (error) {
            }
            
            console.warn(`⚠️ Include file not found: ${filepath}`);
            return null;
        };
    }


    /**
     * Search in uploaded files using synchronous methods with flexible matching
     * @param {string} filepath 
     * @param {Object} storageService 
     * @returns {string|null} 
     */
    findInUploadedFilesSync(filepath, storageService) {
        const openedFiles = storageService.getOpenedFiles();
        
        for (const [filename, fileData] of openedFiles.entries()) {
            const cleanName = fileData.originalFile?.name || fileData.name || filename.replace(/^opened_/, '');
            
            if (cleanName === filepath ||                   
                filepath.endsWith(cleanName) ||              
                cleanName.endsWith(filepath) ||             
                filepath.endsWith('/' + cleanName) ||        
                cleanName.endsWith('/' + filepath) ||
                filename === filepath) {                  
                return fileData.content;
            }
        }
        
        return null;
    }

    /**
     * Search in local files using synchronous methods with flexible matching
     * @param {string} filepath 
     * @param {Object} storageService 
     * @returns {string|null} 
     */
    findInLocalFilesSync(filepath, storageService) {
        const localFiles = storageService.getLocalFiles();
        
        for (const [localPath, fileData] of localFiles.entries()) {
            const fileName = localPath.split('/').pop();
            
            if (localPath === filepath ||                   
                localPath.endsWith(filepath) ||             
                filepath.endsWith(localPath) ||             
                fileName === filepath ||                    
                filepath.endsWith('/' + fileName) ||        
                filepath.endsWith(fileName)) {              
                return fileData.content;
            }
        }
        
        return null;
    }

    /**
     * Initialize DAP
     */
    async initializeDAP() {
        const initMsg = {
            seq: this.state.seqNumber++,
            type: 'request',
            command: 'initialize',
            arguments: {
                clientID: 'debugger',
                clientName: 'Chialisp Debugger',
                adapterID: 'chialisp'
            }
        };

        this.wasmModules.dbg_service_handle_msg(
            this.state.debugService,
            JSON.stringify(initMsg)
        );
    }

    /**
     * Launch program
     */
    async launchProgram(filename, args, symbols) {
        const launchMsg = {
            seq: this.state.seqNumber++,
            type: 'request',
            command: 'launch',
            arguments: {
                name: filename,
                program: filename,
                stopOnEntry: true,
                args: args,
                symbols: JSON.stringify(symbols)
            }
        };

        const result = this.wasmModules.dbg_service_handle_msg(
            this.state.debugService,
            JSON.stringify(launchMsg)
        );

        const events = this.processDebugResult(result);
        
        const compilationInfo = this.extractCompilationInfo(events);
        if (compilationInfo) {
            this.state.compilationInfo = compilationInfo;
        }
        
        return events;
    }

    /**
     * Process debugger result
     */
    processDebugResult(result) {
        if (!result || !result[0]) {
            return [];
        }

        const data = JSON.parse(result[0] || '[]');
        return Array.isArray(data) ? data : [data];
    }

    /**
     * Extract compilation info from events
     */
    extractCompilationInfo(events) {
        for (const event of events) {
            if (event.event === 'output' && event.body?.output) {
                const output = event.body.output;
                if (output.startsWith('COMPILATION_INFO:')) {
                    try {
                        const jsonStr = output.substring('COMPILATION_INFO:'.length);
                        return JSON.parse(jsonStr);
                    } catch (e) {
                        console.error('Error parsing compilation info:', e);
                    }
                }
            }
        }
        return null;
    }

    /**
     * Update current state (stack and variables)
     */
    async updateCurrentState() {
        try {    
            await this.updateStackTrace();
            
            if (this.state.stackFrames.length > 0) {
                await this.updateVariables(this.state.stackFrames[0].id);
            }
            
        } catch (error) {
            console.error('Error updating state:', error);
        }
    }

    /**
     * Update stack trace
     */
    async updateStackTrace() {
        const stackMsg = {
            seq: this.state.seqNumber++,
            type: 'request',
            command: 'stackTrace',
            arguments: { threadId: 1 }
        };

        const result = this.wasmModules.dbg_service_handle_msg(
            this.state.debugService,
            JSON.stringify(stackMsg)
        );

        const data = JSON.parse(result[0] || '[]');
        const stackResponse = data.find(item => item.command === 'stackTrace');

        if (stackResponse && stackResponse.body?.stackFrames) {
            this.state.stackFrames = stackResponse.body.stackFrames;
            
            if (this.state.stackFrames.length > 0) {
                const topFrame = this.state.stackFrames[0];
                this.state.currentLocation = this.extractLocationFromFrame(topFrame);
            }
        }
    }

    /**
     * Update variables
     */
    async updateVariables(frameId) {
        const scopesMsg = {
            seq: this.state.seqNumber++,
            type: 'request',
            command: 'scopes',
            arguments: { frameId: frameId }
        };

        const result = this.wasmModules.dbg_service_handle_msg(
            this.state.debugService,
            JSON.stringify(scopesMsg)
        );

        const data = JSON.parse(result[0] || '[]');
        const scopesResponse = data.find(item => item.command === 'scopes');

        if (scopesResponse && scopesResponse.body?.scopes) {
            const allVariables = {};

            for (const scope of scopesResponse.body.scopes) {
                if (scope.variablesReference > 0) {
                    const variables = await this.getVariablesFromScope(scope.variablesReference);
                    allVariables[scope.name] = variables;
                }
            }

            this.state.variables = allVariables;
        }
    }

    /**
     * Get variables from a scope
     */
    async getVariablesFromScope(variablesReference) {
        const variablesMsg = {
            seq: this.state.seqNumber++,
            type: 'request',
            command: 'variables',
            arguments: { variablesReference: variablesReference }
        };

        const result = this.wasmModules.dbg_service_handle_msg(
            this.state.debugService,
            JSON.stringify(variablesMsg)
        );

        const data = JSON.parse(result[0] || '[]');
        const variablesResponse = data.find(item => item.command === 'variables');

        if (variablesResponse && variablesResponse.body?.variables) {
            const variables = variablesResponse.body.variables;
            
            for (let variable of variables) {
                if (variable.name === '_op') {
                    const opCode = parseInt(variable.value);
                    if (!isNaN(opCode)) {
                        const opName = this.getClvmOpName(opCode);
                        variable.value = `${opCode} (${opName})`;
                    }
                }
                
                if (variable.name.length > 50) {
                    const originalName = variable.name;
                    
                    if (originalName.includes('_arguments') && originalName.length > 64) {
                        const parts = originalName.split('_');
                        if (parts.length > 1) {
                            const fileMatch = originalName.match(/(\w+\.clsp)\((\d+)\):(\d+)/);
                            if (fileMatch) {
                                const [, filename, line, col] = fileMatch;
                                variable.displayName = `${filename}:${line}:${col}_arguments`;
                                variable.originalName = originalName;
                            } else {
                                variable.displayName = `hash_${parts[parts.length - 1]}`;
                                variable.originalName = originalName;
                            }
                        }
                    }
                        
                    if (!variable.displayName) {
                        variable.displayName = originalName.substring(0, 30) + '...';
                        variable.originalName = originalName;
                    }
                }
                
                if (variable.value && variable.value.length > 100) {
                    variable.originalValue = variable.value;
                    variable.value = variable.value.substring(0, 80) + '...';
                    variable.isLongValue = true;
                }
            }
            
            return variables;
        }

        return [];
    }

    /**
     * Extract location from a frame
     */
    extractLocationFromFrame(frame) {
        let file = "unknown";
        let line = frame.line || 0;
        let column = frame.column || 0;

        if (frame.name) {
            const location = this.parseLocationFromName(frame.name);
            if (location) {
                file = location.file;
                line = location.line;
                column = location.column;
            } else {
                if (frame.name.endsWith('.clsp') || frame.name.endsWith('.cl')) {
                    file = frame.name;
                    line = frame.line || 0;
                    column = frame.column || 0;
                }
            }
        }

        return {
            file: file,
            line: line,
            column: column,
            frameName: frame.name
        };
    }

    /**
     * Parse frame name location
     */
    parseLocationFromName(frameName) {
        
        if (!frameName || !frameName.includes("(") || !frameName.includes(")")) {
            return null;
        }
        
        const parenPos = frameName.indexOf('(');
        const filename = frameName.substring(0, parenPos);
        const rest = frameName.substring(parenPos + 1);
        const closeParenPos = rest.indexOf(')');
        
        
        if (closeParenPos === -1) {
            return null;
        }
        
        const lineStr = rest.substring(0, closeParenPos);
        
        const afterParen = rest.substring(closeParenPos + 1); 
        const colonPos = afterParen.indexOf(':');
        
        
        let colStr = '1'; 
        if (colonPos !== -1) {
            colStr = afterParen.substring(colonPos + 1);
        }
        
        const parsedLine = parseInt(lineStr);
        const parsedCol = parseInt(colStr);
        

        if (isNaN(parsedLine)) {
            return null;
        }
        
        const result = {
            file: filename,
            line: parsedLine,
            column: isNaN(parsedCol) ? 1 : parsedCol
        };
        
        return result;
    }


    /**
     * Get readable name for CLVM operation code
     */
    getClvmOpName(opCode) {
        const opMap = {
            1: 'quote', 2: 'apply', 3: 'if', 4: 'cons',
            5: 'first', 6: 'rest', 7: 'listp', 8: 'raise',
            9: 'eq', 10: 'sha256', 11: 'add', 12: 'subtract',
            13: 'multiply', 14: 'divmod', 15: 'substr',
            16: '+', 17: '-', 18: '*', 19: '/',
            20: '=', 21: '>', 22: 'ash', 23: 'lsh',
            24: 'logand', 25: 'logior', 26: 'logxor', 27: 'lognot'
        };
        
        return opMap[opCode] || `op_${opCode}`;
    }

}
