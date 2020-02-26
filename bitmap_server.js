#!/usr/bin/env node

const server = require("./server");
const argv = process.argv.slice(2);

process.on('uncaughtException', console.log);
server.listen(61000);
