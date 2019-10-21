const grammar = require('../grammar');

test('grammar - command - create', () => {
    let command = new grammar.Command();
    command.init();
    let cmd;
    //
    cmd = command.parse([
        'CREATe', 'Index', 'SCHEMA',
        'f1', 'String',
        'f2', 'strinG',
    ]);
    expect(cmd['action']).toBe('CREATE');
    expect(cmd['index']).toBe('index');
    expect(cmd['fields'][0]).toStrictEqual({field: 'f1', type: 'STRING'});
    expect(cmd['fields'][1]).toStrictEqual({field: 'f2', type: 'STRING'});
    //
    cmd = command.parse([
        'CREATe', 'Index', 'SCHEMA',
        'f1', 'String',
    ]);
    expect(cmd['fields'][0]).toStrictEqual({field: 'f1', type: 'STRING'});
    //
    cmd = command.parse([
        'CREATe', 'Index', 'SCHEMA',
        'f1', 'integer', 'min', 1, 'max', 2,
    ]);
    expect(cmd['fields'][0]).toStrictEqual({field: 'f1', type: 'INTEGER', min: 1, max: 2});
    //
    cmd = command.parse([
        'CREATe', 'Index', 'SCHEMA',
        'f1', 'enum', '(', '+1', 'foo', ')',
    ]);
    expect(cmd['fields'][0]).toStrictEqual({field: 'f1', type: 'ENUM', enums: [1, 'foo']});
});

test('grammar - command - add', () => {
    let command = new grammar.Command();
    command.init();
    let cmd = command.parse([
        'ADD', 'Index', 1, 'fields',
        'f1', 'asd1',
        'f2', 'asd2',
    ]);
    expect(cmd['action']).toBe('ADD');
    expect(cmd['index']).toBe('index');
    expect(cmd['id']).toBe(1);
    expect(cmd['values'][0]).toStrictEqual({field: 'f1', value: 'asd1'});
    expect(cmd['values'][1]).toStrictEqual({field: 'f2', value: 'asd2'});
});

test('grammar - command - search', () => {
    let command = new grammar.Command();
    command.init();
    let cmd = command.parse([
        'SEARCH', 'Index', 'hello world',
    ]);
    expect(cmd['action']).toBe('SEARCH');
    expect(cmd['index']).toBe('index');
    expect(cmd['query']).toBe('hello world');
});

test('grammar - query - simple', () => {
    let query = new grammar.Query();
    query.init();
    let q = query.parse('*');
    expect(q['values']).toStrictEqual(['*']);
});
