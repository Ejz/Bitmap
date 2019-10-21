const bitmap = require('../bitmap');
const helpers = require('../helpers');

const to = helpers.to;
const rand = helpers.rand;

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
        expect(res).toStrictEqual(result);
    }
    await bitmap.dropIndex({index: 'index'});
});

test('bitmap - search - integer', async () => {
    let res;
    let id = 1;
    // let add = [[1, 0], [1, -3], , [1, -3]];
    res = await bitmap.createIndex({
        index: 'index', fields: [
            {field: 'f1', type: 'INTEGER', min: -3, max: 3},
            {field: 'f2', type: 'INTEGER', min: 1, max: 10},
        ]
    });
    // await bitmap.addRecordToIndex({index: 'index', id: id++, values: [
    //     {field: 'f1', value: 1},
    // ]});
    // await bitmap.addRecordToIndex({index: 'index', id: id++, values: [
    //     {field: 'f1', value: 2},
    // ]});
    // await bitmap.addRecordToIndex({index: 'index', id: id++, values: [
    //     {field: 'f1', value: 3},
    // ]});
    // res = await bitmap.searchIndex({index: 'index', query: '@f1:2'});
    // console.log(res);
    // return;
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
    expect(res).toStrictEqual(
        Object.entries(f1s).filter(([k, v]) => v == 3).map(([k, v]) => parseInt(k))
    );
    res = await bitmap.searchIndex({index: 'index', query: '@f1:[100,1000]'});
    expect(res).toStrictEqual([]);
    res = await bitmap.searchIndex({index: 'index', query: '@f1:[-3,3]'});
    expect(res).toStrictEqual(ids);
    res = await bitmap.searchIndex({index: 'index', query: '@f1:[Min,3]'});
    expect(res).toStrictEqual(ids);
    res = await bitmap.searchIndex({index: 'index', query: '@f1:[-3,Max]'});
    expect(res).toStrictEqual(ids);
    res = await bitmap.searchIndex({index: 'index', query: '@f1:[Min,Max]'});
    expect(res).toStrictEqual(ids);
    res = await bitmap.searchIndex({index: 'index', query: '@f1:([-1 , 1])'});
    expect(res).toStrictEqual(
        Object.entries(f1s).filter(([k, v]) => v >= -1 && v <= 1).map(([k, v]) => parseInt(k))
    );
    res = await bitmap.searchIndex({index: 'index', query: '@f1:-2 | @f1:[-1,0]'});
    expect(res).toStrictEqual(
        Object.entries(f1s).filter(([k, v]) => v >= -2 && v <= 0).map(([k, v]) => parseInt(k))
    );
    // console.log(res)
        // 
    // );
    return;
    for (let i = 0; i < 100; i++) {
        let f1 = '';
        let f2 = '';
        let query = `(@f1:[]) & (@f2:[])`;
        // let res = 
    }
    let strings = ['foo', 'bar', 'hello', 'world'];
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
        
        
    }
    await bitmap.dropIndex({index: 'index'});
});
