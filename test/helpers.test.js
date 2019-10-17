const helpers = require('../helpers');

const CRLF = '\r\n';

test('to_rsp simple string', () => {
    let res = helpers.to_resp('hello');
    expect(res).toBe('+hello' + CRLF);
});

test('to_rsp error object', () => {
    let res = helpers.to_resp(new Error('foo'));
    expect(res).toBe('-foo' + CRLF);
});

test('from_rsp simple string', async () => {
    let fgets = () => Promise.resolve('+hello' + CRLF);
    let res = await helpers.from_resp(fgets);
    expect(res).toBe('hello');
});
