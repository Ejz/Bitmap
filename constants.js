const os = require('os');

let DIRS = {
    ROOT_DIR: __dirname,
    HOME_DIR: os.homedir(),
    TMP_DIR: os.tmpdir(),
};

let SERVER = {
    SERVER_PORT: 61000,
    SERVER_HOST: '127.0.0.1',
    SERVER_CONTENT_TYPE: 'application/json',
    SERVER_ERROR_INVALID_METHOD: 'SERVER_ERROR_INVALID_METHOD',
    SERVER_ERROR_INVALID_CONTENT_TYPE: 'SERVER_ERROR_INVALID_CONTENT_TYPE',
    SERVER_ERROR_INVALID_AUTHORIZATION: 'SERVER_ERROR_INVALID_AUTHORIZATION',
    SERVER_ERROR_INVALID_JSON: 'SERVER_ERROR_INVALID_JSON',
    SERVER_ERROR_INVALID_QUERY: 'SERVER_ERROR_INVALID_QUERY',
    SERVER_ERROR_INTERNAL: 'SERVER_ERROR_INTERNAL',
};

function TOKENIZER_ERROR_GENERIC({string}) {
    return '-> ' + string;
}

let TOKENIZER_ERROR = {
    TOKENIZER_ERROR_GENERIC,
};

function COMMAND_PARSER_ERROR_MIN_MAX({min, max, field}) {
    return 'minimum (' + min + ') > maximum (' + max + ') for field "' + field + '"';
}

function COMMAND_PARSER_ERROR_UNEXPECTED_PRECISION({field, type}) {
    return 'For field "' + field + '" of type "' + type + '" unexpected token \'PRECISION\'';
}

let COMMAND_PARSER_ERROR = {
    COMMAND_PARSER_ERROR_EXPECT_KW: 'COMMAND_PARSER_ERROR_EXPECT_KW',
    COMMAND_PARSER_ERROR_EXPECT_IDENT: 'COMMAND_PARSER_ERROR_EXPECT_IDENT',
    COMMAND_PARSER_ERROR_EXPECT_VALUE: 'COMMAND_PARSER_ERROR_EXPECT_VALUE',
    COMMAND_PARSER_ERROR_EXPECT_VALUES: 'COMMAND_PARSER_ERROR_EXPECT_VALUES',
    COMMAND_PARSER_ERROR_EXPECT_END: 'COMMAND_PARSER_ERROR_EXPECT_END',
    COMMAND_PARSER_ERROR_EXPECT_INTEGER: 'COMMAND_PARSER_ERROR_EXPECT_INTEGER',
    COMMAND_PARSER_ERROR_EXPECT_POSITIVE_INTEGER: 'COMMAND_PARSER_ERROR_EXPECT_POSITIVE_INTEGER',
    COMMAND_PARSER_ERROR_EXPECT_ZERO_POSITIVE_INTEGER: 'COMMAND_PARSER_ERROR_EXPECT_ZERO_POSITIVE_INTEGER',
    COMMAND_PARSER_ERROR_EXPECT_DATE: 'COMMAND_PARSER_ERROR_EXPECT_DATE',
    COMMAND_PARSER_ERROR_EXPECT_DATETIME: 'COMMAND_PARSER_ERROR_EXPECT_DATETIME',
    COMMAND_PARSER_ERROR_EXPECT_DECIMAL: 'COMMAND_PARSER_ERROR_EXPECT_DECIMAL',
    COMMAND_PARSER_ERROR_DUPLICATE_FIELDS: 'COMMAND_PARSER_ERROR_DUPLICATE_FIELDS',
    COMMAND_PARSER_ERROR_ID_IS_RESERVED: 'COMMAND_PARSER_ERROR_ID_IS_RESERVED',
    COMMAND_PARSER_ERROR_UNKNOWN_FIELD_TYPE: 'COMMAND_PARSER_ERROR_UNKNOWN_FIELD_TYPE',
    COMMAND_PARSER_ERROR_MIN_MAX,
    COMMAND_PARSER_ERROR_RENAME_TO_SAME_NAME: 'COMMAND_PARSER_ERROR_RENAME_TO_SAME_NAME',
    COMMAND_PARSER_ERROR_EXPECTED_SOME_FOREIGN_KEYS: 'COMMAND_PARSER_ERROR_EXPECTED_SOME_FOREIGN_KEYS',
    COMMAND_PARSER_ERROR_EXPECT_NOT_UNDEFINED_VALUE: 'COMMAND_PARSER_ERROR_EXPECT_NOT_UNDEFINED_VALUE',
    COMMAND_PARSER_ERROR_ZERO_LIMIT_WITH_CURSOR: 'COMMAND_PARSER_ERROR_ZERO_LIMIT_WITH_CURSOR',
};

let QUERY_PARSER_ERROR = {
    QUERY_PARSER_ERROR_STACK_IS_NOT_EMPTY: 'QUERY_PARSER_ERROR_STACK_IS_NOT_EMPTY',
    QUERY_PARSER_ERROR_INVALID_INPUT: 'QUERY_PARSER_ERROR_INVALID_INPUT',
};

function BITMAP_ERROR_OUT_OF_RANGE({value, min, max, field}) {
    return '\'' + value + '\' for field "' + field + '" is out of range (MIN = ' + min + ', MAX = ' + max +')';
}

function BITMAP_ERROR_EXPECT_INTEGER({value, field}) {
    return 'Invalid \'' + value + '\' for field "' + field + '"';
}

function BITMAP_ERROR_INVALID_FOREIGN_KEY_ID({value, references}) {
    return '\'' + value + '\' for index "' + references + '" is invalid';
}

function BITMAP_ERROR_INDEX_EXISTS({index}) {
    return 'Index "' + index + '" already exists';
}

function BITMAP_ERROR_INDEX_NOT_EXISTS({index}) {
    return 'Index "' + index + '" does not exist';
}

function BITMAP_ERROR_ID_NOT_EXISTS({index, id}) {
    return 'ID ' + id + ' for index "' + index + '" does not exist';
}

function BITMAP_ERROR_MULTIPLE_FOREIGN_KEYS({index, references}) {
    return `Index "${index}" has multiple REFERENCES "${references}"`;
}

function BITMAP_ERROR_RESERVED_NAME({name}) {
    return `Name "${name}" is reserved`;
}

function BITMAP_ERROR_AMBIGUOUS_REFERENCE() {
    return 'BITMAP_ERROR_AMBIGUOUS_REFERENCE';
}

let BITMAP = {
    BITMAP_OK: 'OK',
    BITMAP_QUEUED: 'QUEUED',
    BITMAP_ID: 'id',
    BITMAP_ERROR_UNKNOWN_COMMAND: 'BITMAP_ERROR_UNKNOWN_COMMAND',
    BITMAP_ERROR_INDEX_EXISTS,
    BITMAP_ERROR_INDEX_NOT_EXISTS,
    BITMAP_ERROR_ID_EXISTS: 'BITMAP_ERROR_ID_EXISTS',
    BITMAP_ERROR_FIELD_NOT_EXISTS: 'BITMAP_ERROR_FIELD_NOT_EXISTS',
    BITMAP_ERROR_OUT_OF_RANGE,
    BITMAP_ERROR_EXPECT_INTEGER,
    BITMAP_ERROR_EXPECT_DATE: 'BITMAP_ERROR_EXPECT_DATE',
    BITMAP_ERROR_EXPECT_DATETIME: 'BITMAP_ERROR_EXPECT_DATETIME',
    BITMAP_ERROR_EXPECT_DECIMAL: 'BITMAP_ERROR_EXPECT_DECIMAL',
    BITMAP_ERROR_EXPECT_POSITIVE_INTEGER: 'BITMAP_ERROR_EXPECT_POSITIVE_INTEGER',
    BITMAP_ERROR_MULTIPLE_FOREIGN_KEYS,
    BITMAP_ERROR_INVALID_FOREIGN_KEY_ID,
    BITMAP_ERROR_FIELD_NOT_SORTABLE: 'BITMAP_ERROR_FIELD_NOT_SORTABLE',
    BITMAP_ERROR_FIELD_NOT_FOREIGN_KEY: 'BITMAP_ERROR_FIELD_NOT_FOREIGN_KEY',
    BITMAP_ERROR_STAT_ON_INTEGER_TYPE: 'BITMAP_ERROR_STAT_ON_INTEGER_TYPE',
    BITMAP_ERROR_AMBIGUOUS_REFERENCE: 'BITMAP_ERROR_AMBIGUOUS_REFERENCE',
};

let TYPES = {
    INTEGER: 'INTEGER',
    DECIMAL: 'DECIMAL',
    DATE: 'DATE',
    DATETIME: 'DATETIME',
    STRING: 'STRING',
    BOOLEAN: 'BOOLEAN',
    ARRAY: 'ARRAY',
    FOREIGNKEY: 'FOREIGNKEY',
    FULLTEXT: 'FULLTEXT',
};

let ETC = {
    NUMERIC_MIN: {
        [TYPES.INTEGER]: 0,
        [TYPES.DATE]: 0,
        [TYPES.DATETIME]: 0,
        [TYPES.DECIMAL]: 0,
    },
    NUMERIC_MAX: {
        [TYPES.INTEGER]: (2 ** 32) - 1,
        [TYPES.DATE]: Math.floor(((2 ** 32) - 1) / (3600 * 24)),
        [TYPES.DATETIME]: (2 ** 32) - 1,
        [TYPES.DECIMAL]: 2 ** 16 - 1,
    },
    CURSOR_TIMEOUT: 60,
    IS_NUMERIC: t => [TYPES.INTEGER, TYPES.DATE, TYPES.DATETIME, TYPES.DECIMAL].includes(t),
};

class GenericError extends Error {
    constructor(message, ...args) {
        if (typeof(message) == 'function') {
            message = message(...args);
        }
        super(message);
        this.name = this.constructor.name;
    }
}

class TokenizerError extends GenericError {
}

class CommandParserError extends GenericError {
}

class QueryParserError extends GenericError {
}

class BitmapError extends GenericError {
}

module.exports = {
    ...DIRS,
    ...SERVER,
    ...TOKENIZER_ERROR,
    ...COMMAND_PARSER_ERROR,
    ...QUERY_PARSER_ERROR,
    ...BITMAP,
    ...ETC,
    TYPES,
    GenericError,
    TokenizerError,
    CommandParserError,
    QueryParserError,
    BitmapError,
};
