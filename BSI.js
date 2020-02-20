const RoaringBitmap = require('./RoaringBitmap');
const C = require('./constants');
const _ = require('./helpers');

class BSI {
    constructor(min, max) {
        min = min > max ? max : min;
        this.max = max - min;
        this.zval = min;
        let rank = this.max + 1;
        let len = 0;
        do {
            len++;
            rank /= 3;
            rank = Math.ceil(rank);
        } while (rank != 1);
        this.bitmaps = [[], [], []];
        for (let i = 0; i < len; i++) {
            this.bitmaps[0].push(this.newBitmap());
            this.bitmaps[1].push(this.newBitmap());
            this.bitmaps[2].push(this.newBitmap());
        }
        this.len = len;
    }

    newBitmap(ids = []) {
        let bitmap = new RoaringBitmap(ids);
        bitmap.persist = true;
        return bitmap;
    }

    add(id, int) {
        let {bitmaps, len, max, zval} = this;
        int -= zval;
        if (int < 0 || int > max) {
            return;
        }
        int.toString(3).padStart(len, '0').split('').forEach((char, i) => {
            bitmaps[char][i].add(id);
        });
    }

    getBitmap(from, to, l) {
        let {bitmaps, max, zval, len} = this;
        if (l === undefined) {
            l = 0;
            from = from === undefined ? 0 : from - zval;
            to = to === undefined ? max : to - zval;
            from = from < 0 ? 0 : from;
            to = to > max ? max : to;
            if (to < from) {
                return this.newBitmap();
            }
            from = from.toString(3).padStart(len, '0');
            to = to.toString(3).padStart(len, '0');
        }
        let last = l == len - 1;
        let f = from[0];
        let t = to[0];
        from = from.substring(1);
        to = to.substring(1);
        let m = + t - f;
        let or = [];
        let push = (bm1, bm2) => {
            or.push(bm2 === undefined ? bm1 : RoaringBitmap.and(bm1, bm2));
        };
        if (m == 0) {
            push(bitmaps[f][l], last ? undefined : this.getBitmap(from, to, l + 1));
        } else {
            let _0 = '0'.repeat(len - l - 1);
            let _2 = '2'.repeat(len - l - 1);
            push(bitmaps[f][l], last ? undefined : this.getBitmap(from, _2, l + 1));
            push(bitmaps[t][l], last ? undefined : this.getBitmap(_0, to, l + 1));
            if (m == 2) {
                push(bitmaps[1][l], undefined);
            }
        }
        return RoaringBitmap.orMany(or);
    }
}

module.exports = BSI;
