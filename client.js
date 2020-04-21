const C = require('./constants');
const http = require('http');
const readline = require('readline');

let sendQuery = (query, options) => {
    return new Promise((resolve, reject) => {
        let req = http.request(options, res => {
            let body = [];
            res.setEncoding('utf8');
            res.on('data', chunk => body.push(chunk.toString()));
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body.join('')));
                } catch (e) {
                    reject(e + ' (' + String(body).trim() + ')');
                }
            });
        });
        req.on('error', reject);
        req.write(JSON.stringify({query}));
        req.end();
    });
};

function createClient(auth) {
    let connect = (port = C.SERVER_PORT, host = C.SERVER_HOST) => {
        let options = {
            port,
            hostname: host,
            path: '/',
            method: 'POST',
            headers: {
                'Content-Type': C.SERVER_CONTENT_TYPE,
            },
        };
        if (auth) {
            options.headers['Authorization'] = auth;
        }
        let rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
        let question = q => {
            rl.question(q, a => {
                if (['exit', 'quit'].includes(a.trim().toLowerCase())) {
                    rl.close();
                }
                sendQuery(a, options).then(res => {
                    console.log(res.error || res.result);
                    question(q);
                }).catch(e => {
                    console.log(String(e));
                    rl.close();
                });
            });
        };
        question('> ');
    };
    return {connect};
}

module.exports = createClient;
