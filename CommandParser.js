const C = require('./constants');
const _ = require('./helpers');
const Tokenizer = require('./Tokenizer');

let TYPES = Object.entries(C.TYPES).map(([k, v]) => v);

let KW = [
    'PING', 'CREATE', 'DROP', 'LIST', 'ADD', 'STAT', 'RENAME',
    'INSERT', 'DELETE', 'DELETEALL', 'REID',
    'SEARCH', 'CURSOR',
    'TRUNCATE', 'ALIAS',
    'SHOWCREATE', 'SLOWQUERYLOG',
    'FIELDS', 'VALUES',
    'NOSTOPWORDS', 'PREFIXSEARCH',
    'MIN', 'MAX', 'PRECISION',
    'SEPARATOR',
    'REFERENCES',
    'SORTBY', 'LIMIT',
    'ASC', 'DESC',
    'UNDEFINED',
    'TIMEOUT', 'WITHCURSOR',
    'WITHFOREIGNKEYS',
    ...TYPES,
];

let ERROR_EXPECT = {
    KW: C.COMMAND_PARSER_ERROR_EXPECT_KW,
    IDENT: C.COMMAND_PARSER_ERROR_EXPECT_IDENT,
    VALUE: C.COMMAND_PARSER_ERROR_EXPECT_VALUE,
};

let rules = {
    KW: [
        new RegExp('^(' + KW.join('|') + ')(?:\\s+|$)', 'i'),
        m => m[1].toUpperCase(),
    ],
    IDENT: [
        /^("|)([a-zA-Z_][a-zA-Z0-9_]*)\1(?:\s+|$)/,
        m => m[2].toLowerCase(),
    ],
    INTEGER: [
        /^([+-]?\d+)(?:\s+|$)/i,
        m => _.toInteger(m[1]),
    ],
    DECIMAL: [
        /^([+-]?\d+\.\d+)(?:\s+|$)/i,
        m => _.toDecimal(m[1]),
    ],
    ENTER_QUOTE_MODE: [
        /^'/,
        function (m) {
            this.mode = 'QUOTE';
            return '';
        },
    ],
    EXIT_QUOTE_MODE: [
        /^'(?:\s+|$)/,
        function (m) {
            this.mode = undefined;
            return '';
        },
        'QUOTE',
    ],
    VALUE: [
        /^([^'\\]+|\\'|\\\\|\\)/,
        m => m[1],
        'QUOTE',
    ],
};

class CommandParser {
    constructor() {
        this.tokenizer = new Tokenizer(rules);
        this.integer2expect = {
           [C.TYPES.INTEGER]: this.expectInteger.bind(this),
           [C.TYPES.DECIMAL]: this.expectDecimal.bind(this),
           [C.TYPES.DATE]: this.expectDate.bind(this),
           [C.TYPES.DATETIME]: this.expectDateTime.bind(this),
       };
    }
    tokenize(string) {
        let tokens = this.tokenizer.tokenize(string);
        let value;
        tokens = tokens.filter(token => {
            switch (token.type) {
                case 'EXIT_QUOTE_MODE':
                    token.type = 'VALUE';
                    token.value = value.join('').replace(/\\('|\\)/g, '$1');
                    return true;
                case 'ENTER_QUOTE_MODE':
                    value = [];
                    return false;
                case 'VALUE':
                    value.push(token.value);
                    return false;
                case 'DECIMAL':
                case 'INTEGER':
                    token.type = 'VALUE';
                    token.value = String(token.value);
                    return true;
                case 'KW':
                    if (token.value == 'UNDEFINED') {
                        token.type = 'VALUE';
                        token.value = undefined;
                    }
                    return true;
                default:
                    return true;
            }
        });
        return tokens;
    }
    parse(tokens) {
        this.tokens = tokens;
        this.command = {};
        this.command.action = this.expectKw();
        switch (this.command.action) {
            case 'PING':
            case 'LIST':
                this.expectEnd();
                return this.command;
            case 'SLOWQUERYLOG':
                this.command.index = this.tryIdent();
                this.expectEnd();
                return this.command;
            case 'STAT':
                this.command.index = this.tryIdent();
                this.command.field = this.tryIdent();
                if (this.command.field && this.tryKw('LIMIT')) {
                    this.command.limit = this.expectPositiveInteger();
                }
                this.expectEnd();
                return this.command;
            case 'SHOWCREATE':
                this.command.index = this.expectIdent();
                this.expectEnd();
                return this.command;
            case 'INSERT':
            case 'ADD':
                this.command.index = this.expectIdent();
                this.command.id = this.expectPositiveInteger();
                this.command.values = Object.create(null);
                if (this.tryEnd()) {
                    return this.command;
                }
                this.expectKw('VALUES');
                while (true) {
                    let ident = this.tryIdent();
                    if (!ident) {
                        break;
                    }
                    if (this.command.values[ident]) {
                        throw new C.CommandParserError(C.COMMAND_PARSER_ERROR_DUPLICATE_FIELDS);
                    }
                    if (ident == C.BITMAP_ID) {
                        throw new C.CommandParserError(C.COMMAND_PARSER_ERROR_ID_IS_RESERVED);
                    }
                    let v = this.expectValue(true);
                    if (v !== undefined) {
                        this.command.values[ident] = v;
                    }
                }
                this.expectEnd();
                return this.command;
            case 'REID':
                this.command.index = this.expectIdent();
                this.command.id1 = this.expectPositiveInteger();
                this.command.id2 = this.expectPositiveInteger();
                this.expectEnd();
                return this.command;
            case 'DELETE':
                this.command.index = this.expectIdent();
                this.command.id = this.expectPositiveInteger();
                this.expectEnd();
                return this.command;
            case 'DELETEALL':
                this.command.index = this.expectIdent();
                this.command.query = this.expectValue();
                this.expectEnd();
                return this.command;
            case 'DROP':
            case 'TRUNCATE':
                this.command.index = this.expectIdent();
                this.expectEnd();
                return this.command;
            case 'CREATE':
                this.command.index = this.expectIdent();
                this.command.fields = Object.create(null);
                if (this.tryEnd()) {
                    return this.command;
                }
                this.expectKw('FIELDS');
                while (true) {
                    let ident = this.tryIdent();
                    if (!ident) {
                        break;
                    }
                    if (this.command.fields[ident]) {
                        throw new C.CommandParserError(C.COMMAND_PARSER_ERROR_DUPLICATE_FIELDS);
                    }
                    if (ident == C.BITMAP_ID) {
                        throw new C.CommandParserError(C.COMMAND_PARSER_ERROR_ID_IS_RESERVED);
                    }
                    let type = this.expectFieldType();
                    let field = {type};
                    if (C.IS_NUMERIC(field.type)) {
                        field.min = C.NUMERIC_MIN[field.type];
                        field.max = C.NUMERIC_MAX[field.type];
                        w: while (true) {
                            switch (this.tryKw('MIN', 'MAX')) {
                                case 'MIN':
                                    field.min = this.integer2expect[field.type]();
                                    break;
                                case 'MAX':
                                    field.max = this.integer2expect[field.type]();
                                    break;
                                case 'PRECISION':
                                    if (field.type != C.TYPES.DECIMAL) {
                                        let ctx = {field: ident, type: field.type};
                                        throw new C.CommandParserError(C.COMMAND_PARSER_ERROR_UNEXPECTED_PRECISION, ctx);
                                    }
                                    field.precision = this.expectPositiveInteger();
                                default:
                                    break w;
                            }
                        }
                        if (field.min > field.max) {
                            let ctx = {min: field.min, max: field.max, field: ident};
                            throw new C.CommandParserError(C.COMMAND_PARSER_ERROR_MIN_MAX, ctx);
                        }
                    } else if (field.type == C.TYPES.ARRAY) {
                        field.separator = ',';
                        if (this.tryKw('SEPARATOR')) {
                            field.separator = this.expectValue();
                        }
                    } else if (field.type == C.TYPES.FULLTEXT) {
                        w: while (true) {
                            switch (this.tryKw('NOSTOPWORDS', 'PREFIXSEARCH')) {
                                case 'NOSTOPWORDS':
                                    field.noStopwords = true;
                                    break;
                                case 'PREFIXSEARCH':
                                    field.prefixSearch = true;
                                    break;
                                default:
                                    break w;
                            }
                        }
                    } else if (field.type == C.TYPES.FOREIGNKEY) {
                        this.expectKw('REFERENCES');
                        field.references = this.expectIdent();
                    }
                    field.aliases = [];
                    while (this.tryKw('ALIAS')) {
                        field.aliases.push(this.expectIdent());
                    }
                    this.command.fields[ident] = field;
                }
                this.expectEnd();
                return this.command;
            case 'RENAME':
                this.command.index = this.expectIdent();
                this.command.name = this.expectIdent();
                if (this.command.index == this.command.name) {
                    throw new C.CommandParserError(C.COMMAND_PARSER_ERROR_RENAME_TO_SAME_NAME);
                }
                this.expectEnd();
                return this.command;
            case 'CURSOR':
                this.command.cursor = this.expectIdent();
                return this.command;
            case 'SEARCH':
                this.command.index = this.expectIdent();
                this.command.query = this.expectValue();
                this.command.limit = 1000;
                this.command.foreignKeys = [];
                w: while (true) {
                    switch (this.tryKw('SORTBY', 'LIMIT', 'WITHFOREIGNKEYS', 'WITHCURSOR')) {
                        case 'SORTBY':
                            this.command.sortby = this.expectIdent();
                            this.command.desc = this.tryKw('ASC', 'DESC') == 'DESC';
                            break;
                        case 'LIMIT':
                            this.command.limit = this.expectZeroPositiveInteger();
                            break;
                        case 'WITHCURSOR':
                            this.command.withCursor = C.CURSOR_TIMEOUT;
                            if (this.tryKw('TIMEOUT')) {
                                this.command.withCursor = this.expectPositiveInteger();
                            }
                            break;
                        case 'WITHFOREIGNKEYS':
                            while (true) {
                                let ident = this.tryIdent();
                                if (!ident) {
                                    break;
                                }
                                this.command.foreignKeys.push(ident);
                            }
                            break;
                        default:
                            break w;
                    }
                }
                if (this.command.withCursor && !this.command.limit) {
                    throw new C.CommandParserError(C.COMMAND_PARSER_ERROR_ZERO_LIMIT_WITH_CURSOR);
                }
                this.expectEnd();
                return this.command;
            default:
                return this.command;
        }
    }
    expect(type, ...values) {
        if (!this.tokens.length) {
            throw new C.CommandParserError(ERROR_EXPECT[type]);
        }
        let token = this.tokens.shift();
        if (token.type != type) {
            throw new C.CommandParserError(ERROR_EXPECT[type]);
        }
        if (!values.length || values.includes(token.value)) {
            return token.value;
        }
        throw new C.CommandParserError(COMMAND_PARSER_ERROR_EXPECT_VALUES);
    }
    expectKw(...values) {
        return this.expect('KW', ...values);
    }
    expectIdent() {
        return this.expect('IDENT');
    }
    expectValue(acceptUndefined = false) {
        let value = this.expect('VALUE');
        if (value === undefined && !acceptUndefined) {
            throw new C.CommandParserError(COMMAND_PARSER_ERROR_EXPECT_NOT_UNDEFINED_VALUE);
        }
        return value;
    }
    expectEnd() {
        if (this.tokens.length) {
            throw new C.CommandParserError(C.COMMAND_PARSER_ERROR_EXPECT_END);
        }
    }
    expectInteger() {
        let value = this.expectValue();
        value = _.toInteger(value);
        if (value === undefined) {
            throw new C.CommandParserError(C.COMMAND_PARSER_ERROR_EXPECT_INTEGER);
        }
        return value;
    }
    expectPositiveInteger() {
        let integer = this.expectInteger();
        if (integer < 1) {
            throw new C.CommandParserError(C.COMMAND_PARSER_ERROR_EXPECT_POSITIVE_INTEGER);
        }
        return integer;
    }
    expectZeroPositiveInteger() {
        let integer = this.expectInteger();
        if (integer < 0) {
            throw new C.CommandParserError(C.COMMAND_PARSER_ERROR_EXPECT_ZERO_POSITIVE_INTEGER);
        }
        return integer;
    }
    expectDate() {
        let value = this.expectValue();
        value = _.toDateInteger(value);
        if (value === undefined) {
            throw new C.CommandParserError(C.COMMAND_PARSER_ERROR_EXPECT_DATE);
        }
        return value;
    }
    expectDateTime() {
        let value = this.expectValue();
        value = _.toDateTimeInteger(value);
        if (value === undefined) {
            throw new C.CommandParserError(C.COMMAND_PARSER_ERROR_EXPECT_DATETIME);
        }
        return value;
    }
    expectDecimal() {
        let value = this.expectValue();
        value = _.toDecimal(value);
        if (value === undefined) {
            throw new C.CommandParserError(C.COMMAND_PARSER_ERROR_EXPECT_DECIMAL);
        }
        return value;
    }
    expectFieldType() {
        let kw = this.expectKw();
        if (!TYPES.includes(kw)) {
            throw new C.CommandParserError(C.COMMAND_PARSER_ERROR_UNKNOWN_FIELD_TYPE);
        }
        return kw;
    }
    try(type, ...values) {
        if (!this.tokens.length) {
            return undefined;
        }
        let token = this.tokens[0];
        if (token.type != type) {
            return undefined;
        }
        if (!values.length || values.includes(token.value)) {
            this.tokens.shift();
            return token.value;
        }
        return undefined;
    }
    tryKw(...values) {
        return this.try('KW', ...values);
    }
    tryIdent() {
        return this.try('IDENT');
    }
    tryEnd() {
        return !this.tokens.length;
    }
}

module.exports = CommandParser;
