const RoaringBitmap = require('roaring/RoaringBitmap32');

RoaringBitmap.not = (bitmap, min, max) => {
    bitmap = bitmap.persist ? new RoaringBitmap(bitmap) : bitmap;
    bitmap.flipRange(min, max + 1);
    return bitmap;
};

RoaringBitmap.and = (a, b) => {
    return RoaringBitmap.andMany([a, b]);
};

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

RoaringBitmap.andNot = (bitmap, not) => {
    bitmap = bitmap.persist ? new RoaringBitmap(bitmap) : bitmap;
    bitmap.andNotInPlace(not);
    return bitmap;
};

module.exports = RoaringBitmap;
