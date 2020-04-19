const _ = require('../helpers');
const C = require('../constants');

test('rand', () => {
    expect([1, 2, 3, 4, 5].includes(_.rand(1, 5))).toBe(true);
    expect(_.rand(1, 1)).toBe(1);
    expect(_.rand(-1, -1)).toBe(-1);
});

test('toInteger', () => {
    expect(_.toInteger('foo')).toEqual(undefined);
    expect(_.toInteger('')).toEqual(undefined);
});

test('toDateInteger', () => {
    expect(_.toDateInteger('foo')).toEqual(undefined);
    expect(_.toDateInteger('')).toEqual(undefined);
});

test('toDateTimeInteger', () => {
    expect(_.toDateTimeInteger('foo')).toEqual(undefined);
    expect(_.toDateTimeInteger('')).toEqual(undefined);
});

// test('toDateTimeInteger', () => {
//     expect(_.toDateTimeInteger('foo')).toEqual(undefined);
// });

// const CRLF = '\r\n';

// test('toResp - simple string', () => {
//     let res = _.toResp('hello');
//     expect(res).toBe('+hello' + CRLF);
// });

// test('toResp - error object', () => {
//     let res = _.toResp(new Error('foo'));
//     expect(res).toBe('-foo' + CRLF);
// });

// test('fromResp - simple string', async () => {
//     let fgets = () => Promise.resolve('+hello' + CRLF);
//     let res = await _.fromResp(fgets);
//     expect(res).toBe('hello');
// });

// test('byteLength', async () => {
//     let res =  _.byteLength('foo™');
//     expect(res).toBe(6);
//     res = _.byteLength('ру');
//     expect(res).toBe(4);
// });

// test('stem', () => {
//     expect(_.stem('Hello Worlds', false)).toStrictEqual(['hello', 'world']);
//     expect(_.stem(' Girls ', false)).toStrictEqual(['girl']);
//     expect(_.stem('  ', false)).toStrictEqual([]);
//     expect(_.stem(' - ', false)).toStrictEqual([]);
//     expect(_.stem('i\'m ok', false)).toStrictEqual(['i', 'm', 'ok']);
//     //
//     expect(_.stem('Bob took my hand!', true)).toStrictEqual(['bob', 'hand']);
//     expect(_.stem('i\'m ok', true)).toStrictEqual([]);
// });

// test('castToArray', () => {
//     expect(_.castToArray(' Foo Bar ')).toStrictEqual(['Foo', 'Bar']);
//     expect(_.castToArray([1, 2])).toStrictEqual([1, 2]);
//     expect(_.castToArray('?? ?', 1, 2, 3)).toStrictEqual(['12', '3']);
//     expect(_.castToArray('? ? ?', 1, 2, 3)).toStrictEqual(['1', '2', '3']);
// });

// test('equal', () => {
//     expect(_.equal([1, 2], [1, 2])).toBe(true);
//     expect(_.equal([1, 2], ['1', '2'])).toBe(false);;
// });

// test('isInteger', () => {
//     expect(_.isInteger(1)).toBe(true);
//     expect(_.isInteger('1')).toBe(true);
//     expect(_.isInteger('100')).toBe(true);
//     expect(_.isInteger('1000')).toBe(true);
//     expect(_.isInteger('1000E1000')).toBe(false);
//     expect(_.isInteger('1' + '0'.repeat(30))).toBe(false);
// });

// test('isDirectory', () => {
//     expect(_.isDirectory()).toBe(false);
//     expect(_.isDirectory(false)).toBe(false);
//     expect(_.isDirectory(true)).toBe(false);
//     expect(_.isDirectory('')).toBe(false);
//     expect(_.isDirectory(undefined)).toBe(false);
//     expect(_.isDirectory({})).toBe(false);
//     expect(_.isDirectory([])).toBe(false);
// });

// test('readDirectory', () => {
//     expect(_.readDirectory(C.TMPDIR).includes('.')).toBe(false);
//     expect(_.readDirectory(C.TMPDIR).includes('..')).toBe(false);
// });

// test('rm', () => {
//     let dir = C.TMPDIR + '/test' + _.rand();
//     _.writeFile(dir + '/_/_/_/_/_.txt', '_');
//     expect(_.isDirectory(dir)).toBe(true);
//     _.rm(dir);
//     expect(_.isDirectory(dir)).toBe(false);
// });

// test('readLines', async () => {
//     let file = C.TMPDIR + '/test' + _.rand();
//     _.writeFile(file, 'a\n\nb\n\n');
//     let res = [];
//     await _.readLines(file, line => res.push(line));
//     expect(res).toStrictEqual(['a', '', 'b', '']);
// });

// test('triplets', () => {
//     expect(_.triplets('hello')).toStrictEqual(['h', 'he', 'hel', 'ell', 'llo']);
//     expect(_.triplets('hii')).toStrictEqual(['h', 'hi', 'hii']);
// });
