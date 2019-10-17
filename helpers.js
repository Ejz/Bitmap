const jison = require('jison');

const CR = '\r'
const LF = '\n'
const CRLF = CR + LF;

function command_grammar() {
    var grammar = {
        "lex": {
            "rules": [
               ["\\s+", "/* skip whitespace */"],
               ["[a-f0-9]+", "return 'HEX';"]
            ]
        },

        "bnf": {
            "hex_strings" :[ "hex_strings HEX",
                             "HEX" ]
        }
    };
    var parser = new jison.Parser(grammar);
    return parser.parse("adfe34bc e82a");
}

function to_resp(message) {
    let resp = [];
    if (Array.isArray(message)) {
        resp.push('*' + message.length + CRLF);
        message.forEach((message) => {
            resp.push(to_resp(message));
        });
    } else if (typeof(message) === 'number') {
        resp.push(':' + message + CRLF);
    } else if (typeof(message) === 'string') {
        if (
            message.indexOf(CR) === -1 &&
            message.indexOf(LF) === -1
        ) {
            resp.push('+' + message + CRLF);
        } else {
            resp.push('$' + message.length + CRLF);
            resp.push(message + CRLF);
        }
    } else if (typeof(message) === 'object' && message.constructor.name === 'Error') {
        resp.push('-' + message.message + CRLF);
    }
    return resp.join('');
}

async function from_resp(fread) {
    let line = await fread();
    let type = line[0];
    let result = line.substr(1, line.length - 3);
    if (type === '-') {
        throw new Error(result);
    }
    if (type === '+') {
        return result;
    }
    if (type === ':') {
        return parseInt(result);
    }
    if (type === '$') {
        result = parseInt(result);
        if (result === -1) {
            return null;
        }
        result = await fread(result + 2);
        return result.substr(0, result.length - 2);
    }
    if (type === '*') {
        let count = parseInt(result);
        result = [];
        for (let i = 0; i < count; i++) {
            result.push(await from_resp(fread));
        }
        return result;
    }
    throw new Error('UNKNOWN TYPE: ' + type);
}

module.exports = {
    to_resp,
    from_resp,
};
