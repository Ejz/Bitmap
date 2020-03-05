const path = require('path');
const bitmap = require('../bitmap');
const _ = require('../helpers');
const mem = () => Math.round(process.memoryUsage().rss / 1e6) + 'MB';

(async () => {
    console.log(mem(), 'STARTED');
    let id = 1, total = 1e6;
    await bitmap.execute('create i1 fields f1 integer min 1 max 1e9');
    console.log(mem(), 'CREATED');
    let time = Number(new Date());
    for (let i = 0; i < total; i++) {
        await bitmap.execute('add i1 ? values f1 ?', id++, _.rand(1, 1e9));
    }
    time = Number(new Date()) - time;
    console.log(mem(), 'POPULATED', time / 1000);
    time = Number(new Date());
    for (let i = 0; i < 1; i++) {
        let r1 = _.rand(1, 1e9);
        let r2 = _.rand(r1, 1e9);
        await bitmap.execute('search i1 @f1:[?,?]', r1, r2);
    }
    time = Number(new Date()) - time;
    console.log(mem(), 'SEARCHED', time / 1000);
    console.log(mem(), 'FINISHED');
})();
