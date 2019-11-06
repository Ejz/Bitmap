const path = require('path');
const debug = require('debug')('benchmark');
const bitmap = require('../bitmap');
const _ = require('../helpers');
const mem = () => Math.round(process.memoryUsage().rss / 1e6) + 'MB';

(async () => {
    debug(mem(), 'STARTED');
    let avg, id, total = 1e6;
    await bitmap.execute('create i1 fields f1 integer min 1 max 1e3 sortable');
    debug(mem(), 'CREATED');
    id = 1, avg = Number(new Date());
    for (let i = 0; i < total; i++) {
        await bitmap.execute('add i1 ? values f1 ?', id++, _.rand(1, 1e3));
    }
    avg = Number(new Date()) - avg;
    avg = String(Math.round(1000 * avg / total));
    debug(mem(), _.sprintf('POPULATED. AVG: %sms / 1000', avg));
    avg = Number(new Date());
    for (let i = 0; i < total; i++) {
        let r1, r2;
        do {
            [r1, r2] = [_.rand(1, 1e3), _.rand(1, 1e3)];
        } while (r2 < r1);
        await bitmap.execute('search i1 @f1:[?,?]' + (_.rand(0, 1) ? ' sortby f1' : ''), r1, r2);
    }
    avg = Number(new Date()) - avg;
    avg = String(Math.round(1000 * avg / total));
    debug(mem(), _.sprintf('SEARCHED. AVG: %sms / 1000', avg));
    debug(mem(), 'FINISHED');
})();
