const Grammar = require('../grammar');
const helpers = require('../helpers');

const to = helpers.to;

async function parse(cmd) {
    let grammar = new Grammar();
    cmd = cmd.split(/\s+/).filter(Boolean);
    return await to(new Promise(r => r(grammar.parse(cmd))));
}

async function parseQuery(cmd) {
    let grammar = new Grammar();
    return await to(new Promise(r => r(grammar.parseQuery(cmd))));
}

test('grammar - command - create', async () => {
    let r, e;
    //
    [r, e] = await parse('create Index');
    expect(r).toStrictEqual({action: 'CREATE', index: 'index'});
    //
    [r, e] = await parse('create index unknown');
    expect(e).toMatch(/unknown/i);
    //
    [r, e] = await parse('create index fields');
    expect(e).toMatch(/no fields/i);
    //
    [r, e] = await parse('create index fields string string');
    expect(r).toStrictEqual({
        action: 'CREATE',
        index: 'index',
        fields: [{field: 'string', type: 'STRING'}],
        persist: false,
    });
    //
    [r, e] = await parse('create index fields string1 string string2 string string3 string');
    expect(e).toBe(null);
    //
    [r, e] = await parse('create index fields FT fulltext');
    expect(r.fields).toStrictEqual([{field: 'ft', noStopwords: false, type: 'FULLTEXT'}]);
    //
    [r, e] = await parse('create index fields i integer min 1 max 2');
    expect(r.fields).toStrictEqual([{field: 'i', type: 'INTEGER', min: 1, max: 2}]);
    //
    [r, e] = await parse('create index fields i integer max 2');
    expect(r.fields[0].max).toStrictEqual(2);
    //
    [r, e] = await parse('create index fields i integer min -9');
    expect(r.fields[0].min).toStrictEqual(-9);
    //
    [r, e] = await parse('create index fields i integer min 1 max 1e3');
    expect(r.fields[0].max).toStrictEqual(1000);
    //
    [r, e] = await parse('create index fields i integer min 1 max ' + '1'.repeat(100));
    expect(e).toMatch(/invalid integer/i);
});

test('grammar - command - add', async () => {
    let r, e;
    //
    [r, e] = await parse('add Index 1');
    expect(r).toStrictEqual({action: 'ADD', index: 'index', id: 1});
    //
    [r, e] = await parse('add Index 1e3 values f1 add f2 create');
    expect(r).toStrictEqual({
        action: 'ADD',
        index: 'index',
        id: 1000,
        values: [{field: 'f1', value: 'add'}, {field: 'f2', value: 'create'}],
    });
});

test('grammar - command - search', async () => {
    let r, e;
    //
    [r, e] = await parse('search index foobar limit 1');
    expect(r.limit).toStrictEqual([0, 1]);
    //
    [r, e] = await parse('search index foobar limit 10 1e2');
    expect(r.limit).toStrictEqual([10, 100]);
    //
    [r, e] = await parse('search index *');
    expect(r.limit).toStrictEqual([0, 100]);
    expect(r.query).toStrictEqual({values: ['*']});
});

test('grammar - query - simple', async () => {
    let r, e;
    //
    [r, e] = await parseQuery('foo bar');
    expect(r.op).toBe('&');
    expect(r.queries).toStrictEqual([{values: ['foo']}, {values: ['bar']}]);
});

test('grammar - query - complex', async () => {
    let r, e;
    //
    [r, e] = await parseQuery('(@f1:(foo | bar)) (str1 | str2) (@f2:(bar | foo))');
    expect(r.queries[0]).toStrictEqual({field: 'f1', values: ['foo', 'bar']});
    expect(r.queries[1].queries[0]).toStrictEqual({values: ['str1', 'str2']});
    expect(r.queries[1].queries[1]).toStrictEqual({field: 'f2', values: ['bar', 'foo']});
});

test('grammar - query - string', async () => {
    let r, e;
    //
    [r, e] = await parseQuery('"hello world"');
    expect(r.values).toStrictEqual(['hello world']);
    [r, e] = await parseQuery('@field:"hello world"');
    expect(r.values).toStrictEqual(['hello world']);
    expect(r.field).toStrictEqual('field');
});
