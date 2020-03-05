const helpers = require('../helpers');
const server = require('../server');
const Client = require('../client');
const C = require('../constants');
const sprintf = require('util').format;

const to = helpers.to;

test('server - ping', async () => {
    let res, err;
    let port = 2000 + Math.round(1000 * Math.random());
    server.listen(port);
    let client = new Client(port);
    [res, err] = await to(client.send([]));
    expect(res).toBe(null);
    expect(err).toMatch(C.INVALID_ACTION_ERROR);
    [res, err] = await to(client.send(['PING']));
    expect(res).toMatch(C.PING_SUCCESS);
    expect(err).toBe(null);
    client.end();
    await new Promise((resolve, reject) => {
        setTimeout(() => {
            server.close();
            resolve();
        }, 1000);
    });
});

test('server - index', async () => {
    let port = 2000 + Math.round(1000 * Math.random());
    server.listen(port);
    let client = new Client(port);
    let res, err;
    let _ = _ => _.split(/\s+/).filter(Boolean);
    [res] = await to(client.send(_('create index1')));
    expect(res).toBe(C.CREATE_SUCCESS);
    [, err] = await to(client.send(_('create index1')));
    expect(err).toBe(sprintf(C.INDEX_EXISTS_ERROR, 'index1'));
    [, err] = await to(client.send(_('drop index2')));
    expect(err).toBe(sprintf(C.INDEX_NOT_EXISTS_ERROR, 'index2'));
    [res] = await to(client.send(_('drop index1')));
    expect(res).toBe(C.DROP_SUCCESS);
    client.end();
    await new Promise((resolve, reject) => {
        setTimeout(() => {
            server.close();
            resolve();
        }, 1000);
    });
});

test('server - utf8', async () => {
    let port = 2000 + Math.round(1000 * Math.random());
    server.listen(port);
    let client = new Client(port);
    let res, err;
    let _ = _ => _.split(/\s+/).filter(Boolean);
    [res, err] = await to(client.send(_('create index1 fields f string')));
    expect(res).toBe(C.CREATE_SUCCESS);
    [res, err] = await to(client.send(_('add index1 1 values f hello')));
    expect(res).toBe(C.ADD_SUCCESS);
    [res, err] = await to(client.send(_('add index1 2 values f TM™')));
    expect(res).toBe(C.ADD_SUCCESS);
    [res, err] = await to(client.send(_('add index1 3 values f \x00')));
    expect(res).toBe(C.ADD_SUCCESS);
    [res] = await to(client.send(_('drop index1')));
    expect(res).toBe(C.DROP_SUCCESS);
    client.end();
    await new Promise((resolve, reject) => {
        setTimeout(() => {
            server.close();
            resolve();
        }, 1000);
    });
});
