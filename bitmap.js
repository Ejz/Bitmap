const RoaringBitmap32 = require('roaring/RoaringBitmap32');
const RoaringBitmap32Iterator = require('roaring/RoaringBitmap32Iterator');
const crypto = require('crypto');
const grammar =  require('./grammar');
const storage = {};

function md5(string) {
    return crypto.createHash('md5').update(string).digest('hex');
}

const queryGrammar = new grammar.Query();
queryGrammar.init();

const ERR_PREFIX = 'ERR: ';

function createIndex({index, fields}) {
    return new Promise((resolve, reject) => {
        if (storage[index]) {
            return reject(new Error('ERR: Index ALREADY exists: ' + index));
        }
        let f = {};
        fields.forEach((field) => {
            f[field.field] = {type: field.type, bitmaps: {}};
        });
        fields = f;
        let ids = new RoaringBitmap32([]);
        storage[index] = {fields, ids};
        return resolve('CREATED');
    });
}

function addRecordToIndex({index, id, values}) {
    return new Promise((resolve, reject) => {
        if (!storage[index]) {
            return reject(new Error('ERR: Index NOT exist: ' + index));
        }
        let {fields, ids} = storage[index];
        if (ids.has(id)) {
            return reject(new Error('ERR: ID ALREADY exists: ' + id));
        }
        storage[index].min = Math.min(...[id, storage[index].min].filter(Number));
        storage[index].max = Math.max(...[id, storage[index].max].filter(Number));
        ids.add(id);
        let available = Object.keys(fields);
        let v = {};
        values.forEach((value) => {
            v[value.field] = value.value;
        });
        values = v;
        v = Object.keys(values);
        let found = v.find((field) => !available.includes(field));
        if (found) {
            return reject(new Error('ERR: Column NOT exist: ' + found));
        }
        if (v.length !== available.length) {
            return reject(new Error('ERR: Specify ALL columns: ' + index));
        }
        Object.entries(values).forEach(([field, value]) => {
            let bitmaps = fields[field].bitmaps;
            field = fields[field];
            let digest = md5(value);
            if (!bitmaps[digest]) {
                bitmaps[digest] = new RoaringBitmap32([]);
            }
            console.log(value, id)
            bitmaps[digest].add(id);
        });
        return resolve('ADDED');
    });
}

function searchIndex({index, query, limit}) {
    return new Promise((resolve, reject) => {
        if (!storage[index]) {
            return reject(new Error('ERR: Index NOT exist: ' + index));
        }
        limit = limit || 100;
        query = queryGrammar.parse(query);
        let iterator = getBitmap(index, query).iterator();
        let ret = [];
        for (let i = 0; i < limit; i++) {
            let {value, done} = iterator.next();
            if (done) {
                break;
            }
            ret.push(value);
        }
        return resolve(ret);
    });
}

function getBitmap(index, query) {
    if (query.values) {
        let {values, field} = query;
        if (values.length > 1) {
            let queries = [];
            values.forEach((value) => {
                queries.push({values: [value], field});
            });
            return getOrBitmap(index, queries);
        }
        let f;
        if (field) {
            field = field.toLowerCase();
            f = storage[index].fields[field];
            if (!f) {
                throw ERR_PREFIX + 'Column NOT exist: ' + f;
            }
        }
        let value = values[0];
        if (value === '*') {
            return storage[index].ids;
        }
        return f.bitmaps[md5(value)] || new RoaringBitmap32();
    }
    let {op, queries} = query;
    op = op || '&';
    if (op === '&') {
        return getAndBitmap(index, queries);
    }
    if (op === '|') {
        return getOrBitmap(index, queries);
    }
    if (op === '-') {
        return getNotBitmap(index, queries);
    }
}

function getAndBitmap(index, queries) {
    queries = queries.map((query) => {
        if (!(query instanceof RoaringBitmap32)) {
            query = getBitmap(index, query);
        }
        return query;
    });
    let and = RoaringBitmap32.and(queries[0], queries[1]);
    queries = queries.splice(2);
    for (let i = 0; i < queries.length; i++) {
        and = and.andInPlace(queries[i]);
    }
    return and;
}

function getOrBitmap(index, queries) {
    queries = queries.map((query) => {
        if (!(query instanceof RoaringBitmap32)) {
            query = getBitmap(index, query);
        }
        return query;
    });
    return RoaringBitmap32.orMany(queries);
}

function getNotBitmap(index, [query]) {
    if (!(query instanceof RoaringBitmap32)) {
        query = getBitmap(index, query);
    }
    let bitmap = new RoaringBitmap32(query);
    let {min, max} = storage[index];
    console.log(min, max);
    bitmap.flipRange(min, max + 1);
    return bitmap;
}

function dropIndex({index}) {
    return new Promise((resolve, reject) => {
        if (!storage[index]) {
            return reject(new Error('ERR: Index NOT exist: ' + index));
        }
        delete storage[index];
        return resolve('DROPPED');
    });
}

module.exports = {
    createIndex,
    dropIndex,
    addRecordToIndex,
    searchIndex,
};
