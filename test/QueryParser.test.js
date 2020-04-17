const C = require('../constants');
const _ = require('../helpers');
const QueryParser = require('../QueryParser');

let tokenize = s => new QueryParser().tokenize(s);

let term = s => new QueryParser().term(tokenize(s));

test('QueryParser / tokenize / 1', () => {
    let r1 = tokenize('@F : 1v');
    console.log(r1);
    // expect(r1[0].value).toEqual('@');
    // expect(r1[1].value).toEqual('f');
    // expect(r1[2].value).toEqual(':');
    // expect(r1[3].value).toEqual('1v');
    // //
    // let r2 = parseQuery('"" v1 1v', {justTokenize: true});
    // expect(r2[0].value).toEqual('');
    // expect(r2[1].value).toEqual('v1');
    // expect(r2[2].value).toEqual('1v');
});

test('QueryParser / tokenize / errors', () => {
    // let r1 = parseQuery('@F:1v', {justFlatten: true});
    // expect(r1).toEqual('@ 0IDENT : 1( 0VALUE 1)');
    // //
    // let r2 = parseQuery('@F:1v @a:fo', {justFlatten: true});
    // expect(r2).toEqual('@ 0IDENT : 1( 0VALUE 1) @ 1IDENT : 2( 2IDENT 2)');
    // console.log(r1);
});
