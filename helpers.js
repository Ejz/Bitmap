const fs = require('fs');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');
const snowball = require('node-snowball');
const C = require('./constants');

const CR = '\r';
const LF = '\n';
const CRLF = CR + LF;

const sprintf = require('util').format;
const stopwords = require('./stopwords');

function stem(sentence, noStopwords) {
    sentence = sentence.trim().toLowerCase().split(/\W+/);
    sentence = sentence.filter(word => word.length);
    if (noStopwords) {
        sentence = sentence.filter(word => !stopwords[word]);
    }
    sentence = sentence.map(word => snowball.stemword(word));
    return sentence;
}

function triplets(word) {
    let triplets = [];
    if (word.length > 0) {
        triplets.push(word[0]);
    }
    if (word.length > 1) {
        triplets.push(word[0] + word[1]);
    }
    for (let i = 0; i < word.length - 2; i++) {
        triplets.push(word.substring(i, i + 3));
    }
    return triplets;
}

function md5(string) {
    return crypto.createHash('md5').update(string).digest('hex');
}

function rand(min = 0, max = Number.MAX_SAFE_INTEGER) {
    min = Number(min);
    max = Number(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
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
            socket.off('error', cb_end);
        }
        socket.on('data', cb_data);
        socket.on('end', cb_end);
        socket.on('error', cb_end);
        cb_data();
    });
}

function toResp(message) {
    let resp = [];
    if (isArray(message)) {
        resp.push('*' + message.length + CRLF);
        message.forEach((message) => {
            resp.push(toResp(message));
        });
    } else if (typeof(message) === 'number') {
        resp.push(':' + message + CRLF);
    } else if (isString(message)) {
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

function generateHex() {
    return Math.floor(Math.random() * Math.pow(2, 32)).toString(16);
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

function toBoolean(v) {
    v = ['true', '1'].includes(String(v).toLowerCase());
    return v ? '1' : '0';
}

function toDateInteger(v) {
    v = toDateTimeInteger(v);
    return v - (v % (3600 * 24));
}

function toDateTimeInteger(v) {
    let d = Date.parse(v);
    return isInteger(d) ? d / 1000 : 0;
}

/* IS_* FUNCTIONS */

function isString(f) {
    return typeof f === 'string';
}

function isFunction(f) {
    return typeof f === 'function';
}

let isArray = Array.isArray;

function isObject(o) {
    return (!!o) && (o.constructor === Object);
}

function isDirectory(dir) {
    try {
        return fs.lstatSync(dir).isDirectory();
    } catch (e) {
        return false;
    }
}

function isFile(file) {
    try {
        let stat = fs.lstatSync(file);
        return stat.isFile() || stat.isSymbolicLink();
    } catch (e) {
        return false;
    }
}

/* FS OPERATIONS */

function readFile(file) {
    if (!isFile(file)) {
        return;
    }
    return String(fs.readFileSync(file));
}

function writeFile(file, content) {
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, content);
}

function appendFile(file, content) {
    fs.appendFileSync(file, content);
}

function renameDirectory(dir1, dir2) {
    if (!isDirectory(dir1) || isDirectory(dir2)) {
        return;
    }
    fs.renameSync(dir1, dir2);
}

function readDirectory(dir) {
    let files = isDirectory(dir) ? fs.readdirSync(dir) : [];
    return files.map(f => dir + '/' + f);
}

function rm(smth) {
    if (isFile(smth)) {
        fs.unlinkSync(smth);
        return;
    }
    if (isDirectory(smth)) {
        readDirectory(smth).map(rm);
        fs.rmdirSync(smth);
    }
}

function readLines(file, handle) {
    return new Promise(resolve => {
        if (!isFile(file)) {
            return resolve();
        }
        let rl = readline.createInterface({
            input: fs.createReadStream(file),
            crlfDelay: Infinity,
        });
        rl.on('line', handle);
        rl.on('close', resolve);
    });
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
    triplets,
    sprintf,
    castToArray,
    isInteger,
    toBoolean,
    toDateInteger,
    toDateTimeInteger,
    isString,
    isFunction,
    isArray,
    isObject,
    isDirectory,
    isFile,
    readFile,
    writeFile,
    appendFile,
    renameDirectory,
    readDirectory,
    rm,
    readLines,
};
