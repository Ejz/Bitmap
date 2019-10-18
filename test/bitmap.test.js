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

test('bitmap - search - single field', async () => {
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
