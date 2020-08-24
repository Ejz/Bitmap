const RoaringBitmap = require('./RoaringBitmap');
const C = require('./constants');
const _ = require('./helpers');

class BSI {
    constructor(min, max, newBitmap) {
        min = parseInt(min);
        max = parseInt(max);
        min = min > max ? max : min;
        this.max = max - min;
        this.zval = min;
        let rank = this.max + 1;
        let len = 0;
        do {
            len++;
            rank /= 2;
            rank = Math.ceil(rank);
        } while (rank != 1);
        newBitmap = newBitmap || this.newBitmap.bind(this);
        this.bitmaps = {all: newBitmap(), zero: []};
        for (let i = 0; i < len; i++) {
            this.bitmaps.zero.push(newBitmap());
        }
        this.len = len;
    }

    newBitmap() {
        let bitmap = new RoaringBitmap();
        bitmap.persist = true;
        return bitmap;
    }

    add(id, int) {
        let {bitmaps, len, max, zval} = this;
        int -= zval;
        if (int < 0 || int > max) {
            return;
        }
        bitmaps.all.add(id);
        int.toString(2).padStart(len, '0').split('').forEach((char, i) => {
            if (char == '0') {
                bitmaps.zero[i].add(id);
            }
        });
    }

    getBitmap(from, to) {
        let {max, zval, len} = this;
        from = from === undefined ? 0 : from - zval;
        to = to === undefined ? max : to - zval;
        from = from < 0 ? 0 : from;
        to = to > max ? max : to;
        if (to < from) {
            return new RoaringBitmap();
        }
        to = this.getBitmapTo(to.toString(2).padStart(len, '0').split(''));
        if (from > 0) {
            from = this.getBitmapTo((from - 1).toString(2).padStart(len, '0').split(''));
            to = RoaringBitmap.andNot(to, from);
        }
        return to;
    }

    getBitmapTo(to) {
        let {bitmaps, len} = this;
        let t = to.shift();
        let l = to.length;
        let idx = len - l - 1;
        if (t == '1') {
            let or = [bitmaps.zero[idx]];
            or.push(l ? this.getBitmapTo(to) : bitmaps.all);
            return RoaringBitmap.orMany(or);
        }
        let _ = bitmaps.zero[idx];
        return l ? RoaringBitmap.andMany([_, this.getBitmapTo(to)]) : _;
    }

    *sort(bitmap, asc, l = 0) {
        let {len, bitmaps} = this;
        bitmap.persist = true;
        let last = l == len - 1;
        for (let i of (asc ? [0, 1] : [1, 0])) {
            let bm = bitmaps.zero[l];
            bm = i ? RoaringBitmap.andNot(bitmaps.all, bm) : bm;
            let intersection = RoaringBitmap.and(bitmap, bm);
            let size = intersection.size;
            if (last || size == 1) {
                yield* intersection.iterator();
            } else if (size >= 2) {
                yield* this.sort(intersection, asc, l + 1);
            }
        }
    }
}

module.exports = BSI;
