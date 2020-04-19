const C = require('../constants');
const _ = require('../helpers');
const bitmap = require('../bitmap');

test('bitmap / PING', () => {
    let r1 = bitmap.execute('ping');
    expect(r1).toEqual(C.BITMAP_OK);
});

test('bitmap / CREATE / LIST / DROP', () => {
    let r1 = bitmap.execute('create a');
    expect(r1).toEqual(C.BITMAP_OK);
    let r2 = bitmap.execute('list');
    expect(r2).toEqual(['a']);
    let r3 = bitmap.execute('drop a');
    expect(r3).toEqual(C.BITMAP_OK);
    let r4 = bitmap.execute('list');
    expect(r4).toEqual([]);
});

test('bitmap / RENAME', () => {
    bitmap.execute('create a');
    let r1 = bitmap.execute('list');
    expect(r1).toEqual(['a']);
    let r2 = bitmap.execute('rename a b');
    expect(r2).toEqual(C.BITMAP_OK);
    let r4 = bitmap.execute('list');
    expect(r4).toEqual(['b']);
});

test('bitmap / STAT', () => {
    let r1 = bitmap.execute('stat');
    expect(/^memory_/.test(Object.keys(r1)[0])).toEqual(true);
    bitmap.execute('create a');
    bitmap.execute('add a 1');
    bitmap.execute('add a 3');
    let r2 = bitmap.execute('stat a');
    expect(r2).toEqual({size: 2, id_minimum: 1, id_maximum: 3, used_bitmaps: 1, used_bits: 2});
    bitmap.execute('drop a');
});

test('bitmap / ADD', () => {
    let r1 = bitmap.execute(`
        create a fields
        i integer min 1 max 2
        d date
        dt datetime
        b boolean
        a array
        s string
    `);
    expect(r1).toEqual(C.BITMAP_OK);
    let r2 = bitmap.execute('add a 1 values i 1 d 2010 dt 2010 b 1 a 1 s 1');
    expect(r2).toEqual(C.BITMAP_OK);
    let r3 = bitmap.execute('add a 2 values s 2');
    expect(r3).toEqual(C.BITMAP_OK);
    let r4 = bitmap.execute('add a 3 values s 1');
    expect(r4).toEqual(C.BITMAP_OK);
    let r5 = bitmap.execute('stat a');
    let used_bitmaps = 1 + 2 + 33 + 33 + 1 + 1 + 2;
    expect(r5).toEqual({size: 3, id_minimum: 1, id_maximum: 3, used_bitmaps, used_bits: r5.used_bits});
    bitmap.execute('drop a');
});

test('bitmap / SEARCH / 1', () => {
    bitmap.execute('create index fields f1 string');
    let strings = ['foo', 'bar', 'hello', 'world'];
    let id = 1;
    for (let string of strings) {
        bitmap.execute(`add index ${id++} values f1 '${string}'`);
    }
    let cases = {
        '@f1:bar': [2],
        '(@f1:bar)': [2],
        '@f1:unknown': [],
        '@f1:foo | @f1:bar': [1, 2],
        '@f1:foo & @f1:bar': [],
        '@f1:foo & @f1:foo': [1],
        '@f1:(bar)': [2],
        '@f1:(bar | foo)': [1, 2],
        '@f1:(bar & foo)': [],
        '@f1:(foo & foo)': [1],
        '*': [1, 2, 3, 4],
        '-*': [],
        '* | @f1:unknown': [1, 2, 3, 4],
        '* & @f1:unknown': [],
        '( @f1 : ( bar ) )': [2],
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
    let res;
    for (let [query, result] of Object.entries(cases)) {
        [, ...res] = bitmap.execute(`search index '${query}'`);
        expect(res).toEqual(result);
    }
    bitmap.execute('drop index');
});

test('bitmap / SEARCH / 2', () => {
    bitmap.execute('create index fields f1 integer min 1 max 5');
    let strings = ['1', '2', '3', '4', '5'];
    let id = 1;
    for (let string of strings) {
        bitmap.execute(`add index ${id++} values f1 '${string}'`);
    }
    let cases = {
        '@f1:[1]': [1],
        '@f1:[1,3]': [1, 2, 3],
        '@f1:[(1,3]': [2, 3],
        '@f1:[1,3)]': [1, 2],
        '@f1:[ 1 , 3 ) ]': [1, 2],
        '-@f1:[1,3)]': [3, 4, 5],
        '@f1:[min,max]': [1, 2, 3, 4, 5],
        '@f1:[,max]': [1, 2, 3, 4, 5],
        '@f1:[min,]': [1, 2, 3, 4, 5],
        '@f1:[,]': [1, 2, 3, 4, 5],
        '@f1:[(,)]': [2, 3, 4],
        '-@f1:[(,)]': [1, 5],
        '-@f1:[(min,max)]': [1, 5],
        '@f1:([min] | [max])': [1, 5],
        '-@f1:([min] | [max])': [2, 3, 4],
    };
    let res;
    for (let [query, result] of Object.entries(cases)) {
        [, ...res] = bitmap.execute(`search index '${query}'`);
        expect(res).toEqual(result);
    }
    bitmap.execute('drop index');
});

// const to = _.to;
// const rand = _.rand;
// const equal = _.equal;



// test('bitmap - ADD', async () => {
//     let res, err;
//     res = await bitmap.execute('create index fields f1 string');
//     expect(res).toBe(C.CREATE_SUCCESS);
//     [, err] = await to(bitmap.execute('add index 1 values f2 v1'));
//     expect(err).toBe(sprintf(C.COLUMN_NOT_EXISTS_ERROR, 'f2'));
//     res = await bitmap.execute('add index 1 values f1 v1');
//     expect(res).toBe(C.ADD_SUCCESS);
//     await bitmap.execute('drop index');
// });



// test('bitmap - SEARCH (INTEGER)', async () => {
//     let res, err;
//     let id = 1;
//     res = await bitmap.execute(`
//         create index fields f1 integer min -3 max 3 f2 integer min 1 max 100
//     `);
//     [, err] = await to(bitmap.execute('add index ? values f1 ? f2 ?', id++, 10, 1));
//     expect(err).toBe(sprintf(C.INTEGER_OUT_OF_RANGE_ERROR, 'f1'));
//     [, err] = await to(bitmap.execute('add index ? values f1 ? f2 ?', id++, 1, 1000));
//     expect(err).toBe(sprintf(C.INTEGER_OUT_OF_RANGE_ERROR, 'f2'));
//     let values = [];
//     for (let i = 0; i < 100; i++) {
//         let r1 = rand(-3, 3);
//         let r2 = rand(1, 100);
//         await bitmap.execute('add index ? values f1 ? f2 ?', id++, r1, r2);
//         values.push([id - 1, 'f1', r1]);
//         values.push([id - 1, 'f2', r2]);
//     }
//     let cases = {
//         '@f1:3': ([id, f, v]) => f == 'f1' && v == 3,
//         '@f1:[1,3]': ([id, f, v]) => f == 'f1' && v >= 1 && v <= 3,
//         '@f1:[-1,+1]': ([id, f, v]) => f == 'f1' && v >= -1 && v <= 1,
//         '@f1:[ -10 , 10 ]': ([id, f, v]) => f == 'f1' && v >= -10 && v <= 10,
//         '@f1:[min,1]': ([id, f, v]) => f == 'f1' && v >= -3 && v <= 1,
//         '@f1:[-1,max]': ([id, f, v]) => f == 'f1' && v >= -1 && v <= 3,
//         '@f1:[min,max]': ([id, f, v]) => f == 'f1' && v >= -3 && v <= 3,
//         '@f2:1 | @f1:2': ([id, f, v]) => equal([f, v], ['f2', 1]) || equal([f, v], ['f1', 2]),
//         foo: () => false,
//     };
//     for (let [q, f] of Object.entries(cases)) {
//         [, ...res] = await bitmap.execute('search index ? limit 0 1e6', q);
//         expect(res).toEqual(Array.from(new Set(values.filter(f).map(_ => _[0]))));
//     }
//     await bitmap.execute('drop index');
// });

// test('bitmap - FULLTEXT', async () => {
//     let res;
//     let id = 1;
//     await bitmap.execute('create index fields f1 fulltext');
//     for (let v of ['hello world', 'foo bar', 'boys girls']) {
//         await bitmap.execute('add index ? values f1 ?', id++, v);
//     }
//     let cases = {
//         'hello': [1],
//         'world hello': [1],
//         'foo': [2],
//         'foo | hello': [1, 2],
//         '(world | foo) & (bar | one)': [2],
//         'boy girl': [3],
//     };
//     for (let [q, f] of Object.entries(cases)) {
//         [, ...res] = await bitmap.execute('search index ?', q);
//         expect(res).toEqual(f);
//     }
//     await bitmap.execute('drop index');
// });

// test('bitmap - BOOLEAN', async () => {
//     let res;
//     let id = 1;
//     await bitmap.execute('create index fields f1 boolean');
//     for (let v of ['1', 'true', 'false']) {
//         await bitmap.execute('add index ? values f1 ?', id++, v);
//     }
//     let cases = {
//         '@f1:1': [1, 2],
//         '@f1:True': [1, 2],
//         '@f1:0': [3],
//         '@f1:False': [3],
//     };
//     for (let [q, f] of Object.entries(cases)) {
//         [, ...res] = await bitmap.execute('search index ?', q);
//         expect(res).toEqual(f);
//     }
//     await bitmap.execute('drop index');
// });

// test('bitmap - ARRAY', async () => {
//     let res;
//     let id = 1;
//     await bitmap.execute('create index fields f1 array separator |');
//     for (let v of ['hello | world', 'foo|bar', ' boys|girls ']) {
//         await bitmap.execute('add index ? values f1 ?', id++, v);
//     }
//     let cases = {
//         '@f1:hello': [1],
//         '@f1:world @f1:hello': [1],
//         '@f1:foo': [2],
//         '@f1:foo | @f1:hello': [1, 2],
//         '(@f1:world | @f1:foo) & (@f1:bar | @f1:one)': [2],
//         '@f1:boys @f1:girls': [3],
//     };
//     for (let [q, f] of Object.entries(cases)) {
//         [, ...res] = await bitmap.execute('search index ?', q);
//         expect(res).toEqual(f);
//     }
//     await bitmap.execute('drop index');
// });

// test('bitmap - SORTBY VALUES', async () => {
//     let id = 1, res;
//     await bitmap.execute('create index fields f1 integer');
//     await bitmap.execute('add index ? values f1 3', id++);
//     await bitmap.execute('add index ? values f1 1', id++);
//     await bitmap.execute('add index ? values f1 2', id++);
//     [, ...res] = await bitmap.execute('search index * sortby f1 asc');
//     expect(res).toEqual([2, 3, 1]);
//     [, ...res] = await bitmap.execute('search index * sortby f1 desc');
//     expect(res).toEqual([1, 3, 2]);
//     await bitmap.execute('drop index');
// });

// test('bitmap - SORTABLE', async () => {
//     let res;
//     let asc = ([id1, v1], [id2, v2]) => v1 == v2 ? id1 - id2 : v1 - v2;
//     let desc = ([id1, v1], [id2, v2]) => v1 == v2 ? id1 - id2 : v2 - v1;
//     await bitmap.execute('create index fields f1 integer min -1000 max 1000');
//     let values = [];
//     for (let id = 1; id <= 1E3; id++) {
//         let r = _.rand(-1E3, 1E3); // id; // rand(-100, +100);
//         await bitmap.execute('add index ? values f1 ?', id, r);
//         values.push([id, r]);
//     }
//     let cases = {
//         '@f1:[1,10]': ([, v]) => 1 <= v && v <= 10,
//         '@f1:[10,100]': ([, v]) => 10 <= v && v <= 100,
//         '@f1:[-10,100]': ([, v]) => -10 <= v && v <= 100,
//         '@f1:[-10,10]': ([, v]) => -10 <= v && v <= 10,
//         '@f1:[-10000,0]': ([, v]) => -10000 <= v && v <= 0,
//         '@f1:[0,+10000]': ([, v]) => 0 <= v && v <= 10000,
//         '*': () => true,
//     };
//     for (let [q, f] of Object.entries(cases)) {
//         let order = _.rand(0, 1) ? 'asc' : 'desc';
//         [, ...res] = await bitmap.execute('search index ? sortby f1 ? limit 1e6', q, order);
//         let v = values.filter(f);
//         v.sort(order == 'asc' ? asc : desc);
//         v = v.map(([id]) => id);
//         expect(res).toEqual(v);
//     }
//     await bitmap.execute('drop index');
// });

// test('bitmap - FOREIGNKEY', async () => {
//     let res;
//     await bitmap.execute('create i1');
//     await bitmap.execute('create i2 fields i1 foreignkey i1 f1 integer min 1 max 3');
//     await bitmap.execute('create i3 fields i2 foreignkey i2 f1 integer min 1 max 5');
//     await bitmap.execute('add i1 ?', 1);
//     await bitmap.execute('add i1 ?', 2);
//     await bitmap.execute('add i2 ? values i1 ? f1 ?', 1, 1, 1);
//     await bitmap.execute('add i2 ? values i1 ? f1 ?', 2, 2, 2);
//     await bitmap.execute('add i2 ? values i1 ? f1 ?', 3, 1, 3);
//     await bitmap.execute('add i3 ? values i2 ? f1 ?', 1, 1, 1);
//     await bitmap.execute('add i3 ? values i2 ? f1 ?', 2, 2, 2);
//     await bitmap.execute('add i3 ? values i2 ? f1 ?', 3, 3, 3);
//     await bitmap.execute('add i3 ? values i2 ? f1 ?', 4, 1, 4);
//     await bitmap.execute('add i3 ? values i2 ? f1 ?', 5, 2, 5);
//     let cases = {
//         '@@i2:@f1:1': [1],
//         '@@i2:(@f1:1)': [1],
//         '(@@i2:@f1:1)': [1],
//         '(@@i2:(@f1:1))': [1],
//         '@@i2:@@i3:@f1:1': [1],
//         '@@i2:(@@i3:@f1:1)': [1],
//         '@@i2:(@@i3:(@f1:1))': [1],
//         '@@i2:(@@i3:(@f1:1 | @f1:2))': [1, 2],
//         '@@i2:(@@i3:*)': [1, 2],
//     };
//     for (let [q, f] of Object.entries(cases)) {
//         let [, ...res] = await bitmap.execute('search i1 ?', q);
//         expect(res).toEqual(f);
//     }
//     [, ...res] = await bitmap.execute('search i2 ?', '@i1:1');
//     expect(res).toEqual([1, 3]);
//     await bitmap.execute('drop i1');
//     await bitmap.execute('drop i2');
//     await bitmap.execute('drop i3');
// });

// test('bitmap - STAT', async () => {
//     let res;
//     await bitmap.execute('create a');
//     await bitmap.execute('add a 1');
//     res = await bitmap.execute('stat');
//     expect(res[0]).toBe('rss');
//     expect(res[1] > 0).toBe(true);
//     res = await bitmap.execute('stat a');
//     expect(res[0]).toBe('size');
//     expect(res[1] > 0).toBe(true);
//     await bitmap.execute('drop a');
// });

// test('bitmap - RENAME', async () => {
//     let res;
//     res = await bitmap.execute('list');
//     expect(res).toEqual([]);
//     await bitmap.execute('create a');
//     res = await bitmap.execute('list');
//     expect(res).toEqual(['a']);
//     await bitmap.execute('rename a a2');
//     res = await bitmap.execute('list');
//     expect(res).toEqual(['a2']);
//     await bitmap.execute('drop a2');
//     res = await bitmap.execute('list');
//     expect(res).toEqual([]);
// });

// test('bitmap - PERSIST', async () => {
//     _.rm(C.DUMPDIR);
//     let res;
//     await bitmap.execute('create a persist');
//     await bitmap.execute('add a 1');
//     await bitmap.execute('rename a a1');
//     await bitmap.execute('drop a1');
//     await bitmap.execute('load a1');
//     res = await bitmap.execute('list');
//     expect(res).toEqual(['a1']);
//     await bitmap.execute('add a1 2');
//     await bitmap.execute('drop a1');
//     await bitmap.execute('load a1');
//     [, ...res] = await bitmap.execute('search a1 *');
//     expect(res).toEqual([1, 2]);
// });

// test('bitmap - APPENDFK', async () => {
//     let res;
//     await bitmap.execute('create parent');
//     await bitmap.execute('add parent 1');
//     await bitmap.execute('add parent 2');
//     await bitmap.execute('add parent 3');
//     await bitmap.execute('create child fields parent_id foreignkey parent');
//     await bitmap.execute('add child 1 values parent_id 1');
//     await bitmap.execute('add child 2 values parent_id 1');
//     await bitmap.execute('add child 3 values parent_id 2');
//     [, ...res] = await bitmap.execute('search parent ?', '@@child:(*)');
//     expect(res).toEqual([1, 2]);
//     [, ...res] = await bitmap.execute('search child ? appendfk parent_id appendfk parent_id', '*');
//     expect(res).toEqual([[1, 1, 1], [2, 1, 1], [3, 2, 2]]);
//     await bitmap.execute('drop parent');
//     await bitmap.execute('drop child');
// });

// test('bitmap - INVALID QUERY', async () => {
//     let res;
//     await bitmap.execute('create a');
//     let bool = false;
//     try {
//         await bitmap.execute('search a -');
//     } catch (e) {
//         bool = true;
//     }
//     expect(bool).toBe(true);
//     await bitmap.execute('drop a');
// });

// test('bitmap - TRIPLETS', async () => {
//     let res;
//     await bitmap.execute('create a fields ft fulltext tr triplets');
//     let texts = {
//         1: ['which a user might search', 'lazy dog'],
//         2: ['some english text', 'foo bar'],
//         3: ['one two three', 'hello world foz'],
//         4: ['constructor', 'prototype'],
//     };
//     for (let [id, [ft, tr]] of Object.entries(texts)) {
//         await bitmap.execute('add a ? values ft ? tr ?', id, ft, tr);
//     }
//     let cases = {
//         'lazy': [1],
//         'lazy dogs': [1],
//         'which dogs': [1],
//         'lazy ^d': [1],
//         '^"lazy d"': [1],
//         '@ft:one & @tr:^worl': [3],
//         '^s': [],
//         '^fo': [2, 3],
//     };
//     for (let [query, ids] of Object.entries(cases)) {
//         [, ...res] = await bitmap.execute('search a ?', query);
//         expect(res).toEqual(ids);
//     }
//     await bitmap.execute('drop a');
// });

// test('bitmap - CONSTRUCTOR / PROTOTYPE', async () => {
//     let res;
//     await bitmap.execute('create a fields constructor string prototype string');
//     await bitmap.execute('add a 1 values constructor 1 prototype 2');
//     [res] = await bitmap.execute('search a ?', '@constructor:1');
//     expect(res).toEqual(1);
//     [res] = await bitmap.execute('search a ?', '@prototype:2');
//     expect(res).toEqual(1);
//     await bitmap.execute('drop a');
// });

// test('bitmap - DateTime', async () => {
//     let res;
//     await bitmap.execute('create a fields d date dt datetime');
//     await bitmap.execute('add a 1 values d ? dt ?', '2020-01-01', '2020-01-01 10:00:01');
//     await bitmap.execute('add a 2 values d ? dt ?', '2020-02-01', '2020-02-01 11:00:01');
//     await bitmap.execute('add a 3 values d ? dt ?', '2020-02-02', '2020-02-01 12:00:01');
//     [, ...res] = await bitmap.execute('search a ?', '@d:[2020-01-01,2020-01-01]');
//     expect(res).toEqual([1]);
//     [, ...res] = await bitmap.execute('search a ?', '@d:[2020-01-02,2022-01-01]');
//     expect(res).toEqual([2, 3]);
//     [, ...res] = await bitmap.execute('search a * sortby d desc');
//     expect(res).toEqual([3, 2, 1]);
//     await bitmap.execute('drop a');
// });
