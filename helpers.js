const crypto = require('crypto');
const snowball = require('node-snowball');

const CR = '\r';
const LF = '\n';
const CRLF = CR + LF;

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
    return Math.floor(Math.random() * Math.pow(2, 32)).toString(16).toUpperCase();
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
            result.push(await fromResp(fread));
        }
        return result;
    }
    throw new Error('UNKNOWN TYPE: ' + type);
}

function to(promise) {
    return promise.then((data) => {
        return [null, data];
    }).catch(err => [err]);
}

module.exports = {
    to,
    generateHex,
    md5,
    rand,
    toResp,
    fromResp,
    stem,
};
