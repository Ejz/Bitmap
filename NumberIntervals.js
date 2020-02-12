const RoaringBitmap = require('./RoaringBitmap');
const C = require('./constants');
const _ = require('./helpers');

class NumberIntervals {
    constructor(hasValues, config = {div: 5, rank: 1000}) {
        let {intervals} = config;
        delete config.intervals;
        this.hasValues = hasValues;
        this.config = config;
        intervals = intervals || [[
            Number.MIN_SAFE_INTEGER,
            Number.MAX_SAFE_INTEGER,
            this.newBitmap(),
            {},
            null,
        ]];
        this.intervals = intervals;
    }

    add(id, int) {
        let _ = this.hasValues ? Number(int) : id;
        let idx = this.intervals.findIndex(([min, max]) => min <= _ && _ <= max);
        let interval = this.intervals[idx];
        let [min, max, bitmap, values, intervals] = interval;
        bitmap.add(id);
        if (min == max) {
            return;
        }
        if (!intervals) {
            if (this.hasValues) {
                values[id] = Number(int);
            }
            if (bitmap.size > this.config.rank) {
                let [i1, i2] = this.splitInterval(interval);
                if (this.intervals.length < this.config.div) {
                    this.intervals.splice(idx, 1, i1, i2);
                } else {
                    let cfg = {intervals: [i1, i2], ...this.config};
                    intervals = new NumberIntervals(this.hasValues, cfg);
                    values = {};
                }
            }
        }
        if (intervals) {
            intervals.add(id, int);
        }
    }

    getBitmap(from, to) {
        from = from !== undefined ? from : this.minimum();
        to = to !== undefined ? to : this.maximum();
        let bitmaps = [];
        for (let interval of this.intervals) {
            let [min, max, bitmap] = interval;
            if (max < from) {
                continue;
            }
            if (to < min) {
                break;
            }
            if (from <= min && max <= to) {
                bitmaps.push(bitmap);
            }
            bitmaps.push(this.getBitmapFromInterval(from, to, interval));
        }
        return RoaringBitmap.orMany(bitmaps);
    }

    getBitmapFromInterval(from, to, interval) {
        let [min, max, bitmap, values, intervals] = interval;
        from = from < min ? min : from;
        to = to > max ? max : to;
        if (intervals) {
            return intervals.getBitmap(from, to);
        }
        let getValue = id => values === undefined ? min : values[id];
        let f1 = v => from <= v && v <= to;
        let f2 = v => {
            v = getValue(v);
            return from <= v && v <= to;
        };
        let collect = bitmap.toArray().filter(this.hasValues ? f2 : f1);
        return new RoaringBitmap(collect);
    }

    splitInterval(interval) {
        let [min, max, bitmap] = interval;
        let hasValues = this.hasValues;
        let values;
        if (hasValues) {
            values = Object.entries(interval[3]);
            values.sort(([, a], [, b]) => a - b);
        } else {
            values = bitmap.toArray();
        }
        if (values.length < 2) {
            throw 'values.length < 2';
        }
        let i1 = [min, min, this.newBitmap(), {}, null];
        let i2 = [max, max, this.newBitmap(), {}, null];
        for (let i = 0, l = values.length, j = l - 1; i <= j;) {
            let [i1id, i1val] = hasValues ? values[i] : [values[i], values[i]];
            let [i2id, i2val] = hasValues ? values[j] : [values[j], values[j]];
            if (i1val < i2[0]) {
                i1[1] = i1val;
                i1[2].add(+ i1id);
                if (hasValues) {
                    i1[3][i1id] = i1val;
                }
                i++;
            }
            if (i2val > i1[1]) {
                i2[2].add(+ i2id);
                i2[0] = i2val;
                if (hasValues) {
                    i2[3][i2id] = i2val;
                }
                j--;
            }
        }
        let d = i2[0] - i1[1];
        if (d != 1) {
            d = (d - 1) / 2;
            i1[1] += Math.ceil(d);
            i2[0] -= Math.floor(d);
        }
        i1[3] = i1[0] == i1[1] ? undefined : i1[3];
        i2[3] = i2[0] == i2[1] ? undefined : i2[3];
        return [i1, i2];
    }

    newBitmap(ids = []) {
        let bitmap = new RoaringBitmap(ids);
        bitmap.persist = true;
        return bitmap;
    }

    has(v) {
        for (let interval of this.intervals) {
            if (interval[0] <= v && v <= interval[1]) {
                if (!this.hasValues) {
                    return interval[2].has(v);
                }
                if (interval[4]) {
                    return interval[4].has(v);
                }
                let idx = Object.entries(interval[3]).findIndex(([, b]) => b == v);
                return ~idx;
            }
        }
    }

    size() {
        let size = 0;
        this.intervals.forEach(i => size += i[2].size);
        return size;
    }

    minimum() {
        return this.intervals[0][0];
    }

    maximum() {
        return this.intervals[this.intervals.length - 1][1];
    }

    sort(bm, asc, lim, pos) {
        let ret = [], pos2, valx;
        let inc = asc ? 1 : -1;
        let hasValues = this.hasValues;
        if (pos) {
            valx = pos[hasValues ? 1 : 0];
            valx = hasValues ? valx : valx + inc;
        }
        for (let l = this.intervals.length, i = asc ? 0 : l - 1; 0 <= i && i < l; i += inc) {
            if (lim < 1) {
                break;
            }
            let [min, max, bitmap, values, intervals] = this.intervals[i];
            let getValue = id => values === undefined ? min : values[id];
            if (pos && ((asc && max < valx) || (!asc && valx < min))) {
                continue;
            }
            let ids;
            if (intervals) {
                [ids, pos2] = intervals.sort(bm, asc, lim, pos);
            } else {
                ids = RoaringBitmap.and(bm, bitmap).toArray();
                if (pos && ((asc && min <= valx) || (!asc && valx <= max))) {
                    let [_0, _1] = pos;
                    let fv = id => {
                        let v = getValue(id);
                        return v == _1 ? _0 < id : (asc ? _1 < v : v < _1);
                    };
                    let fi = id => asc ? _0 < id : id < _0;
                    ids = ids.filter(hasValues ? fv : fi);
                }
                if (hasValues && min < max) {
                    let s1 = (a, b) => {
                        let v1 = getValue(a), v2 = getValue(b);
                        return v1 == v2 ? a - b : v1 - v2;
                    };
                    let s2 = (a, b) => {
                        let v1 = getValue(a), v2 = getValue(b);
                        return v1 == v2 ? a - b : v2 - v1;
                    };
                    ids.sort(asc ? s1 : s2);
                } else if (!hasValues && !asc) {
                    ids = ids.reverse();
                }
                ids = ids.slice(0, lim);
                if (ids.length) {
                    let id = ids[ids.length - 1];
                    let _ = hasValues ? getValue(id) : undefined;
                    pos2 = [id, _];
                } else {
                    pos2 = undefined;
                }
            }
            lim -= ids.length;
            ret = ret.concat(ids);
        }
        return [ret, lim > 0 ? undefined : pos2];
    }
}

module.exports = NumberIntervals;
