const RoaringBitmap = require('./RoaringBitmap');
const Grammar = require('./grammar');
const C = require('./constants');
const _ = require('./helpers');
const NumberIntervals = require('./NumberIntervals');

const storage = {};
const cursors = {};
const grammar = new Grammar();

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
        let size = ids.size();
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
        let found = fields.find(f => f.field == C.ID_FIELD);
        if (found) {
            return reject(C.ID_FIELD_IS_FORBIDDEN_ERROR);
        }
        if (storage[index]) {
            return reject(_.sprintf(C.INDEX_EXISTS_ERROR, index));
        }
        let f = {};
        for (let thisField of fields) {
            let {
                field, type, min, max,
                fk, separator, noStopwords,
            } = thisField;
            let triplets, bsi, bitmaps = {};
            if ([C.TYPE_INTEGER, C.TYPE_DATE, C.TYPE_DATETIME].includes(type)) {
                bsi = new BSI(min, max);
                bitmaps = undefined;
            } else if (type == C.TYPE_FOREIGNKEY) {
                fk = {fk, id2fk: {}};
            } else if (type == C.TYPE_TRIPLETS) {
                triplets = {};
            }
            f[field] = {
                type,
                ...(bitmaps !== undefined ? {bitmaps} : {}),
                ...(intervals !== undefined ? {intervals} : {}),
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

function ADD({index, id, values}) {
    return new Promise((resolve, reject) => {
        if (!index) {
            return reject(C.INVALID_INDEX_ERROR);
        }
        if (!storage[index]) {
            return reject(_.sprintf(C.INDEX_NOT_EXISTS_ERROR, index));
        }
        values = values || [];
        let {fields, ids, persist} = storage[index];
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
            let thisField = fields[field];
            let {type, bitmaps} = thisField;
            if (type === C.TYPE_INTEGER) {
                thisField.bsi.add(id, value);
                continue;
            }
            if (type === C.TYPE_DATE) {
                value = _.toDateInteger(value);
                thisField.bsi.add(id, value);
                continue;
            }
            if (type === C.TYPE_DATETIME) {
                value = _.toDateTimeInteger(value);
                thisField.bsi.add(id, value);
                continue;
            }
            if ([C.TYPE_STRING, C.TYPE_ARRAY, C.TYPE_BOOLEAN, C.TYPE_FOREIGNKEY].includes(type)) {
                value = [value];
                if (type == C.TYPE_ARRAY) {
                    value = value[0].split(thisField.separator).map(v => v.trim());
                } else if (type == C.TYPE_BOOLEAN) {
                    value[0] = _.toBoolean(value[0]);
                } else if (type == C.TYPE_FOREIGNKEY) {
                    value[0] = Number(value[0]);
                    thisField.fk.id2fk[id] = value[0];
                }
                for (let v of value) {
                    if (!bitmaps[v]) {
                        bitmaps[v] = new RoaringBitmap();
                        bitmaps[v].persist = true;
                    }
                    bitmaps[v].add(id);
                }
                continue;
            }
            if ([C.TYPE_FULLTEXT, C.TYPE_TRIPLETS].includes(type)) {
                let {noStopwords, triplets} = thisField;
                let flag = type == C.TYPE_TRIPLETS;
                for (let v of _.stem(value, noStopwords)) {
                    if (!bitmaps[v]) {
                        bitmaps[v] = new RoaringBitmap();
                        bitmaps[v].persist = true;
                    }
                    bitmaps[v].add(id);
                    if (flag) {
                        for (let vv of _.triplets(v)) {
                            if (!triplets[vv]) {
                                triplets[vv] = new RoaringBitmap();
                                triplets[vv].persist = true;
                            }
                            triplets[vv].add(id);
                        }
                    }
                }
                continue;
            }
        }
        ids.add(id);
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

function SEARCH({index, query, sortby, desc, limit, appendFk, withCursor, bitmap, cursor, appendPos}) {
    return new Promise((resolve, reject) => {
        if (!index) {
            return reject(C.INVALID_INDEX_ERROR);
        }
        if (!storage[index]) {
            return reject(_.sprintf(C.INDEX_NOT_EXISTS_ERROR, index));
        }
        let {fields} = storage[index];
        for (let fk of appendFk) {
            if (!fields[fk] || fields[fk].type != C.TYPE_FOREIGNKEY) {
                let e = fields[fk] ? C.COLUMN_NOT_FOREIGNKEY_ERROR : C.COLUMN_NOT_EXISTS_ERROR;
                return reject(_.sprintf(e, fk));
            }
        }
        if (sortby && (!fields[sortby] || !fields[sortby].bsi)) {
            let e = fields[sortby] ? C.COLUMN_NOT_SORTABLE_ERROR : C.COLUMN_NOT_EXISTS_ERROR;
            return reject(_.sprintf(e, sortby));
        }
        sortby = sortby || C.ID_FIELD;
        bitmap = bitmap || getBitmap(index, query);
        let {size} = bitmap;
        if (!size) {
            return resolve([0]);
        }
        if (withCursor) {
            let cursor = hex();
            bitmap.persist = true;
            let tid = setTimeout(cursorTimeout, C.CURSOR_TIMEOUT, cursor);
            cursors[cursor] = {index, sortby, desc, tid, bitmap, appendFk};
            return resolve([size, cursor]);
        }
        let [off, lim] = limit;
        lim += off;
        let ret;
        let val, p = bitmap.persist;
        bitmap.persist = true;
        let position = cursor ? cursor.position : undefined;
        let [_ids, pos] = fields[sortby].bsi.sort(bitmap, !desc, lim, position);
        bitmap.persist = p;
        if (cursor) {
            cursor.position = pos;
        } else {
            _ids = off > 0 ? _ids.slice(off) : _ids;
            _ids.unshift(size);
        }
        ret = _ids;
        if (!bitmap.persist) {
            bitmap.clear();
        }
        if (appendFk.length) {
            let collect = cursor ? [] : [ret.shift()];
            for (let id of ret) {
                let _t = [id];
                for (let fk of appendFk) {
                    _t.push(fields[fk].fk.id2fk[id]);
                }
                collect.push(_t);
            }
            ret = collect;
        }
        if (appendPos) {
            ret.push(_.isArray(pos) ? pos.join('-') : '');
        }
        return resolve(ret);
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
            return storage[index].ids.getBitmap();
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

module.exports = {
    storage,
    PING,
    CREATE,
    DROP,
    ADD,
    CURSOR,
    SEARCH,
    LIST,
    STAT,
    RENAME,
    LOAD,
    execute,
};
