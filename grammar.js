const fs = require('fs');
const path = require('path');
const jison = require('jison');

const queryGrammar = {
    bnf: {
        query: [
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
        ],
        fields: [
            ['fields field', '$$ = $1.concat($2)'],
            ['field', '$$ = [$1]'],
        ],
        field: [
            ['IDENT type', '$$ = {field: $1, type: $2}'],
        ],
        type: [
            ['KW_STRING', '$$ = $1'],
        ],
    },
};

const lexerKeywords = [
    'PING', 'CREATE', 'DROP', 'ADD', 'DELETE', 'FIELDS', 'STRING',
    'SCHEMA',
];
const lexerIdentRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const lexerIntegerRegex = /^\d+$/;

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
            console.log('INTEGER');
            return 'INTEGER';
        }
        if (lexerKeywords.includes(t.toUpperCase())) {
            this.yytext = t.toUpperCase();
            console.log('KW_' + t.toUpperCase());
            return 'KW_' + t.toUpperCase();
        }
        if (lexerIdentRegex.test(t)) {
            this.yytext = t.toLowerCase();
            console.log('IDENT')
            return 'IDENT';
        }
        return 'INVALID';
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
