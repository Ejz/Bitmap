const fs = require('fs');
const path = require('path');
const jison = require('jison');
const helpers = require('./helpers');

const md5 = helpers.md5;

const grammar = {
    lex: {
        rules: [
            ['([+-]\\s*)?[0-9]+\\b', 'return "INTEGER";'],
            ['\\s+', '/* */'],
            ['[Mm][Ii][Nn]\\b', 'return "KW_MIN";'],
            ['[Mm][Aa][Xx]\\b', 'return "KW_MAX";'],
            ['@@[a-zA-Z_][a-zA-Z0-9_]*\\b', 'return "EXTERNAL";'],
            ['@[a-zA-Z_][a-zA-Z0-9_]*\\b', 'return "IDENT";'],
            ['\\*', 'return "*";'],
            ['\\|', 'return "|";'],
            ['\\(', 'return "(";'],
            ['\\)', 'return ")";'],
            ['\\[', 'return "[";'],
            ['\\]', 'return "]";'],
            ['&', 'return "&";'],
            ['-', 'return "-";'],
            [':', 'return ":";'],
            [',', 'return ",";'],
            ['[a-zA-Z0-9_\\.]+', 'return "VALUE";'],
            ['$', 'return "EOF";'],
        ],
    },
    operators: [
        ['left', '|'],
        ['left', '&'],
        ['left', '-'],
    ],
    bnf: {
        expressions: [
            ['e EOF', 'return $1'],
        ],
        e: [
            ['( e )', '$$ = $2'],
            ['IDENT : values', '$$ = {field: $1.substring(1).toLowerCase(), values: $3}'],
            ['EXTERNAL : values', '$$ = {external: $1.substring(1).toLowerCase(), values: $3}'],
            ['values', '$$ = {values: $1}'],
            ['e & e', '$$ = {op: $2, queries: [$1, $3]}'],
            ['e e', '$$ = {op: "&", queries: [$1, $2]}'],
            ['e | e', '$$ = {op: $2, queries: [$1, $3]}'],
            ['- e', '$$ = {op: $1, queries: [$2]}'],
        ],
        values: [
            ['value', '$$ = [$1]'],
            ['( _values )', '$$ = $2'],
        ],
        _values: [
            ['_values | value', '$$ = $1.concat($3)'],
            ['value', '$$ = [$1]'],
        ],
        value: [
            ['( value )', '$$ = $2'],
            ['INTEGER', '$$ = parseInt($1)'],
            ['VALUE', '$$ = $1'],
            ['*', '$$ = $1'],
            ['KW_MIN', '$$ = "MIN"'],
            ['KW_MAX', '$$ = "MAX"'],
            ['[ INTEGER , INTEGER ]', '$$ = [parseInt($2), parseInt($4)]'],
            ['[ INTEGER , KW_MAX ]', '$$ = [parseInt($2), "MAX"]'],
            ['[ INTEGER , KW_MIN ]', '$$ = [parseInt($2), "MIN"]'],
            ['[ KW_MIN , INTEGER ]', '$$ = ["MIN", parseInt($4)]'],
            ['[ KW_MAX , INTEGER ]', '$$ = ["MAX", parseInt($4)]'],
            ['[ KW_MIN , KW_MAX ]', '$$ = ["MIN", "MAX"]'],
            ['[ KW_MAX , KW_MIN ]', '$$ = ["MAX", "MIN"]'],
        ],
    },
};

class Grammar {
    constructor() {
        let hash = md5(JSON.stringify(grammar));
        let target = path.resolve(__dirname + '/tmp', hash + '.js');
        if (!fs.existsSync(target)) {
            let parser = new jison.Parser(grammar);
            fs.writeFileSync(target, parser.generate());
        }
        this.parser = require(target);
        this.strings = [];
        this.actions = /^[A-Z]*$/;
        this.types = ['STRING', 'INTEGER', 'FULLTEXT'];
        this.idents = /^[a-z_][a-z0-9_]*$/;
        this.getIdent = () => {
            let string = this.getValue();
            string = string.toLowerCase();
            if (!this.idents.test(string)) {
                throw 'Invalid identifier: ' + string;
            }
            return string;
        };
        this.getInteger = () => {
            let string = this.getValue();
            let integer = Number(string);
            let [min, max] = [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER];
            if (min <= integer && integer <= max) {
                return integer;
            }
            throw 'Invalid INTEGER: ' + string;
        };
        this.getPositiveInteger = () => {
            let integer = this.getInteger();
            if (integer > 0) {
                return integer;
            }
            throw 'Non-positive integer values';
        };
        this.getPositiveOrZeroInteger = () => {
            let integer = this.getInteger();
            if (integer >= 0) {
                return integer;
            }
            throw 'Negative integer values';
        };
        this.getType = () => {
            let string = this.getValue();
            string = string.toUpperCase();
            if (!this.types.includes(string)) {
                throw 'Invalid type: ' + string;
            }
            return string;
        };
        this.getValues = (n) => {
            let values = [];
            if (this.strings.length < n) {
                throw 'Unexpected END!';
            }
            for (let i = 0; i < n; i++) {
                values.push(String(this.strings.shift()));
            }
            return values;
        };
        this.getValue = () => {
            return this.getValues(1)[0];
        };
    }

    getAction() {
        let string = this.getValue();
        string = string.toUpperCase();
        if (!this.actions.test(string)) {
            throw 'Invalid action: ' + string;
        }
        return string;
    }

    tryKeyword(kw) {
        if (this.strings.length && String(this.strings[0]).toUpperCase() == kw) {
            this.strings.shift();
            return true;
        }
        return false;
    }

    expectKeyword(kw) {
        let value = this.getValue();
        if (value.toUpperCase() != kw) {
            throw 'Unexpected keyword: ' + value;
        }
    }

    parse(strings) {
        let command = {};
        let pos = 0;
        if (typeof(strings) === 'string') {
            strings = strings.split(/\s+/).filter(Boolean);
        }
        this.strings = strings;
        while (this.strings.length) {
            if (!command.action) {
                command.action = this.getAction();
                continue;
            }
            if (command.action == 'PING') {
                throw 'PING: Invalid arguments';
            }
            if (!command.index) {
                command.index = this.getIdent();
                continue;
            }
            if (command.action == 'DROP') {
                throw 'DROP: Invalid arguments';
            }
            if (command.action == 'CREATE') {
                command.fields = [];
                this.expectKeyword('FIELDS');
                while (this.strings.length) {
                    let field = {field: this.getIdent(), type: this.getType()};
                    if (field.type === 'INTEGER') {
                        this.expectKeyword('MIN');
                        field.min = this.getInteger();
                        this.expectKeyword('MAX');
                        field.max = this.getInteger();
                    }
                    command.fields.push(field);
                }
                if (!command.fields.length) {
                    throw 'No Fields Mentioned!';
                }
                continue;
            }
            if (command.action == 'ADD' && !command.id) {
                command.id = this.getPositiveInteger();
                continue;
            }
            if (command.action == 'ADD') {
                command.values = [];
                this.expectKeyword('VALUES');
                while (this.strings.length) {
                    let value = {field: this.getIdent(), value: this.getValue()};
                    command.values.push(value);
                }
                if (!command.values.length) {
                    throw 'No Values Mentioned!';
                }
                continue;
            }
            if (command.action == 'SEARCH' && !command.limit) {
                command.query = this.getValue();
                command.query = this.parseQuery(command.query);
                command.limit = [0, 100];
                if (this.tryKeyword('LIMIT')) {
                    let [off, lim] = [0, this.getPositiveOrZeroInteger()];
                    if (this.strings.length) {
                        [off, lim] = [lim, this.getPositiveOrZeroInteger()];
                    }
                    command.limit = [off, lim];
                } else if (this.tryKeyword('CURSOR')) {
                    let lim = this.getPositiveInteger();
                    command.limit = ['CURSOR', lim];
                }
                continue;
            }
            throw 'Syntax error!';
        }
        return command;
    }

    parseQuery(string) {
        return this.parser.parse(string);
    }
}

module.exports = Grammar;
