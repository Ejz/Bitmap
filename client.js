const C = require('./constants');
const http = require('http');
const readline = require('readline');

function createClient(settings = {}) {
    settings.port = settings.port || C.SERVER_PORT;
    settings.host = settings.host || C.SERVER_HOST;
    return {
        options: {
            auth: settings.auth,
            port: settings.port,
            hostname: settings.host,
            path: '/',
            method: 'POST',
            headers: {
                'Content-Type': C.SERVER_CONTENT_TYPE,
            },
        },
        escapeIdent(ident) {
            return '"' + ident + '"';
        },
        escapeValue(value) {
            let cb = (m, p1) => p1 == '\'' ? '\\\'' : '\\\\';
            return '\'' + value.replace(/('|\\)/g, cb) + '\'';
        },
        sendQuery(query, ...args) {
            if (args.length) {
                let cb = (m, p1) => {
                    let v = args.shift();
                    switch (p1) {
                        case '?':
                            return v === undefined ? 'UNDEFINED' : this.escapeValue(v);
                        case '#':
                            return v === undefined ? 'UNDEFINED' : this.escapeIdent(v);
                        default:
                            return v;
                    }
                };
                query = query.replace(/([%#\?])/g, cb);
            }
            return new Promise((resolve, reject) => {
                let req = http.request(this.options, res => {
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
        },
        connect() {
            if (this.options.auth) {
                this.options.headers['Authorization'] = this.options.auth;
            }
            return new Promise((resolve, reject) => {
                this.sendQuery('PING').then(resolve).catch(reject);
            });
        },
        question(invite = '> ') {
            let rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout,
            });
            let question = invite => {
                rl.question(invite, a => {
                    a = a.trim();
                    if (['exit', 'quit'].includes(a.toLowerCase())) {
                        rl.close();
                        return;
                    }
                    if (!a) {
                        question(invite);
                        return;
                    }
                    this.sendQuery(a).then(res => {
                        res = res.error || res.result;
                        if (typeof(res) == 'string') {
                            console.log(res);
                        } else {
                            console.log(JSON.stringify(res, null, 2));
                        }
                        question(invite);
                    }).catch(e => {
                        console.log(String(e));
                        rl.close();
                    });
                });
            };
            question(invite);
        },
    };
}

module.exports = createClient;
