const bitmap = require('../bitmap');
const helpers = require('../helpers');
const _ = require('../helpers');
const C = require('../constants');
const sprintf = require('util').format;

const to = helpers.to;
const rand = helpers.rand;
const equal = helpers.equal;

function sortAsc([id1, v1], [id2, v2]) {
    return v1 == v2 ? id1 - id2 : v1 - v2;
}

function sortDesc([id1, v1], [id2, v2]) {
    return v1 == v2 ? id1 - id2 : v2 - v1;
}

test('bitmap - getSortSlices', () => {
    let res;
    res = bitmap.getSortSlices(340, [35], 10);
    expect(res).toStrictEqual({'35': ['35', '3x', 'xx']});
    res = bitmap.getSortSlices(340, [7], 10);
    expect(res['7']).toStrictEqual(['7', 'x', 'xx']);
    res = bitmap.getSortSlices(340, [201], 10);
    expect(res['201']).toStrictEqual(['201', '20x', '2xx']);
    res = bitmap.getSortSlices(10, [9], 10);
    expect(res['9']).toStrictEqual(['9']);
    res = bitmap.getSortSlices(11, [9], 10);
    expect(res['9']).toStrictEqual(['9', 'x']);
    res = bitmap.getSortSlices(11, [10], 10);
    expect(res['10']).toStrictEqual(['10', '1x']);
    res = bitmap.getSortSlices(20, [15], 3);
    expect(res['15']).toStrictEqual(['120', '12x', '1xx']);
    res = bitmap.getSortSlices(20, [2], 3);
    expect(res['2']).toStrictEqual(['2', 'x', 'xx']);
});

test('bitmap - getSortMap', () => {
    let res;
    res = bitmap.getSortMap(15, 3);
    expect(res.bitmaps.has('xx')).toBe(true);
    expect(res.map.get('xx').get('x') instanceof Map).toBe(true);
});

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

test('bitmap - SORTABLE', async () => {
    let res;
    let id = 1;
    await bitmap.execute('create index fields f1 integer min -100 max 100 sortable');
    let values = [];
    for (let i = 0; i < 1000; i++) {
        let r = rand(-100, 100);
        await bitmap.execute('add index ? values f1 ?', id, r);
        values.push([id++, r]);
    }
    let cases = {
        '@f1:[1,10]': ([, v]) => 1 <= v && v <= 10,
        '@f1:[10,100]': ([, v]) => 10 <= v && v <= 100,
        '@f1:[-10,100]': ([, v]) => -10 <= v && v <= 100,
        '@f1:[-10,10]': ([, v]) => -10 <= v && v <= 10,
        '@f1:[min,0]': ([, v]) => -100 <= v && v <= 0,
        '@f1:[0,max]': ([, v]) => 0 <= v && v <= 100,
        '*': () => true,
    };
    for (let [q, f] of Object.entries(cases)) {
        [, ...res] = await bitmap.execute('search index ? sortby f1 limit 1e6', q);
        let v = values.filter(f);
        v.sort(sortAsc);
        v = v.map(([id]) => id);
        expect(res).toStrictEqual(v);
    }
    [, ...res] = await bitmap.execute('search index ? sortby f1 desc limit 1e6', '*');
    values.sort(sortDesc);
    values = values.map(([id]) => id);
    expect(res).toStrictEqual(values);
    await bitmap.execute('drop index');
});

test('bitmap - SORTABLE - DESC', async () => {
    let res;
    let id = 1;
    await bitmap.execute('create index fields f1 integer min -1 max 1 sortable');
    let values = [];
    for (let i = 0; i < 10; i++) {
        let r = rand(-1, 1);
        await bitmap.execute('add index ? values f1 ?', id, r);
        values.push([id++, r]);
    }
    let cases = {
        '@f1:[-1,+1]': ([, v]) => -1 <= v && v <= 1,
    };
    for (let [q, f] of Object.entries(cases)) {
        let [, ...res] = await bitmap.execute('search index ? sortby f1 desc limit 1e6', q);
        let v = values.filter(f);
        v.sort(sortDesc);
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

test('bitmap - CURSOR', async () => {
    let res, cursor, lim;
    await bitmap.execute('create i1 fields f1 integer min 1 max 10');
    await bitmap.execute('add i1 ?', 1);
    await bitmap.execute('add i1 ?', 2);
    await bitmap.execute('add i1 ?', 3);
    [lim, cursor] = await bitmap.execute('search i1 * withcursor');
    expect(lim).toBe(3);
    res = await bitmap.execute('cursor ? limit 2', cursor);
    expect(res).toStrictEqual([1, 2]);
    res = await bitmap.execute('cursor ?', cursor);
    expect(res).toStrictEqual([3]);
    await bitmap.execute('drop i1');
});

test('bitmap - STAT', async () => {
    let res, cursor, lim;
    await bitmap.execute('create a');
    await bitmap.execute('add a 1');
    res = await bitmap.execute('stat');
    expect(res[0]).toBe('rss');
    expect(res[1] > 0).toBe(true);
    res = await bitmap.execute('stat a');
    expect(res[0]).toBe('size');
    expect(res[1] > 0).toBe(true);
});
