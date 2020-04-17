const C = require('../constants');
const _ = require('../helpers');
const Tokenizer = require('../Tokenizer');

test('Tokenizer / 1', () => {
    let rules = {WORD: [/^(\w+)(?:\s+|$)/, m => m[1].toLowerCase()]};
    let tokens = new Tokenizer(rules).tokenize('Foo bar');
    expect(tokens[0]).toEqual({type: 'WORD', value: 'foo'});
    expect(tokens[1]).toEqual({type: 'WORD', value: 'bar'});
    expect(tokens[2]).toEqual(undefined);
});

test('Tokenizer / 2', () => {
    let rules = {
        ENTER_QUOTE_MODE: [
            /^"/,
            function (m) {
                this.mode = 'QUOTE';
                return '';
            },
        ],
        EXIT_QUOTE_MODE: [
            /^"(?:\s+|$)/,
            function (m) {
                this.mode = undefined;
                return '';
            },
            'QUOTE',
        ],
        STRING: [
            /^([^"\\]+|\\"|\\\\|\\)/,
            m => m[1].replace(/\\("|\\)/g, '$1'),
            'QUOTE',
        ],
    };
    //
    let tokens1 = new Tokenizer(rules).tokenize('"a\\"\\\\\\b"');
    expect(tokens1.map(v => v.value).join('')).toEqual('a"\\\\b');
    //
    let tokens2 = new Tokenizer(rules).tokenize('"\\"');
    expect(typeof(tokens2) == 'string').toEqual(true);
});

test('Tokenizer / 3', () => {
    let rules = {
        INTEGER: [
            /^(\d+)(?:\s+|$)/,
            m => _.toInteger(m[1]),
        ],
        ANY: [
            /^(\S+)(?:\s+|$)/,
            m => m[1],
        ],
    };
    //
    let tokens1 = new Tokenizer(rules).tokenize(' 101 ');
    expect(tokens1[0]).toEqual({type: 'INTEGER', value: 101});
    //
    let tokens2 = new Tokenizer(rules).tokenize(' 101000000000000000000 ');
    expect(typeof(tokens2) == 'string').toEqual(true);
});
