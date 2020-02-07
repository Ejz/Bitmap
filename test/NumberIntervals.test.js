const NumberIntervals = require('../NumberIntervals');
const _ = require('../helpers');
const C = require('../constants');

test('NumberIntervals - splitInterval - 1', () => {
    let i1, i2, ni = new NumberIntervals(false);
    [i1, i2] = ni.splitInterval([1, 10, ni.newBitmap([1, 4, 7, 8, 9, 10]), {}, null]);
    expect(i1[0]).toStrictEqual(1);
    expect(i1[1]).toStrictEqual(7);
    expect(i1[2].toArray()).toStrictEqual([1, 4, 7]);
    expect(i2[0]).toStrictEqual(8);
    expect(i2[1]).toStrictEqual(10);
    expect(i2[2].toArray()).toStrictEqual([8, 9, 10]);
});

test('NumberIntervals - splitInterval - 2', () => {
    let i1, i2, ni = new NumberIntervals(false);
    [i1, i2] = ni.splitInterval([1, 10, ni.newBitmap([3, 5, 8]), {}, null]);
    expect(i1[0]).toStrictEqual(1);
    expect(i1[1]).toStrictEqual(6);
    expect(i1[2].toArray()).toStrictEqual([3, 5]);
    expect(i2[0]).toStrictEqual(7);
    expect(i2[1]).toStrictEqual(10);
    expect(i2[2].toArray()).toStrictEqual([8]);
});

test('NumberIntervals - splitInterval - 3', () => {
    let i1, i2, ni = new NumberIntervals(true);
    let values = {1: 1, 2: 2, 3: 2, 4: 2, 5: 2, 6: 1, 7: 2, 8: 2, 9: 2, 10: 2};
    let _ = ni.splitInterval([1, 2, ni.newBitmap([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), values, null]);
    let [[min1, max1, bm1, v1], [min2, max2, bm2, v2]] = _;
    expect(min1).toStrictEqual(1);
    expect(max1).toStrictEqual(1);
    expect(min2).toStrictEqual(2);
    expect(max2).toStrictEqual(2);
    expect(bm1.size).toStrictEqual(2);
    expect(bm2.size).toStrictEqual(8);
});

test('NumberIntervals - complex - 1', () => {
    let ni = new NumberIntervals(false, {div: 3, rank: 10});
    let ids = [];
    let filter = (a, b) => ids.filter(i => a <= i && i <= b);
    for (let i = 1; i <= 1E3; i++) {
        if (_.rand(0, 1)) {
            ids.push(i);
            ni.add(i);
        }
    }
    for (let i = 1; i <= 1E3; i++) {
        let from = _.rand(1, 1E3);
        let to = _.rand(from, 1E3);
        expect(ni.getBitmap(from, to).toArray()).toStrictEqual(filter(from, to));
    }
});

test('NumberIntervals - complex - 2', () => {
    let ni = new NumberIntervals(true, {div: 3, rank: 3});
    let values = [];
    let filter = (a, b) => values.filter(([, v]) => a <= v && v <= b).map(([i]) => i);
    let max = _.rand(1, 1E3);
    for (let i = 1; i <= 1E3; i++) {
        if (_.rand(0, 2)) {
            let v = _.rand(1, max);
            values.push([i, v]);
            ni.add(i, v);
        }
    }
    for (let i = 1; i <= 1E3; i++) {
        let from = _.rand(1, max);
        let to = _.rand(from, max);
        expect(ni.getBitmap(from, to).toArray()).toStrictEqual(filter(from, to));
    }
});
