#!/usr/bin/env node

var createClient = require('../client');

process.on('uncaughtException', e => console.log('uncaughtException:', String(e)));
process.on('unhandledRejection', e => console.log('unhandledRejection:', String(e)));

var argv = process.argv.slice(2);
var port = argv[0] || process.env.BITMAP_PORT || 61000;
var host = argv[1] || process.env.BITMAP_HOST || '127.0.0.1';

var client = createClient({port, host});

client.connect().then(res => {
    client.question();
}).catch(res => {
    console.log(String(res));
});
