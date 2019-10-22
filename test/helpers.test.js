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
    expect(/^[A-F0-9]+$/.test(helpers.generateHex())).toBe(true);
});

test('stem', () => {
    expect(helpers.stem('Hello Worlds')).toStrictEqual(['hello', 'world']);
    expect(helpers.stem(' Girls ')).toStrictEqual(['girl']);
    expect(helpers.stem('  ')).toStrictEqual([]);
    expect(helpers.stem(' - ')).toStrictEqual([]);
    expect(helpers.stem('i\'m ok')).toStrictEqual(['i', 'm', 'ok']);
});
