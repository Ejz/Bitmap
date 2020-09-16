#!/usr/bin/env node

var createServer = require('../server');

process.on('uncaughtException', e => console.log('uncaughtException:', String(e)));
process.on('unhandledRejection', e => console.log('unhandledRejection:', String(e)));

var argv = process.argv.slice(2);
var port = argv[0] || process.env.BITMAP_PORT || 61000;
var host = argv[1] || process.env.BITMAP_HOST || '127.0.0.1';

createServer({port, host}).listen(() => {
    console.log(`Running .. port=${port} host=${host}`);
});
