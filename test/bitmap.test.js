const C = require('../constants');
const _ = require('../helpers');
const bitmap = require('../bitmap');

test('bitmap / PING', () => {
    let r1 = bitmap.execute('ping');
    expect(r1).toEqual(C.BITMAP_OK);
});

test('bitmap / CREATE / LIST / DROP', () => {
    let r1 = bitmap.execute('create a');
    expect(r1).toEqual(C.BITMAP_OK);
    let r2 = bitmap.execute('list');
    expect(r2).toEqual(['a']);
    let r3 = bitmap.execute('drop a');
    expect(r3).toEqual(C.BITMAP_OK);
    let r4 = bitmap.execute('list');
    expect(r4).toEqual([]);
});

test('bitmap / RENAME / 1', () => {
    bitmap.execute('create a');
    let r1 = bitmap.execute('list');
    expect(r1).toEqual(['a']);
    let r2 = bitmap.execute('rename a b');
    expect(r2).toEqual(C.BITMAP_OK);
    let r4 = bitmap.execute('list');
    expect(r4).toEqual(['b']);
    bitmap.execute('drop b');
});

test('bitmap / RENAME / 2', () => {
    bitmap.execute('create a');
    bitmap.execute('create b fields a foreignkey references a');
    bitmap.execute('rename a a1');
    expect(bitmap.dump('a1').links.b.references).toEqual('a1');
    expect(bitmap.dump('b').fields.a.references).toEqual('a1');
    bitmap.execute('drop a1');
});

test('bitmap / RENAME / 3', () => {
    bitmap.execute('create a');
    bitmap.execute('create b fields a foreignkey references a');
    bitmap.execute('rename b b1');
    expect(bitmap.dump('a').links.b1.references).toEqual('a');
    expect(bitmap.dump('b1').fields.a.references).toEqual('a');
    bitmap.execute('drop a');
});

test('bitmap / STAT', () => {
    let r1 = bitmap.execute('stat');
    expect(/^memory_/.test(Object.keys(r1)[0])).toEqual(true);
    bitmap.execute('create a');
    bitmap.execute('add a 1');
    bitmap.execute('add a 3');
    let r2 = bitmap.execute('stat a');
    expect(r2).toEqual({size: 2, id_minimum: 1, id_maximum: 3, used_bitmaps: 1, used_bits: 2});
    bitmap.execute('drop a');
});

test('bitmap / ADD', () => {
    let r1 = bitmap.execute(`
        create a fields
        i integer min 1 max 2
        d date
        dt datetime
        b boolean
        a array
        s string
    `);
    expect(r1).toEqual(C.BITMAP_OK);
    let r2 = bitmap.execute('add a 1 values i 1 d 2010 dt 2010 b 1 a 1 s 1');
    expect(r2).toEqual(C.BITMAP_OK);
    let r3 = bitmap.execute('add a 2 values s 2');
    expect(r3).toEqual(C.BITMAP_OK);
    let r4 = bitmap.execute('add a 3 values s 1');
    expect(r4).toEqual(C.BITMAP_OK);
    let r5 = bitmap.execute('stat a');
    let used_bitmaps = 1 + 2 + 33 + 33 + 1 + 1 + 2;
    expect(r5).toEqual({size: 3, id_minimum: 1, id_maximum: 3, used_bitmaps, used_bits: r5.used_bits});
    bitmap.execute('drop a');
});

test('bitmap / SEARCH / 1', () => {
    bitmap.execute('create index fields f1 string');
    let strings = ['foo', 'bar', 'hello', 'world'];
    let id = 1;
    for (let string of strings) {
        bitmap.execute(`add index ${id++} values f1 '${string}'`);
    }
    let cases = {
        '@f1:bar': [2],
        '(@f1:bar)': [2],
        '@f1:unknown': [],
        '@f1:foo | @f1:bar': [1, 2],
        '@f1:foo & @f1:bar': [],
        '@f1:foo & @f1:foo': [1],
        '@f1:(bar)': [2],
        '@f1:(bar | foo)': [1, 2],
        '@f1:(bar & foo)': [],
        '@f1:(foo & foo)': [1],
        '*': [1, 2, 3, 4],
        '-*': [],
        '* | @f1:unknown': [1, 2, 3, 4],
        '* & @f1:unknown': [],
        '( @f1 : ( bar ) )': [2],
        '@f1:foo | @f1:bar & @f1:foo': [1],
        '@f1:foo | (@f1:bar & @f1:foo)': [1],
        '(@f1:foo | @f1:bar) & @f1:foo': [1],
        '@f1:foo & @f1:(bar|foo)': [1],
        '@f1:bar & @f1:(bar|foo)': [2],
        '@f1:bar @f1:(bar|foo)': [2],
        '-@f1:bar': [1, 3, 4],
        '-@f1:(bar|foo)': [3, 4],
        '-@f1:bar & @f1:(unknown|foo)': [1],
    };
    for (let [query, result] of Object.entries(cases)) {
        let {ids} = bitmap.execute(`search index '${query}'`);
        expect(ids).toEqual(result);
    }
    bitmap.execute('drop index');
});

test('bitmap / SEARCH / 2', () => {
    bitmap.execute('create index fields f1 integer min 1 max 5');
    let strings = ['1', '2', '3', '4', '5'];
    let id = 1;
    for (let string of strings) {
        bitmap.execute(`add index ${id++} values f1 '${string}'`);
    }
    let cases = {
        '@f1:[1]': [1],
        '@f1:[1,3]': [1, 2, 3],
        '@f1:[(1,3]': [2, 3],
        '@f1:[1,3)]': [1, 2],
        '@f1:[ 1 , 3 ) ]': [1, 2],
        '-@f1:[1,3)]': [3, 4, 5],
        '@f1:[min,max]': [1, 2, 3, 4, 5],
        '@f1:[,max]': [1, 2, 3, 4, 5],
        '@f1:[min,]': [1, 2, 3, 4, 5],
        '@f1:[,]': [1, 2, 3, 4, 5],
        '@f1:[(,)]': [2, 3, 4],
        '-@f1:[(,)]': [1, 5],
        '-@f1:[(min,max)]': [1, 5],
        '@f1:([min] | [max])': [1, 5],
        '-@f1:([min] | [max])': [2, 3, 4],
        '@f1>1': [2, 3, 4, 5],
        '@f1 < 5': [1, 2, 3, 4],
        '@f1 < 5 & @id > 2': [3, 4],
        '@f1 < 5 & @id >= 2': [2, 3, 4],
        '@f1 < 5 & @id < 4': [1, 2, 3],
        '@id < 100': [1, 2, 3, 4, 5],
        '@id > 0': [1, 2, 3, 4, 5],
        '@f1 < 5 & @f1 >= 2': [2, 3, 4],
        '@f1:1': [1],
        '@f1:Max': [5],
        '@f1:Min': [1],
    };
    for (let [query, result] of Object.entries(cases)) {
        let {ids} = bitmap.execute(`search index '${query}'`);
        expect(ids).toEqual(result);
    }
    bitmap.execute('drop index');
});

test('bitmap / SEARCH / 3', () => {
    bitmap.execute('create index fields f1 fulltext prefixsearch f2 fulltext nostopwords');
    let strings = [['foo a', 'bar'], ['zoomba', ''], ['', 'a world']];
    let id = 1;
    for (let [f1, f2] of strings) {
        bitmap.execute(`add index ${id++} values f1 '${f1}' f2 '${f2}'`);
    }
    let cases = {
        'foo': [1],
        'worlds': [3],
        'foo | worlds': [1, 3],
        'foo & bar': [1],
        '~foo | ~zoomba': [1, 2],
        '~foo | ~zoo': [1, 2],
        '(~zoo | ~fo)': [1, 2],
        '(~foo & ~bar)': [1],
        'a': [1],
    };
    for (let [query, result] of Object.entries(cases)) {
        let {ids} = bitmap.execute(`search index '${query}'`);
        expect(ids).toEqual(result);
    }
    bitmap.execute('drop index');
});

test('bitmap / SEARCH / LIMIT', () => {
    bitmap.execute('create index fields f1 integer min 0 max 10');
    let id = 1;
    while (id < 10) {
        bitmap.execute(`add index ${id} values f1 ${id}`);
        id++;
    }
    let r1 = bitmap.execute('search index \'*\' limit 0');
    expect(r1).toEqual({total: 9, ids: []});
    //
    let r2 = bitmap.execute('search index \'* & @id > 7\' limit 1');
    expect(r2).toEqual({total: 2, ids: [8]});
    //
    bitmap.execute('drop index');
});

test('bitmap / SEARCH / SORTBY', () => {
    bitmap.execute('create index fields f1 integer');
    let id = 1;
    let values = [];
    let asc = ([id1, v1], [id2, v2]) => v1 == v2 ? id1 - id2 : v1 - v2;
    let desc = ([id1, v1], [id2, v2]) => v1 == v2 ? id1 - id2 : v2 - v1;
    while (id <= 1000) {
        let v = _.rand(0, 1000);
        bitmap.execute(`add index ${id} values f1 ${v}`);
        values.push([id, v]);
        id++;
    }
    let {ids: ids1} = bitmap.execute('search index \'*\' sortby f1');
    values.sort(asc);
    expect(ids1).toEqual(values.map(_ => _[0]));
    //
    let {ids: ids2} = bitmap.execute('search index \'*\' sortby f1 desc');
    values.sort(desc);
    expect(ids2).toEqual(values.map(_ => _[0]));
    //
    let {ids: ids3, lastSortbyValue} = bitmap.execute('search index \'*\' sortby f1 desc limit 10');
    values.sort(desc);
    expect(ids3).toEqual(values.map(_ => _[0]).slice(0, 10));
    //
    bitmap.execute('drop index');
});

test('bitmap / CURSOR / 1', () => {
    bitmap.execute('create index fields f1 integer');
    bitmap.execute('add index 1 values f1 2');
    bitmap.execute('add index 2 values f1 3');
    bitmap.execute('add index 3 values f1 1');
    let r1 = bitmap.execute('search index \'*\' withcursor limit 1');
    expect(r1.ids).toEqual([1]);
    let r2 = bitmap.execute('cursor ' + r1.cursor);
    expect(r2.ids).toEqual([2]);
    let r3 = bitmap.execute('cursor ' + r1.cursor);
    expect(r3.ids).toEqual([3]);
    expect(r3.cursor).toEqual(null);
    bitmap.execute('drop index');
});

test('bitmap / CURSOR / 2', () => {
    bitmap.execute('create index');
    expect(() => bitmap.execute('search index \'*\' withcursor limit 0')).toThrow(C.CommandParserError);
    bitmap.execute('drop index');
});

test('bitmap / CURSOR / 3', async () => {
    bitmap.execute('create index');
    bitmap.execute('add index 1');
    bitmap.execute('add index 2');
    bitmap.execute('add index 3');
    let {cursor} = bitmap.execute('search index \'*\' withcursor timeout 1 limit 1');
    let r1 = bitmap.execute('cursor ' + cursor);
    expect(r1.ids).toEqual([2]);
    await new Promise(r => setTimeout(r, 1500));
    expect(() => bitmap.execute('cursor ' + cursor)).toThrow(C.BitmapError);
    bitmap.execute('drop index');
});

test('bitmap / CURSOR / 4', async () => {
    bitmap.execute('create index');
    bitmap.execute('add index 1');
    bitmap.execute('add index 2');
    bitmap.execute('add index 3');
    bitmap.execute('add index 4');
    bitmap.execute('add index 5');
    let {cursor} = bitmap.execute('search index \'*\' withcursor timeout 1 limit 1');
    let r1 = bitmap.execute('cursor ' + cursor);
    expect(r1.ids).toEqual([2]);
    await new Promise(r => setTimeout(r, 500));
    let r2 = bitmap.execute('cursor ' + cursor);
    expect(r2.ids).toEqual([3]);
    await new Promise(r => setTimeout(r, 500));
    let r3 = bitmap.execute('cursor ' + cursor);
    expect(r3.ids).toEqual([4]);
    await new Promise(r => setTimeout(r, 500));
    let r5 = bitmap.execute('cursor ' + cursor);
    expect(r5.ids).toEqual([5]);
    expect(r5.cursor).toEqual(null);
    bitmap.execute('drop index');
});

test('bitmap / SEARCH / WITHFOREIGNKEYS', () => {
    bitmap.execute('create parent');
    bitmap.execute('create child fields parent foreignkey references parent');
    bitmap.execute('add parent 1');
    bitmap.execute('add parent 2');
    bitmap.execute('add child 1 values parent 1');
    bitmap.execute('add child 2 values parent 2');
    bitmap.execute('add child 3 values parent 1');
    let r = bitmap.execute('search child \'@parent:2\' withforeignkeys "parent"');
    expect(r.total).toEqual(1);
    expect(r.records).toEqual([{id: 2, parent: 2}]);
    expect('ids' in r).toEqual(false);
    bitmap.execute('drop child');
    bitmap.execute('drop parent');
});

test('bitmap / DROP', () => {
    bitmap.execute('create a');
    bitmap.execute('create b fields a foreignkey references a');
    bitmap.execute('create c fields b foreignkey references b');
    bitmap.execute('drop a');
    expect(bitmap.execute('list')).toEqual([]);
});

test('bitmap / SEARCH / 4', () => {
    bitmap.execute('create parent');
    bitmap.execute('add parent 1');
    bitmap.execute('add parent 2');
    bitmap.execute('create child fields parent_id foreignkey references parent "fulltext" fulltext');
    bitmap.execute('add child 1 values parent_id 1 "fulltext" \'foo bar\'');
    bitmap.execute('add child 2 values parent_id 1 "fulltext" \'hello world\'');
    bitmap.execute('add child 3 values parent_id 2 "fulltext" \'hi mi shi\'');
    let cases = {
        '*': ['child', [1, 2, 3]],
        '@parent_id:1': ['child', [1, 2]],
        '@parent_id:2': ['child', [3]],
        '-@parent_id:2': ['child', [1, 2]],
        '-@id:2': ['parent', [1]],
        '@@child:@parent_id:1': ['parent', [1]],
        '@@child:(@parent_id:1)': ['parent', [1]],
        '(@@child:@parent_id:1)': ['parent', [1]],
        '(@@child:(@parent_id:1))': ['parent', [1]],
        '@@child:(hello world)': ['parent', [1]],
        '@@child:(hello | hi)': ['parent', [1, 2]],
    };
    for (let [query, [index, result]] of Object.entries(cases)) {
        let {ids} = bitmap.execute(`search ${index} '${query}'`);
        expect(ids).toEqual(result);
    }
    bitmap.execute('drop child');
    bitmap.execute('drop parent');
});

test('bitmap / SEARCH / 5', () => {
    bitmap.execute('create index fields ft fulltext prefixsearch');
    bitmap.execute('add index 1 values ft \'sahara foo\'');
    bitmap.execute('add index 2 values ft \'Salwas bar\'');
    bitmap.execute('add index 3 values ft \'somsal news\'');
    let cases = {
        '~sa': [1, 2],
        '~"foo sa"': [1],
        '~"salw"': [2],
        '"salw"': [],
    };
    for (let [query, result] of Object.entries(cases)) {
        let {ids} = bitmap.execute(`search index '${query}'`);
        expect(ids).toEqual(result);
    }
    bitmap.execute('drop index');
});
