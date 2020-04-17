const RoaringBitmap = require('./RoaringBitmap');
const BSI = require('./BSI');
const C = require('./constants');
const _ = require('./helpers');
const CommandParser = require('./CommandParser');
const QueryParser = require('./QueryParser');

let storage = Object.create(null);

let isUnique = arr => arr.length == _.unique(arr).length;

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
    if (_.isString(command)) {
        return command;
    }
    let action = String(command.action || '');
    if (!module.exports[action]) {
        return C.E(C.BITMAP_ERROR_UNKNOWN_COMMAND);
    }
    try {
        return module.exports[action](command);
    } catch (e) {
        e = _.isArray(e) ? e : [e];
        return C.E(...e);
    }
}

function PING() {
    return C.BITMAP_OK;
}

function LIST() {
    return Object.keys(storage);
}

function CREATE({index, fields}) {
    if (storage[index]) {
        throw C.BITMAP_ERROR_INDEX_EXISTS;
    }
    for (let [, field] of Object.entries(fields)) {
        let {type} = field;
        if (!C.IS_INTEGER(type)) {
            field.bitmaps = Object.create(null);
            if (type == C.TYPES.FOREIGNKEY) {
                field.id2fk = Object.create(null);
            }
        }
    }
    storage[index] = {fields, bitmaps: [], newBitmap};
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
        throw C.BITMAP_ERROR_INDEX_NOT_EXISTS;
    }
    delete storage[index];
    return C.BITMAP_OK;
}

function RENAME({index, name}) {
    if (!storage[index]) {
        throw C.BITMAP_ERROR_INDEX_NOT_EXISTS;
    }
    if (storage[name]) {
        throw C.BITMAP_ERROR_INDEX_EXISTS;
    }
    storage[name] = storage[index];
    delete storage[index];
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
        throw C.BITMAP_ERROR_INDEX_NOT_EXISTS;
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
        throw C.BITMAP_ERROR_INDEX_NOT_EXISTS;
    }
    let {ids, fields} = storage[index];
    if (ids.has(id)) {
        throw C.BITMAP_ERROR_ID_EXISTS;
    }
    let f1 = Object.entries(values).find(([field]) => !fields[field]);
    if (f1) {
        throw C.BITMAP_ERROR_FIELD_NOT_EXISTS;
    }
    let f2 = Object.entries(values).find(([field, value]) =>
        C.IS_INTEGER(fields[field].type) && (
            value < fields[field].min || fields[field].max < value
        )
    );
    if (f2) {
        throw C.BITMAP_ERROR_OUT_OF_RANGE;
    }
    for (let [field, value] of Object.entries(values)) {
        field = fields[field];
        let {type, bitmaps, separator, id2fk} = field;
        let toBitmap = v => {
            bitmaps[v] = bitmaps[v] || storage[index].newBitmap();
            bitmaps[v].add(id);
        };
        switch (type) {
            case C.TYPES.INTEGER:
                value = _.toInteger(value);
                if (value === undefined) {
                    throw C.BITMAP_ERROR_EXPECT_INTEGER;
                }
                field.bsi.add(id, value);
                break;
            case C.TYPES.DATE:
                value = _.toDateInteger(value);
                if (value === undefined) {
                    throw C.BITMAP_ERROR_EXPECT_DATE;
                }
                field.bsi.add(id, value);
                break;
            case C.TYPES.DATETIME:
                value = _.toDateTimeInteger(value);
                if (value === undefined) {
                    throw C.BITMAP_ERROR_EXPECT_DATETIME;
                }
                field.bsi.add(id, value);
                break;
            case C.TYPES.BOOLEAN:
                value = _.toBoolean(value);
                toBitmap(value);
                break;
            case C.TYPES.STRING:
                toBitmap(String(value));
                break;
            case C.TYPES.ARRAY:
                value = String(value).split(separator).map(v => v.trim());
                value.filter(Boolean).forEach(toBitmap);
                break;
            // case C.TYPES.FOREIGNKEY:
            //     value = _.toInteger(value);
            //     if (value === undefined || value < 1) {
            //         throw [C.BITMAP_ERROR_EXPECT_POSITIVE_INTEGER];
            //     }
            //     toBitmap(value);
            //     id2fk[id] = value;
            //     break;
            // case C.TYPES.FULLTEXT:
            //     value = [];
            //     value.forEach(toBitmap);
            //     break;
        }
    }
    ids.add(id);
    return C.BITMAP_OK;
}

function SEARCH({index, query, limit}) {
    if (!storage[index]) {
        throw C.BITMAP_ERROR_INDEX_NOT_EXISTS;
    }
    let {fields, ids} = storage[index];
    let queryParser = new QueryParser();
    let tokens = queryParser.tokenize(query);
    let terms = queryParser.tokens2terms(tokens);
    terms.postfix = queryParser.infix2postfix(terms.infix);
    let bitmap = queryParser.resolve(terms.postfix, terms.terms, term => {
        if (term == '*') {
            return ids;
        }
        let {field, value} = term;
        if (!fields[field]) {
            throw C.BITMAP_ERROR_FIELD_NOT_EXISTS;
        }
        let {type, bitmaps} = fields[field];
        switch (type) {
            case C.TYPES.STRING:
                return bitmaps[String(value)] || new RoaringBitmap();
        }
    });
    let ret = [bitmap.size];
    for (let id of (limit > 0 ? bitmap : [])) {
        ret.push(id);
        limit--;
        if (!limit) {
            break;
        }
    }
    return ret;
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
};



function CREATEOLD({index, fields, persist}) {
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
        let found = fields.find(f => f.field == C.ID_FIELD);
        if (found) {
            return reject(C.ID_FIELD_IS_FORBIDDEN_ERROR);
        }
        if (storage[index]) {
            return reject(_.sprintf(C.INDEX_EXISTS_ERROR, index));
        }
        let f = Object.create(null);
        for (let thisField of fields) {
            let {
                field, type, min, max,
                fk, separator, noStopwords,
            } = thisField;
            let triplets, bsi, bitmaps = Object.create(null);
            if ([C.TYPE_INTEGER, C.TYPE_DATE, C.TYPE_DATETIME].includes(type)) {
                bsi = new BSI(min, max);
                bitmaps = undefined;
            } else if (type == C.TYPE_FOREIGNKEY) {
                fk = {fk, id2fk: Object.create(null)};
            } else if (type == C.TYPE_TRIPLETS) {
                triplets = Object.create(null);
            }
            f[field] = {
                type,
                ...(bitmaps !== undefined ? {bitmaps} : {}),
                ...(bsi !== undefined ? {bsi} : {}),
                ...(min !== undefined ? {min} : {}),
                ...(max !== undefined ? {max} : {}),
                ...(fk !== undefined ? {fk} : {}),
                ...(separator !== undefined ? {separator} : {}),
                ...(noStopwords !== undefined ? {noStopwords} : {}),
                ...(triplets !== undefined ? {triplets} : {}),
            };
        }
        let ids = new RoaringBitmap();
        ids.persist = true;
        storage[index] = {fields: f, ids, persist};
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

function DROPOLD({index}) {
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







function CURSOR({index: cursor, limit}) {
    return new Promise(async (resolve, reject) => {
        if (!cursor || !cursors[cursor]) {
            return reject(C.INVALID_CURSOR_ERROR);
        }
        let {index, sortby, desc, tid, bitmap, appendFk} = cursors[cursor];
        clearTimeout(tid);
        tid = setTimeout(cursorTimeout, C.CURSOR_TIMEOUT, cursor);
        cursors[cursor].tid = tid;
        let values = await SEARCH({
            index, sortby, desc, limit: [0, limit], appendFk,
            bitmap, cursor: cursors[cursor],
        });
        return resolve(values);
    });
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
        let indexTypes = [C.TYPE_FULLTEXT, C.TYPE_TRIPLETS];
        if (!field) {
            let fields = Object.entries(storage[index].fields);
            fields = fields.filter(([k, v]) => indexTypes.includes(v.type));
            fields = fields.map(([k]) => k);
            if (!fields.length) {
                return new RoaringBitmap();
            }
            let queries = fields.map(field => ({values, field}));
            return getOrBitmap(index, queries);
        }
        let thisField = storage[index].fields[field];
        let {type, bitmaps, triplets} = thisField;
        if (type === C.TYPE_BOOLEAN) {
            value = _.toBoolean(value);
            return bitmaps[value] || new RoaringBitmap();
        }
        if ([C.TYPE_STRING, C.TYPE_ARRAY].includes(type)) {
            return bitmaps[value] || new RoaringBitmap();
        }
        if (indexTypes.includes(type)) {
            let last, flag = value.length && value[0] == '^';
            if (flag && type != C.TYPE_TRIPLETS) {
                return new RoaringBitmap();
            }
            let words = _.stem(value, thisField.noStopwords);
            if (flag && words.length) {
                last = words.pop();
            }
            words = words.map(w => bitmaps[w] || new RoaringBitmap());
            if (last !== undefined) {
                words.push(getTripletsBitmap(triplets, last));
            }
            return RoaringBitmap.andMany(words);
        }
        if (type == C.TYPE_INTEGER) {
            if (!Array.isArray(value)) {
                value = [value, value];
            }
            let [from, to] = value;
            from = _.isInteger(from) ? from : undefined;
            to = _.isInteger(to) ? to : undefined;
            return thisField.bsi.getBitmap(from, to);
        }
        if (type == C.TYPE_DATE) {
            if (!Array.isArray(value)) {
                value = [value, value];
            }
            let [from, to] = value;
            from = _.toDateInteger(from);
            to = _.toDateInteger(to);
            from = _.isInteger(from) ? from : undefined;
            to = _.isInteger(to) ? to : undefined;
            return thisField.bsi.getBitmap(from, to);
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
    queries = queries.map(query => {
        if (!(query instanceof RoaringBitmap)) {
            query = getBitmap(index, query);
        }
        return query;
    });
    return RoaringBitmap.andMany(queries);
}

function getOrBitmap(index, queries) {
    queries = queries.map(query => {
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

function getTripletsBitmap(triplets, word) {
    let t3 = _.triplets(word);
    if (t3.length > 1) {
        t3.shift();
    }
    if (t3.length > 1) {
        t3.shift();
    }
    return RoaringBitmap.andMany(t3.map(w => triplets[w] || new RoaringBitmap()));
}


// const Grammar = require('./grammar');
// const C = require('./constants');
// const _ = require('./helpers');
// const NumberIntervals = require('./NumberIntervals');


// const storage = Object.create(null);
// const cursors = Object.create(null);
// const grammar = new Grammar();

// function hex() {
//     let hex;
//     do {
//         hex = _.generateHex();
//     } while (hex.length < 8 || Number(hex.substring(0, 1)));
//     return hex;
// }

// function cursorTimeout(cursor) {
//     if (!cursors[cursor].bitmap.persist) {
//         cursors[cursor].bitmap.clear();
//     }
//     delete cursors[cursor];
// }
//     // if (C.IS_NUMERIC(type)) {
        //     field.bsi.add(id, value);
        //     continue;
        // }
        // let vs;
        // switch (type) {
        //     case C.TYPES.BOOLEAN:
        //         value = 
        // }
        // if (type == C.TYPES.BOOLEAN) {
        //     let v = 
        //     if (!bitmaps[v]) {
        //         bitmaps[v] = new RoaringBitmap();
        //         bitmaps[v].persist = true;
        //     }
        //     bitmaps[v].add(id);
        // }
    //     let thisField = fields[field];
    //     let {type, bitmaps} = thisField;
    //     if (type === C.TYPE_INTEGER) {
    //         thisField.bsi.add(id, value);
    //         continue;
    //     }
    //     if (type === C.TYPE_DATE) {
    //         value = _.toDateInteger(value);
    //         thisField.bsi.add(id, value);
    //         continue;
    //     }
    //     if (type === C.TYPE_DATETIME) {
    //         value = _.toDateTimeInteger(value);
    //         thisField.bsi.add(id, value);
    //         continue;
    //     }
    //     if ([C.TYPE_STRING, C.TYPE_ARRAY, C.TYPE_BOOLEAN, C.TYPE_FOREIGNKEY].includes(type)) {
    //         value = [value];
    //         if (type == C.TYPE_ARRAY) {
    //             value = value[0].split(thisField.separator).map(v => v.trim());
    //         } else if (type == C.TYPE_BOOLEAN) {
    //             value[0] = _.toBoolean(value[0]);
    //         } else if (type == C.TYPE_FOREIGNKEY) {
    //             value[0] = Number(value[0]);
    //             thisField.fk.id2fk[id] = value[0];
    //         }
    //         for (let v of value) {
    //             if (!bitmaps[v]) {
    //                 bitmaps[v] = new RoaringBitmap();
    //                 bitmaps[v].persist = true;
    //             }
    //             bitmaps[v].add(id);
    //         }
    //         continue;
    //     }
    //     if ([C.TYPE_FULLTEXT, C.TYPE_TRIPLETS].includes(type)) {
    //         let {noStopwords, triplets} = thisField;
    //         let flag = type == C.TYPE_TRIPLETS;
    //         for (let v of _.stem(value, noStopwords)) {
    //             if (!bitmaps[v]) {
    //                 bitmaps[v] = new RoaringBitmap();
    //                 bitmaps[v].persist = true;
    //             }
    //             bitmaps[v].add(id);
    //             if (flag) {
    //                 for (let vv of _.triplets(v)) {
    //                     if (!triplets[vv]) {
    //                         triplets[vv] = new RoaringBitmap();
    //                         triplets[vv].persist = true;
    //                     }
    //                     triplets[vv].add(id);
    //                 }
    //             }
    //         }
    //         continue;
    //     }
    // }