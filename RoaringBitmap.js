const RoaringBitmap = require('roaring/RoaringBitmap32');

RoaringBitmap.andMany = (bitmaps) => {
    if (!bitmaps.length) {
        return new RoaringBitmap();
    }
    if (bitmaps.length == 1) {
        return bitmaps[0];
    }
    let max = Number.MAX_SAFE_INTEGER;
    let reduce = (a, b) => Math.min(a, b.size);
    let size1 = bitmaps.filter(b => b.persist).reduce(reduce, max);
    let size2 = bitmaps.filter(b => !b.persist).reduce(reduce, max);
    let index, find, bitmap;
    if (size2 != max) {
        find = b => !b.persist && b.size == size2;
    } else {
        find = b => b.persist && b.size == size1;
    }
    index = bitmaps.findIndex(find);
    bitmap = bitmaps[index];
    bitmaps.splice(index, 1);
    bitmap = bitmap.persist ? new RoaringBitmap(bitmap) : bitmap;
    for (let b of bitmaps) {
        bitmap = bitmap.andInPlace(b);
    }
    return bitmap;
};

RoaringBitmap.orMany = (bitmaps) => {
    if (!bitmaps.length) {
        return new RoaringBitmap();
    }
    if (bitmaps.length == 1) {
        return bitmaps[0];
    }
    let index, bitmap;
    index = bitmaps.findIndex(b => !b.persist);
    index = ~index ? index : 0;
    bitmap = bitmaps[index];
    bitmaps.splice(index, 1);
    bitmap = bitmap.persist ? new RoaringBitmap(bitmap) : bitmap;
    for (let b of bitmaps) {
        bitmap = bitmap.orInPlace(b);
    }
    return bitmap;
};

let andNot = RoaringBitmap.andNot;

RoaringBitmap.andNot = (bitmap, not) => {
    if (bitmap.persist) {
        return andNot(bitmap, not);
    }
    return bitmap.andNotInPlace(not);
};

RoaringBitmap.onlyRange = (bitmap, from, to) => {
    bitmap = bitmap.persist ? new RoaringBitmap(bitmap) : bitmap;
    let min = bitmap.minimum();
    let max = bitmap.maximum();
    from = from < min ? min : from;
    to = to > max ? max : to;
    bitmap.removeRange(min, from);
    bitmap.removeRange(to + 1, max + 1);
    return bitmap;
};

module.exports = RoaringBitmap;
