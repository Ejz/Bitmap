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

test('wordSplit', () => {
    expect(_.wordSplit('Hello Worlds!')).toEqual(['hello', 'worlds']);
    expect(_.wordSplit('a b c b')).toEqual(['a', 'c', 'b']);
});

test('stem', () => {
    expect(_.stem('Hello Worlds', false)).toEqual(['hello', 'world']);
    expect(_.stem(' Girls ', false)).toEqual(['girl']);
    expect(_.stem('  ', false)).toEqual([]);
    expect(_.stem(' - ', false)).toEqual([]);
    expect(_.stem('i\'m ok', false)).toEqual(['i', 'm', 'ok']);
    //
    expect(_.stem('Bob took my hand!', true)).toEqual(['bob', 'hand']);
    expect(_.stem('i\'m ok', true)).toEqual([]);
    expect(_.stem('i\'m ok, Brothers', true)).toEqual(['brother']);
});

test('triplet', () => {
    expect(_.triplet('hello')).toStrictEqual(['h', 'he', 'hel', 'ell', 'llo']);
    expect(_.triplet('hii')).toStrictEqual(['h', 'hi', 'hii']);
});
