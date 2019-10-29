const crypto = require('crypto');
const snowball = require('node-snowball');
const C = require('./constants');

const CR = '\r';
const LF = '\n';
const CRLF = CR + LF;

const sprintf = require('util').format;

function stem(word) {
    return word.split(/\W+/).filter(w => w.length).map(w => snowball.stemword(w.toLowerCase()));
}

function md5(string) {
    return crypto.createHash('md5').update(string).digest('hex');
}

function rand(min, max) {
    min = parseInt(min);
    max = parseInt(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateHex() {
    return Math.floor(Math.random() * Math.pow(2, 32)).toString(16);
}

function isUnique(array) {
    return new Set(array).size == array.length;
}

function freader(socket) {
    let buffer = '';
    return (size) => new Promise((resolve, reject) => {
        function cb_data(data) {
            if (data !== undefined) {
                buffer += data.toString();
            }
            let n = buffer.indexOf(CRLF);
            let undef = size === undefined;
            if (
                (!undef && buffer.length >= size) ||
                (undef && ~n)
            ) {
                let s = undef ? n + 2 : size;
                let result = buffer.substring(0, s);
                buffer = buffer.substring(s);
                finalize();
                resolve(result);
            }
        }
        function cb_end() {
            finalize();
            reject(C.CONNECTION_ERROR);
        }
        function finalize() {
            socket.off('data', cb_data);
            socket.off('end', cb_end);
        }
        socket.on('data', cb_data);
        socket.on('end', cb_end);
        cb_data();
    });
}

function toResp(message) {
    let resp = [];
    if (Array.isArray(message)) {
        resp.push('*' + message.length + CRLF);
        message.forEach((message) => {
            resp.push(toResp(message));
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

async function fromResp(fread) {
    let line = await fread();
    let type = line[0];
    let result = line.substr(1, line.length - 3);
    if (type === '-') {
        throw result;
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
            result.push(await fromResp(fread));
        }
        return result;
    }
    throw 'UNKNOWN TYPE: ' + type;
}

function to(p) {
    p = p.then ? p : Promise.resolve(p);
    return p.then(data => [data, null]).catch(err => [null, err]);
}

function castToArray(strings, ...args) {
    if (Array.isArray(strings)) {
        if (args.length) {
            throw C.INVALID_INPUT;
        }
        return strings;
    }
    if (typeof(strings) != 'string') {
        throw C.INVALID_INPUT;
    }
    let r = /\?/g;
    if ((strings.match(r) || []).length != args.length) {
        throw C.INVALID_INPUT;
    }
    let cb = () => String(args.shift());
    return strings.split(/\s+/).filter(Boolean).map(_ => _.replace(r, cb));
}

function isInteger(i) {
    let [min, max] = [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER];
    return min <= i && i <= max;
}

function equal(a, b) {
    return JSON.stringify(a) == JSON.stringify(b);
}

module.exports = {
    equal,
    to,
    generateHex,
    freader,
    md5,
    isUnique,
    rand,
    toResp,
    fromResp,
    stem,
    sprintf,
    castToArray,
    isInteger,
};
