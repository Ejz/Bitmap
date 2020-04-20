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
                    throw new C.TokenizerError(C.TOKENIZER_ERROR_GENERIC, string);
                }
                string = string.substring(m[0].length);
                tokens.push({type, value});
                continue w;
            }
            throw new C.TokenizerError(C.TOKENIZER_ERROR_GENERIC, string);
        }
        if (context.mode !== undefined) {
            throw new C.TokenizerError(C.TOKENIZER_ERROR_GENERIC, string);
        }
        return tokens;
    }
}

module.exports = Tokenizer;
