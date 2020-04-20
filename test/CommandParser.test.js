const C = require('../constants');
const _ = require('../helpers');
const CommandParser = require('../CommandParser');

let tokenize = s => new CommandParser().tokenize(s);

let parse = s => new CommandParser().parse(tokenize(s));

test('CommandParser / tokenize / 1', () => {
    let r1 = tokenize('create A');
    expect(r1).toEqual([{type: 'KW', value: 'CREATE'}, {type: 'IDENT', value: 'a'}]);
    //
    let r2 = tokenize('create "Create"');
    expect(r2[1]).toEqual({type: 'IDENT', value: 'create'});
});

test('CommandParser / tokenize / 2', () => {
    let r1 = tokenize('\'string\'');
    expect(r1[0]).toEqual({type: 'VALUE', value: 'string'});
    //
    let r2 = tokenize('\'\'');
    expect(r2[0].value).toEqual('');
    //
    let r3 = tokenize('\'so\\me\\\'\\\\\'');
    expect(r3[0].value).toEqual('so\\me\'\\');
});

test('CommandParser / tokenize / 3', () => {
    let r1 = tokenize('+2');
    expect(r1[0]).toEqual({type: 'VALUE', value: '2'});
});

test('CommandParser / tokenize / errors', () => {
    let commands = [
        '1.1',
        '+-1',
        '100000000000000000000000000',
        '1E10',
        '"a',
        '1create',
        '\'\\\'',
    ];
    for (let command of commands) {
        expect(() => tokenize(command)).toThrow(C.TokenizeError);
    }
});

test('CommandParser / parse / 1', () => {
    let r1 = parse('ping');
    expect(r1).toEqual({action: 'PING'});
    //
    let r2 = parse('create A');
    expect(r2.action).toEqual('CREATE');
    expect(r2.index).toEqual('a');
    expect(r2.fields).toEqual({});
    //
    let r3 = parse('create A fields');
    expect(r3.fields).toEqual({});
});

test('CommandParser / parse / 2', () => {
    let r1 = parse('create A fields a integer');
    expect(r1.fields.a.type).toEqual(C.TYPES.INTEGER);
    //
    let r2 = parse('create A fields a integer min 1 max 2');
    expect(r2.fields.a.min).toEqual(1);
    expect(r2.fields.a.max).toEqual(2);
    //
    let r3 = parse('create A fields a integer max 3 min 1');
    expect(r3.fields.a.min).toEqual(1);
    expect(r3.fields.a.max).toEqual(3);
    //
    let r4 = parse('create A fields a integer max 3 min 1 max 7');
    expect(r4.fields.a.min).toEqual(1);
    expect(r4.fields.a.max).toEqual(7);
    //
    let r5 = parse('create A fields "integer" integer');
    expect(!!r5.fields.integer).toEqual(true);
    //
    let r6 = parse('create A fields a date min \'2010\'');
    expect(r6.fields.a.min).toEqual(_.toDateInteger('2010-01-01'));
    r6 = parse('create A fields a date min 2010');
    expect(r6.fields.a.min).toEqual(_.toDateInteger('2010-01-01'));
    //
    let r7 = parse('create A fields a datetime min \'2010-02-01 04:01:01\'');
    expect(r7.fields.a.min).toEqual(_.toDateTimeInteger('2010-02-01 04:01:01'));
});

test('CommandParser / parse / 3', () => {
    let r1 = parse('add a 1 values a 1');
    expect(r1.values).toEqual({a: '1'});
    //
    let r2 = parse('add a 1 values a \'1\'');
    expect(r2.values).toEqual({a: '1'});
    //
    let r3 = parse('add a 1 values a \'100000000000000000000000000\'');
    expect(r3.values).toEqual({a: '100000000000000000000000000'});
});

test('CommandParser / parse / 4', () => {
    let r1 = parse('create a fields f array separator 0');
    expect(r1.fields.f.separator).toEqual('0');
    //
    let r2 = parse('create a fields f array');
    expect(r2.fields.f.separator).toEqual(',');
});

test('CommandParser / parse / 5', () => {
    let r1 = parse('create a fields f fulltext prefixsearch');
    expect(r1.fields.f.prefixSearch).toEqual(true);
});

test('CommandParser / parse / errors', () => {
    let commands = [
        'foo',
        'create 1',
        'create a r',
        'list a',
        'add a b',
        'add a -1',
        'add a \'-1\'',
        'add a \'0\'',
        'add a 0',
        'add a',
        'create a fields f1 integer f1 integer',
        'create a fields f1 integer min 0 max -1',
        'create a fields id integer',
        'create a fields a foo',
        'create a fields a create',
        'rename a a',
        'create a fields f1 date min \'-\'',
        'create a fields f1 datetime min \'-\'',
    ];
    for (let command of commands) {
        expect(() => parse(command)).toThrow(C.CommandParserError);
    }
});
