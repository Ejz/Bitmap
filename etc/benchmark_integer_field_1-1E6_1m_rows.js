const bitmap = require('../bitmap');
const _ = require('../helpers');

let mem = () => Math.round(process.memoryUsage().rss / 1E6) + 'MB';
let log = (msg, time, cnt = 1) => {
    time = (time ? ' (' + ((Number(new Date()) - time) / (1000 * cnt)) + ')' : '');
    console.log(mem() + ': ' + msg + time);
};

(async () => {
    log('STARTED');
    let id = 1, total = 1E6;
    bitmap.execute('CREATE i1 FIELDS f1 INTEGER MIN 1 MAX 1000000');
    log('CREATED');
    let time = Number(new Date());
    for (let i = 0; i < total; i++) {
        bitmap.execute('ADD i1 ' + id + ' VALUES f1 ' + _.rand(1, 1E6));
        id++;
    }
    log('POPULATED', time);
    time = Number(new Date());
    let counter1 = 1000;
    for (let i = 0; i < counter1; i++) {
        let r1 = _.rand(1, 1E6);
        let r2 = _.rand(r1, 1E6);
        bitmap.execute('SEARCH i1 \'@f1:[' + r1 + ',' + r2 + ']\'');
    }
    log('SEARCHED', time, counter1);
    let counter2 = 100;
    for (let i = 0; i < counter2; i++) {
        let r1 = _.rand(1, 1E6);
        let r2 = _.rand(r1, 1E6);
        bitmap.execute('SEARCH i1 \'@f1:[' + r1 + ',' + r2 + ']\' SORTBY f1');
    }
    log('SEARCHED (SORTBY)', time, counter2);
    log('FINISHED');
})();
