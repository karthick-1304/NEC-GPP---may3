// src/config/db.js
import mysql  from 'mysql2/promise';
import logger from '../utils/logger.js';
import dotenv from 'dotenv';

dotenv.config();

const requiredEnvVars = ['DB_HOST', 'DB_USER', 'DB_NAME'];
const missingVars     = requiredEnvVars.filter(key => !process.env[key]);
if (missingVars.length > 0) {
  console.error(`[DB] Missing required env vars: ${missingVars.join(', ')}`);
  process.exit(1);
}

const _connectionLimit = parseInt(process.env.DB_CONNECTION_LIMIT, 10) || 10;
const _queueLimit      = 150;

export const pool = mysql.createPool({
  host:               process.env.DB_HOST,
  user:               process.env.DB_USER,
  password:           process.env.DB_PASSWORD || '',
  database:           process.env.DB_NAME,
  port:               parseInt(process.env.DB_PORT, 10) || 3306,
  waitForConnections: true,
  connectionLimit:    _connectionLimit,
  queueLimit:         _queueLimit,
  enableKeepAlive:    true,
  keepAliveInitialDelay: 10000,
  timezone:           'local',
  charset:            'utf8mb4',
  connectTimeout:     10000,
  multipleStatements: false,
  ...(process.env.DB_SSL === 'true' && { ssl: { rejectUnauthorized: true } }),
});

let _activeQueries = 0;

export const getPoolStats = () => ({
  connectionLimit: _connectionLimit,
  queueLimit:      _queueLimit,
  activeQueries:   _activeQueries,
});

export const testDatabaseConnection = async () => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.query('SELECT 1');
    logger.info('Database connected successfully', getPoolStats());
    return true;
  } catch (error) {
    logger.error('Database connection failed', { error: error.message, code: error.code });
    throw error;
  } finally {
    if (connection) connection.release();
  }
};

pool.on('connection', (conn) =>
  logger.debug('New DB connection', { threadId: conn.threadId })
);
pool.on('enqueue', () =>
  logger.warn('DB pool saturated — request queued', getPoolStats())
);
pool.on('acquire', (conn) =>
  logger.debug('DB connection acquired', { threadId: conn.threadId })
);
pool.on('error', (err) =>
  logger.error('DB pool error', { error: err.message, code: err.code })
);

const QUEUE_TIMEOUT_MS          = parseInt(process.env.DB_QUEUE_TIMEOUT_MS, 10)          || 8000;
const QUERY_EXECUTION_TIMEOUT_S = parseInt(process.env.DB_QUERY_EXECUTION_TIMEOUT_S, 10) || 10;
const SET_TIMEOUT_SQL           = `SET SESSION MAX_EXECUTION_TIME = ${QUERY_EXECUTION_TIMEOUT_S * 1000}`;

export const executeQuery = async (query, params = []) => {
  const start = Date.now();
  let timeoutId;
  let connection;
  let acquired = false;
  try {
    connection = await Promise.race([
      pool.getConnection(),
      new Promise((_, reject) => {
        timeoutId = setTimeout(
          () => reject(Object.assign(new Error('DB_QUEUE_TIMEOUT'), { isOperational: true, statusCode: 503 })),
          QUEUE_TIMEOUT_MS
        );
      }),
    ]);
    clearTimeout(timeoutId);
    acquired = true;          
    _activeQueries++;

    await connection.query(SET_TIMEOUT_SQL);
    const [rows] = await connection.query(query, params);

    const duration = Date.now() - start;
    if (duration > 2000) {
      logger.warn('Slow query', { duration: `${duration}ms`, query: query.substring(0, 200) });
    }

    return rows;

  } catch (error) {
    clearTimeout(timeoutId);
    if (error.code === 'ER_QUERY_TIMEOUT' || error.errno === 3024) {
      logger.error('Query execution timeout', { query: query.substring(0, 200), duration: `${Date.now() - start}ms` });
      throw Object.assign(new Error('DB_QUERY_EXECUTION_TIMEOUT'), { isOperational: true, statusCode: 503 });
    }
    logger.error('Database query error', { error: error.message, code: error.code, duration: `${Date.now() - start}ms`, query: query.substring(0, 200) });
    throw error;
  } finally {
    if (connection) {
      connection.release();
      if (acquired) _activeQueries--;  
    }
  }
};

export const withTransaction = async (callback) => {
  let connection;
  let timeoutId;

  try {
    connection = await Promise.race([
      pool.getConnection(),
      new Promise((_, reject) => {
        timeoutId = setTimeout(
          () => reject(Object.assign(new Error('DB_QUEUE_TIMEOUT'), { isOperational: true, statusCode: 503 })),
          QUEUE_TIMEOUT_MS
        );
      }),
    ]);
    clearTimeout(timeoutId);
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }

  try {
    await connection.query(SET_TIMEOUT_SQL);
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      logger.error('Transaction rollback failed', { rollbackError: rollbackError.message, originalError: error.message });
    }
    throw error;
  } finally {
    connection.release();
  }
};

export const closeDatabasePool = async () => {
  try {
    await pool.end();
    logger.info('Database pool closed gracefully');
  } catch (error) {
    logger.error('Error closing database pool', { error: error.message });
    throw error;
  }
};

export default pool;