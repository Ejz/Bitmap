const bitmap = require('../bitmap');
const to = require('../helpers').to;

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

test('bitmap - search', async () => {
    let res;
    res = await bitmap.createIndex({index: 'index', fields: [{field: 'f1', type: 'STRING'}]});
    let strings = ['foo', 'bar', 'hello', 'world'];
    let id = 1;
    await strings.map((value) => {
        return bitmap.addRecordToIndex({index: 'index', id: id++, values: [{field: 'f1', value}]});
    });
    res = await bitmap.searchIndex({index: 'index', query: '*'});
    expect(res).toStrictEqual([1, 2, 3, 4]);
    res = await bitmap.searchIndex({index: 'index', query: '@f1:bar'});
    expect(res).toStrictEqual([2]);
    res = await bitmap.searchIndex({index: 'index', query: '@f1:unknown'});
    expect(res).toStrictEqual([]);
    await bitmap.dropIndex({index: 'index'});
});
