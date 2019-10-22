const bitmap = require('../bitmap');
const helpers = require('../helpers');

const to = helpers.to;
const rand = helpers.rand;

test('bitmap - getSortSlices', () => {
    let res;
    res = bitmap.getSortSlices(340, 35);
    expect(res).toStrictEqual(['35', '3x', '0xx']);
    res = bitmap.getSortSlices(340, 7);
    expect(res).toStrictEqual(['7', '0x', '0xx']);
    res = bitmap.getSortSlices(340, 201);
    expect(res).toStrictEqual(['201', '20x', '2xx']);
    res = bitmap.getSortSlices(10, 9);
    expect(res).toStrictEqual(['9']);
    res = bitmap.getSortSlices(11, 9);
    expect(res).toStrictEqual(['9', '0x']);
    res = bitmap.getSortSlices(11, 10);
    expect(res).toStrictEqual(['10', '1x']);
});

test('bitmap - getSortMap', () => {
    let res;
    res = bitmap.getSortMap(35);
    expect(Object.keys(res.bitmaps).includes('0')).toBe(true);
    expect(Object.keys(res.bitmaps).includes('34')).toBe(true);
    expect(Object.keys(res.bitmaps).includes('3x')).toBe(true);
    res = bitmap.getSortMap(355);
    expect(res.map instanceof Map).toBe(true);
    expect(res.map.get('2xx').get('20x') instanceof Map).toBe(true);
    expect(res.map.get('2xx').get('20x').get('200')).toBe(null);
    res = bitmap.getSortMap(9);
    expect(res.map.get('1x')).toBe(undefined);
    res = bitmap.getSortMap(10);
    expect(res.map.get('1x')).toBe(undefined);
    res = bitmap.getSortMap(11);
    expect(res.map.get('1x')).toStrictEqual(new Map([['10', null]]));
});

test('bitmap - create / drop', async () => {
    let res;
    res = await bitmap.createIndex({index: 'index', fields: []});
    expect(res).toBe('CREATED');
    res = await bitmap.dropIndex({index: 'index'});
    expect(res).toBe('DROPPED');
});

test('bitmap - create / add', async () => {
    let res;
    res = await bitmap.createIndex({index: 'index', fields: [{field: 'f1', type: 'STRING'}]});
    res = await bitmap.addRecordToIndex({index: 'index', id: 1, values: [{field: 'f1', value: 'v1'}]});
    expect(res).toBe('ADDED');
    [res] = await to(bitmap.addRecordToIndex({index: 'index', id: 1, values: []}));
    expect(res.message).toContain('ID ALREADY exists');
    await bitmap.dropIndex({index: 'index'});
});

test('bitmap - search - common', async () => {
    let res;
    res = await bitmap.createIndex({index: 'index', fields: [{field: 'f1', type: 'STRING'}]});
    let strings = ['foo', 'bar', 'hello', 'world'];
    let id = 1;
    await strings.map((value) => {
        return bitmap.addRecordToIndex({index: 'index', id: id++, values: [{field: 'f1', value}]});
    });
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
        res = await bitmap.searchIndex({index: 'index', query});
        res.shift();
        expect(res).toStrictEqual(result);
    }
    await bitmap.dropIndex({index: 'index'});
});

test('bitmap - search - integer', async () => {
    let res;
    let id = 1;
    res = await bitmap.createIndex({
        index: 'index', fields: [
            {field: 'f1', type: 'INTEGER', min: -3, max: 3},
            {field: 'f2', type: 'INTEGER', min: 1, max: 10},
        ]
    });
    let f1s = {};
    let f2s = {};
    for (let i = 0; i < 100; i++) {
        let r1 = rand(-3, 3);
        let r2 = rand(1, 10);
        await bitmap.addRecordToIndex({index: 'index', id, values: [
            {field: 'f1', value: r1},
            {field: 'f2', value: r2},
        ]});
        f1s[id] = r1;
        f2s[id] = r2;
        id++;
    }
    let ids = Object.keys(f1s).map(k => parseInt(k));
    res = await bitmap.searchIndex({index: 'index', query: '@f1:3'});
    res.shift();
    expect(res).toStrictEqual(
        Object.entries(f1s).filter(([k, v]) => v == 3).map(([k, v]) => parseInt(k))
    );
    res = await bitmap.searchIndex({index: 'index', query: '@f1:[100,1000]'});
    res.shift();
    expect(res).toStrictEqual([]);
    res = await bitmap.searchIndex({index: 'index', query: '@f1:[-3,3]'});
    res.shift();
    expect(res).toStrictEqual(ids);
    res = await bitmap.searchIndex({index: 'index', query: '@f1:[Min,3]'});
    res.shift();
    expect(res).toStrictEqual(ids);
    res = await bitmap.searchIndex({index: 'index', query: '@f1:[-3,Max]'});
    res.shift();
    expect(res).toStrictEqual(ids);
    res = await bitmap.searchIndex({index: 'index', query: '@f1:[Min,Max]'});
    res.shift();
    expect(res).toStrictEqual(ids);
    res = await bitmap.searchIndex({index: 'index', query: '@f1:([-1 , 1])'});
    res.shift();
    expect(res).toStrictEqual(
        Object.entries(f1s).filter(([k, v]) => v >= -1 && v <= 1).map(([k, v]) => parseInt(k))
    );
    res = await bitmap.searchIndex({index: 'index', query: '@f1:-2 | @f1:[-1,0]'});
    res.shift();
    expect(res).toStrictEqual(
        Object.entries(f1s).filter(([k, v]) => v >= -2 && v <= 0).map(([k, v]) => parseInt(k))
    );
    await bitmap.dropIndex({index: 'index'});
});

test('bitmap - sortable', async () => {
    let res;
    let id = 1;
    res = await bitmap.createIndex({
        index: 'index', fields: [
            {field: 'f1', type: 'INTEGER', min: 1, max: 100, sortable: true},
        ]
    });
    let f1 = {};
    for (let i = 0; i < 1000; i++) {
        let r = rand(1, 100);
        await bitmap.addRecordToIndex({index: 'index', id, values: [
            {field: 'f1', value: r},
        ]});
        f1[id] = r;
        id++;
    }
    res = await bitmap.searchIndex({index: 'index', query: '*', sortby: 'f1'});
    let len = res.shift();
    expect(len).toStrictEqual(1000);
    let ids = Object.entries(f1);
    ids.sort(([k1, v1], [k2, v2]) => {
        return v1 < v2 ? -1 : (v1 == v2 ? (parseInt(k1) - parseInt(k2)) : 1);
    });
    ids = ids.map(([k, v]) => parseInt(k));
    ids = ids.slice(0, 100)
    expect(res).toStrictEqual(ids);
    await bitmap.dropIndex({index: 'index'});
});

test('bitmap - cursor', async () => {
    let res;
    let id = 1;
    await bitmap.createIndex({
        index: 'index', fields: [
            {field: 'f1', type: 'INTEGER', min: 1, max: 100},
        ]
    });
    for (let i = 0; i < 100; i++) {
        await bitmap.addRecordToIndex({index: 'index', id: id++, values: [
            {field: 'f1', value: rand(1, 100)},
        ]});
    }
    let ids = [];
    res = await bitmap.searchIndex({index: 'index', query: '*', limit: ['CURSOR', rand(1, 4)]});
    let [, cursor, idd] = res;
    let f = (_ids) => {
        ids = ids.concat(_ids);
    };
    f(res.splice(2));
    while (cursor) {
        res = await bitmap.cursor({cursor});
        cursor = res[1];
        f(res.splice(2));
    }
    let _ = [...Array(100).keys()].map(x => ++x);
    expect(ids).toStrictEqual(_);
    await bitmap.dropIndex({index: 'index'});
});

test('bitmap - fulltext', async () => {
    let res;
    let id = 1;
    await bitmap.createIndex({
        index: 'index', fields: [
            {field: 'f1', type: 'FULLTEXT'},
        ]
    });
    await bitmap.addRecordToIndex({index: 'index', id: id++, values: [
        {field: 'f1', value: 'hello world'},
    ]});
    await bitmap.addRecordToIndex({index: 'index', id: id++, values: [
        {field: 'f1', value: 'foo bar'},
    ]});
    await bitmap.addRecordToIndex({index: 'index', id: id++, values: [
        {field: 'f1', value: 'hello foo'},
    ]});
    res = await bitmap.searchIndex({index: 'index', query: 'hello'});
    res.shift()
    expect(res).toStrictEqual([1, 3]);
    res = await bitmap.searchIndex({index: 'index', query: 'world hello'});
    res.shift()
    expect(res).toStrictEqual([1]);
    res = await bitmap.searchIndex({index: 'index', query: 'foo'});
    res.shift()
    expect(res).toStrictEqual([2, 3]);
    res = await bitmap.searchIndex({index: 'index', query: 'foo | hello'});
    res.shift()
    expect(res).toStrictEqual([1, 2, 3]);
    await bitmap.dropIndex({index: 'index'});
});
