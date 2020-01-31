const RoaringBitmap = require('roaring/RoaringBitmap32');
const Grammar = require('./grammar');
const C = require('./constants');
const _ = require('./helpers');

const cursors = {};
const storage = {};
const SORT_DIV = 3;
const grammar = new Grammar();

RoaringBitmap.not = (bitmap, min, max) => {
    bitmap = bitmap.persist ? new RoaringBitmap(bitmap) : bitmap;
    bitmap.flipRange(min, max + 1);
    return bitmap;
};

RoaringBitmap.and = (a, b) => {
    return RoaringBitmap.andMany([a, b]);
};

RoaringBitmap.andMany = (bitmaps) => {
    if (!bitmaps.length) {
        return new RoaringBitmap();
    }
    if (bitmaps.length == 1) {
        return bitmaps[0];
    }
    let max = Number.MAX_SAFE_INTEGER;
    let reduce = (a, b) => Math.min(a, b.size);
    let size1 = bitmaps.filter(b => b.persist).reduce(reduce, max);
    let size2 = bitmaps.filter(b => !b.persist).reduce(reduce, max);
    let index, find, bitmap;
    if (size2 != max) {
        find = b => !b.persist && b.size == size2;
    } else {
        find = b => b.persist && b.size == size1;
    }
    index = bitmaps.findIndex(find);
    bitmap = bitmaps[index];
    bitmaps.splice(index, 1);
    bitmap = bitmap.persist ? new RoaringBitmap(bitmap) : bitmap;
    for (let b of bitmaps) {
        bitmap = bitmap.andInPlace(b);
    }
    return bitmap;
};

RoaringBitmap.orMany = (bitmaps) => {
    if (!bitmaps.length) {
        return new RoaringBitmap();
    }
    if (bitmaps.length == 1) {
        return bitmaps[0];
    }
    let index, bitmap;
    index = bitmaps.findIndex(b => !b.persist);
    index = ~index ? index : 0;
    bitmap = bitmaps[index];
    bitmaps.splice(index, 1);
    bitmap = bitmap.persist ? new RoaringBitmap(bitmap) : bitmap;
    for (let b of bitmaps) {
        bitmap = bitmap.orInPlace(b);
    }
    return bitmap;
};

RoaringBitmap.andNot = (bitmap, not) => {
    bitmap = bitmap.persist ? new RoaringBitmap(bitmap) : bitmap;
    bitmap.andNotInPlace(not);
    return bitmap;
};

function hex() {
    let hex;
    do {
        hex = _.generateHex();
    } while (hex.length < 8 || Number(hex.substring(0, 1)));
    return hex;
}

function cursorTimeout(cursor) {
    if (!cursors[cursor].bitmap.persist) {
        cursors[cursor].bitmap.clear();
    }
    delete cursors[cursor];
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

function STAT({index}) {
    return new Promise((resolve, reject) => {
        if (!index) {
            let reply = [];
            let memoryUsage = process.memoryUsage();
            for (let key of Object.keys(memoryUsage)) {
                reply.push(key, Math.round(memoryUsage[key] / 1E6));
            }
            return resolve(reply);
        }
        if (!storage[index]) {
            return reject(_.sprintf(C.INDEX_NOT_EXISTS_ERROR, index));
        }
        let ids = storage[index].ids;
        let size = ids.size;
        return resolve([
            'size', size,
            'min', size > 0 ? ids.minimum() : 0,
            'max', size > 0 ? ids.maximum() : 0,
        ]);
    });
}

function CREATE({index, fields, persist}) {
    return new Promise((resolve, reject) => {
        if (!index) {
            return reject(C.INVALID_INDEX_ERROR);
        }
        if (storage[index]) {
            return reject(_.sprintf(C.INDEX_EXISTS_ERROR, index));
        }
        fields = fields || [];
        if (!_.isUnique(fields.map(f => f.field))) {
            return reject(_.sprintf(C.DUPLICATE_COLUMNS_ERROR, index));
        }
        let f = {};
        for (let {field, type, min, max, sortable, fk, separator} of fields) {
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
                ...(separator !== undefined ? {separator} : {}),
            };
        }
        let ids = new RoaringBitmap();
        ids.persist = true;
        storage[index] = {fields: f, ids, persist, scores: {}};
        if (persist) {
            let dir = C.DUMPDIR + '/' + index;
            _.rm(dir);
            _.writeFile(
                dir + '/CREATE',
                JSON.stringify({fields}) + '\n'
            );
            _.writeFile(dir + '/CHANGES', '');
        }
        return resolve(C.CREATE_SUCCESS);
    });
}

function DROP({index}) {
    return new Promise((resolve, reject) => {
        if (!index) {
            return reject(C.INVALID_INDEX_ERROR);
        }
        if (!storage[index]) {
            return reject(_.sprintf(C.INDEX_NOT_EXISTS_ERROR, index));
        }
        delete storage[index];
        return resolve(C.DROP_SUCCESS);
    });
}

function RENAME({index, name}) {
    return new Promise((resolve, reject) => {
        if (!index || !name) {
            return reject(C.INVALID_INDEX_ERROR);
        }
        if (index == name) {
            return reject(C.SAME_NAME_ERROR);
        }
        if (!storage[index]) {
            return reject(_.sprintf(C.INDEX_NOT_EXISTS_ERROR, index));
        }
        if (storage[name]) {
            return reject(_.sprintf(C.INDEX_EXISTS_ERROR, name));
        }
        storage[name] = storage[index];
        delete storage[index];
        if (storage[name].persist) {
            _.renameDirectory(C.DUMPDIR + '/' + index, C.DUMPDIR + '/' + name);
        }
        return resolve(C.RENAME_SUCCESS);
    });
}

function LOAD({index}) {
    return new Promise(async (resolve, reject) => {
        if (!index) {
            return reject(C.INVALID_INDEX_ERROR);
        }
        if (storage[index]) {
            return reject(_.sprintf(C.INDEX_EXISTS_ERROR, index));
        }
        let dir = C.DUMPDIR + '/' + index;
        if (!_.isDirectory(dir)) {
            return reject(C.LOAD_ERROR);
        }
        await _.readLines(dir + '/CREATE', async line => {
            let {fields} = JSON.parse(line);
            await CREATE({index, fields});
        });
        await _.readLines(dir + '/CHANGES', async line => {
            let {id, values} = JSON.parse(line);
            await ADD({index, id, values});
        });
        storage[index].persist = true;
        return resolve(C.LOAD_SUCCESS);
    });
}

function CURSOR({index: cursor, limit, withScore}) {
    return new Promise((resolve, reject) => {
        if (!cursor || !cursors[cursor]) {
            return reject(C.INVALID_CURSOR_ERROR);
        }
        let {tid, bitmap, sortby, iterator, index} = cursors[cursor];
        clearTimeout(tid);
        if (sortby) throw new Error();
        iterator = iterator || bitmap.iterator();
        let values = [];
        limit = limit || 100;
        let {scores} = storage[index];
        for (let i = 0; i < limit; i++) {
            let {value, done} = iterator.next();
            if (done) {
                iterator = null;
                break;
            }
            values.push(value);
            if (withScore) {
                values.push(scores[value] || 0);
            }
        }
        if (iterator) {
            tid = setTimeout(cursorTimeout, C.CURSOR_TIMEOUT, cursor);
            cursors[cursor].tid = tid;
            cursors[cursor].iterator = iterator;
        } else {
            cursorTimeout(cursor);
        }
        return resolve(values);
    });
}

function ADD({index, id, values, score}) {
    return new Promise((resolve, reject) => {
        if (!index) {
            return reject(C.INVALID_INDEX_ERROR);
        }
        if (!storage[index]) {
            return reject(_.sprintf(C.INDEX_NOT_EXISTS_ERROR, index));
        }
        values = values || [];
        let {fields, ids, persist, scores} = storage[index];
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
            let {type, bitmaps, min, max, sortable, sortmap, fk, separator} = fields[field];
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
            if (type == C.TYPE_BOOLEAN) {
                value = _.toBoolean(value);
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
                continue;
            }
            if (type == C.TYPE_ARRAY) {
                value = value.split(separator).map(v => v.trim());
                for (let v of value) {
                    if (!bitmaps[v]) {
                        bitmaps[v] = new RoaringBitmap();
                        bitmaps[v].persist = true;
                    }
                    bitmaps[v].add(id);
                }
                continue;
            }
        }
        ids.add(id);
        if (score && score > 0) {
            scores[id] = score;
        }
        storage[index].min = Math.min(...[id, storage[index].min].filter(Number));
        storage[index].max = Math.max(...[id, storage[index].max].filter(Number));
        if (persist) {
            let dir = C.DUMPDIR + '/' + index;
            _.appendFile(
                dir + '/CHANGES',
                JSON.stringify({id, values}) + '\n'
            );
        }
        return resolve(C.ADD_SUCCESS);
    });
}

function SEARCH({index, query, sortby, desc, limit, withCursor, withScore, id2fk}) {
    return new Promise((resolve, reject) => {
        if (!index) {
            return reject(C.INVALID_INDEX_ERROR);
        }
        if (!storage[index]) {
            return reject(_.sprintf(C.INDEX_NOT_EXISTS_ERROR, index));
        }
        let {fields, scores} = storage[index];
        if (id2fk && (!fields[id2fk] || fields[id2fk].type != C.TYPE_FOREIGNKEY)) {
            let e = fields[id2fk] ? C.COLUMN_NOT_FOREIGNKEY_ERROR : C.COLUMN_NOT_EXISTS_ERROR;
            return reject(_.sprintf(e, id2fk));
        }
        if (sortby && (!fields[sortby] || !fields[sortby].sortable)) {
            let e = fields[sortby] ? C.COLUMN_NOT_SORTABLE_ERROR : C.COLUMN_NOT_EXISTS_ERROR;
            return reject(_.sprintf(e, sortby));
        }
        let cursor = withCursor ? hex() : false;
        let [off, lim] = cursor ? [0, 0] : limit;
        lim += off;
        let bitmap = getBitmap(index, query);
        let {size} = bitmap;
        let ret = [size];
        if (cursor) {
            if (size > 0) {
                ret.push(cursor);
                let tid = setTimeout(cursorTimeout, C.CURSOR_TIMEOUT, cursor);
                cursors[cursor] = {tid, bitmap, sortby, index};
            }
            return resolve(ret);
        }
        if (sortby) {
            let {map, bitmaps} = fields[sortby].sortmap;
            let persist = !!bitmap.persist;
            bitmap.persist = true;
            let values = getSortValues(map, bitmaps, bitmap, lim, !!desc);
            bitmap.persist = persist;
            ret = ret.concat(values.slice(off));
        } else {
            let iterator = bitmap.iterator();
            for (let i = 0; i < lim; i++) {
                let {value, done} = iterator.next();
                if (done) {
                    break;
                }
                if (off <= i) {
                    ret.push(value);
                }
            }
        }
        if (!bitmap.persist) {
            bitmap.clear();
        }
        if (id2fk) {
            let _ = fields[id2fk].fk.id2fk;
            let collect = [ret.shift()];
            for (let id of ret) {
                collect.push(_[id]);
            }
            ret = collect;
        }
        if (withScore) {
            let collect = [ret.shift()];
            for (let id of ret) {
                collect.push(id, scores[id] || 0);
            }
            ret = collect;
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
        if (size && !v) {
            let iterator = and.iterator();
            while (limit > 0) {
                let {value, done} = iterator.next();
                if (done) break;
                ret.push(value);
                limit -= 1;
            }
        } else if (size) {
            let r = getSortValues(v, bitmaps, bitmap, limit, desc);
            limit -= r.length;
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
            fields = fields.map(([k]) => k);
            if (!fields.length) {
                return new RoaringBitmap();
            }
            let queries = fields.map(field => ({values, field}));
            return getOrBitmap(index, queries);
        }
        let {type, bitmaps, min, max} = storage[index].fields[field];
        if (type === C.TYPE_BOOLEAN) {
            value = _.toBoolean(value);
            return bitmaps[value] || new RoaringBitmap();
        }
        if ([C.TYPE_STRING, C.TYPE_ARRAY].includes(type)) {
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
            let queries = words.map(v => ({values: [v], field}));
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
        if (type === C.TYPE_FOREIGNKEY) {
            if (!_.isInteger(value)) {
                return new RoaringBitmap();
            }
            value = Number(value);
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
    return RoaringBitmap.andMany(queries);
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
    let {min, max} = storage[index];
    return RoaringBitmap.not(query, min, max);
}

module.exports = {
    PING,
    CREATE,
    CURSOR,
    DROP,
    ADD,
    SEARCH,
    LIST,
    STAT,
    RENAME,
    LOAD,
    execute,
    getSortMap,
    getSortSlices,
};
