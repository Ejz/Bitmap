const RoaringBitmap32 = require('roaring/RoaringBitmap32');
const RoaringBitmap32Iterator = require('roaring/RoaringBitmap32Iterator');
const crypto = require('crypto');
const grammar =  require('./grammar');
const storage = {};

function md5(string) {
    return crypto.createHash('md5').update(string).digest('hex');
}

const queryGrammar = new grammar.Query();
queryGrammar.init();

const ERR_PREFIX = 'ERR: ';

function createIndex({index, fields}) {
    return new Promise((resolve, reject) => {
        if (storage[index]) {
            return reject(new Error('ERR: Index ALREADY exists: ' + index));
        }
        let f = {};
        fields.forEach((field) => {
            f[field.field] = {type: field.type, bitmaps: {}};
        });
        fields = f;
        let ids = new RoaringBitmap32([]);
        storage[index] = {fields, ids};
        return resolve('CREATED');
    });
}

function addRecordToIndex({index, id, values}) {
    return new Promise((resolve, reject) => {
        if (!storage[index]) {
            return reject(new Error('ERR: Index NOT exist: ' + index));
        }
        let {fields, ids} = storage[index];
        if (ids.has(id)) {
            return reject(new Error('ERR: ID ALREADY exists: ' + id));
        }
        ids.add(id);
        let available = Object.keys(fields);
        let v = {};
        values.forEach((value) => {
            v[value.field] = value.value;
        });
        values = v;
        v = Object.keys(values);
        let found = v.find((field) => !available.includes(field));
        if (found) {
            return reject(new Error('ERR: Column NOT exist: ' + found));
        }
        if (v.length !== available.length) {
            return reject(new Error('ERR: Specify ALL columns: ' + index));
        }
        Object.entries(values).forEach(([field, value]) => {
            let bitmaps = fields[field].bitmaps;
            field = fields[field];
            let digest = md5(value);
            if (!bitmaps[digest]) {
                bitmaps[digest] = new RoaringBitmap32([]);
            }
            bitmaps[digest].add(id);
        });
        return resolve('ADDED');
    });
}

function searchIndex({index, query}) {
    return new Promise((resolve, reject) => {
        if (!storage[index]) {
            return reject(new Error('ERR: Index NOT exist: ' + index));
        }
        let iterator = queryGrammar.parse(query);
        iterator = getIterator(index, iterator);
        // try {
        // } catch (e) {
        //     if (e.message.indexOf(ERR_PREFIX) === 0) {
        //         socket.write(to_resp(e));
        //     } else {
        //         socket.write(to_resp(new Error(ERR_PREFIX + 'Internal error' + query)));
        //     }
        //     e = e.message;
        //     if (e.contains('ERR: '))
        //     return reject(new Error('ERR: Query error: ' + query));
        // }
        // let {fields, ids} = storage[index];
        // let iterator = ids.iterator();
        let ret = [];
        for (let i = 0; i < 10; i++) {
            let {value, done} = iterator.next();
            if (done) {
                break;
            }
            ret.push(value);
        }
        return resolve(ret);
    });
}

function getIterator(index, iterator) {
    if (Array.isArray(iterator)) {
        let [value, field] = iterator;
        let f;
        if (field) {
            field = field.toLowerCase();
            f = storage[index].fields[field];
            if (!f) {
                throw new Error('ERR: Column NOT exist: ' + f);
            }
        }
        if (value === '*') {
            return storage[index].ids.iterator();
        }
        let digest = md5(value);
        let bitmap = f.bitmaps[digest];
        return bitmap ? bitmap.iterator() : new RoaringBitmap32Iterator();
    }
    let {op, iterators} = iterator;
    op = op || '&';
    if (op === '&') {
        return getAndIterator(index, iterators);
    }
    // if (op === '|') {
    //     return getOrIterator({index, iterators});
    // }
}

function getAndIterator(index, iterators) {
    let iterator = iterators[0];
    return getIterator(index, iterator);
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
