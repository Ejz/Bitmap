const RoaringBitmap = require('roaring/RoaringBitmap32');
const RoaringBitmapIterator = require('roaring/RoaringBitmap32Iterator');
const Grammar = require('./grammar');
const C = require('./constants');
const _ = require('./helpers');
const debug = require('debug')('bitmap');

const grammar = new Grammar();

module.exports = {
    PING,
    CREATE,
    DROP,
    ADD,
    SEARCH,
    LIST,
    CURSOR,
    execute,
    getSortMap,
    getSortSlices,
};

const storage = {};
const cursors = {};

function hex() {
    let hex;
    do {
        hex = _.generateHex();
    } while (Number(hex.substring(0, 1)));
    return hex;
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
            return reject(_.sprintf(C.INDEX_EXISTS_ERROR, index));
        }
        fields = fields || [];
        if (!_.isUnique(fields.map(f => f.field))) {
            return reject(_.sprintf(C.DUPLICATE_COLUMNS_ERROR, index));
        }
        let f = {};
        for (let {field, type, min, max, sortable, fk} of fields) {
            let bitmaps = {};
            let sortmap;
            if (type == C.TYPE_INTEGER) {
                if (max < min) {
                    return reject(_.sprintf(C.INVALID_MIN_MAX_ERROR, field));
                }
                let zmax = max - min;
                for (let i = 0; i <= zmax; i++) {
                    bitmaps[i] = new RoaringBitmap();
                }
                if (sortable) {
                    sortmap = getSortMap(zmax + 1);
                }
            } else if (type == C.TYPE_FOREIGNKEY) {
                fk = {fk, id2fk: {}};
            }
            f[field] = {
                type,
                bitmaps,
                ...(min !== undefined ? {min} : {}),
                ...(max !== undefined ? {max} : {}),
                ...(sortable !== undefined ? {sortable} : {}),
                ...(sortmap !== undefined ? {sortmap} : {}),
                ...(fk !== undefined ? {fk} : {}),
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
            return reject(_.sprintf(C.INDEX_NOT_EXISTS_ERROR, index));
        }
        delete storage[index];
        return resolve(C.DROP_SUCCESS);
    });
}

function ADD({index, id, values}) {
    return new Promise((resolve, reject) => {
        if (!storage[index]) {
            return reject(_.sprintf(C.INDEX_NOT_EXISTS_ERROR, index));
        }
        values = values || [];
        let {fields, ids} = storage[index];
        if (ids.has(id)) {
            return reject(_.sprintf(C.ID_EXISTS_ERROR, id));
        }
        if (!_.isUnique(values.map(v => v.field))) {
            return reject(_.sprintf(C.DUPLICATE_COLUMNS_ERROR, index));
        }
        let found;
        found = values.find(({value, field}) => !fields[field]);
        if (found) {
            return reject(_.sprintf(C.COLUMN_NOT_EXISTS_ERROR, found.field));
        }
        found = values.find(({value, field}) => {
            let {type, min, max} = fields[field];
            return type == C.TYPE_INTEGER && (value < min || max < value);
        });
        if (found) {
            return reject(_.sprintf(C.INTEGER_OUT_OF_RANGE_ERROR, found.field));
        }
        found = values.find(({value, field}) => {
            let {type} = fields[field];
            return type == C.TYPE_FOREIGNKEY && !(_.isInteger(value) && value > 0);
        });
        if (found) {
            return reject(_.sprintf(C.FOREIGNKEY_ID_OUT_OF_RANGE_ERROR, found.field));
        }
        for (let {value, field} of values) {
            let {type, bitmaps, min, max, sortable, sortmap, fk} = fields[field];
            if (type == C.TYPE_INTEGER) {
                value = Number(value);
                let zvalue = value - min;
                let zmax = max - min;
                for (let i = zvalue; i <= zmax; i++) {
                    bitmaps[i].add(id);
                }
                for (let i of (sortable ? getSortSlices(zmax + 1, zvalue) : [])) {
                    sortmap.bitmaps[i].add(id);
                }
                continue;
            }
            if (type == C.TYPE_STRING) {
                if (!bitmaps[value]) {
                    bitmaps[value] = new RoaringBitmap();
                }
                bitmaps[value].add(id);
                continue;
            }
            if (type == C.TYPE_FULLTEXT) {
                for (let v of _.stem(value)) {
                    if (!bitmaps[v]) {
                        bitmaps[v] = new RoaringBitmap();
                    }
                    bitmaps[v].add(id);
                }
                continue;
            }
            if (type == C.TYPE_FOREIGNKEY) {
                value = Number(value);
                if (!bitmaps[value]) {
                    bitmaps[value] = new RoaringBitmap();
                }
                bitmaps[value].add(id);
                fk.id2fk[id] = value;
            }
        }
        ids.add(id);
        storage[index].min = Math.min(...[id, storage[index].min].filter(Number));
        storage[index].max = Math.max(...[id, storage[index].max].filter(Number));
        return resolve(C.ADD_SUCCESS);
    });
}

function SEARCH({index, query, sortby, limit}) {
    return new Promise((resolve, reject) => {
        if (!storage[index]) {
            return reject(_.sprintf(C.INDEX_NOT_EXISTS_ERROR, index));
        }
        let {fields} = storage[index];
        if (sortby && (!fields[sortby] || !fields[sortby].sortable)) {
            let e = fields[sortby] ? C.COLUMN_NOT_SORTABLE_ERROR : C.COLUMN_NOT_EXISTS_ERROR;
            return reject(_.sprintf(e, sortby));
        }
        let [off, lim] = limit;
        let cursor = off == 'CURSOR' ? hex() : false;
        off = cursor ? 0 : off;
        let iterator, bitmap = getBitmap(index, query);
        if (sortby) {
            let {map, bitmaps} = fields[sortby].sortmap;
            iterator = getSortIterator(map, bitmaps, bitmap);
        } else {
            iterator = bitmap.iterator();
        }
        let size = bitmap.size;
        let ret = [size];
        if (cursor) {
            cursor = size > lim ? cursor : null;
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
            return reject(_.sprintf(C.CURSOR_NOT_EXISTS_ERROR, cursor));
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
        card = Math.floor((shift ? card : card - 1) / div);
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
        let {values, field, fk} = query;
        if (fk) {
            if (!storage[fk]) {
                throw _.sprintf(C.INDEX_NOT_EXISTS_ERROR, fk);
            }
            let {fields} = storage[fk];
            let fks = Object.values(fields).filter(
                ({type, fk}) => type == C.TYPE_FOREIGNKEY && fk.fk == index
            );
            if (!fks.length) {
                throw _.sprintf(C.FOREIGNKEY_NOT_FOUND_ERROR, index, fk);
            }
            if (fks.length > 1) {
                throw _.sprintf(C.FOREIGNKEY_AMBIGUOUS_ERROR, index, fk);
            }
            let {id2fk} = fks[0].fk;
            let bitmap = new RoaringBitmap();
            for (let id of getBitmap(fk, values)) {
                bitmap.add(id2fk[id]);
            }
            return bitmap;
        }
        if (values.includes('*')) {
            return storage[index].ids;
        }
        if (!values.length) {
            return new RoaringBitmap();
        }
        if (values.length > 1) {
            let queries = values.map(v => ({values: [v], field}));
            return getOrBitmap(index, queries);
        }
        let [value] = values;
        if (field && !storage[index].fields[field]) {
            throw _.sprintf(C.COLUMN_NOT_EXISTS_ERROR, field);
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
            let words = Array.isArray(value) ? value : _.stem(value);
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
            if (!_.isInteger(from)) {
                throw _.sprintf(C.INVALID_INTEGER_VALUE_ERROR, from);
            }
            if (!_.isInteger(to)) {
                throw _.sprintf(C.INVALID_INTEGER_VALUE_ERROR, to);
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
            if (!from) {
                return bitmaps[to];
            }
            return RoaringBitmap.andNot(bitmaps[to], bitmaps[from - 1]);
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
