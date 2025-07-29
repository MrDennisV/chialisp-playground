
class CompilationService {
    constructor(storageService, debuggerInstance = null) {
        this.debuggerInstance = debuggerInstance;
        this.storageService = storageService;
    }

    async initialize() {
        try {
           
            if (!this.debuggerInstance.isReady()) {
                await this.debuggerInstance.initialize();
            }
        } catch (error) {
            console.error('❌ Error initializing CompilationService:', error);
            throw error;
        }
    }
    /**
     * Compile ChiaLisp code
     * @param {string} sourceCode 
     * @param {string} filename 
     * @param {Object} buildParams 
     * @returns {Promise<Object>} 
     */
    async compileCode(sourceCode, filename, buildParams = {}) {
        if (!sourceCode.trim()) {
            throw new Error('No code to compile');
        }

        if (!this.debuggerInstance || !this.debuggerInstance.isReady()) {
            throw new Error('Debugger not ready');
        }

        const compileResult = await this.debuggerInstance.compile(sourceCode, filename, this.storageService);
        
        let finalHex = compileResult.hex;
        let originalPuzzleHash = compileResult.hash || 'Hash not available';
        let curriedPuzzleHash = null;
        
        if (buildParams.curriedParams && buildParams.curriedParams !== '()') {
            try {
                const curryResult = await this.debuggerInstance.curry(
                    compileResult.hex,
                    buildParams.curriedParams
                );
                finalHex = curryResult.hex;
                curriedPuzzleHash = curryResult.hash;
            } catch (curryError) {
                console.warn('Curry failed:', curryError);
            }
        }


        return {
            hex: finalHex,
            hash: curriedPuzzleHash || originalPuzzleHash,
            originalHex: compileResult.hex,
            originalHash: originalPuzzleHash,
            curriedHex: curriedPuzzleHash ? finalHex : null,
            curriedHash: curriedPuzzleHash,
            symbols: compileResult.symbols || {}
        };
    }

    /**
     * Execute ChiaLisp code
     * @param {string} sourceCode 
     * @param {string} filename 
     * @param {Object} runParams 
     * @returns {Promise<Object>} 
     */
    async runCode(sourceCode, filename, runParams = {}) {
        if (!sourceCode.trim()) {
            throw new Error('No code to run');
        }

        if (!this.debuggerInstance || !this.debuggerInstance.isReady()) {
            throw new Error('Debugger not ready');
        }

        const compileResult = await this.debuggerInstance.compile(sourceCode, filename, this.storageService);
        
        let executableHex = compileResult.hex;
        let originalPuzzleHash = compileResult.hash || 'Hash not available';
        let curriedPuzzleHash = null;
        
        if (runParams.curriedParams && runParams.curriedParams !== '()') {
            try {
                const curryResult = await this.debuggerInstance.curry(
                    compileResult.hex,
                    runParams.curriedParams
                );
                executableHex = curryResult.hex;
                curriedPuzzleHash = curryResult.hash;
            } catch (curryError) {
                console.warn('Curry failed during execution:', curryError);
            }
        }

        const runResult = await this.debuggerInstance.run(
            executableHex,
            runParams.curriedParams || '',
            runParams.solutionParams || '()'
        );

        return {
            result: runResult.resultParsed || runResult.result,
            output: runResult.output,
            cost: runResult.cost,
            hex: executableHex,
            hash: curriedPuzzleHash || originalPuzzleHash,
            compilation: {
                hex: compileResult.hex,
                hash: originalPuzzleHash
            }
        };
    }

    /**
     * Show arguments modal for execution parameters
     * @param {boolean} isDebugMode 
     * @param {Object} defaultParams 
     * @param {Function} onExecute 
     * @returns {Promise<Object>} 
     */
    showArgumentsModal(isDebugMode = false, defaultParams = {}, onExecute = null) {
        return new Promise((resolve, reject) => {
            const modal = new mdb.Modal(document.getElementById('argsModal'));
            const executeBtn = document.getElementById('executeBtn');
            const modalTitle = document.querySelector('#argsModal .modal-title');
            const modalContent = document.querySelector('#argsModal .modal-content');
            const loadingDiv = document.getElementById('argumentsModalLoading');
            const footerDiv = document.getElementById('argumentsModalFooter');
            
            modalTitle.innerHTML = isDebugMode ? 
                '<i class="fas fa-bug me-2"></i>Debug Program' : 
                '<i class="fas fa-play me-2"></i>Execute Program';
            
            const debugWarning = document.getElementById('debugWarningSection');
            if (isDebugMode && debugWarning) {
                debugWarning.style.display = 'block';
            } else if (debugWarning) {
                debugWarning.style.display = 'none';
            }
            
            const curriedInput = document.getElementById('curriedParamsInput');
            const solutionInput = document.getElementById('solutionParamsInput');
            
            curriedInput.value = defaultParams.curriedParams || '';
            solutionInput.value = defaultParams.solutionParams || '()';
            
            const showLoading = (message = 'Executing ChiaLisp program...') => {
                modalContent.classList.add('loading');
                loadingDiv.style.display = 'block';
                footerDiv.style.display = 'none';
                document.getElementById('argumentsLoadingTitle').textContent = message;
            };
            
            const hideLoading = () => {
                modalContent.classList.remove('loading');
                loadingDiv.style.display = 'none';
                footerDiv.style.display = 'flex';
            };
            
            executeBtn.disabled = false;
            hideLoading();
            
            const handleExecute = async () => {
                const curriedParams = curriedInput.value.trim() || '';
                const solutionParams = solutionInput.value.trim() || '()';
                
                if (onExecute) {
                    try {
                        const operationType = isDebugMode ? 'Starting debug session...' : 'Executing ChiaLisp program...';
                        
                        executeBtn.disabled = true;
                        showLoading(operationType);
                        
                        await new Promise(resolve => setTimeout(resolve, 10));
                        
                        const result = await onExecute({ curriedParams, solutionParams });
                        
                        hideLoading();
                        modal.hide();
                        resolve({ curriedParams, solutionParams, result });
                    } catch (error) {
                        hideLoading();
                        executeBtn.disabled = false;
                        console.error('Execution error:', error);
                        modal.hide();
                        reject(error);
                    }
                } else {
                    modal.hide();
                    resolve({ curriedParams, solutionParams });
                }
            };
            
            const handleCancel = () => {
                hideLoading();
                executeBtn.disabled = false;
                modal.hide();
                reject(new Error('Modal cancelled'));
            };
            
            executeBtn.onclick = handleExecute;
            
            const modalElement = document.getElementById('argsModal');
            const dismissButtons = modalElement.querySelectorAll('[data-mdb-dismiss="modal"]');
            dismissButtons.forEach(btn => {
                btn.addEventListener('click', handleCancel, { once: true });
            });
            
            modal.show();
        });
    }

    /**
     * Show build modal for curry parameters
     * @param {Object} defaultParams 
     * @param {Function} onBuild 
     * @returns {Promise<Object>} 
     */
    showBuildModal(defaultParams = {}, onBuild = null) {
        return new Promise((resolve, reject) => {
            const modal = new mdb.Modal(document.getElementById('buildModal'));
            const buildBtn = document.getElementById('buildBtn');
            const modalContent = document.querySelector('#buildModal .modal-content');
            const loadingDiv = document.getElementById('buildModalLoading');
            const footerDiv = document.getElementById('buildModalFooter');
            const curriedInput = document.getElementById('buildCurriedParamsInput');
            
            curriedInput.value = defaultParams.curriedParams || '';
            
            const showLoading = (message = 'Compiling ChiaLisp program...') => {
                modalContent.classList.add('loading');
                loadingDiv.style.display = 'block';
                footerDiv.style.display = 'none';
                document.getElementById('buildLoadingTitle').textContent = message;
            };
            
            const hideLoading = () => {
                modalContent.classList.remove('loading');
                loadingDiv.style.display = 'none';
                footerDiv.style.display = 'flex';
            };
            
            buildBtn.disabled = false;
            hideLoading();
            
            const handleBuild = async () => {
                const curriedParams = curriedInput.value.trim() || null;
                
                if (onBuild) {
                    try {
                        buildBtn.disabled = true;
                        showLoading('Compiling ChiaLisp program...');
                        
                        await new Promise(resolve => setTimeout(resolve, 10));
                        
                        const result = await onBuild({ curriedParams });
                        
                        hideLoading();
                        modal.hide();
                        resolve({ curriedParams, result });
                    } catch (error) {
                        hideLoading();
                        buildBtn.disabled = false;
                        console.error('Build error:', error);
                        reject(error);
                    }
                } else {
                    modal.hide();
                    resolve({ curriedParams });
                }
            };
            
            const handleCancel = () => {
                hideLoading();
                buildBtn.disabled = false;
                modal.hide();
                reject(new Error('Modal cancelled'));
            };
            
            buildBtn.onclick = handleBuild;
            
            const modalElement = document.getElementById('buildModal');
            const dismissButtons = modalElement.querySelectorAll('[data-mdb-dismiss="modal"]');
            dismissButtons.forEach(btn => {
                btn.addEventListener('click', handleCancel, { once: true });
            });
            
            modal.show();
        });
    }
}