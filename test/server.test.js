const http = require('http');
const createServer = require('../server');
const C = require('../constants');

let options = {
    hostname: 'localhost',
    path: '/',
    method: 'POST',
    headers: {
        'Content-Type': C.SERVER_CONTENT_TYPE,
    },
};

let sendRequest = async (body, opts = {}) => {
    return new Promise((resolve, reject) => {
        let o = JSON.parse(JSON.stringify(options));
        o.method = opts.method || o.method;
        o.headers['Content-Type'] = opts.contentType || o.headers['Content-Type'];
        if (opts.authorization) {
            o.headers['Authorization'] = opts.authorization;
        }
        let req = http.request(o, res => {
            let body = [];
            res.setEncoding('utf8');
            res.on('data', chunk => body.push(chunk.toString()));
            res.on('end', () => {
                resolve(JSON.parse(body.join('')));
            });
        });
        req.on('error', reject);
        req.write(typeof(body) == 'string' ? body : JSON.stringify(body));
        req.end();
    });
};

test('server / errors', async () => {
    let res, port = 2000 + Math.round(1000 * Math.random());
    let server = createServer({port, auth: 'foo'});
    server.listen();
    options.port = port;
    res = await sendRequest('', {method: 'GET'});
    expect(res.error).toEqual(C.SERVER_ERROR_INVALID_METHOD);
    res = await sendRequest('', {contentType: 'application/javascript'});
    expect(res.error).toEqual(C.SERVER_ERROR_INVALID_CONTENT_TYPE);
    res = await sendRequest('', {authorization: 'bar'});
    expect(res.error).toEqual(C.SERVER_ERROR_INVALID_AUTHORIZATION);
    res = await sendRequest('');
    expect(res.error).toEqual(C.SERVER_ERROR_INVALID_AUTHORIZATION);
    res = await sendRequest('', {authorization: 'foo'});
    expect(res.error).toEqual(C.SERVER_ERROR_INVALID_JSON);
    res = await sendRequest('""', {authorization: 'foo'});
    expect(res.error).toEqual(C.SERVER_ERROR_INVALID_JSON);
    res = await sendRequest('[""]', {authorization: 'foo'});
    expect(res.error).toEqual(C.SERVER_ERROR_INVALID_JSON);
    res = await sendRequest('[]', {authorization: 'foo'});
    expect(res.error).toEqual(C.SERVER_ERROR_INVALID_JSON);
    res = await sendRequest('{"q":1}', {authorization: 'foo'});
    expect(res.error).toEqual(C.SERVER_ERROR_INVALID_QUERY);
    res = await sendRequest('{"query":1}', {authorization: 'foo'});
    expect(res.error).toEqual(C.SERVER_ERROR_INVALID_QUERY);
    await new Promise((resolve, reject) => {
        setTimeout(() => {
            server.close();
            resolve();
        }, 1000);
    });
});

test('server / id', async () => {
    let res, port = 2000 + Math.round(1000 * Math.random());
    let server = createServer({port});
    server.listen();
    options.port = port;
    res = await sendRequest('{"query":"PING"}');
    expect(res.result).toEqual(C.BITMAP_OK);
    res = await sendRequest('{"query":"!"}');
    expect(!!res.error).toEqual(true);
    expect('id' in res).toEqual(false);
    res = await sendRequest('{"query": "PING","id":1}');
    expect(res.id).toEqual(1);
    res = await sendRequest('{"query": "PING","id":"1"}');
    expect(res.id).toEqual('1');
    await new Promise((resolve, reject) => {
        setTimeout(() => {
            server.close();
            resolve();
        }, 1000);
    });
});

test('server / batch', async () => {
    let res, port = 2000 + Math.round(1000 * Math.random());
    let server = createServer({port});
    server.listen();
    options.port = port;
    res = await sendRequest('[{"query":"PING"},{"query":"a"}]');
    expect(res[0].result).toEqual(C.BITMAP_OK);
    expect(res[1].error).toMatch(/CommandParserError/);
    res = await sendRequest('[{"query":"PING","id":null},{"query":"a"}]');
    expect(res[0].result).toEqual(C.BITMAP_OK);
    expect(res[0].id).toEqual(null);
    expect(res[1].error).toMatch(/CommandParserError/);
    expect(res[1].id).toEqual(undefined);
    expect('id' in res[1]).toEqual(false);
    res = await sendRequest('[{"query":"!","id":{"a":"b"}}]');
    expect(res[0].id).toEqual({a: 'b'});
    await new Promise((resolve, reject) => {
        setTimeout(() => {
            server.close();
            resolve();
        }, 1000);
    });
});
