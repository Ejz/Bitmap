const fs = require('fs');
const path = require('path');
const jison = require('jison');

function clog() {
    console.log(1111111)
}

const queryGrammar = {
    lex: {
        rules: [
            ['([+-]\\s*)?[0-9]+\\b', 'return "INTEGER";'],
            ['\\s+', '/* */'],
            ['@[a-zA-Z_][a-zA-Z0-9_]*\\b', 'return "IDENT";'],
            ['\\*', 'return "*";'],
            ['\\|', 'return "|";'],
            ['\\(', 'return "(";'],
            ['\\)', 'return ")";'],
            // ['\\[', 'return "[";'],
            // ['\\]', 'return "]";'],
            ['&', 'return "&";'],
            ['-', 'return "-";'],
            [':', 'return ":";'],
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
            ['INTEGER', '$$ = $1'],
            ['[ INTEGER INTEGER ]', '$$ = [$2 $3]'],
            ['VALUE', '$$ = $1'],
            ['*', '$$ = $1'],
        ],
    },
};

const commandGrammar = {
    bnf: {
        command: [
            ['KW_CREATE IDENT KW_SCHEMA fields', 'return {action: $1, index: $2, fields: $4}'],
            ['KW_ADD IDENT INTEGER KW_FIELDS pairs', 'return {action: $1, index: $2, id: $3, values: $5}'],
            ['KW_DROP IDENT', 'return {action: $1, index: $2}'],
            ['KW_PING', 'return {action: $1}'],
            ['KW_SEARCH IDENT value limit', 'return {action: $1, index: $2, query: $3, limit: $4}'],
        ],
        pairs: [
            ['pairs pair', '$$ = $1.concat($2)'],
            ['pair', '$$ = [$1]'],
        ],
        pair: [
            ['IDENT value', '$$ = {field: $1, value: $2}'],
        ],
        value: [
            ['INTEGER', '$$ = $1'],
            ['IDENT', '$$ = $1'],
            ['VALUE', '$$ = $1'],
            ['KW_TRUE', '$$ = true'],
            ['KW_FALSE', '$$ = false'],
        ],
        fields: [
            ['fields field', '$$ = $1.concat($2)'],
            ['field', '$$ = [$1]'],
        ],
        field: [
            ['IDENT type', '$$ = {field: $1, ...$2}'],
        ],
        type: [
            ['KW_STRING', '$$ = {type: "STRING"}'],
            ['KW_ENUM ( enums )', '$$ = {type: "ENUM", enums: $3}'],
            ['KW_BOOLEAN', '$$ = {type: "BOOLEAN"}'],
            ['KW_INTEGER KW_MIN INTEGER KW_MAX INTEGER', '$$ = {type: "INTEGER", min: $3, max: $5}'],
        ],
        enums: [
            ['value', '$$ = [$1]'],
            ['enums value', '$$ = $1.concat($2)'],
        ],
        limit: [
            ['', ''],
            ['KW_LIMIT INTEGER', '$$ = $2'],
        ],
    },
};

const lexerKeywords = [
    'PING', 'CREATE', 'DROP', 'ADD', 'DELETE', 'FIELDS',
    'SCHEMA', 'SEARCH', 'LIMIT', 'ENUM',
    'STRING', 'INTEGER', 'MIN', 'MAX',
    'TRUE', 'FALSE', 'BOOLEAN',
];
const lexerIdentRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const lexerIntegerRegex = /^([+-]\s*)?\d+$/;

function RespLexer() {
    let text = [];
    this.yytext = '';
    this.yyloc = {
        first_column: 0,
        first_line: 1,
        last_line: 1,
        last_column: 0,
    };
    this.yylloc = this.yyloc;
    this.setInput = (t) => {
        text = t;
    };
    this.lex = () => {
        if (!text.length) {
            return;
        }
        let t = text[0];
        text = text.splice(1);
        this.yytext = t;
        if (lexerIntegerRegex.test(t)) {
            this.yytext = parseInt(t);
            return 'INTEGER';
        }
        if (lexerKeywords.includes(t.toUpperCase())) {
            this.yytext = t.toUpperCase();
            return 'KW_' + t.toUpperCase();
        }
        if (~['(', ')'].indexOf(t)) {
            return t;
        }
        if (lexerIdentRegex.test(t)) {
            this.yytext = t.toLowerCase();
            return 'IDENT';
        }
        return 'VALUE';
    };
}

class Command {
    constructor() {
        this.parser = null;
    }

    init() {
        this.parser = new jison.Parser(commandGrammar);
        this.parser.lexer = new RespLexer();
    }

    parse(string) {
        return this.parser.parse(string);
    }
}

class Query {
    constructor() {
        this.parser = null;
    }

    init() {
        this.parser = new jison.Parser(queryGrammar);
    }

    parse(string) {
        return this.parser.parse(string);
    }
}

module.exports = {Command, Query};
