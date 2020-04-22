const snowball = require('node-snowball');
const sprintf = require('util').format;
const stopwords = require('./stopwords');

function isString(f) {
    return typeof(f) == 'string';
}

function isFunction(f) {
    return typeof(f) == 'function';
}

let isArray = Array.isArray;

function isObject(o) {
    return (!!o) && (o.constructor === Object);
}

function isNumeric(i) {
    let n = i !== '' ? Number(i) : NaN;
    return Number.MIN_SAFE_INTEGER <= n && n <= Number.MAX_SAFE_INTEGER;
}

function rand(min = 0, max = Number.MAX_SAFE_INTEGER) {
    min = Number(min);
    max = Number(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function to(p) {
    p = p.then ? p : Promise.resolve(p);
    return p.then(data => [null, data]).catch(err => [err, null]);
}

function nsplit(str) {
    return str.split(/\s*\n\s*/g).map(_ => _.trim()).filter(Boolean);
}

function unique(array) {
    return array.filter((v, i, a) => a.indexOf(v) == i);
}

function filter(obj, f) {
    if (isArray(obj)) {
        return obj.filter(f);
    }
    let reducer = (res, key) => (res[key] = obj[key], res);
    return Object.keys(obj).filter(k => f(k, obj[k])).reduce(reducer, {});
}

function toDateTimeInteger(v) {
    v = toInteger(Date.parse(v));
    return v === undefined ? v : Math.floor(v / 1000);
}

function toDateInteger(v) {
    v = toDateTimeInteger(v);
    return v === undefined ? v : Math.floor(v / 86400);
}

function toInteger(v) {
    return isNumeric(v) ? Math.floor(Number(v)) : undefined;
}

function toBoolean(v) {
    return ['true', '1', 'yes'].includes(String(v).toLowerCase());
}

function wordSplit(sentence, prefixSearch) {
    let words = sentence.trim().toLowerCase().split(/\W+/);
    words = words.filter(word => word.length);
    if (prefixSearch) {
        let w = words.pop();
        words = words.filter((v, i, a) => a.lastIndexOf(v) == i);
        words.push(w);
    } else {
        words = words.filter((v, i, a) => a.lastIndexOf(v) == i);
    }
    return words;
}

function stem(sentence, noStopwords) {
    let words = isArray(sentence) ? sentence : wordSplit(sentence);
    if (noStopwords) {
        words = words.filter(word => !stopwords[word]);
    }
    words = words.map(word => snowball.stemword(word));
    words = words.filter((v, i, a) => a.lastIndexOf(v) == i);
    return words;
}

function prefixSearch(word, max = 6) {
    let ret = [];
    for (let i = Math.min(word.length, max); i >= 1; i--) {
        ret.push(word.substring(0, i));
    }
    return ret;
}

function triplet(word) {
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

module.exports = {
    sprintf,
    isString,
    isFunction,
    isArray,
    isObject,
    isNumeric,
    rand,
    to,
    nsplit,
    unique,
    filter,
    toDateTimeInteger,
    toDateInteger,
    toInteger,
    toBoolean,
    wordSplit,
    stem,
    prefixSearch,
    triplet,
};
