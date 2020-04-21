const RoaringBitmap = require('./RoaringBitmap');
const BSI = require('./BSI');
const C = require('./constants');
const _ = require('./helpers');
const CommandParser = require('./CommandParser');
const QueryParser = require('./QueryParser');

let storage = Object.create(null);

let isUnique = arr => arr.length == _.unique(arr).length;

let type2cast = {
    [C.TYPES.INTEGER]: 'toInteger',
    [C.TYPES.DATE]: 'toDateInteger',
    [C.TYPES.DATETIME]: 'toDateTimeInteger',
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
        throw new C.BitmapError(C.BITMAP_ERROR_INDEX_EXISTS);
    }
    for (let [, field] of Object.entries(fields)) {
        let {type, prefixSearch, references} = field;
        if (!C.IS_INTEGER(type)) {
            field.bitmaps = Object.create(null);
            if (type == C.TYPES.FOREIGNKEY) {
                if (!storage[references]) {
                    throw new C.BitmapError(C.BITMAP_ERROR_INDEX_NOT_EXISTS);
                }
                if (storage[references].links[index]) {
                    delete storage[references].links[index];
                    throw new C.BitmapError(C.BITMAP_ERROR_MULTIPLE_FOREIGN_KEYS);
                }
                storage[references].links[index] = field;
                field.id2fk = Object.create(null);
            } else if (type == C.TYPES.FULLTEXT && prefixSearch) {
                field.triplets = Object.create(null);
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
        if (C.IS_INTEGER(f.type)) {
            f.bsi = new BSI(f.min, f.max, nb);
        }
    });
    return C.BITMAP_OK;
}

function DROP({index}) {
    if (!storage[index]) {
        throw new C.BitmapError(C.BITMAP_ERROR_INDEX_NOT_EXISTS);
    }
    Object.entries(storage).filter(([, v]) => {
        return Object.entries(v.fields).filter(
            ([, f]) => f.type == C.TYPES.FOREIGNKEY && f.references == index
        ).length;
    }).forEach(([k]) => DROP({index: k}));
    storage[index].bitmaps.forEach(b => b.clear());
    delete storage[index];
    return C.BITMAP_OK;
}

function RENAME({index, name}) {
    if (!storage[index]) {
        throw new C.BitmapError(C.BITMAP_ERROR_INDEX_NOT_EXISTS);
    }
    if (storage[name]) {
        throw new C.BitmapError(C.BITMAP_ERROR_INDEX_EXISTS);
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

function STAT({index}) {
    if (!index) {
        let reply = {};
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
        throw new C.BitmapError(C.BITMAP_ERROR_INDEX_NOT_EXISTS);
    }
    index = storage[index];
    let size = index.ids.size;
    return {
        size: size,
        id_minimum: size > 0 ? index.ids.minimum() : 0,
        id_maximum: size > 0 ? index.ids.maximum() : 0,
        used_bitmaps: index.bitmaps.length,
        used_bits: index.bitmaps.reduce((acc, v) => acc + v.size, 0),
    };
}

function ADD({index, id, values}) {
    if (!storage[index]) {
        throw new C.BitmapError(C.BITMAP_ERROR_INDEX_NOT_EXISTS);
    }
    let {ids, fields} = storage[index];
    if (ids.has(id)) {
        throw new C.BitmapError(C.BITMAP_ERROR_ID_EXISTS);
    }
    let f1 = Object.entries(values).find(([field]) => !fields[field]);
    if (f1) {
        throw new C.BitmapError(C.BITMAP_ERROR_FIELD_NOT_EXISTS);
    }
    let f2 = Object.entries(values).find(([field, value]) =>
        C.IS_INTEGER(fields[field].type) && (
            value < fields[field].min || fields[field].max < value
        )
    );
    if (f2) {
        throw new C.BitmapError(C.BITMAP_ERROR_OUT_OF_RANGE);
    }
    for (let field of Object.keys(values)) {
        let {type, references} = fields[field];
        if (type == C.TYPES.FOREIGNKEY) {
            let v = _.toInteger(values[field]);
            if (
                v === undefined ||
                v < 1 ||
                !storage[references].ids.has(v)
            ) {
                throw new C.BitmapError(C.BITMAP_ERROR_INVALID_FOREIGN_KEY_ID, values[field], references);
            }
            values[field] = v;
        }
    }
    for (let [field, value] of Object.entries(values)) {
        field = fields[field];
        let {type, bitmaps, separator, triplets, id2fk} = field;
        let toBitmaps = v => {
            bitmaps[v] = bitmaps[v] || storage[index].newBitmap();
            bitmaps[v].add(id);
        };
        let toTriplets = v => {
            triplets[v] = triplets[v] || storage[index].newBitmap();
            triplets[v].add(id);
        };
        switch (type) {
            case C.TYPES.INTEGER:
                value = _.toInteger(value);
                if (value === undefined) {
                    throw new C.BitmapError(C.BITMAP_ERROR_EXPECT_INTEGER);
                }
                field.bsi.add(id, value);
                break;
            case C.TYPES.DATE:
                value = _.toDateInteger(value);
                if (value === undefined) {
                    throw new C.BitmapError(C.BITMAP_ERROR_EXPECT_DATE);
                }
                field.bsi.add(id, value);
                break;
            case C.TYPES.DATETIME:
                value = _.toDateTimeInteger(value);
                if (value === undefined) {
                    throw new C.BitmapError(C.BITMAP_ERROR_EXPECT_DATETIME);
                }
                field.bsi.add(id, value);
                break;
            case C.TYPES.BOOLEAN:
                value = _.toBoolean(value);
                toBitmaps(value ? '1' : '0');
                break;
            case C.TYPES.STRING:
                toBitmaps(String(value));
                break;
            case C.TYPES.ARRAY:
                value = String(value).split(separator);
                _.unique(value).forEach(toBitmaps);
                break;
            case C.TYPES.FULLTEXT:
                let {noStopwords, prefixSearch} = field;
                _.stem(value, noStopwords).forEach(toBitmaps);
                prefixSearch && _.triplet(value).forEach(toTriplets);
                break;
            case C.TYPES.FOREIGNKEY:
                toBitmaps(String(value));
                id2fk[id] = value;
                break;
        }
    }
    ids.add(id);
    return C.BITMAP_OK;
}

function SEARCH({index, query, limit, terms, parent, sortby, desc, foreignKeys}) {
    if (!storage[index]) {
        throw new C.BitmapError(C.BITMAP_ERROR_INDEX_NOT_EXISTS);
    }
    let {fields, ids} = storage[index];
    if (sortby && (!fields[sortby] || !fields[sortby].bsi)) {
        let e = fields[sortby] ? C.BITMAP_ERROR_FIELD_NOT_SORTABLE : C.BITMAP_ERROR_FIELD_NOT_EXISTS;
        throw new C.BitmapError(e);
    }
    for (let fk of (foreignKeys || [])) {
        if (!fields[fk] || !fields[fk].id2fk) {
            let e = fields[fk] ? C.BITMAP_ERROR_FIELD_NOT_FOREIGN_KEY : C.BITMAP_ERROR_FIELD_NOT_EXISTS;
            throw new C.BitmapError(e);
        }
    }
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
            fulltext = fulltext.map(({noStopwords, bitmaps, triplets}) => {
                let prefixSearch = false;
                let val = value;
                if (_.isObject(value)) {
                    prefixSearch = value.prefixSearch;
                    val = value.value;
                }
                let words = _.wordSplit(val);
                if (!words.length) {
                    return new RoaringBitmap();
                }
                let bitmap1 = prefixSearch && triplets && searchInTriplets(words.pop(), triplets);
                let andMany = _.stem(words, noStopwords).map(
                    word => bitmaps[word] || new RoaringBitmap()
                );
                let bitmap2 = RoaringBitmap.andMany(andMany);
                return bitmap1 ? RoaringBitmap.orMany([bitmap1, bitmap2]) : bitmap2;
            });
            return RoaringBitmap.orMany(fulltext);
        } else if (field == C.BITMAP_ID) {
            type = C.TYPES.INTEGER;
            min = ids.minimum();
            max = ids.maximum();
        } else if (fields[field]) {
            ({type, bitmaps, min, max, bsi} = fields[field]);
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
    let iterator, ret = [bitmap.size];
    if (sortby) {
        iterator = fields[sortby].bsi.sort(bitmap, !desc);
    } else {
        iterator = bitmap.iterator();
    }
    for (let id of (limit > 0 ? iterator : [])) {
        ret.push(id);
        limit--;
        if (!limit) {
            break;
        }
    }
    if (foreignKeys) {
        foreignKeys = _.unique(foreignKeys);
        foreignKeys = foreignKeys.map(fk => [fk, fields[fk].id2fk]);
        ret = ret.map((id, x) => {
            if (x == 0) {
                return id;
            }
            let r = {id};
            foreignKeys.forEach(fk => r[fk[0]] = fk[1][id]);
            return r;
        });
    }
    if (!bitmap.persist) {
        bitmap.clear();
    }
    return ret;
}

function SHOWCREATE({index}) {
    if (!storage[index]) {
        throw new C.BitmapError(C.BITMAP_ERROR_INDEX_NOT_EXISTS);
    }
    let fields = Object.entries(storage[index].fields).map(([name, field]) => {
        let ret = ['"' + name + '"', field.type];
        switch (field.type) {
            case C.TYPES.ARRAY:
                ret.push('SEPARATOR', '\'' + field.separator + '\'');
                break;
            case C.TYPES.INTEGER:
                ret.push('MIN', field.min, 'MAX', field.max);
                break;
            case C.TYPES.DATE:
                let cast = d => new Date(d * 864E5).toISOString().replace(/T.*$/, '');
                ret.push('MIN', cast(field.min), 'MAX', cast(field.max));
                break;
            case C.TYPES.DATETIME:
                let cast = d => new Date(d * 1E3).toISOString().replace(/\..*$/, '');
                ret.push('MIN', cast(field.min), 'MAX', cast(field.max));
                break;
            case C.TYPES.FULLTEXT:
                field.noStopwords && ret.push('NOSTOPWORDS');
                field.prefixSearch && ret.push('PREFIXSEARCH');
                break;
            case C.TYPES.FOREIGNKEY:
                ret.push('REFERENCES', '"' + ret.references + '"');
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
        throw new C.BitmapError(C.BITMAP_ERROR_INDEX_NOT_EXISTS);
    }
    return storage[index].slowQueryLog;
}

function searchInTriplets(word, triplets) {
    let t3 = _.triplet(word);
    t3.length > 1 && t3.shift();
    t3.length > 1 && t3.shift();
    return RoaringBitmap.andMany(t3.map(w => triplets[w] || new RoaringBitmap()));
}

function dump(index) {
    return storage[index];
}

module.exports = {
    execute,
    PING,
    LIST,
    CREATE,
    DROP,
    RENAME,
    STAT,
    ADD,
    SEARCH,
    SHOWCREATE,
    SLOWQUERYLOG,
    dump,
};
