#!/usr/bin/env node

const server = require("./server");
const argv = process.argv.slice(2);

server.listen(61000);
