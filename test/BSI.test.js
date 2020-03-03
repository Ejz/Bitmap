const BSI = require('../BSI');
const _ = require('../helpers');
const C = require('../constants');

test('BSI - constructor', () => {
    let cases = [
        [0, 0, 1],
        [1, 0, 1],
        // [1, 3, 1],
        // [1, 8, 2],
        // [1, 10, 3],
    ];
    for (let [min, max, length] of cases) {
        let bsi = new BSI(min, max);
        expect(bsi.len).toStrictEqual(length);
    }
});

test('BSI - add / getBitmap - 0-2', () => {
    let bsi = new BSI(0, 2);
    bsi.add(1, 0);
    bsi.add(2, 1);
    bsi.add(3, 2);
    let cases = [
        [0, 0, [1]],
        [1, 1, [2]],
        [2, 2, [3]],
        [0, 1, [1, 2]],
        [1, 2, [2, 3]],
        [0, 2, [1, 2, 3]],
    ];
    for (let [from, to, assert] of cases) {
        expect(bsi.getBitmap(from, to).toArray()).toStrictEqual(assert);
    }
});

test('BSI - add / getBitmap - 0-8', () => {
    let bsi = new BSI(0, 8);
    bsi.add(1, 0);
    bsi.add(2, 1);
    bsi.add(3, 2);
    bsi.add(4, 3);
    bsi.add(5, 4);
    bsi.add(6, 5);
    bsi.add(7, 6);
    bsi.add(8, 7);
    bsi.add(9, 8);
    let cases = [
        [0, 0, [1]],
        [1, 1, [2]],
        [2, 2, [3]],
        [0, 1, [1, 2]],
        [1, 2, [2, 3]],
        [0, 2, [1, 2, 3]],
        [3, 6, [4, 5, 6, 7]],
        [1, 7, [2, 3, 4, 5, 6, 7, 8]],
    ];
    for (let [from, to, assert] of cases) {
        expect(bsi.getBitmap(from, to).toArray()).toStrictEqual(assert);
    }
});

test('BSI - add / getBitmap - multi', () => {
    let time;
    let limit = 1E5;
    let min = 1;
    let max = 1E5;
    let values = [];
    let bsi = new BSI(min, max);
    for (let id = 1; id <= limit; id++) {
        let value = _.rand(min, max);
        bsi.add(id, value);
        values.push([id, value]);
    }
    time = Number(new Date());
    for (let i = 0; i < 10; i++) {
        let from = _.rand(min, max);
        let to = _.rand(from, max);
        expect(
            bsi.getBitmap(from, to).toArray()
        ).toStrictEqual(
            values.filter(([, val]) => from <= val && val <= to).map(([id]) => id)
        );
    }
    time = Number(new Date()) - time;
    time /= 1000;
    // console.log('TIME:', time);
    time = Number(new Date());
    for (let i = 0; i < 5; i++) {
        let from = _.rand(min, max);
        let to = _.rand(from, max);
        let bitmap = bsi.getBitmap(from, to);
        let asc = _.rand(0, 1) == 0;
        let res = [...bsi.sort(bitmap, asc)];
        let vals = values.filter(([, val]) => from <= val && val <= to);
        vals.sort(([i1, v1], [i2, v2]) => {
            if (!asc) {
                [v1, v2] = [v2, v1];
            }
            return v1 - v2 ? v1 - v2 : i1 - i2;
        });
        vals = vals.map(([id]) => id);
        expect(res).toStrictEqual(vals);
    }
    time = Number(new Date()) - time;
    time /= 1000;
    // console.log('TIME:', time);
});
