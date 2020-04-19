const C = require('../constants');
const _ = require('../helpers');
const QueryParser = require('../QueryParser');

let tokenize = s => new QueryParser().tokenize(s);

let tokens2terms = s => new QueryParser().tokens2terms(tokenize(s));

let infix2postfix = s => new QueryParser().infix2postfix(s);

test('QueryParser / tokenize / 1', () => {
    let r1 = tokenize('@F : 1v');
    expect(r1[0]).toEqual({type: 'IDENT', value: 'f'});
    expect(r1[1]).toEqual({type: 'SPECIAL', value: ':'});
    expect(r1[2]).toEqual({type: 'VALUE', value: '1v'});
    //
    let r2 = tokenize('@f:v & (foo | bar)');
    expect(r2).toEqual([
        {type: 'IDENT', value: 'f'},
        {type: 'SPECIAL', value: ':'},
        {type: 'VALUE', value: 'v'},
        {type: 'SPECIAL', value: '&'},
        {type: 'SPECIAL', value: '('},
        {type: 'VALUE', value: 'foo'},
        {type: 'SPECIAL', value: '|'},
        {type: 'VALUE', value: 'bar'},
        {type: 'SPECIAL', value: ')'},
    ]);
});

test('QueryParser / tokenize / 2', () => {
    let r1 = tokenize('*');
    expect(r1[0]).toEqual({type: 'ALL', value: true});
});

test('QueryParser / tokenize / 3', () => {
    let r1 = tokenize('[ a,b ]');
    expect(r1[0]).toEqual({type: 'VALUE', value: [false, 'a', 'b', false]});
    //
    let r2 = tokenize('asd1@asd2:asd3[asd4]');
    expect(r2).toEqual([
        {type: 'VALUE', value: 'asd1'},
        {type: 'IDENT', value: 'asd2'},
        {type: 'SPECIAL', value: ':'},
        {type: 'VALUE', value: 'asd3'},
        {type: 'VALUE', value: [false, 'asd4', 'asd4', false]},
    ]);
});

test('QueryParser / tokenize / 4', () => {
    let r1 = tokenize('@a < 5 & @b >= 2');
    expect(r1[0].type).toEqual('IDENT');
});

test('QueryParser / tokenize / errors', () => {
    let queries = [
        '@&',
        '@да',
    ];
    for (let query of queries) {
        expect(() => tokenize(query)).toThrow(C.TokenizerError);
    }
});

test('QueryParser / tokens2terms / 1', () => {
    let r1 = tokens2terms('@f:1');
    expect(r1).toEqual({infix: '1', terms: [null, {value: '1', field: 'f'}]});
    //
    let r2 = tokens2terms('@f:1 | @f:2');
    expect(r2.infix).toEqual('1 | 2');
    //
    let r3 = tokens2terms('@f:1 & @f:2');
    expect(r3.infix).toEqual('1 & 2');
    //
    let r4 = tokens2terms('@f:(1 & 2)');
    expect(r4.infix).toEqual('(( 1 ) & ( 2 ))');
    //
    let r5 = tokens2terms('@f:(1 & 2 | (3&4))');
    expect(r5.infix).toEqual('(( 1 ) & ( 2 ) | (( 3 ) & ( 4 )))');
    //
    let r6 = tokens2terms('@f:1 @f:2');
    expect(r6.infix).toEqual('1 & 2');
    //
    let r7 = tokens2terms('@f:1 *');
    expect(r7.infix).toEqual('1 & *');
});

test('QueryParser / infix2postfix', () => {
    let r1 = infix2postfix('1 | 2');
    expect(r1).toEqual('1 2 |');
    //
    let r2 = infix2postfix('1 | 2 & 3');
    expect(r2).toEqual('1 2 3 & |');
    //
    let r3 = infix2postfix('(1 | 2) & 3');
    expect(r3).toEqual('1 2 | 3 &');
    //
    let r4 = infix2postfix('1 | * & 2');
    expect(r4).toEqual('1 * 2 & |');
    //
    let r5 = infix2postfix('1 & - 3');
    expect(r5).toEqual('1 3 - &');
    //
    let r6 = infix2postfix('- (1 & 3)');
    expect(r6).toEqual('1 3 & -');
});
