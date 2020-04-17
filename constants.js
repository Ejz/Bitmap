const os = require('os');

let DIRS = {
    ROOT_DIR: __dirname,
    HOME_DIR: os.homedir(),
    TMP_DIR: os.tmpdir(),
};

let SERVER = {
    SERVER_CONTENT_TYPE: 'application/json',
    SERVER_ERROR_INVALID_METHOD: 'SERVER_ERROR_INVALID_METHOD',
    SERVER_ERROR_INVALID_CONTENT_TYPE: 'SERVER_ERROR_INVALID_CONTENT_TYPE',
    SERVER_ERROR_INVALID_AUTHORIZATION: 'SERVER_ERROR_INVALID_AUTHORIZATION',
    SERVER_ERROR_INVALID_JSON: 'SERVER_ERROR_INVALID_JSON',
    SERVER_ERROR_INVALID_QUERY: 'SERVER_ERROR_INVALID_QUERY',
};

let TOKENIZER_ERROR = {
    TOKENIZER_ERROR_GENERIC: 'TOKENIZER_ERROR_GENERIC',
};

let COMMAND_PARSER_ERROR = {
    COMMAND_PARSER_ERROR_EXPECT_KW: 'COMMAND_PARSER_ERROR_EXPECT_KW',
    COMMAND_PARSER_ERROR_EXPECT_IDENT: 'COMMAND_PARSER_ERROR_EXPECT_IDENT',
    COMMAND_PARSER_ERROR_EXPECT_VALUE: 'COMMAND_PARSER_ERROR_EXPECT_VALUE',
    COMMAND_PARSER_ERROR_EXPECT_VALUES: 'COMMAND_PARSER_ERROR_EXPECT_VALUES',
    COMMAND_PARSER_ERROR_EXPECT_END: 'COMMAND_PARSER_ERROR_EXPECT_END',
    COMMAND_PARSER_ERROR_EXPECT_INTEGER: 'COMMAND_PARSER_ERROR_EXPECT_INTEGER',
    COMMAND_PARSER_ERROR_EXPECT_POSITIVE_INTEGER: 'COMMAND_PARSER_ERROR_EXPECT_POSITIVE_INTEGER',
    COMMAND_PARSER_ERROR_EXPECT_DATE: 'COMMAND_PARSER_ERROR_EXPECT_DATE',
    COMMAND_PARSER_ERROR_EXPECT_DATETIME: 'COMMAND_PARSER_ERROR_EXPECT_DATETIME',
    COMMAND_PARSER_ERROR_DUPLICATE_FIELDS: 'COMMAND_PARSER_ERROR_DUPLICATE_FIELDS',
    COMMAND_PARSER_ERROR_ID_IS_RESERVED: 'COMMAND_PARSER_ERROR_ID_IS_RESERVED',
    COMMAND_PARSER_ERROR_UNKNOWN_FIELD_TYPE: 'COMMAND_PARSER_ERROR_UNKNOWN_FIELD_TYPE',
    COMMAND_PARSER_ERROR_MIN_MAX: 'COMMAND_PARSER_ERROR_MIN_MAX',
    COMMAND_PARSER_ERROR_RENAME_TO_SAME_NAME: 'COMMAND_PARSER_ERROR_RENAME_TO_SAME_NAME',
};

let QUERY_PARSER_ERROR = {
    QUERY_PARSER_ERROR_STACK_IS_NOT_EMPTY: 'QUERY_PARSER_ERROR_STACK_IS_NOT_EMPTY',
    QUERY_PARSER_ERROR_INVALID_INPUT: 'QUERY_PARSER_ERROR_INVALID_INPUT',
};

let BITMAP = {
    BITMAP_OK: 'BITMAP_OK',
    BITMAP_ID: 'id',
    BITMAP_ERROR_UNKNOWN_COMMAND: 'BITMAP_ERROR_UNKNOWN_COMMAND',
    BITMAP_ERROR_INDEX_EXISTS: 'BITMAP_ERROR_INDEX_EXISTS',
    BITMAP_ERROR_INDEX_NOT_EXISTS: 'BITMAP_ERROR_INDEX_NOT_EXISTS',
    BITMAP_ERROR_ID_EXISTS: 'BITMAP_ERROR_ID_EXISTS',
    BITMAP_ERROR_FIELD_NOT_EXISTS: 'BITMAP_ERROR_FIELD_NOT_EXISTS',
    BITMAP_ERROR_OUT_OF_RANGE: 'BITMAP_ERROR_OUT_OF_RANGE',
    BITMAP_ERROR_EXPECT_INTEGER: 'BITMAP_ERROR_EXPECT_INTEGER',
    BITMAP_ERROR_EXPECT_DATE: 'BITMAP_ERROR_EXPECT_DATE',
    BITMAP_ERROR_EXPECT_DATETIME: 'BITMAP_ERROR_EXPECT_DATETIME',
    BITMAP_ERROR_EXPECT_POSITIVE_INTEGER: 'BITMAP_ERROR_EXPECT_POSITIVE_INTEGER',
};




    // COMMAND_PARSER_ERROR_EXPECT_NUMERIC: 'COMMAND_PARSER_ERROR_EXPECT_NUMERIC',
    // COMMAND_PARSER_ERROR_EXPECT_END: 'COMMAND_PARSER_ERROR_EXPECT_END',
    // COMMAND_PARSER_ERROR_EXPECT_POSITIVE_NUMERIC: 'COMMAND_PARSER_ERROR_EXPECT_POSITIVE_NUMERIC',
    // COMMAND_PARSER_ERROR_EXPECT_VALUE: 'COMMAND_PARSER_ERROR_EXPECT_VALUE',
    // COMMAND_PARSER_ERROR_EXPECT_CERTAIN_VALUE: 'COMMAND_PARSER_ERROR_EXPECT_CERTAIN_VALUE',
    // COMMAND_PARSER_ERROR_MIN_MAX: 'COMMAND_PARSER_ERROR_MIN_MAX',
    // COMMAND_PARSER_ERROR_DUPLICATE_FIELDS: 'COMMAND_PARSER_ERROR_DUPLICATE_FIELDS',
    // COMMAND_PARSER_ERROR_ID_IS_RESERVED: 'COMMAND_PARSER_ERROR_ID_IS_RESERVED',
    // COMMAND_PARSER_ERROR_UNKNOWN_FIELD_TYPE: 'COMMAND_PARSER_ERROR_UNKNOWN_FIELD_TYPE',
    // COMMAND_PARSER_ERROR_RENAME_TO_SAME_NAME: 'COMMAND_PARSER_ERROR_RENAME_TO_SAME_NAME',
    // COMMAND_PARSER_ERROR_EXPECT_DATE: 'COMMAND_PARSER_ERROR_EXPECT_DATE',
    // COMMAND_PARSER_ERROR_EXPECT_DATETIME: 'COMMAND_PARSER_ERROR_EXPECT_DATETIME',
    // COMMAND_PARSER_ERROR_EXPECT_SPECIAL: 'COMMAND_PARSER_ERROR_EXPECT_SPECIAL',
    // COMMAND_PARSER_ERROR_EXPECT_OPEN: 'COMMAND_PARSER_ERROR_EXPECT_OPEN',
    // COMMAND_PARSER_ERROR_EXPECT_CLOSE: 'COMMAND_PARSER_ERROR_EXPECT_CLOSE',


    // QUERY_PARSER_ERROR_BROKEN_PARENTHESES: 'QUERY_PARSER_ERROR_BROKEN_PARENTHESES',
    // QUERY_PARSER_ERROR_GENERAL: 'QUERY_PARSER_ERROR_GENERAL',

let TYPES = {
    INTEGER: 'INTEGER',
    DATE: 'DATE',
    DATETIME: 'DATETIME',
    STRING: 'STRING',
    BOOLEAN: 'BOOLEAN',
    ARRAY: 'ARRAY',
    FOREIGNKEY: 'FOREIGNKEY',
    FULLTEXT: 'FULLTEXT',
};

let ETC = {
    INTEGER_DEFAULT_MIN: 0,
    INTEGER_DEFAULT_MAX: (2 ** 32) - 1,
    IS_INTEGER: t => [TYPES.INTEGER, TYPES.DATE, TYPES.DATETIME].includes(t),
};

module.exports = {
    ...DIRS,
    ...SERVER,
    ...TOKENIZER_ERROR,
    ...COMMAND_PARSER_ERROR,
    ...QUERY_PARSER_ERROR,
    ...BITMAP,
    ...ETC,
    TYPES,
    E(e, context) {
        return typeof(e) == 'function' ? e(e, context) : String(e);
    },
};
