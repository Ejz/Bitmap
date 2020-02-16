const bitmap = require('../bitmap');
const _ = require('../helpers');
const C = require('../constants');
const sprintf = require('util').format;

const to = _.to;
const rand = _.rand;
const equal = _.equal;

test('bitmap - CREATE / DROP', async () => {
    let res;
    res = await bitmap.execute('create index');
    expect(res).toBe(C.CREATE_SUCCESS);
    res = await bitmap.execute('drop index');
    expect(res).toBe(C.DROP_SUCCESS);
});

test('bitmap - ADD', async () => {
    let res, err;
    res = await bitmap.execute('create index fields f1 string');
    expect(res).toBe(C.CREATE_SUCCESS);
    [, err] = await to(bitmap.execute('add index 1 values f2 v1'));
    expect(err).toBe(sprintf(C.COLUMN_NOT_EXISTS_ERROR, 'f2'));
    res = await bitmap.execute('add index 1 values f1 v1');
    expect(res).toBe(C.ADD_SUCCESS);
    await bitmap.execute('drop index');
});

test('bitmap - SEARCH', async () => {
    let res;
    res = await bitmap.execute('create index fields f1 string');
    let strings = ['foo', 'bar', 'hello', 'world'];
    let id = 1;
    for (let string of strings) {
        await bitmap.execute('add index ? values f1 ?', id++, string);
    }
    let cases = {
        '*': [1, 2, 3, 4],
        '@f1:bar': [2],
        '(@f1:bar)': [2],
        '@f1:(bar)': [2],
        '( @f1 : ( bar ) )': [2],
        '@f1:unknown': [],
        '@f1:foo | @f1:bar': [1, 2],
        '@f1:foo & @f1:foo': [1],
        '@f1:foo | @f1:bar & @f1:foo': [1],
        '@f1:foo | (@f1:bar & @f1:foo)': [1],
        '(@f1:foo | @f1:bar) & @f1:foo': [1],
        '@f1:foo & @f1:(bar|foo)': [1],
        '@f1:bar & @f1:(bar|foo)': [2],
        '@f1:bar @f1:(bar|foo)': [2],
        '-@f1:bar': [1, 3, 4],
        '-@f1:(bar|foo)': [3, 4],
        '-@f1:bar & @f1:(unknown|foo)': [1],
    };
    for (const [query, result] of Object.entries(cases)) {
        [, ...res] = await bitmap.execute('search index ?', query);
        expect(res).toStrictEqual(result);
    }
    await bitmap.execute('drop index');
});

test('bitmap - SEARCH (INTEGER)', async () => {
    let res, err;
    let id = 1;
    res = await bitmap.execute(`
        create index fields f1 integer min -3 max 3 f2 integer min 1 max 100
    `);
    [, err] = await to(bitmap.execute('add index ? values f1 ? f2 ?', id++, 10, 1));
    expect(err).toBe(sprintf(C.INTEGER_OUT_OF_RANGE_ERROR, 'f1'));
    [, err] = await to(bitmap.execute('add index ? values f1 ? f2 ?', id++, 1, 1000));
    expect(err).toBe(sprintf(C.INTEGER_OUT_OF_RANGE_ERROR, 'f2'));
    let values = [];
    for (let i = 0; i < 100; i++) {
        let r1 = rand(-3, 3);
        let r2 = rand(1, 100);
        await bitmap.execute('add index ? values f1 ? f2 ?', id++, r1, r2);
        values.push([id - 1, 'f1', r1]);
        values.push([id - 1, 'f2', r2]);
    }
    let cases = {
        '@f1:3': ([id, f, v]) => f == 'f1' && v == 3,
        '@f1:[1,3]': ([id, f, v]) => f == 'f1' && v >= 1 && v <= 3,
        '@f1:[-1,+1]': ([id, f, v]) => f == 'f1' && v >= -1 && v <= 1,
        '@f1:[ -10 , 10 ]': ([id, f, v]) => f == 'f1' && v >= -10 && v <= 10,
        '@f1:[min,1]': ([id, f, v]) => f == 'f1' && v >= -3 && v <= 1,
        '@f1:[-1,max]': ([id, f, v]) => f == 'f1' && v >= -1 && v <= 3,
        '@f1:[min,max]': ([id, f, v]) => f == 'f1' && v >= -3 && v <= 3,
        // '@f1:[,]': ([id, f, v]) => f == 'f1' && v >= -3 && v <= 3,
        '@f2:1 | @f1:2': ([id, f, v]) => equal([f, v], ['f2', 1]) || equal([f, v], ['f1', 2]),
        foo: () => false,
    };
    for (let [q, f] of Object.entries(cases)) {
        [, ...res] = await bitmap.execute('search index ? limit 0 1e6', q);
        expect(res).toStrictEqual(Array.from(new Set(values.filter(f).map(_ => _[0]))));
    }
    await bitmap.execute('drop index');
});

test('bitmap - FULLTEXT', async () => {
    let res;
    let id = 1;
    await bitmap.execute('create index fields f1 fulltext');
    for (let v of ['hello world', 'foo bar', 'boys girls']) {
        await bitmap.execute('add index ? values f1 ?', id++, v);
    }
    let cases = {
        'hello': [1],
        'world hello': [1],
        'foo': [2],
        'foo | hello': [1, 2],
        '(world | foo) & (bar | one)': [2],
        'boy girl': [3],
    };
    for (let [q, f] of Object.entries(cases)) {
        [, ...res] = await bitmap.execute('search index ?', q);
        expect(res).toStrictEqual(f);
    }
    await bitmap.execute('drop index');
});

test('bitmap - BOOLEAN', async () => {
    let res;
    let id = 1;
    await bitmap.execute('create index fields f1 boolean');
    for (let v of ['1', 'true', 'false']) {
        await bitmap.execute('add index ? values f1 ?', id++, v);
    }
    let cases = {
        '@f1:1': [1, 2],
        '@f1:True': [1, 2],
        '@f1:0': [3],
        '@f1:False': [3],
    };
    for (let [q, f] of Object.entries(cases)) {
        [, ...res] = await bitmap.execute('search index ?', q);
        expect(res).toStrictEqual(f);
    }
    await bitmap.execute('drop index');
});

test('bitmap - ARRAY', async () => {
    let res;
    let id = 1;
    await bitmap.execute('create index fields f1 array separator |');
    for (let v of ['hello | world', 'foo|bar', ' boys|girls ']) {
        await bitmap.execute('add index ? values f1 ?', id++, v);
    }
    let cases = {
        '@f1:hello': [1],
        '@f1:world @f1:hello': [1],
        '@f1:foo': [2],
        '@f1:foo | @f1:hello': [1, 2],
        '(@f1:world | @f1:foo) & (@f1:bar | @f1:one)': [2],
        '@f1:boys @f1:girls': [3],
    };
    for (let [q, f] of Object.entries(cases)) {
        [, ...res] = await bitmap.execute('search index ?', q);
        expect(res).toStrictEqual(f);
    }
    await bitmap.execute('drop index');
});

test('bitmap - SORTBY id DESC', async () => {
    let res;
    await bitmap.execute('create index');
    for (let i of Array(1E3).keys()) {
        await bitmap.execute('add index ?', i + 1);
    }
    [, ...res] = await bitmap.execute('search index * sortby id desc limit 1000');
    expect(res).toStrictEqual([...Array(1E3).keys()].map(k => k + 1).reverse());
    await bitmap.execute('drop index');
});

test('bitmap - SORTBY VALUES', async () => {
    let id = 1, res;
    await bitmap.execute('create index fields f1 integer');
    await bitmap.execute('add index ? values f1 3', id++);
    await bitmap.execute('add index ? values f1 1', id++);
    await bitmap.execute('add index ? values f1 2', id++);
    [, ...res] = await bitmap.execute('search index * sortby f1 asc');
    expect(res).toStrictEqual([2, 3, 1]);
    [, ...res] = await bitmap.execute('search index * sortby f1 desc');
    expect(res).toStrictEqual([1, 3, 2]);
    await bitmap.execute('drop index');
});

test('bitmap - SORTABLE', async () => {
    let res;
    let asc = ([id1, v1], [id2, v2]) => v1 == v2 ? id1 - id2 : v1 - v2;
    let desc = ([id1, v1], [id2, v2]) => v1 == v2 ? id1 - id2 : v2 - v1;
    await bitmap.execute('create index fields f1 integer');
    let values = [];
    for (let id = 1; id <= 1E3; id++) {
        let r = _.rand(-1E3, 1E3); // id; // rand(-100, +100);
        await bitmap.execute('add index ? values f1 ?', id, r);
        values.push([id, r]);
    }
    let cases = {
        '@f1:[1,10]': ([, v]) => 1 <= v && v <= 10,
        '@f1:[10,100]': ([, v]) => 10 <= v && v <= 100,
        '@f1:[-10,100]': ([, v]) => -10 <= v && v <= 100,
        '@f1:[-10,10]': ([, v]) => -10 <= v && v <= 10,
        '@f1:[-10000,0]': ([, v]) => -10000 <= v && v <= 0,
        '@f1:[0,+10000]': ([, v]) => 0 <= v && v <= 10000,
        '*': () => true,
    };
    for (let [q, f] of Object.entries(cases)) {
        let order = _.rand(0, 1) ? 'asc' : 'desc';
        [, ...res] = await bitmap.execute('search index ? sortby f1 ? limit 1e6', q, order);
        let v = values.filter(f);
        v.sort(order == 'asc' ? asc : desc);
        v = v.map(([id]) => id);
        expect(res).toStrictEqual(v);
    }
    await bitmap.execute('drop index');
});

test('bitmap - FOREIGNKEY', async () => {
    let res;
    await bitmap.execute('create i1');
    await bitmap.execute('create i2 fields i1 foreignkey i1 f1 integer min 1 max 3');
    await bitmap.execute('create i3 fields i2 foreignkey i2 f1 integer min 1 max 5');
    await bitmap.execute('add i1 ?', 1);
    await bitmap.execute('add i1 ?', 2);
    await bitmap.execute('add i2 ? values i1 ? f1 ?', 1, 1, 1);
    await bitmap.execute('add i2 ? values i1 ? f1 ?', 2, 2, 2);
    await bitmap.execute('add i2 ? values i1 ? f1 ?', 3, 1, 3);
    await bitmap.execute('add i3 ? values i2 ? f1 ?', 1, 1, 1);
    await bitmap.execute('add i3 ? values i2 ? f1 ?', 2, 2, 2);
    await bitmap.execute('add i3 ? values i2 ? f1 ?', 3, 3, 3);
    await bitmap.execute('add i3 ? values i2 ? f1 ?', 4, 1, 4);
    await bitmap.execute('add i3 ? values i2 ? f1 ?', 5, 2, 5);
    let cases = {
        '@@i2:@f1:1': [1],
        '@@i2:(@f1:1)': [1],
        '(@@i2:@f1:1)': [1],
        '(@@i2:(@f1:1))': [1],
        '@@i2:@@i3:@f1:1': [1],
        '@@i2:(@@i3:@f1:1)': [1],
        '@@i2:(@@i3:(@f1:1))': [1],
        '@@i2:(@@i3:(@f1:1 | @f1:2))': [1, 2],
        '@@i2:(@@i3:*)': [1, 2],
    };
    for (let [q, f] of Object.entries(cases)) {
        let [, ...res] = await bitmap.execute('search i1 ?', q);
        expect(res).toStrictEqual(f);
    }
    [, ...res] = await bitmap.execute('search i2 ?', '@i1:1');
    expect(res).toStrictEqual([1, 3]);
    await bitmap.execute('drop i1');
    await bitmap.execute('drop i2');
    await bitmap.execute('drop i3');
});

test('bitmap - STAT', async () => {
    let res;
    await bitmap.execute('create a');
    await bitmap.execute('add a 1');
    res = await bitmap.execute('stat');
    expect(res[0]).toBe('rss');
    expect(res[1] > 0).toBe(true);
    res = await bitmap.execute('stat a');
    expect(res[0]).toBe('size');
    expect(res[1] > 0).toBe(true);
    await bitmap.execute('drop a');
});

test('bitmap - RENAME', async () => {
    let res;
    res = await bitmap.execute('list');
    expect(res).toStrictEqual([]);
    await bitmap.execute('create a');
    res = await bitmap.execute('list');
    expect(res).toStrictEqual(['a']);
    await bitmap.execute('rename a a2');
    res = await bitmap.execute('list');
    expect(res).toStrictEqual(['a2']);
    await bitmap.execute('drop a2');
    res = await bitmap.execute('list');
    expect(res).toStrictEqual([]);
});

test('bitmap - PERSIST', async () => {
    _.rm(C.DUMPDIR);
    let res;
    await bitmap.execute('create a persist');
    await bitmap.execute('add a 1');
    await bitmap.execute('rename a a1');
    await bitmap.execute('drop a1');
    await bitmap.execute('load a1');
    res = await bitmap.execute('list');
    expect(res).toStrictEqual(['a1']);
    await bitmap.execute('add a1 2');
    await bitmap.execute('drop a1');
    await bitmap.execute('load a1');
    [, ...res] = await bitmap.execute('search a1 *');
    expect(res).toStrictEqual([1, 2]);
});

test('bitmap - APPENDFK', async () => {
    let res;
    await bitmap.execute('create parent');
    await bitmap.execute('add parent 1');
    await bitmap.execute('add parent 2');
    await bitmap.execute('add parent 3');
    await bitmap.execute('create child fields parent_id foreignkey parent');
    await bitmap.execute('add child 1 values parent_id 1');
    await bitmap.execute('add child 2 values parent_id 1');
    await bitmap.execute('add child 3 values parent_id 2');
    [, ...res] = await bitmap.execute('search parent ?', '@@child:(*)');
    expect(res).toStrictEqual([1, 2]);
    [, ...res] = await bitmap.execute('search child ? appendfk parent_id appendfk parent_id', '*');
    expect(res).toStrictEqual([[1, 1, 1], [2, 1, 1], [3, 2, 2]]);
    await bitmap.execute('drop parent');
    await bitmap.execute('drop child');
});

test('bitmap - INVALID QUERY', async () => {
    let res;
    await bitmap.execute('create a');
    let bool = false;
    try {
        await bitmap.execute('search a -');
    } catch (e) {
        bool = true;
    }
    expect(bool).toBe(true);
    await bitmap.execute('drop a');
});

test('bitmap - TRIPLETS', async () => {
    let res;
    await bitmap.execute('create a fields ft fulltext tr triplets');
    let texts = {
        1: ['which a user might search', 'lazy dog'],
        2: ['some english text', 'foo bar'],
        3: ['one two three', 'hello world foz'],
    };
    for (let [id, [ft, tr]] of Object.entries(texts)) {
        await bitmap.execute('add a ? values ft ? tr ?', id, ft, tr);
    }
    let cases = {
        'lazy': [1],
        'lazy dogs': [1],
        'which dogs': [1],
        'lazy ^d': [1],
        '^"lazy d"': [1],
        '@ft:one & @tr:^worl': [3],
        '^s': [],
        '^fo': [2, 3],
    };
    for (let [query, ids] of Object.entries(cases)) {
        [, ...res] = await bitmap.execute('search a ?', query);
        expect(res).toStrictEqual(ids);
    }
    await bitmap.execute('drop a');
});

test('bitmap - ID FILTER', async () => {
    let res;
    await bitmap.execute('create a');
    await bitmap.execute('add a 1');
    await bitmap.execute('add a 2');
    await bitmap.execute('add a 3');
    [, ...res] = await bitmap.execute('search a ?', '@id:[2,max]');
    expect(res).toStrictEqual([2, 3]);
    [, ...res] = await bitmap.execute('search a ?', '@id:[3,max]');
    expect(res).toStrictEqual([3]);
    [, ...res] = await bitmap.execute('search a ?', '@id:[min,1]');
    expect(res).toStrictEqual([1]);
    [, ...res] = await bitmap.execute('search a ?', '@id:[min,2]');
    expect(res).toStrictEqual([1, 2]);
    await bitmap.execute('drop a');
});

test('bitmap - DateTime', async () => {
    let res;
    await bitmap.execute('create a fields d date dt datetime');
    await bitmap.execute('add a 1 values d ? dt ?', '2020-01-01', '2020-01-01 10:00:01');
    await bitmap.execute('add a 2 values d ? dt ?', '2020-02-01', '2020-02-01 11:00:01');
    await bitmap.execute('add a 3 values d ? dt ?', '2020-02-02', '2020-02-01 12:00:01');
    [, ...res] = await bitmap.execute('search a ?', '@d:[2020-01-01,2020-01-01]');
    expect(res).toStrictEqual([1]);
    [, ...res] = await bitmap.execute('search a ?', '@d:[2020-01-02,2022-01-01]');
    expect(res).toStrictEqual([2, 3]);
    [, ...res] = await bitmap.execute('search a * sortby d desc');
    expect(res).toStrictEqual([3, 2, 1]);
    await bitmap.execute('drop a');
});

test('bitmap - CURSOR', async () => {
    let res;
    let sortAsc = ([id1], [id2]) => id1 - id2;
    let sortDesc = ([id1], [id2]) => id2 - id1;
    let sortValAsc = ([id1, v1], [id2, v2]) => v1 == v2 ? id1 - id2 : v1 - v2;
    let sortValDesc = ([id1, v1], [id2, v2]) => v1 == v2 ? id1 - id2 : v2 - v1;
    let grab = async (cursor) => {
        let ids, limit, ret = [];
        do {
            limit = _.rand(1, 5);
            ids = await bitmap.execute('cursor ? limit ?', cursor, limit);
            ret = ret.concat(ids);
        } while (ids.length >= limit);
        return ret;
    };
    let cases = [
        {
            num: 1000,
            val: id => _.rand(1, 10),
            queries: [{
                query: '*',
                sort: 'id',
                asc: true,
                filterValues: ([i, v]) => true,
                sortValues: sortAsc,
            }, {
                query: '*',
                sort: 'id',
                asc: false,
                filterValues: ([i, v]) => true,
                sortValues: sortDesc,
            }, {
                query: '*',
                sort: 'int',
                asc: true,
                filterValues: ([i, v]) => true,
                sortValues: sortValAsc,
            }, {
                query: '*',
                sort: 'int',
                asc: false,
                filterValues: ([i, v]) => true,
                sortValues: sortValDesc,
            }, {
                query: '@int:4',
                sort: 'int',
                asc: false,
                filterValues: ([i, v]) => v == 4,
                sortValues: sortValDesc,
            }],
        },
    ];
    for (let {num, val, queries} of cases) {
        let vals = [];
        await bitmap.execute('create index fields int integer');
        bitmap.storage.index.fields.id.intervals.config = {div: _.rand(2, 100), rank: _.rand(2, 100)};
        bitmap.storage.index.fields.int.intervals.config = {div: _.rand(2, 100), rank: _.rand(2, 100)};
        for (let i = 1; i <= num; i++) {
            let v = val(i);
            vals.push([i, v]);
            await bitmap.execute('add index ? values int ?', i, v);
        }
        for (let {query, sort, asc, filterValues, sortValues} of queries) {
            let [size, cursor] = await bitmap.execute('search index ? sortby ? ? withcursor', query, sort, asc ? 'asc' : 'desc');
            let grabbed = await grab(cursor);
            let _vals = vals.filter(filterValues);
            _vals.sort(sortValues);
            expect(size).toStrictEqual(_vals.length);
            expect(size).toStrictEqual(grabbed.length);
            expect(grabbed).toStrictEqual(_vals.map(([id]) => id));
        }
        await bitmap.execute('drop index');
    }
});
