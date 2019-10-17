const grammar = require('../grammar');

test('grammar - command - create', () => {
    let command = new grammar.Command();
    command.init();
    let cmd = command.parse([
        'CREATe', 'Index', 'SCHEMA',
        'f1', 'String',
        'f2', 'strinG',
    ]);
    expect(cmd['action']).toBe('CREATE');
    expect(cmd['index']).toBe('index');
    expect(cmd['fields'][0]).toStrictEqual({field: 'f1', type: 'STRING'});
    expect(cmd['fields'][1]).toStrictEqual({field: 'f2', type: 'STRING'});
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
