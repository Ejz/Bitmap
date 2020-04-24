const fs = require('fs');
const readline = require('readline');
const createClient = require('../client');
const _ = require('../helpers');

let argv = process.argv.slice(2);

let client = createClient({
    port: argv[0],
    host: argv[1],
});

let source = __dirname + '/airports.csv';

function csvToArray(text) {
    let p = '', row = [''], ret = [row], i = 0, r = 0, s = !0, l;
    for (l of text) {
        if ('"' === l) {
            if (s && l === p) {
                row[i] += l;
            }
            s = !s;
        } else if (',' === l && s) {
            l = row[++i] = '';
        } else if ('\n' === l && s) {
            if ('\r' === p) {
                row[i] = row[i].slice(0, -1);
            }
            row = ret[++r] = [l = ''];
            i = 0;
        } else {
            row[i] += l;
        }
        p = l;
    }
    return ret;
}

function readCsv() {
    return new Promise(resolve => {
        let csv = [];
        let rl = readline.createInterface({
            input: fs.createReadStream(source),
            crlfDelay: Infinity,
        });
        rl.on('line', line => {
            csv.push(csvToArray(line)[0]);
        });
        rl.on('close', _ => resolve(csv));
    });
}

(async () => {
    let [err] = await _.to(client.connect());
    if (err) {
        console.log(String(err));
        process.exit();
    }
    if ((await client.sendQuery('LIST')).result.includes('airports')) {
        await client.sendQuery('DROP airports');
    }
    await client.sendQuery(`
        CREATE airports FIELDS
            "ident" STRING
            "type" STRING
            "name" FULLTEXT PREFIXSEARCH
            "latitude_deg" INTEGER MIN -1000 MAX +1000
            "longitude_deg" INTEGER MIN -1000 MAX +1000
            "elevation_ft" INTEGER MIN -100000 MAX 100000
            "continent" STRING
            "iso_country" STRING
            "iso_region" STRING
            "municipality" STRING
            "scheduled_service" BOOLEAN
            "gps_code" STRING
            "iata_code" STRING
            "local_code" STRING
            "home_link" STRING
            "wikipedia_link" STRING
            "keywords" ARRAY SEPARATOR ','
    `);
    readCsv().then(async lines => {
        for (let line of lines) {
            if (line[0] == 'id') {
                continue;
            }
            line.push(line.pop().split(/,/).map(s => s.trim()).join(','));
            line = line.map(elem => elem == '' ? undefined : elem);
            let res = await client.sendQuery(`
                ADD airports ? VALUES
                "ident" ?
                "type" ?
                "name" ?
                "latitude_deg" ?
                "longitude_deg" ?
                "elevation_ft" ?
                "continent" ?
                "iso_country" ?
                "iso_region" ?
                "municipality" ?
                "scheduled_service" ?
                "gps_code" ?
                "iata_code" ?
                "local_code" ?
                "home_link" ?
                "wikipedia_link" ?
                "keywords" ?
            `, ...line).catch(e => {
                console.log(String(e));
                process.exit();
            });
            console.log(res);
        }
    });
})();
