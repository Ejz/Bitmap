var Queued = require('./Queued');

test('Queued / length / clear', () => {
    let q = new Queued();
    q.push({id: 1, index: 'a'}, {id: 2, index: 'a'}, {id: 2, index: 'a'}, {id: 1, index: 'b'});
    expect(q.length()).toEqual(4);
    expect(q.length('a')).toEqual(3);
    expect(q.length('a', 1)).toEqual(1);
    expect(q.length('a', 2)).toEqual(2);
    q.clear('a', 1);
    expect(q.length()).toEqual(3);
    q.clear('a');
    expect(q.length()).toEqual(1);
});
