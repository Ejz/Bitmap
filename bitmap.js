const RoaringBitmap32 = require('roaring/RoaringBitmap32');
const RoaringBitmap32Iterator = require('roaring/RoaringBitmap32Iterator');
const grammar = require('./grammar');
const helpers = require('./helpers');
const storage = {};

const queryGrammar = new grammar.Query();

const ERR_PREFIX = 'ERR: ';
const md5 = helpers.md5;

function createIndex({index, fields}) {
    return new Promise((resolve, reject) => {
        if (storage[index]) {
            return reject(new Error(ERR_PREFIX + 'Index ALREADY exists: ' + index));
        }
        if ((new Set(fields.map((f) => f.field))).size != fields.length) {
            return reject(new Error(ERR_PREFIX + 'Duplicate columns: ' + index));
        }
        let f = {};
        for (const {field, type, enums, min, max} of fields) {
            let bitmaps = {};
            if (type === 'INTEGER') {
                for (let i = min; i <= max; i++) {
                    bitmaps['_' + i] = new RoaringBitmap32([]);
                }
            }
            f[field] = {
                type,
                bitmaps,
                ...(enums !== undefined ? {enums} : {}),
                ...(min !== undefined ? {min} : {}),
                ...(max !== undefined ? {max} : {}),
            };
        }
        fields = f;
        let ids = new RoaringBitmap32([]);
        storage[index] = {fields, ids};
        return resolve('CREATED');
    });
}

function addRecordToIndex({index, id, values}) {
    return new Promise((resolve, reject) => {
        if (!storage[index]) {
            return reject(new Error(ERR_PREFIX + 'Index NOT exist: ' + index));
        }
        let {fields, ids} = storage[index];
        if (ids.has(id)) {
            return reject(new Error(ERR_PREFIX + 'ID ALREADY exists: ' + id));
        }
        if (id < 1) {
            return reject(new Error(ERR_PREFIX + 'ID is NEGATIVE or ZERO: ' + id));
        }
        if ((new Set(values.map((v) => v.field))).size != values.length) {
            return reject(new Error(ERR_PREFIX + 'Duplicate columns: ' + index));
        }
        let available = Object.keys(fields);
        for (const {value, field} of values) {
            if (!available.includes(field)) {
                return reject(new Error(ERR_PREFIX + 'Column NOT exist: ' + field));
            }
            let {type, bitmaps, enums, min, max} = fields[field];
            let invalid = ERR_PREFIX + 'Invalid ' + type + ' value: ' + value;
            if (type === 'INTEGER') {
                if (value > max || value < min) {
                    return reject(new Error(invalid));
                }
                for (let i = value; i <= max; i++) {
                    bitmaps['_' + i].add(id);
                }
            } else if (type === 'ENUM') {
                if (!fields[field].enums.includes(value)) {
                    return reject(new Error(invalid));
                }
            } else if (type === 'BOOLEAN') {
                if (![true, false, 0, 1].includes(value)) {
                    return reject(new Error(invalid));
                }
            } else if (type === 'STRING') {
                let digest = md5(value);
                if (!bitmaps[digest]) {
                    bitmaps[digest] = new RoaringBitmap32([]);
                }
                bitmaps[digest].add(id);
            }
        }
        ids.add(id);
        storage[index].min = Math.min(...[id, storage[index].min].filter(Number));
        storage[index].max = Math.max(...[id, storage[index].max].filter(Number));
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
        console.log(query)
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
            let queries = values.map((v) => ({values: [v], field}));
            return getOrBitmap(index, queries);
        }
        if (field && !storage[index].fields[field]) {
            throw ERR_PREFIX + 'Column NOT exist: ' + field;
        }
        let [value] = values;
        if (value === '*') {
            return storage[index].ids;
        }
        let {type, bitmaps, enums, min, max} = storage[index].fields[field];
        if (type === 'STRING') {
            return bitmaps[md5(value)] || new RoaringBitmap32();
        }
        if (type === 'INTEGER') {
            if (!Array.isArray(value)) {
                value = [value, value];
            }
            let [from, to] = value;
            from = ['MIN', 'MAX'].includes(from) ? (from == 'MAX' ? max : min) : from;
            to = ['MIN', 'MAX'].includes(to) ? (to == 'MAX' ? max : min) : to;
            if (to < from || to < min || from > max) {
                return new RoaringBitmap32();
            }
            from = from < min ? min : from;
            to = to > max ? max : to;
            if (to == min) {
                return bitmaps['_' + to];
            }
            if (from == min && to == max) {
                return bitmaps['_' + to];
            }
            // if (from == )
            // console.log(bitmaps)
            // console.log('_' + from, '_' + (to - 1));
            // console.log(RoaringBitmap32.andNot(bitmaps[from], bitmaps[to + 1]).toArray());
            // console.log(bitmaps['_' + from].toArray());
            // console.log(bitmaps['_' + (to - 1)].toArray());
            return RoaringBitmap32.andNot(bitmaps['_' + to], bitmaps['_' + (from - 1)]);
        }
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
