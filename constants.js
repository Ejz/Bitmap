const ERR_PREFIX = 'ERR: ';
const INTERNAL_ERROR = ERR_PREFIX + 'INTERNAL_ERROR';
const INVALID_INPUT = ERR_PREFIX + 'INVALID_INPUT';
const INVALID_ACTION_ERROR = ERR_PREFIX + 'INVALID_ACTION_ERROR';
const CONNECTION_ERROR = ERR_PREFIX + 'CONNECTION_ERROR';
const INDEX_EXISTS_ERROR = ERR_PREFIX + 'INDEX_EXISTS_ERROR: %s';
const INDEX_NOT_EXISTS_ERROR = ERR_PREFIX + 'INDEX_NOT_EXISTS_ERROR: %s';
const DUPLICATE_COLUMNS_ERROR = ERR_PREFIX + 'DUPLICATE_COLUMNS_ERROR: %s';
const INVALID_MIN_MAX_ERROR = ERR_PREFIX + 'INVALID_MIN_MAX_ERROR: %s';
const ID_EXISTS_ERROR = ERR_PREFIX + 'ID_EXISTS_ERROR: %s';
const COLUMN_NOT_EXISTS_ERROR = ERR_PREFIX + 'COLUMN_NOT_EXISTS_ERROR: %s';
const INTEGER_OUT_OF_RANGE_ERROR = ERR_PREFIX + 'INTEGER_OUT_OF_RANGE_ERROR: %s';
const INVALID_COMMAND_ARGUMENTS_ERROR = ERR_PREFIX + '%s: INVALID_COMMAND_ARGUMENTS_ERROR';
const INVALID_INTEGER_VALUE_ERROR = ERR_PREFIX + 'INVALID_INTEGER_VALUE_ERROR: %s';
const SYNTAX_ERROR = ERR_PREFIX + 'SYNTAX_ERROR: %s';
const COLUMN_NOT_SORTABLE_ERROR = ERR_PREFIX + 'COLUMN_NOT_SORTABLE_ERROR: %s';
const FOREIGNKEY_ID_OUT_OF_RANGE_ERROR = ERR_PREFIX + 'FOREIGNKEY_ID_OUT_OF_RANGE_ERROR: %s';
const FOREIGNKEY_NOT_FOUND_ERROR = ERR_PREFIX + 'FOREIGNKEY_NOT_FOUND_ERROR: %s <- %s';
const FOREIGNKEY_AMBIGUOUS_ERROR = ERR_PREFIX + 'FOREIGNKEY_AMBIGUOUS_ERROR: %s <- %s';
const PING_SUCCESS = 'PONG';
const CREATE_SUCCESS = 'CREATED';
const DROP_SUCCESS = 'DROPPED';
const ADD_SUCCESS = 'ADDED';
const TYPE_STRING = 'STRING';
const TYPE_INTEGER = 'INTEGER';
const TYPE_FULLTEXT = 'FULLTEXT';
const TYPE_FOREIGNKEY = 'FOREIGNKEY';
const TYPES = [TYPE_STRING, TYPE_INTEGER, TYPE_FULLTEXT, TYPE_FOREIGNKEY];

module.exports = {
    INTERNAL_ERROR,
    INVALID_INPUT,
    INVALID_ACTION_ERROR,
    CONNECTION_ERROR,
    INDEX_EXISTS_ERROR,
    INDEX_NOT_EXISTS_ERROR,
    DUPLICATE_COLUMNS_ERROR,
    INVALID_MIN_MAX_ERROR,
    ID_EXISTS_ERROR,
    COLUMN_NOT_EXISTS_ERROR,
    INTEGER_OUT_OF_RANGE_ERROR,
    INVALID_COMMAND_ARGUMENTS_ERROR,
    INVALID_INTEGER_VALUE_ERROR,
    SYNTAX_ERROR,
    COLUMN_NOT_SORTABLE_ERROR,
    FOREIGNKEY_ID_OUT_OF_RANGE_ERROR,
    FOREIGNKEY_NOT_FOUND_ERROR,
    FOREIGNKEY_AMBIGUOUS_ERROR,
    PING_SUCCESS,
    CREATE_SUCCESS,
    DROP_SUCCESS,
    ADD_SUCCESS,
    TYPE_STRING,
    TYPE_INTEGER,
    TYPE_FULLTEXT,
    TYPE_FOREIGNKEY,
    TYPES,
    IS_ERROR: e => !e.indexOf(ERR_PREFIX),
};
