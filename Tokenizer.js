const C = require('./constants');

class Tokenizer {
    constructor(rules) {
        this.rules = Object.entries(rules);
    }
    tokenize(string) {
        string = String(string).trim();
        let tokens = [];
        let rules = this.rules;
        let context = {mode: undefined};
        w: while (string.length) {
            for (let [type, [regex, normalize, mode]] of rules) {
                let m = context.mode === mode && string.match(regex);
                if (!m) {
                    continue;
                }
                let value = normalize.bind(context)(m);
                if (value === undefined) {
                    return C.E(C.TOKENIZER_ERROR_GENERIC);
                }
                string = string.substring(m[0].length);
                tokens.push({type, value});
                continue w;
            }
            return C.E(C.TOKENIZER_ERROR_GENERIC);
        }
        if (context.mode !== undefined) {
            return C.E(C.TOKENIZER_ERROR_GENERIC);
        }
        return tokens;
    }
}

module.exports = Tokenizer;
