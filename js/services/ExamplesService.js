
class ExamplesService {
    constructor() {
        this.examples = {};
        this.examplesData = null;
    }

    /**
     * Get all loaded examples
     * @returns {Object} Examples object
     */
    getExamples() {
        return this.examples;
    }

    /**
     * Get raw examples data from examples.json
     * @returns {Object|null} 
     */
    getExamplesData() {
        return this.examplesData;
    }

    /**
     * Load examples from examples.json and process structure
     * @returns {Promise<void>}
     */
    async loadExamples() {
        try {
            const response = await fetch('examples/examples.json');
            if (!response.ok) {
                throw new Error(`Failed to load examples: ${response.statusText}`);
            }
            const data = await response.json();

            this.examplesData = data;
            this.examples = {};
            
            if (data.welcome) {
                this.examples.welcome = data.welcome;
            }
            
            if (data.modules) {
                Object.entries(data.modules).forEach(([moduleKey, module]) => {
                    if (module.examples) {
                        Object.entries(module.examples).forEach(([exampleKey, example]) => {
                            this.examples[`${moduleKey}_${exampleKey}`] = {
                                ...example,
                                moduleKey,
                                moduleName: module.name,
                                moduleIcon: module.icon,
                                moduleLevel: module.level || 0
                            };
                        });
                    }
                });
            }
            
        } catch (error) {
            console.error('❌ Error loading examples:', error);
        }
    }

    /**
     * Get example data by key with fallback logic
     * @param {string} exampleKey 
     * @returns {Object|null} 
     */
    getExample(exampleKey) {
        let example = this.examples[exampleKey];
        
        if (!example && this.examplesData) {
            if (exampleKey === 'welcome' && this.examplesData.welcome) {
                example = this.examplesData.welcome;
            } else if (this.examplesData.modules) {
                for (const [moduleKey, module] of Object.entries(this.examplesData.modules)) {
                    if (module.examples && module.examples[exampleKey]) {
                        example = {
                            ...module.examples[exampleKey],
                            moduleKey,
                            moduleName: module.name
                        };
                        break;
                    }
                    const shortKey = exampleKey.replace(`${moduleKey}_`, '');
                    if (module.examples && module.examples[shortKey]) {
                        example = {
                            ...module.examples[shortKey],
                            moduleKey,
                            moduleName: module.name
                        };
                        break;
                    }
                }
            }
        }
        
        return example || null;
    }

    /**
     * Load example file content from server
     * @param {string} filePath 
     * @returns {Promise<string>} 
     */
    async loadExampleFile(filePath) {
        try {
            const response = await fetch(filePath);
            if (!response.ok) {
                throw new Error(`Failed to load ${filePath}: ${response.statusText}`);
            }
            const content = await response.text();  
            return content;
        } catch (error) {
            console.error(`❌ Error loading example file ${filePath}:`, error);
            throw error;
        }
    }

    /**
     * Get default parameters for a given filename from examples
     * @param {string} filename 
     * @returns {Object|null} 
     */
    getDefaultParameters(filename) {
        const example = this._findExampleByFilename(filename);
        if (!example) return null;

        const parameterConfig = this._getParameterConfig(example, filename);
        return parameterConfig ? this._formatParameters(parameterConfig) : null;
    }

    /**
     * Find example by filename
     * @private
     * @param {string} filename 
     * @returns {Object|null} 
     */
    _findExampleByFilename(filename) {
        const exampleKey = Object.keys(this.examples).find(key => {
            const example = this.examples[key];
            if (example.modules) {
                return Object.values(example.modules).some(module => 
                    module.file === filename || filename.endsWith(module.file)
                );
            }
            return example.file === filename || filename.endsWith(example.file || `${key}.clsp`);
        });

        return exampleKey ? this.examples[exampleKey] : null;
    }

    /**
     * Get parameter configuration from example
     * @private
     * @param {Object} example 
     * @param {string} filename 
     * @returns {Object|null} 
     */
    _getParameterConfig(example, filename) {
        if (example.modules) {
            const moduleKey = Object.keys(example.modules).find(key => {
                const module = example.modules[key];
                return module.file === filename || filename.endsWith(module.file);
            });
            return moduleKey ? example.modules[moduleKey] : null;
        }
        return example;
    }

    /**
     * Format parameters from configuration
     * @private
     * @param {Object} config 
     * @returns {Object} 
     */
    _formatParameters(config) {
        return {
            curriedParams: Array.isArray(config.curryArgs) ? `(${config.curryArgs.join(' ')})` : (config.curryArgs || ''),
            solutionParams: config.solutionArgs || '()'
        };
    }
}