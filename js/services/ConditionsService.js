
class ConditionsService {
    constructor() {
        this.conditionRegistry = {
            compiled: {
                "q": { code: 1, name: "REMARK", description: "Add arbitrary data to blockchain (always succeeds)", category: "Basic" },
                
                "coinid": { code: 48, name: "AGG_SIG_PARENT_PUZZLE", description: "Aggregate signature with parent and puzzle", category: "Signatures" },
                "g1_subtract": { code: 49, name: "AGG_SIG_UNSAFE", description: "Aggregate signature (unsafe - can be replayed)", category: "Signatures" },
                "g1_multiply": { code: 50, name: "AGG_SIG_ME", description: "Aggregate signature with coin ID (most common)", category: "Signatures" },
                
                "g1_negate": { code: 51, name: "CREATE_COIN", description: "Create new coin with puzzle hash and amount", category: "Creation" },
                "g2_add": { code: 52, name: "RESERVE_FEE", description: "Reserve fee for transaction processing", category: "Creation" },
                
                "modpow": { code: 60, name: "CREATE_COIN_ANNOUNCEMENT", description: "Create coin announcement for coordination", category: "Announcements" },
                "%": { code: 61, name: "ASSERT_COIN_ANNOUNCEMENT", description: "Assert that a coin announcement exists", category: "Announcements" },
                "keccak256": { code: 62, name: "CREATE_PUZZLE_ANNOUNCEMENT", description: "Create puzzle announcement", category: "Announcements" },
            },
            numeric: {
                1: { name: "REMARK", description: "Add arbitrary data to blockchain (always succeeds)", category: "Basic" },
                
                43: { name: "AGG_SIG_PARENT", description: "Aggregate signature with parent coin ID", category: "Signatures" },
                44: { name: "AGG_SIG_PUZZLE", description: "Aggregate signature with puzzle hash", category: "Signatures" },
                45: { name: "AGG_SIG_AMOUNT", description: "Aggregate signature with amount", category: "Signatures" },
                46: { name: "AGG_SIG_PUZZLE_AMOUNT", description: "Aggregate signature with puzzle hash and amount", category: "Signatures" },
                47: { name: "AGG_SIG_PARENT_AMOUNT", description: "Aggregate signature with parent and amount", category: "Signatures" },
                48: { name: "AGG_SIG_PARENT_PUZZLE", description: "Aggregate signature with parent and puzzle", category: "Signatures" },
                49: { name: "AGG_SIG_UNSAFE", description: "Aggregate signature (unsafe - can be replayed)", category: "Signatures" },
                50: { name: "AGG_SIG_ME", description: "Aggregate signature with coin ID (most common)", category: "Signatures" },
                
                51: { name: "CREATE_COIN", description: "Create new coin with puzzle hash and amount", category: "Creation" },
                52: { name: "RESERVE_FEE", description: "Reserve fee for transaction processing", category: "Creation" },
                
                60: { name: "CREATE_COIN_ANNOUNCEMENT", description: "Create coin announcement for coordination", category: "Announcements" },
                61: { name: "ASSERT_COIN_ANNOUNCEMENT", description: "Assert that a coin announcement exists", category: "Announcements" },
                62: { name: "CREATE_PUZZLE_ANNOUNCEMENT", description: "Create puzzle announcement", category: "Announcements" },
                63: { name: "ASSERT_PUZZLE_ANNOUNCEMENT", description: "Assert that a puzzle announcement exists", category: "Announcements" },
                
                64: { name: "ASSERT_CONCURRENT_SPEND", description: "Ensure specific coins are spent together", category: "Concurrency" },
                65: { name: "ASSERT_CONCURRENT_PUZZLE", description: "Ensure specific puzzles are spent together", category: "Concurrency" },
                66: { name: "SEND_MESSAGE", description: "Send message to other coins", category: "Messaging" },
                67: { name: "RECEIVE_MESSAGE", description: "Receive message from other coins", category: "Messaging" },
                
                70: { name: "ASSERT_MY_COIN_ID", description: "Assert this coin's ID", category: "Self-Assertion" },
                71: { name: "ASSERT_MY_PARENT_ID", description: "Assert this coin's parent ID", category: "Self-Assertion" },
                72: { name: "ASSERT_MY_PUZZLEHASH", description: "Assert this coin's puzzle hash", category: "Self-Assertion" },
                73: { name: "ASSERT_MY_AMOUNT", description: "Assert this coin's amount", category: "Self-Assertion" },
                74: { name: "ASSERT_MY_BIRTH_SECONDS", description: "Assert this coin's birth seconds", category: "Self-Assertion" },
                75: { name: "ASSERT_MY_BIRTH_HEIGHT", description: "Assert this coin's birth height", category: "Self-Assertion" },
                76: { name: "ASSERT_EPHEMERAL", description: "Assert this coin is ephemeral", category: "Self-Assertion" },
                
                80: { name: "ASSERT_SECONDS_RELATIVE", description: "Assert minimum seconds since coin creation", category: "Time" },
                81: { name: "ASSERT_SECONDS_ABSOLUTE", description: "Assert minimum timestamp", category: "Time" },
                82: { name: "ASSERT_HEIGHT_RELATIVE", description: "Assert minimum blocks since coin creation", category: "Height" },
                83: { name: "ASSERT_HEIGHT_ABSOLUTE", description: "Assert minimum block height", category: "Height" },
                
                84: { name: "ASSERT_BEFORE_SECONDS_RELATIVE", description: "Assert maximum seconds since coin creation", category: "Time" },
                85: { name: "ASSERT_BEFORE_SECONDS_ABSOLUTE", description: "Assert maximum timestamp", category: "Time" },
                86: { name: "ASSERT_BEFORE_HEIGHT_RELATIVE", description: "Assert maximum blocks since coin creation", category: "Height" },
                87: { name: "ASSERT_BEFORE_HEIGHT_ABSOLUTE", description: "Assert maximum block height", category: "Height" },
                
                90: { name: "SOFTFORK", description: "Soft fork placeholder for future conditions", category: "Special" }
            }
        };
        
        this._initialize();
    }
    
    /**
     * Initialize patterns and lookup maps
     * @private
     */
    _initialize() {
        const compiledKeys = Object.keys(this.conditionRegistry.compiled);
        const escapedKeys = compiledKeys.map(op => op === '%' ? '\\%' : op);
        
        this.patterns = {
            compiledValidation: new RegExp(`\\(\\s*(${escapedKeys.join('|')})\\s+`),
            numericValidation: /\(\s*\d+\s+/,
            compiledParsing: /\(\s*([a-z]+[a-z0-9_]*|%)\s+(.*?)\s*\)$/,
            numericParsing: /\(\s*(\d+)\s*(.*?)\s*\)$/
        };
        
        this.lookupMaps = {
            compiled: new Map(Object.entries(this.conditionRegistry.compiled)),
            numeric: new Map(Object.entries(this.conditionRegistry.numeric).map(([key, value]) => [parseInt(key), value]))
        };
    }

    /**
     * Parse ChiaLisp condition codes from result string
     * @param {string} result 
     * @returns {string|null} 
     */
    parseConditionCodes(result) {
        if (!result.startsWith('((') || !result.endsWith('))')) {
            return null;
        }
        
        const innerContent = result.slice(1, -1).trim();
        const conditions = this.extractPairs(innerContent);
        
        if (conditions.length === 0) {
            return null;
        }
        
        let hasValidConditions = false;
        const jsonData = {};
        
        for (let i = 0; i < conditions.length; i++) {
            const condition = conditions[i];
            const conditionInfo = this._parseCondition(condition);
            
            if (conditionInfo) {
                hasValidConditions = true;
                const key = `Condition ${i + 1}`;
                jsonData[key] = conditionInfo.args ? 
                    `${conditionInfo.name}: ${conditionInfo.args}` : 
                    conditionInfo.name;
            } else {
                const key = `Condition ${i + 1}`;
                jsonData[key] = `UNKNOWN: ${condition}`;
            }
        }
        
        return hasValidConditions ? this.formatJSON(jsonData) : null;
    }

    /**
     * Parse individual condition
     * @private
     * @param {string} condition 
     * @returns {Object|null} 
     */
    _parseCondition(condition) {
        let match = this.patterns.compiledParsing.exec(condition);
        if (match) {
            const operator = match[1];
            const conditionInfo = this.lookupMaps.compiled.get(operator);
            if (conditionInfo) {
                return {
                    name: conditionInfo.name,
                    args: match[2].trim(),
                    operator: operator
                };
            }
        }
        
        match = this.patterns.numericParsing.exec(condition);
        if (match) {
            const code = parseInt(match[1]);
            const conditionInfo = this.lookupMaps.numeric.get(code);
            if (conditionInfo) {
                return {
                    name: conditionInfo.name,
                    args: match[2].trim(),
                    operator: code.toString()
                };
            }
        }
        
        return null;
    }

    /**
     * Extract nested pairs from ChiaLisp text
     * @param {string} text 
     * @returns {Array<string>} 
     */
    extractPairs(text) {
        const pairs = [];
        let depth = 0;
        let start = 0;
        const textLength = text.length;
        
        for (let i = 0; i < textLength; i++) {
            const char = text[i];
            if (char === '(') {
                if (depth === 0) start = i;
                depth++;
            } else if (char === ')') {
                depth--;
                if (depth === 0) {
                    pairs.push(text.slice(start, i + 1));
                }
            }
        }
        
        return pairs;
    }


    /**
     * Format JSON data with syntax highlighting
     * @param {Object} data 
     * @returns {string} 
     */
    formatJSON(data) {
        const jsonString = JSON.stringify(data, null, 2);
        
        return jsonString
            .replace(/"([^"]+)":/g, '<span class="json-key">"$1"</span>:')
            .replace(/:\\s*"([^"]*)"/g, ': <span class="json-string">"$1"</span>')
            .replace(/:\\s*(\\d+)/g, ': <span class="json-number">$1</span>');
    }

}