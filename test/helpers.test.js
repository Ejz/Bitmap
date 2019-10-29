const helpers = require('../helpers');

const CRLF = '\r\n';

test('toResp - simple string', () => {
    let res = helpers.toResp('hello');
    expect(res).toBe('+hello' + CRLF);
});

test('toResp - error object', () => {
    let res = helpers.toResp(new Error('foo'));
    expect(res).toBe('-foo' + CRLF);
});

test('fromResp - simple string', async () => {
    let fgets = () => Promise.resolve('+hello' + CRLF);
    let res = await helpers.fromResp(fgets);
    expect(res).toBe('hello');
});

test('rand', () => {
    expect([1, 2, 3, 4, 5].includes(helpers.rand(1, 5))).toBe(true);
    expect(helpers.rand(1, 1)).toBe(1);
    expect(helpers.rand(-1, -1)).toBe(-1);
});

test('generateHex', () => {
    expect(/^[a-f0-9]+$/.test(helpers.generateHex())).toBe(true);
});

test('stem', () => {
    expect(helpers.stem('Hello Worlds')).toStrictEqual(['hello', 'world']);
    expect(helpers.stem(' Girls ')).toStrictEqual(['girl']);
    expect(helpers.stem('  ')).toStrictEqual([]);
    expect(helpers.stem(' - ')).toStrictEqual([]);
    expect(helpers.stem('i\'m ok')).toStrictEqual(['i', 'm', 'ok']);
});

test('castToArray', () => {
    expect(helpers.castToArray(' Foo Bar ')).toStrictEqual(['Foo', 'Bar']);
    expect(helpers.castToArray([1, 2])).toStrictEqual([1, 2]);
    expect(helpers.castToArray('?? ?', 1, 2, 3)).toStrictEqual(['12', '3']);
    expect(helpers.castToArray('? ? ?', 1, 2, 3)).toStrictEqual(['1', '2', '3']);
});

test('equal', () => {
    expect(helpers.equal([1, 2], [1, 2])).toBe(true);
    expect(helpers.equal([1, 2], ['1', '2'])).toBe(false);;
});
