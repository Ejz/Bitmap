const RoaringBitmap = require('roaring/RoaringBitmap32');
const RoaringBitmapIterator = require('roaring/RoaringBitmap32Iterator');
const helpers = require('./helpers');
const Grammar = require('./grammar');
const C = require('./constants');
const sprintf = require('util').format;

const generateHex = helpers.generateHex;
const stem = helpers.stem;
const isUnique = helpers.isUnique;
const isInteger = helpers.isInteger;
const grammar = new Grammar();

module.exports = {
    PING,
    CREATE,
    DROP,
    ADD,
    SEARCH,
    LIST,
    execute,
    getSortMap,
    getSortSlices,
};

const storage = {};
const cursors = {};

function hex() {
    let _;
    do {
        _ = generateHex();
    } while (Number(_.substring(0, 1)));
    return _;
}

async function execute(strings, ...args) {
    let command = grammar.parse(strings, ...args);
    if (!module.exports[command.action]) {
        throw C.INVALID_ACTION_ERROR;
    }
    return await module.exports[command.action](command);
}

function PING() {
    return C.PING_SUCCESS;
}

function LIST() {
    return Object.keys(storage);
}

function CREATE({index, fields}) {
    return new Promise((resolve, reject) => {
        if (storage[index]) {
            return reject(sprintf(C.INDEX_EXISTS_ERROR, index));
        }
        fields = fields || [];
        if (!isUnique(fields.map(f => f.field))) {
            return reject(sprintf(C.DUPLICATE_COLUMNS_ERROR, index));
        }
        let f = {};
        for (let {field, type, min, max} of fields) {
            let bitmaps = {};
            // let sortmap;
            if (type === C.TYPE_INTEGER) {
                if (max < min) {
                    return reject(sprintf(C.INVALID_MIN_MAX_ERROR, field));
                }
                let zmax = max - min;
                for (let i = 0; i <= zmax; i++) {
                    bitmaps[i] = new RoaringBitmap();
                }
                // if (sortable) {
                //     sortmap = getSortMap(zmax + 1);
                // }
            }
            // if (type === 'FOREIGN') {
            //     if (!parent || !storage[parent]) {
            //         return reject(new Error(ERR_PREFIX + 'Invalid FOREIGN field: ' + field));
            //     }
            // }
            f[field] = {
                type,
                bitmaps,
                // sortable: !!sortable,
                // ...(enums !== undefined ? {enums} : {}),
                ...(min !== undefined ? {min} : {}),
                ...(max !== undefined ? {max} : {}),
                // ...(sortmap !== undefined ? {sortmap} : {}),
                // ...(parent !== undefined ? {parent} : {}),
            };
        }
        fields = f;
        let ids = new RoaringBitmap();
        storage[index] = {fields, ids};
        return resolve(C.CREATE_SUCCESS);
    });
}

function DROP({index}) {
    return new Promise((resolve, reject) => {
        if (!storage[index]) {
            return reject(sprintf(C.INDEX_NOT_EXISTS_ERROR, index));
        }
        delete storage[index];
        return resolve(C.DROP_SUCCESS);
    });
}

function ADD({index, id, values}) {
    return new Promise((resolve, reject) => {
        if (!storage[index]) {
            return reject(sprintf(C.INDEX_NOT_EXISTS_ERROR, index));
        }
        values = values || [];
        let {fields, ids} = storage[index];
        if (ids.has(id)) {
            return reject(sprintf(C.ID_EXISTS_ERROR, id));
        }
        if (!isUnique(values.map(v => v.field))) {
            return reject(sprintf(C.DUPLICATE_COLUMNS_ERROR, index));
        }
        let found;
        found = values.find(({value, field}) => !fields[field]);
        if (found) {
            return reject(sprintf(C.COLUMN_NOT_EXISTS_ERROR, found.field));
        }
        found = values.find(({value, field}) => {
            let {type, min, max} = fields[field];
            return type == C.TYPE_INTEGER && (value < min || max < value);
        });
        if (found) {
            return reject(sprintf(C.INTEGER_OUT_OF_RANGE_ERROR, found.field));
        }
        for (let {value, field} of values) {
            let {type, bitmaps, min, max} = fields[field];
            if (type == C.TYPE_INTEGER) {
                value -= min;
                max -= min;
                min = 0;
                for (let i = value; i <= max; i++) {
                    bitmaps[i].add(id);
                }
                continue;
            }
            if (type == 'STRING') {
                if (!bitmaps[value]) {
                    bitmaps[value] = new RoaringBitmap();
                }
                bitmaps[value].add(id);
                continue;
            }

                // if (sortable) {
                //     for (let i of getSortSlices(max + 1, value)) {
                //         sortmap.bitmaps[i].add(id);
                //     }
                // }
            // let err = C.INVALID_TYPE_VALUE
            // let invalid = ERR_PREFIX + 'Invalid ' + type + ' value: ' + value;
             // else if (type === 'ENUM') {
            //     if (!fields[field].enums.includes(value)) {
            //         return reject(new Error(invalid));
            //     }
            // } else if (type === 'BOOLEAN') {
            //     if (![true, false, 0, 1].includes(value)) {
            //         return reject(new Error(invalid));
            //     }
            // } else if (type === 'STRING') {
            
            // } else if (type === 'FULLTEXT') {
            //     for (let v of stem(value)) {
            //         if (!bitmaps[v]) {
            //             bitmaps[v] = new RoaringBitmap([]);
            //         }
            //         bitmaps[v].add(id);
            //     }
            // } else if (type === 'INTEGERS') {
            //     value = (value.match(/[+-]?\b\d+\b/g) || []).map(x => parseInt(x));
            //     for (let v of value) {
            //         if (Number.isNaN(v)) {
            //             continue;
            //         }
            //         if (!bitmaps[v]) {
            //             bitmaps[v] = new RoaringBitmap([]);
            //         }
            //         bitmaps[v].add(id);
            //     }
            // } else if (type === 'FOREIGN') {
            //     value = parseInt(value);
            //     if (Number.isNaN(value)) {
            //         return reject(new Error(invalid));
            //     }
            //     if (!bitmaps[value]) {
            //         bitmaps[value] = new RoaringBitmap([]);
            //     }
            //     bitmaps[value].add(id);
            // }
        }
        ids.add(id);
        storage[index].min = Math.min(...[id, storage[index].min].filter(Number));
        storage[index].max = Math.max(...[id, storage[index].max].filter(Number));
        return resolve(C.ADD_SUCCESS);
    });
}

function SEARCH({index, query, limit}) {
    return new Promise((resolve, reject) => {
        if (!storage[index]) {
            return reject(sprintf(C.INDEX_NOT_EXISTS_ERROR, index));
        }
        // if (
        //     sortby && (
        //         !storage[index].fields[sortby] ||
        //         !storage[index].fields[sortby].sortable
        //     )
        // ) {
        //     return reject(new Error(ERR_PREFIX + 'Column NOT sortable: ' + sortby));
        // }
        let [off, lim] = limit;
        let cursor = off == 'CURSOR' ? hex() : false;
        off = cursor ? 0 : off;
        // console.log(query);
        // let iterator;
        let bitmap = getBitmap(index, query);
        let iterator = bitmap.iterator();
        // if (sortby) {
        //     let {map, bitmaps} = storage[index].fields[sortby].sortmap;
        //     iterator = getSortIterator(map, bitmaps, bitmap);
        // } else {
        // }
        let size = bitmap.size;
        let ret = [size];
        if (cursor) {
            cursor = ret[0] > lim ? cursor : null;
            ret.push(cursor);
            if (cursor) {
                cursors[cursor] = {size, iterator, lim, off: lim};
                cursors[cursor].tid = setTimeout(() => {
                    delete cursors[cursor];
                }, C.CURSOR_TIMEOUT);
            }
        }
        for (let i = 0; i < off + lim; i++) {
            let {value, done} = iterator.next();
            if (done) {
                break;
            }
            if (off <= i) {
                ret.push(value);
            }
        }
        return resolve(ret);
    });
}

function CURSOR({cursor}) {
    return new Promise((resolve, reject) => {
        if (!cursors[cursor]) {
            return reject(sprintf(C.CURSOR_NOT_EXISTS_ERROR, cursor));
        }
        let cur = cursor;
        let {tid, size, lim, iterator, off} = cursors[cursor];
        clearTimeout(tid);
        let ret = [size];
        cursor = (size > lim + off) ? cursor : null;
        ret.push(cursor);
        if (cursor) {
            cursors[cursor] = {size, iterator, lim, off: lim + off};
            cursors[cursor].tid = setTimeout(() => {
                delete cursors[cursor];
            }, C.CURSOR_TIMEOUT);
        } else {
            delete cursors[cur];
        }
        for (let i = 0; i < lim; i++) {
            let {value, done} = iterator.next();
            if (done) {
                break;
            }
            ret.push(value);
        }
        return resolve(ret);
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
    all.forEach(e => _[e] = new RoaringBitmap());
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

function* getSortIterator(map, bitmaps, bitmap) {
    for (let [k, v] of map.entries()) {
        let and = RoaringBitmap.and(bitmaps[k], bitmap);
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
        if (values.includes('*')) {
            return storage[index].ids;
        }
        if (!values.length) {
            return new RoaringBitmap();
        }
        // if (external) {
        //     if () {

        //     }
            
        // }
        if (values.length > 1) {
            let queries = values.map(v => ({values: [v], field}));
            return getOrBitmap(index, queries);
        }
        let [value] = values;
        if (field && !storage[index].fields[field]) {
            throw ERR_PREFIX + 'Column NOT exist: ' + field;
        }
        if (!field) {
            let fields = Object.entries(storage[index].fields);
            fields = fields.filter(([k, v]) => ['FULLTEXT'].includes(v.type));
            fields = fields.map(([k, v]) => k);
            if (!fields.length) {
                return new RoaringBitmap();
            }
            let queries = fields.map(field => ({values, field}));
            return getOrBitmap(index, queries);
        }
        let {type, bitmaps, min, max} = storage[index].fields[field];
        if (type === 'STRING') {
            return bitmaps[value] || new RoaringBitmap();
        }
        if (type === 'FULLTEXT') {
            let words = Array.isArray(value) ? value : stem(value);
            if (!words.length) {
                return new RoaringBitmap();
            }
            if (words.length == 1) {
                return bitmaps[words[0]] || new RoaringBitmap();
            }
            let queries = words.map((v) => ({values: [v], field}));
            return getAndBitmap(index, queries);
        }
        if (type === C.TYPE_INTEGER) {
            if (!Array.isArray(value)) {
                value = [value, value];
            }
            let [from, to] = value;
            from = ['MIN', 'MAX'].includes(from) ? (from == 'MAX' ? max : min) : from;
            to = ['MIN', 'MAX'].includes(to) ? (to == 'MAX' ? max : min) : to;
            if (!isInteger(from)) {
                throw sprintf(C.INVALID_INTEGER_VALUE, from);
            }
            if (!isInteger(to)) {
                throw sprintf(C.INVALID_INTEGER_VALUE, to);
            }
            from = from < min ? min : from;
            to = to > max ? max : to;
            if (to < from || to < min || from > max) {
                return new RoaringBitmap();
            }
            to -= min;
            from -= min;
            max -= min;
            min = 0;
            if (!to || !from) {
                return bitmaps[to];
            }
            return RoaringBitmap.andNot(bitmaps[to], bitmaps[from - 1]);
        }
        if (type === 'INTEGERS') {
            return bitmaps[value] || new RoaringBitmap();
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
        if (!(query instanceof RoaringBitmap)) {
            query = getBitmap(index, query);
        }
        return query;
    });
    let and = RoaringBitmap.and(queries[0], queries[1]);
    queries = queries.splice(2);
    for (let i = 0; i < queries.length; i++) {
        and = and.andInPlace(queries[i]);
    }
    return and;
}

function getOrBitmap(index, queries) {
    queries = queries.map((query) => {
        if (!(query instanceof RoaringBitmap)) {
            query = getBitmap(index, query);
        }
        return query;
    });
    return RoaringBitmap.orMany(queries);
}

function getNotBitmap(index, [query]) {
    if (!(query instanceof RoaringBitmap)) {
        query = getBitmap(index, query);
    }
    let bitmap = new RoaringBitmap(query);
    let {min, max} = storage[index];
    bitmap.flipRange(min, max + 1);
    return bitmap;
}
