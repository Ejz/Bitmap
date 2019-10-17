const server = require('../server');
const Client = require('../client');

test('server - errors', async () => {
    let port = 2000 + Math.round(1000 * Math.random());
    server.listen(port);
    let client = new Client(port);
    let msg;
    try {
        await client.send([]);
    } catch (e) {
        msg = e.message;
    }
    expect(msg).toContain('Syntax error');
    client.end();
    await new Promise((resolve, reject) => {
        setTimeout(() => {
            server.close();
            resolve();
        }, 1000);
    });
});

test('server - ping', async () => {
    let port = 2000 + Math.round(1000 * Math.random());
    server.listen(port);
    let client = new Client(port);
    let res = await client.send(['PING']);
    expect(res).toBe('PONG');
    res = await client.send(['PING']);
    expect(res).toBe('PONG');
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
    let res = await client.send(`
        create index schema f1 string
    `.split(/\s+/).filter(Boolean));
    expect(res).toBe('CREATED');
    try {
        res = await client.send(`
            create index schema f1 string
        `.split(/\s+/).filter(Boolean));
    } catch (e) {
        res = e.message;
    }
    expect(res).toContain('Index ALREADY exists');
    res = await client.send(`
        drop index
    `.split(/\s+/).filter(Boolean));
    expect(res).toBe('DROPPED');
    client.end();
    await new Promise((resolve, reject) => {
        setTimeout(() => {
            server.close();
            resolve();
        }, 1000);
    });
});
