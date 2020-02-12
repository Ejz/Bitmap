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

test('NumberIntervals - complex - 3', () => {
    let t, ni = new NumberIntervals(true, {div: 3, rank: 3});
    let [ids, pos] = ni.sort(ni.newBitmap(), true, 1);
    expect(ids).toStrictEqual([]);
    expect(pos).toStrictEqual(undefined);
    let values = [];
    let filter = (ids, asc) => {
        let vals = values.filter(([i, v]) => ids.includes(i));
        vals.sort(([i1, v1], [i2, v2]) => v1 == v2 ? i1 - i2 : (asc ? v1 - v2 : v2 - v1));
        return vals;
    };
    let getter = (ids, asc, lim) => {
        let vals = filter(ids, asc);
        let ret = vals.slice(0, lim + 1).map(([i, v]) => i);
        if (ret.length <= lim) {
            return [ret, undefined];
        }
        let id = ret.pop();
        id = ret[ret.length - 1];
        return [ret, [id, filter([id])[0][1]]];
    };
    for (let i = 1; i <= 20; i++) {
        let v = _.rand(1, 10);
        values.push([i, v]);
        ni.add(i, v);
    }
    let cases = [
        [[1, 2, 3, 4, 5], true, 3],
        [[], true, 3],
        [[10, 20], true, 3],
        [[1, 20], true, 1],
        [[1, 20], false, 1],
        [[100, 200], true, 1],
    ];
    for (let [t, asc, lim] of cases) {
        [ids, pos] = ni.sort(ni.newBitmap(t), asc, lim);
        expect(ids).toStrictEqual(getter(t, asc, lim)[0]);
        expect(pos).toStrictEqual(getter(t, asc, lim)[1]);
    }
});

test('NumberIntervals - complex - 4', () => {
    let t1, t2, ni = new NumberIntervals(false, {div: _.rand(2, 10), rank: _.rand(2, 10)});
    ni.add(1);
    ni.add(2);
    ni.add(3);
    ni.add(4);
    ni.add(5);
    ni.add(6);
    ni.add(7);
    [t1, t2] = ni.sort(ni.newBitmap([1, 2, 3]), true, 2);
    expect(t1).toStrictEqual([1, 2]);
    expect(t2).toStrictEqual([2, undefined]);
    [t1, t2] = ni.sort(ni.newBitmap([1, 2, 3]), true, 2, [2, undefined]);
    expect(t1).toStrictEqual([3]);
    expect(t2).toStrictEqual(undefined);
    [t1, t2] = ni.sort(ni.newBitmap([1, 2, 3]), true, 1, [2, undefined]);
    expect(t1).toStrictEqual([3]);
    expect(t2).toStrictEqual([3, undefined]);
    [t1, t2] = ni.sort(ni.newBitmap([2, 3]), true, 1, [1, undefined]);
    expect(t1).toStrictEqual([2]);
    expect(t2).toStrictEqual([2, undefined]);
    [t1, t2] = ni.sort(ni.newBitmap([2, 3]), true, 1, [2, undefined]);
    expect(t1).toStrictEqual([3]);
    expect(t2).toStrictEqual([3, undefined]);
});

test('NumberIntervals - complex - 5', () => {
    let t1, t2, ni = new NumberIntervals(true, {div: _.rand(2, 10), rank: _.rand(2, 10)});
    ni.add(1, 10);
    ni.add(2, 20);
    ni.add(3, 30);
    ni.add(4, 40);
    ni.add(5, 50);
    ni.add(6, 60);
    ni.add(7, 70);
    [t1, t2] = ni.sort(ni.newBitmap([1, 2, 3]), true, 2);
    expect(t1).toStrictEqual([1, 2]);
    expect(t2).toStrictEqual([2, 20]);
    [t1, t2] = ni.sort(ni.newBitmap([1, 2, 3]), true, 2, [2, 20]);
    expect(t1).toStrictEqual([3]);
    expect(t2).toStrictEqual(undefined);
    [t1, t2] = ni.sort(ni.newBitmap([1, 2, 3]), true, 1, [2, 20]);
    expect(t1).toStrictEqual([3]);
    expect(t2).toStrictEqual([3, 30]);
    [t1, t2] = ni.sort(ni.newBitmap([2, 5, 7]), true, 1, [1, 10]);
    expect(t1).toStrictEqual([2]);
    expect(t2).toStrictEqual([2, 20]);
    [t1, t2] = ni.sort(ni.newBitmap([2, 5, 7]), true, 1, [2, 20]);
    expect(t1).toStrictEqual([5]);
    expect(t2).toStrictEqual([5, 50]);
});

test('NumberIntervals - complex - 6', () => {
    let t1, t2, ni = new NumberIntervals(true, {div: _.rand(2, 10), rank: _.rand(2, 10)});
    ni.add(1, 1);
    ni.add(2, 1);
    ni.add(5, 1);
    ni.add(7, 1);
    ni.add(3, 2);
    ni.add(4, 2);
    ni.add(6, 2);
    let ids = [1, 2, 3, 4, 5, 6, 7];
    [t1, t2] = ni.sort(ni.newBitmap(ids), true, 2);
    expect(t1).toStrictEqual([1, 2]);
    expect(t2).toStrictEqual([2, 1]);
    [t1, t2] = ni.sort(ni.newBitmap(ids), true, 2, [2, 1]);
    expect(t1).toStrictEqual([5, 7]);
    expect(t2).toStrictEqual([7, 1]);
    [t1, t2] = ni.sort(ni.newBitmap(ids), true, 2, [7, 1], true);
    expect(t1).toStrictEqual([3, 4]);
    expect(t2).toStrictEqual([4, 2]);
    [t1, t2] = ni.sort(ni.newBitmap(ids), true, 2, [4, 2]);
    expect(t1).toStrictEqual([6]);
    expect(t2).toStrictEqual(undefined);
});

test('NumberIntervals - complex - 7', () => {
    let t1, ni = new NumberIntervals(false, {div: _.rand(2, 10), rank: _.rand(2, 10)});
    for (let id = 1; id <= 10; id++) {
        ni.add(id);
    }
    let ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    [t1] = ni.sort(ni.newBitmap(ids), true, 1, [4, undefined]);
    expect(t1).toStrictEqual([5]);
    [t1] = ni.sort(ni.newBitmap(ids), true, 1, [5, undefined]);
    expect(t1).toStrictEqual([6]);
    [t1] = ni.sort(ni.newBitmap(ids), true, 1, [6, undefined]);
    expect(t1).toStrictEqual([7]);
    [t1] = ni.sort(ni.newBitmap(ids), true, 1, [7, undefined]);
    expect(t1).toStrictEqual([8]);
    //
    [t1] = ni.sort(ni.newBitmap(ids), false, 1, [7, undefined]);
    expect(t1).toStrictEqual([6]);
    [t1] = ni.sort(ni.newBitmap(ids), false, 1, [6, undefined]);
    expect(t1).toStrictEqual([5]);
    [t1] = ni.sort(ni.newBitmap(ids), false, 1, [5, undefined]);
    expect(t1).toStrictEqual([4]);
    [t1] = ni.sort(ni.newBitmap(ids), false, 1, [4, undefined]);
    expect(t1).toStrictEqual([3]);
});
