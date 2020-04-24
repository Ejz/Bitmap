const http = require('http');
const bitmap = require('./bitmap');
const C = require('./constants');
const _ = require('./helpers');

function createServer(settings = {}) {
    settings.port = settings.port || C.SERVER_PORT;
    settings.host = settings.host || C.SERVER_HOST;
    let server = http.createServer((req, res) => {
        let {auth} = settings;
        res.setHeader('content-type', C.SERVER_CONTENT_TYPE);
        if (req.method != 'POST') {
            return res.end(JSON.stringify({error: C.SERVER_ERROR_INVALID_METHOD}));
        }
        if (req.headers['content-type'] != C.SERVER_CONTENT_TYPE) {
            return res.end(JSON.stringify({error: C.SERVER_ERROR_INVALID_CONTENT_TYPE}));
        }
        if (auth && req.headers['authorization'] != auth) {
            return res.end(JSON.stringify({error: C.SERVER_ERROR_INVALID_AUTHORIZATION}));
        }
        let body = [];
        req.on('data', chunk => body.push(chunk.toString()));
        req.on('end', () => {
            body = body.join('');
            let json;
            try {
                json = JSON.parse(body);
            } catch (e) {
                return res.end(JSON.stringify({error: C.SERVER_ERROR_INVALID_JSON}));
            }
            let isArray = _.isArray(json);
            json = isArray ? json : [json];
            if (json.filter(j => !_.isObject(j)).length || !json.length) {
                return res.end(JSON.stringify({error: C.SERVER_ERROR_INVALID_JSON}));
            }
            let results = [];
            for (let js of json) {
                if (!_.isString(js.query)) {
                    results.push({error: C.SERVER_ERROR_INVALID_QUERY, id: js.id});
                    continue;
                }
                let ret, key = 'result';
                try {
                    ret = bitmap.execute(js.query);
                } catch (e) {
                    key = 'error';
                    ret = e instanceof C.GenericError ? String(e) : C.SERVER_ERROR_INTERNAL;
                }
                results.push({[key]: ret, id: js.id});
            }
            results = isArray ? results : results[0];
            res.end(JSON.stringify(results));
        });
    });
    return {
        server,
        settings,
        listen() {
            this.server.listen(this.settings.port, this.settings.host);
        },
        close() {
            this.server.close();
        },
    };
}

module.exports = createServer;
