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
    STAT,
    execute,
    getSortMap,
    getSortSlices,
};

const storage = {};

const SORT_DIV = 3;

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

function STAT() {
    let stat = {};
    stat.heap = Math.round(process.memoryUsage().rss / 1e6) + 'MB';
    return Object.entries(stat);
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
                    bitmaps[i].persist = true;
                }
                if (sortable) {
                    sortmap = getSortMap(zmax + 1, SORT_DIV);
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
        ids.persist = true;
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
                let s = sortable ? getSortSlices(zmax + 1, [zvalue], SORT_DIV)[zvalue] : [];
                for (let i of s) {
                    sortmap.bitmaps.get(i).add(id);
                }
                continue;
            }
            if (type == C.TYPE_STRING) {
                if (!bitmaps[value]) {
                    bitmaps[value] = new RoaringBitmap();
                    bitmaps[value].persist = true;
                }
                bitmaps[value].add(id);
                continue;
            }
            if (type == C.TYPE_FULLTEXT) {
                for (let v of _.stem(value)) {
                    if (!bitmaps[v]) {
                        bitmaps[v] = new RoaringBitmap();
                        bitmaps[v].persist = true;
                    }
                    bitmaps[v].add(id);
                }
                continue;
            }
            if (type == C.TYPE_FOREIGNKEY) {
                value = Number(value);
                if (!bitmaps[value]) {
                    bitmaps[value] = new RoaringBitmap();
                    bitmaps[value].persist = true;
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

function SEARCH({index, query, sortby, desc, limit}) {
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
        lim += off;
        let bitmap = getBitmap(index, query);
        let ret = [bitmap.size];
        if (sortby) {
            let {map, bitmaps} = fields[sortby].sortmap;
            let values = getSortValues(map, bitmaps, bitmap, lim, !!desc);
            ret = ret.concat(values.slice(off));
        } else {
            let iterator = bitmap.iterator();
            for (let i = 0; i < lim; i++) {
                let {value, done} = iterator.next();
                if (done) break;
                if (off <= i) {
                    ret.push(value);
                }
            }
        }
        if (!bitmap.persist) {
            bitmap.clear();
        }
        return resolve(ret);
    });
}

function getSortMap(card, div) {
    let values = Array.from(Array(card).keys());
    let slices = getSortSlices(card, values, div);
    let bitmaps = Object.values(slices).reduce((a, s) => a.concat(s), []);
    bitmaps = Array.from(new Set(bitmaps));
    bitmaps = new Map(bitmaps.map(k => {
        let v = new RoaringBitmap();
        v.persist = true;
        return [k, v];
    }));
    let tree = [], shift = 0;
    let keys = Array.from(bitmaps.keys());
    do {
        let regex = new RegExp('x'.repeat(shift));
        tree[shift] = new Map(keys.filter(
            k => regex.test(k)
        ).map(k => {
            let map = null;
            if (shift) {
                let regex = new RegExp('^' + k.replace('x', '\\d') + '$');
                map = new Map(keys.filter(k => regex.test(k) || regex.test('0' + k)).map(
                    k => [k, tree[shift - 1].get(k)]
                ));
            }
            return [k, map];
        }));
        card = Math.floor((card - 1) / div);
        shift++;
    } while (card);
    return {map: tree[shift - 1], bitmaps};
}

function getSortSlices(card, values, div) {
    let slices = {}, map = {};
    values.forEach(v => {
        slices[v] = [];
        map[v] = Number(v).toString(div);
    });
    let shift = 0;
    do {
        values.forEach(v => {
            slices[v].push(map[v] + 'x'.repeat(shift));
            map[v] = map[v].substr(0, map[v].length - 1);
        });
        card = Math.floor((card - 1) / div);
        shift++;
    } while (card);
    return slices;
}

function getSortValues(map, bitmaps, bitmap, limit, desc) {
    let ret = [];
    let entries = desc ? Array.from(map.entries()).reverse() : map.entries();
    for (let [k, v] of entries) {
        if (limit <= 0) break;
        let and = RoaringBitmap.and(bitmaps.get(k), bitmap);
        let size = and.size;
        // debug('RoaringBitmap.and', limit, and.size, k, ret.length);
        if (size && !v) {
            let iterator = and.iterator();
            // debug('while (1), limit', limit)
            while (limit > 0) {
                let {value, done} = iterator.next();
                if (done) break;
                ret.push(value);
                limit -= 1;
            }
            // debug('while (2), limit', limit)
        } else if (size) {
            let r = getSortValues(v, bitmaps, bitmap, limit, desc);
            limit -= r.length;
            // debug('getSortValues, limit', limit)
            ret = ret.concat(r);
        }
        and.clear();
    }
    return ret;
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
        if (type == C.TYPE_STRING) {
            return bitmaps[value] || new RoaringBitmap();
        }
        if (type == C.TYPE_FULLTEXT) {
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
        if (type == C.TYPE_INTEGER) {
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
