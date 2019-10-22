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
        for (const {field, type, enums, min, max, sortable} of fields) {
            let bitmaps = {};
            let sortmap;
            if (type === 'INTEGER') {
                if (max < min) {
                    return reject(new Error(ERR_PREFIX + 'Invalid MIN or MAX: ' + field));
                }
                let zmax = max - min;
                for (let i = 0; i <= zmax; i++) {
                    bitmaps[i] = new RoaringBitmap32([]);
                }
                if (sortable) {
                    sortmap = getSortMap(zmax + 1);
                }
            }
            f[field] = {
                type,
                bitmaps,
                sortable: !!sortable,
                ...(enums !== undefined ? {enums} : {}),
                ...(min !== undefined ? {min} : {}),
                ...(max !== undefined ? {max} : {}),
                ...(sortmap !== undefined ? {sortmap} : {}),
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
        for (let {value, field} of values) {
            if (!available.includes(field)) {
                return reject(new Error(ERR_PREFIX + 'Column NOT exist: ' + field));
            }
            let {type, bitmaps, enums, min, max, sortable, sortmap} = fields[field];
            let invalid = ERR_PREFIX + 'Invalid ' + type + ' value: ' + value;
            if (type === 'INTEGER') {
                if (value > max || value < min) {
                    return reject(new Error(invalid));
                }
                value -= min;
                max -= min;
                min = 0;
                if (sortable) {
                    for (let i of getSortSlices(max + 1, value)) {
                        sortmap.bitmaps[i].add(id);
                    }
                }
                for (let i = value; i <= max; i++) {
                    bitmaps[i].add(id);
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

function getSortMap(card) {
    let all = [];
    let shift = 0;
    let div = 10;
    let tree = [];
    do {
        tree[shift] = new Map();
        for (let i = 0; i < (shift ? card + 1 : card); i++) {
            let _ = i + 'x'.repeat(shift);
            all.push(_);
            tree[shift].set(_, null);
            if (shift) {
                let regex = new RegExp('^' + _.replace(/^0+/, '').replace('x', '\\d') + '$');
                let map = all.filter((a) => regex.test(a)).map((a) => {
                    let v = null;
                    if (tree[shift - 1] && tree[shift - 1].has(a)) {
                        v = tree[shift - 1].get(a);
                    }
                    return [a, v];
                });
                tree[shift].set(_, new Map(map));
            }
        }
        card = Math.floor((card - 1) / div);
        shift++;
    } while (card);
    let _ = {};
    all.forEach(e => _[e] = new RoaringBitmap32());
    return {map: tree[shift - 1], bitmaps: _};
}

function getSortSlices(card, value) {
    let shift = 0;
    let div = 10;
    let slices = [];
    do {
        slices.push(value + 'x'.repeat(shift))
        card = Math.floor((card - 1) / div);
        shift++;
        value = Math.floor(value / div);
    } while (card);
    return slices;
}

function searchIndex({index, query, limit, sortby}) {
    return new Promise((resolve, reject) => {
        if (!storage[index]) {
            return reject(new Error(ERR_PREFIX + 'Index NOT exist: ' + index));
        }
        if (
            sortby && (
                !storage[index].fields[sortby] ||
                !storage[index].fields[sortby].sortable
            )
        ) {
            return reject(new Error(ERR_PREFIX + 'Column NOT sortable: ' + sortby));
        }
        limit = limit || 100;
        query = queryGrammar.parse(query);
        let iterator;
        let bitmap = getBitmap(index, query);
        if (sortby) {
            let {map, bitmaps} = storage[index].fields[sortby].sortmap;
            iterator = getSortIterator(map, bitmaps, bitmap);
        } else {
            iterator = bitmap.iterator();
        }
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

function* getSortIterator(map, bitmaps, bitmap) {
    for (let [k, v] of map.entries()) {
        let and = RoaringBitmap32.and(bitmaps[k], bitmap);
        if (v === null) {
            yield* and.iterator();
        } else if (and.size) {
            yield* getSortIterator(v, bitmaps, bitmap);
        }
    }
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
            to -= min;
            from -= min;
            max -= min;
            min = 0;
            if ((to == 0) || (from == 0 && to == max)) {
                return bitmaps[to];
            }
            return RoaringBitmap32.andNot(bitmaps[to], bitmaps[from - 1]);
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
    bitmap.flipRange(min, max + 1);
    return bitmap;
}

function dropIndex({index}) {
    return new Promise((resolve, reject) => {
        if (!storage[index]) {
            return reject(new Error(ERR_PREFIX + 'Index NOT exist: ' + index));
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
    getSortMap,
    getSortSlices,
};
