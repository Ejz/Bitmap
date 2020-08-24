let snowball = require('node-snowball');
let sprintf = require('util').format;
let stopwords = require('./stopwords');
let _ = require('ejz-helpers');

function isNumeric(i) {
    let n = i !== '' ? Number(i) : NaN;
    return Number.MIN_SAFE_INTEGER <= n && n <= Number.MAX_SAFE_INTEGER;
}

function rand(min = 0, max = Number.MAX_SAFE_INTEGER) {
    min = Number(min);
    max = Number(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
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

function toDecimal(v) {
    return isNumeric(v) ? Number(v) : undefined;
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
    let words = _.isArray(sentence) ? sentence : wordSplit(sentence);
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
    ..._,
    sprintf,
    isNumeric,
    rand,
    toDateTimeInteger,
    toDateInteger,
    toInteger,
    toDecimal,
    toBoolean,
    wordSplit,
    stem,
    prefixSearch,
    triplet,
};
