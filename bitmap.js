var RoaringBitmap = require('./RoaringBitmap');
var BSI = require('./BSI');
var C = require('./constants');
var _ = require('./helpers');
var CommandParser = require('./CommandParser');
var QueryParser = require('./QueryParser');
var Queued = require('./Queued');

var storage = Object.create(null);
var cursors = Object.create(null);
var syncTimer = null;
var syncInterval = 1000;
var syncTimeout = 300;
var queued = new Queued();

var isUnique = arr => arr.length == _.unique(arr).length;

var type2cast = {
    [C.TYPES.INTEGER]: 'toInteger',
    [C.TYPES.DATE]: 'toDateInteger',
    [C.TYPES.DATETIME]: 'toDateTimeInteger',
    [C.TYPES.DECIMAL]: 'toDecimal',
};

function newBitmap() {
    let bm = new RoaringBitmap();
    bm.persist = true;
    if (this && this.bitmaps) {
        this.bitmaps.push(bm);
    }
    return bm;
}

function execute(query) {
    let commandParser = new CommandParser();
    let tokens = commandParser.tokenize(query);
    let command = commandParser.parse(tokens);
    let action = String(command.action || '');
    if (!module.exports[action]) {
        throw new C.BitmapError(C.BITMAP_ERROR_UNKNOWN_COMMAND);
    }
    if (action != 'SEARCH') {
        return module.exports[action](command);
    }
    let _1 = Number(new Date());
    let res = module.exports[action](command);
    _1 = Number(new Date()) - _1;
    if (_1 > 100) {
        storage[command.index].slowQueryLog.push({
            timestamp: Number(new Date()),
            taken: _1,
            query: command.query,
        });
    }
    return res;
}

function PING() {
    return C.BITMAP_OK;
}

function LIST() {
    return Object.keys(storage);
}

function CREATE({index, fields}) {
    if (storage[index]) {
        throw new C.BitmapError(C.BITMAP_ERROR_INDEX_EXISTS, {index});
    }
    for (let [name, field] of Object.entries(fields)) {
        let {type, prefixSearch, references} = field;
        if (!C.IS_NUMERIC(type)) {
            field.bitmaps = Object.create(null);
            if (type == C.TYPES.FOREIGNKEY) {
                if (!storage[references]) {
                    throw new C.BitmapError(C.BITMAP_ERROR_INDEX_NOT_EXISTS, {index: references});
                }
                // if (storage[references].links[index]) {
                //     let ctx = {index, references, field: name};
                //     throw new C.BitmapError(C.BITMAP_ERROR_MULTIPLE_FOREIGN_KEYS, ctx);
                // }
                storage[references].links[index] = field;
                field.id2fk = Object.create(null);
            }
        }
    }
    storage[index] = {
        fields,
        bitmaps: [],
        newBitmap,
        links: Object.create(null),
        slowQueryLog: [],
    };
    storage[index].ids = storage[index].newBitmap();
    let nb = storage[index].newBitmap.bind(storage[index]);
    Object.entries(storage[index].fields).forEach(([, f]) => {
        if (f.type == C.TYPES.DECIMAL) {
            f.precision = Math.min(5, f.precision || 2);
            let e = 10 ** f.precision;
            f.min = Math.floor(f.min * e) / e;
            f.max = Math.floor(f.max * e) / e;
            f.bsi = new BSI(f.min * e, f.max * e, nb);
        } else if (C.IS_NUMERIC(f.type)) {
            f.bsi = new BSI(f.min, f.max, nb);
        }
    });
    return C.BITMAP_OK;
}

function DROP({index, fromTruncate}) {
    if (!storage[index]) {
        throw new C.BitmapError(C.BITMAP_ERROR_INDEX_NOT_EXISTS, {index});
    }
    let create = fromTruncate ? [SHOWCREATE({index})] : [];
    for (let [k, {fields, links}] of Object.entries(storage)) {
        let isChild = Object.entries(fields).filter(
            ([, f]) => f.type == C.TYPES.FOREIGNKEY && f.references == index
        ).length;
        if (isChild) {
            let res = DROP({index: k, fromTruncate});
            if (fromTruncate) {
                create = create.concat(res);
            }
        }
        let isParent = links[index];
        if (isParent) {
            delete links[index];
        }
    }
    storage[index].bitmaps.forEach(b => b.clear());
    delete storage[index];
    queued.clear(index);
    return fromTruncate ? create : C.BITMAP_OK;
}

function TRUNCATE({index}) {
    DROP({index, fromTruncate: true}).forEach(execute);
    return C.BITMAP_OK;
}

function RENAME({index, name}) {
    if (!storage[index]) {
        throw new C.BitmapError(C.BITMAP_ERROR_INDEX_NOT_EXISTS, {index});
    }
    if (storage[name]) {
        throw new C.BitmapError(C.BITMAP_ERROR_INDEX_EXISTS, {index: name});
    }
    storage[name] = storage[index];
    delete storage[index];
    Object.entries(storage[name].links).forEach(([, field]) => field.references = name);
    Object.entries(storage).forEach(([k, v]) => {
        if (k != name && index in v.links) {
            v.links[name] = v.links[index];
            delete v.links[index];
        }
    });
    return C.BITMAP_OK;
}

function STAT({index, field, limit}) {
    if (!index) {
        let reply = {queued: queued.length()};
        let memoryUsage = process.memoryUsage();
        for (let key of Object.keys(memoryUsage)) {
            let k = 'memory_' + key.replace(/[A-Z]/g, m => '_' + m.toLowerCase());
            reply[k] = memoryUsage[key];
            let mb = Math.round(memoryUsage[key] / 1E6);
            let kb = Math.round(memoryUsage[key] / 1E3);
            reply[k + '_human'] = (mb ? mb : kb) + (mb ? 'M' : 'K');
        }
        return reply;
    }
    if (!storage[index]) {
        throw new C.BitmapError(C.BITMAP_ERROR_INDEX_NOT_EXISTS, {index});
    }
    let {bitmaps, ids, fields} = storage[index];
    if (!field) {
        let size = ids.size;
        return {
            size: size,
            id_minimum: size > 0 ? ids.minimum() : 0,
            id_maximum: size > 0 ? ids.maximum() : 0,
            used_bitmaps: bitmaps.length,
            used_bits: bitmaps.reduce((acc, v) => acc + v.size, 0),
            queued: queued.length(index),
        };
    }
    if (!fields[field]) {
        throw new C.BitmapError(C.BITMAP_ERROR_FIELD_NOT_EXISTS);
    }
    if (C.IS_NUMERIC(fields[field].type)) {
        throw new C.BitmapError(C.BITMAP_ERROR_STAT_ON_INTEGER_TYPE);
    }
    bitmaps = fields[field].bitmaps;
    let reduce = (acc, key) => (acc.push([key, bitmaps[key].size]), acc);
    let ret = Object.keys(bitmaps).reduce(reduce, []);
    ret.sort(([, s1], [, s2]) => s2 - s1);
    ret = ret.reduce((acc, [k, v]) => (acc[k] = v, acc), Object.create(null));
    if (limit !== undefined) {
        let reduce = (acc, key) => (acc[key] = ret[key], acc);
        return Object.keys(ret).filter((k, i) => i < limit).reduce(reduce, Object.create(null));
    }
    return ret;
}

function ADD(...args) {
    return INSERT(...args);
}

function INSERT({index, id, values}) {
    if (!storage[index]) {
        throw new C.BitmapError(C.BITMAP_ERROR_INDEX_NOT_EXISTS, {index});
    }
    if (queued.has(index, id)) {
        queued.push({action: 'ADD', index, id, values});
        return C.BITMAP_QUEUED;
    }
    let {ids, fields} = storage[index];
    if (ids.has(id)) {
        throw new C.BitmapError(C.BITMAP_ERROR_ID_EXISTS);
    }
    for (let field of Object.keys(values)) {
        if (!fields[field]) {
            throw new C.BitmapError(C.BITMAP_ERROR_FIELD_NOT_EXISTS);
        }
        let {type, references, min, max, separator} = fields[field];
        let e, ctx, v;
        switch (type) {
            case C.TYPES.INTEGER:
                v = _.toInteger(values[field]);
                if (v === undefined) {
                    e = C.BITMAP_ERROR_EXPECT_INTEGER;
                    ctx = {value: values[field], field};
                    throw new C.BitmapError(e, ctx);
                }
                if (v < min || max < v) {
                    e = C.BITMAP_ERROR_OUT_OF_RANGE;
                    ctx = {min, max, value: v, field};
                    throw new C.BitmapError(e, ctx);
                }
                break;
            case C.TYPES.DATE:
                v = _.toDateInteger(values[field]);
                if (v === undefined) {
                    throw new C.BitmapError(C.BITMAP_ERROR_EXPECT_DATE);
                }
                if (v < min || max < v) {
                    e = C.BITMAP_ERROR_OUT_OF_RANGE;
                    ctx = {min, max, value: v, field};
                    throw new C.BitmapError(e, ctx);
                }
                break;
            case C.TYPES.DATETIME:
                v = _.toDateTimeInteger(values[field]);
                if (v === undefined) {
                    throw new C.BitmapError(C.BITMAP_ERROR_EXPECT_DATETIME);
                }
                if (v < min || max < v) {
                    e = C.BITMAP_ERROR_OUT_OF_RANGE;
                    ctx = {min, max, value: v, field};
                    throw new C.BitmapError(e, ctx);
                }
                break;
            case C.TYPES.DECIMAL:
                v = _.toDecimal(values[field]);
                if (v === undefined) {
                    throw new C.BitmapError(C.BITMAP_ERROR_EXPECT_DECIMAL);
                }
                if (v < min || max < v) {
                    e = C.BITMAP_ERROR_OUT_OF_RANGE;
                    ctx = {min, max, value: v, field};
                    throw new C.BitmapError(e, ctx);
                }
                break;
            case C.TYPES.BOOLEAN:
                v = _.toBoolean(values[field]);
                break;
            case C.TYPES.STRING:
                v = String(values[field]);
                break;
            case C.TYPES.ARRAY:
                v = String(values[field]).split(separator);
                v = _.unique(v);
                v = v.filter(v => v.length);
                break;
            case C.TYPES.FULLTEXT:
                v = _.wordSplit(String(values[field]));
                break;
            case C.TYPES.FOREIGNKEY:
                v = _.toInteger(values[field]);
                if (
                    v === undefined ||
                    v < 1 ||
                    !storage[references].ids.has(v)
                ) {
                    e = C.BITMAP_ERROR_INVALID_FOREIGN_KEY_ID;
                    ctx = {references, value: values[field]};
                    throw new C.BitmapError(e, ctx);
                }
                break;
        }
        values[field] = v;
    }
    for (let [field, value] of Object.entries(values)) {
        field = fields[field];
        let {type, bitmaps, id2fk} = field;
        let toBitmaps = v => {
            bitmaps[v] = bitmaps[v] || storage[index].newBitmap();
            bitmaps[v].add(id);
        };
        switch (type) {
            case C.TYPES.INTEGER:
                field.bsi.add(id, value);
                break;
            case C.TYPES.DATE:
                field.bsi.add(id, value);
                break;
            case C.TYPES.DATETIME:
                field.bsi.add(id, value);
                break;
            case C.TYPES.DECIMAL:
                field.bsi.add(id, Math.floor(value * (10 ** field.precision)));
                break;
            case C.TYPES.BOOLEAN:
                toBitmaps(value ? '1' : '0');
                break;
            case C.TYPES.STRING:
                toBitmaps(value);
                break;
            case C.TYPES.ARRAY:
                value.forEach(toBitmaps);
                break;
            case C.TYPES.FULLTEXT:
                let {noStopwords, prefixSearch} = field;
                _.stem(value, noStopwords).forEach(word => {
                    toBitmaps(word);
                    if (prefixSearch) {
                        _.prefixSearch(word).map(w => w + '*').forEach(toBitmaps);
                    }
                });
                break;
            case C.TYPES.FOREIGNKEY:
                id2fk[id] = value;
                toBitmaps(String(value));
                break;
        }
    }
    ids.add(id);
    return C.BITMAP_OK;
}

function DELETE({index, id, withForeignKeys, sync}) {
    if (!storage[index]) {
        throw new C.BitmapError(C.BITMAP_ERROR_INDEX_NOT_EXISTS, {index});
    }
    let {ids, bitmaps, fields, links} = storage[index];
    if (!ids.has(id)) {
        throw new C.BitmapError(C.BITMAP_ERROR_ID_NOT_EXISTS, {index, id});
    }
    if (!sync) {
        queued.push({action: 'DELETE', index, id, withForeignKeys, sync: true});
        startSyncTimer();
        return C.BITMAP_QUEUED;
    }
    bitmaps.forEach(bitmap => bitmap.delete(id));
    for (let [, field] of Object.entries(fields)) {
        if (!field.id2fk) continue;
        delete field.id2fk[id];
    }
    for (let child of Object.keys(withForeignKeys ? links : {})) {
        let {fields} = storage[child];
        let name = Object.keys(fields).find(f => fields[f].id2fk && fields[f].references == index);
        DELETEALL({index: child, query: `@${name}:${id}`, withForeignKeys, sync});
    }
    return C.BITMAP_OK;
}

function DELETEALL({index, query, withForeignKeys, sync}) {
    let iterator = SEARCH({index, query, returnIterator: true});
    for (let id of [...iterator]) {
        DELETE({index, id, withForeignKeys, sync});
    }
    return C.BITMAP_QUEUED;
}

function REID({index, id1, id2, sync}) {
    if (!storage[index]) {
        throw new C.BitmapError(C.BITMAP_ERROR_INDEX_NOT_EXISTS, {index});
    }
    let {ids, bitmaps, fields, links} = storage[index];
    if (!ids.has(id1) || !ids.has(id2)) {
        let id = ids.has(id1) ? id2 : id1;
        throw new C.BitmapError(C.BITMAP_ERROR_ID_NOT_EXISTS, {index, id});
    }
    if (!sync) {
        queued.push({action: 'REID', index, id: id1, id1, id2, sync: true});
        queued.push({index, id: id2});
        startSyncTimer();
        return C.BITMAP_QUEUED;
    }
    bitmaps.forEach(bitmap => {
        let b1 = bitmap.has(id1);
        let b2 = bitmap.has(id2);
        if (b1 && !b2) {
            bitmap.delete(id1);
            bitmap.add(id2);
        } else if (!b1 && b2) {
            bitmap.add(id1);
            bitmap.delete(id2);
        }
    });
    for (let [, field] of Object.entries(fields)) {
        if (!field.id2fk) continue;
        let fk1 = field.id2fk[id1];
        let fk2 = field.id2fk[id2];
        field.id2fk[id1] = fk2;
        field.id2fk[id2] = fk1;
    }
    for (let [child, field] of Object.entries(links)) {
        let bm1 = field.bitmaps[id1];
        let bm2 = field.bitmaps[id2];
        if (bm1 && bm2) {
            field.bitmaps[id1] = bm2;
            field.bitmaps[id2] = bm1;
            continue;
        }
        if (bm1) {
            delete field.bitmaps[id1];
            field.bitmaps[id2] = bm1;
            continue;
        }
        if (bm2) {
            field.bitmaps[id1] = bm2;
            delete field.bitmaps[id2];
            continue;
        }
    }
    return C.BITMAP_OK;
}

function SEARCH({
    index,
    query,
    limit,
    terms,
    parent,
    sortby,
    desc,
    foreignKeys,
    withCursor,
    returnIterator,
}) {
    if (!storage[index]) {
        throw new C.BitmapError(C.BITMAP_ERROR_INDEX_NOT_EXISTS, {index});
    }
    let {fields, ids} = storage[index];
    if (sortby && (!fields[sortby] || !fields[sortby].bsi)) {
        let e = fields[sortby] ? C.BITMAP_ERROR_FIELD_NOT_SORTABLE : C.BITMAP_ERROR_FIELD_NOT_EXISTS;
        throw new C.BitmapError(e);
    }
    foreignKeys = _.unique(foreignKeys || []);
    for (let fk of foreignKeys) {
        if (!fields[fk] || !fields[fk].id2fk) {
            let e = fields[fk] ? C.BITMAP_ERROR_FIELD_NOT_FOREIGN_KEY : C.BITMAP_ERROR_FIELD_NOT_EXISTS;
            throw new C.BitmapError(e);
        }
    }
    foreignKeys = foreignKeys.map(fk => [fk, fields[fk].id2fk]);
    let queryParser = new QueryParser();
    if (terms === undefined) {
        let tokens = queryParser.tokenize(query);
        terms = queryParser.tokens2terms(tokens);
        terms.postfix = queryParser.infix2postfix(terms.infix);
    }
    let bitmap = queryParser.resolve(terms.postfix, terms.terms, term => {
        if (term === '*') {
            return ids;
        }
        if (term.fk) {
            return SEARCH({
                index: term.fk,
                parent: index,
                terms: {
                    postfix: term.value,
                    terms: terms.terms,
                },
            });
        }
        let {field, value} = term;
        let type, bitmaps, min, max, bsi;
        if (field === undefined) {
            let fulltext = Object.entries(fields).map(([, v]) => v).filter(f => f.type == C.TYPES.FULLTEXT);
            fulltext = fulltext.map(({noStopwords, bitmaps, prefixSearch}) => {
                let ps = false;
                let val = value;
                if (_.isObject(value)) {
                    ps = value.prefixSearch;
                    val = value.value;
                }
                let words = _.wordSplit(val, ps && prefixSearch);
                if (!words.length) {
                    return new RoaringBitmap();
                }
                let bitmap1;
                if (ps && prefixSearch) {
                    bitmap1 = bitmaps[words.pop().substring(0, 6) + '*'] || new RoaringBitmap();
                }
                let andMany = _.stem(words, noStopwords).map(
                    word => bitmaps[word] || new RoaringBitmap()
                );
                bitmap1 && andMany.push(bitmap1);
                return RoaringBitmap.andMany(andMany);
            });
            return RoaringBitmap.orMany(fulltext);
        } else if (field == C.BITMAP_ID) {
            type = C.TYPES.INTEGER;
            min = ids.minimum();
            max = ids.maximum();
        } else if (fields[field]) {
            ({type, bitmaps, min, max, bsi, precision} = fields[field]);
        } else {
            throw new C.BitmapError(C.BITMAP_ERROR_FIELD_NOT_EXISTS);
        }
        let mm = {min, max};
        let excFrom, from, to, excTo;
        let z = new RoaringBitmap();
        switch (type) {
            case C.TYPES.FOREIGNKEY:
                if (!_.isString(value)) {
                    return z;
                }
                value = _.toInteger(value);
                if (value === undefined) {
                    return z;
                }
                return bitmaps[String(value)] || z;
            case C.TYPES.STRING:
            case C.TYPES.ARRAY:
                return _.isString(value) ? (bitmaps[value] || z) : z;
            case C.TYPES.BOOLEAN:
                return _.isString(value) ? (bitmaps[_.toBoolean(value) ? '1' : '0'] || z) : z;
            case C.TYPES.INTEGER:
            case C.TYPES.DATE:
            case C.TYPES.DATETIME:
            case C.TYPES.DECIMAL:
                if (_.isArray(value)) {
                    [excFrom, from, to, excTo] = value;
                    from = from in mm ? mm[from] : _[type2cast[type]](from);
                    to = to in mm ? mm[to] : _[type2cast[type]](to);
                } else if (_.isString(value)) {
                    let lc = value.toLowerCase();
                    from = lc in mm ? mm[lc] : _[type2cast[type]](value);
                    to = from;
                } else {
                    return z;
                }
                if (from === undefined || to === undefined) {
                    return z;
                }
                if (type == C.TYPES.DECIMAL) {
                    from = Math.floor(from * (10 ** precision));
                    to = Math.floor(to * (10 ** precision));
                }
                from += excFrom ? 1 : 0;
                to -= excTo ? 1 : 0;
                if (bsi) {
                    return bsi.getBitmap(from, to);
                }
                return RoaringBitmap.onlyRange(ids, from, to);
            default:
                return z;
        }
    });
    if (parent) {
        let id2fk = storage[parent].links[index].id2fk;
        let ret = new RoaringBitmap();
        for (let id of bitmap) {
            ret.add(id2fk[id]);
        }
        return ret;
    }
    let iterator, ret = {total: bitmap.size, ids: []};
    if (sortby) {
        iterator = fields[sortby].bsi.sort(bitmap, !desc);
    } else {
        iterator = bitmap.iterator();
    }
    if (returnIterator) {
        return iterator;
    }
    while (limit > 0) {
        let next = iterator.next();
        if (next.done) break;
        ret.ids.push(next.value);
        limit--;
    }
    if (withCursor) {
        ret.cursor = null;
        if (ret.ids.length < ret.total) {
            let cursor = generateCursor();
            let tid = setTimeout(deleteCursor, withCursor * 1000, cursor);
            cursors[cursor] = {
                foreignKeys,
                tid,
                iterator,
                total: ret.total,
                offset: ret.ids.length,
                timeout: withCursor,
                limit: ret.ids.length + limit,
            };
            ret.cursor = cursor;
        }
    }
    if (foreignKeys.length) {
        ret.records = ret.ids.map(id => {
            let r = {id};
            foreignKeys.forEach(fk => r[fk[0]] = fk[1][id]);
            return r;
        });
        delete ret.ids;
    }
    return ret;
}

function CURSOR({cursor}) {
    if (!cursors[cursor]) {
        throw new C.BitmapError(C.BITMAP_ERROR_CURSOR_NOT_EXISTS);
    }
    let {foreignKeys, iterator, total, offset, timeout, limit} = cursors[cursor];
    clearTimeout(cursors[cursor].tid);
    let ret = {total: total, ids: []};
    while (limit > 0) {
        let next = iterator.next();
        if (next.done) break;
        ret.ids.push(next.value);
        limit--;
    }
    if (offset + ret.ids.length < total) {
        cursors[cursor].tid = setTimeout(deleteCursor, timeout * 1000, cursor);
        cursors[cursor].offset += ret.ids.length;
        ret.cursor = cursor;
    } else {
        ret.cursor = null;
        delete cursors[cursor];
    }
    if (foreignKeys.length) {
        ret.records = ret.ids.map(id => {
            let r = {id};
            foreignKeys.forEach(fk => r[fk[0]] = fk[1][id]);
            return r;
        });
        delete ret.ids;
    }
    return ret;
}

function SHOWCREATE({index}) {
    if (!storage[index]) {
        throw new C.BitmapError(C.BITMAP_ERROR_INDEX_NOT_EXISTS, {index});
    }
    let d2s = d => d.toISOString().replace(/T.*$/, '');
    let dt2s = d => d.toISOString().replace(/\..*$/, '').replace('T', ' ');
    let fields = Object.entries(storage[index].fields).map(([name, field]) => {
        let cast, ret = ['"' + name + '"', field.type];
        switch (field.type) {
            case C.TYPES.ARRAY:
                ret.push('SEPARATOR', '\'' + field.separator + '\'');
                break;
            case C.TYPES.INTEGER:
                ret.push('MIN', field.min, 'MAX', field.max);
                break;
            case C.TYPES.DATE:
                ret.push('MIN', "'" + d2s(new Date(field.min * 864E5)) + "'");
                ret.push('MAX', "'" + d2s(new Date(field.max * 864E5)) + "'");
                break;
            case C.TYPES.DATETIME:
                ret.push('MIN', "'" + dt2s(new Date(field.min * 1E3)) + "'");
                ret.push('MAX', "'" + dt2s(new Date(field.max * 1E3)) + "'");
                break;
            case C.TYPES.FULLTEXT:
                field.noStopwords && ret.push('NOSTOPWORDS');
                field.prefixSearch && ret.push('PREFIXSEARCH');
                break;
            case C.TYPES.FOREIGNKEY:
                ret.push('REFERENCES', '"' + field.references + '"');
                break;
        }
        return ret.join(' ');
    });
    let create = [
        'CREATE',
        '"' + index + '"',
    ];
    if (fields.length) {
        create.push('FIELDS');
        create.push(fields.join(' '));
    }
    return create.join(' ');
}

function SLOWQUERYLOG({index}) {
    if (!index) {
        return Object.keys(storage).reduce((acc, index) => {
            acc[index] = SLOWQUERYLOG({index});
            return acc;
        }, Object.create(null));
    }
    if (!storage[index]) {
        throw new C.BitmapError(C.BITMAP_ERROR_INDEX_NOT_EXISTS, {index});
    }
    return storage[index].slowQueryLog;
}

function dump(index) {
    return storage[index];
}

function generateCursor() {
    let hex;
    do {
        hex = Math.floor(Math.random() * Math.pow(2, 32)).toString(16);
    } while (hex.length < 8 || Number(hex.substring(0, 1)) || cursors[hex]);
    return hex;
}

function deleteCursor(cursor) {
    delete cursors[cursor];
}

function startSyncTimer() {
    if (!syncTimer) {
        syncTimer = setTimeout(syncProcedure, syncInterval);
    }
}

function syncProcedure() {
    syncTimer = null;
    let start = Number(new Date());
    while (queued.length()) {
        let command = queued.shift();
        let {action} = command;
        delete command.action;
        if (!action) continue;
        try {
            module.exports[action](command);
        } catch (e) {
            console.log(action, command, e);
        }
        if (Number(new Date()) > start + syncTimeout) {
            break;
        }
    }
    queued.length() && startSyncTimer();
}

module.exports = {
    execute,
    PING,
    LIST,
    CREATE,
    DROP,
    TRUNCATE,
    RENAME,
    STAT,
    ADD,
    INSERT,
    DELETE,
    DELETEALL,
    REID,
    SEARCH,
    CURSOR,
    SHOWCREATE,
    SLOWQUERYLOG,
    dump,
};
