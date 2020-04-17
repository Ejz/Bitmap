const http = require('http');
const bitmap = require('./bitmap');
const C = require('./constants');
const _ = require('./helpers');

function createServer(auth) {
    return http.createServer((req, res) => {
        res.setHeader('content-type', C.SERVER_CONTENT_TYPE);
        if (req.method != 'POST') {
            return res.end(JSON.stringify({error: C.SERVER_ERROR_INVALID_METHOD}));
        }
        if (req.headers['content-type'] != C.SERVER_CONTENT_TYPE) {
            return res.end(JSON.stringify({error: C.SERVER_ERROR_INVALID_CONTENT_TYPE}));
        }
        if (auth !== undefined && req.headers['authorization'] != auth) {
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
                let ret = bitmap.execute(js.query);
                let key = (_.isString(ret) && ret != C.BITMAP_OK) ? 'error' : 'result';
                results.push({[key]: ret, id: js.id});
            }
            results = isArray ? results : results[0];
            res.end(JSON.stringify(results));
        });
    });
}

module.exports = createServer;
