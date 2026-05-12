import dotenv from 'dotenv';
dotenv.config({ override: true });
import mysql from 'mysql2/promise';

// Support Railway MYSQL_URL, individual MYSQL* vars, or local DB_* vars
const mysqlUrl = process.env.MYSQL_URL || process.env.MYSQL_PUBLIC_URL;

const pool = mysqlUrl
  ? mysql.createPool({ uri: mysqlUrl, waitForConnections: true, connectionLimit: 10, queueLimit: 0 })
  : mysql.createPool({
      host:     process.env.MYSQLHOST     || process.env.DB_HOST || 'localhost',
      port:     process.env.MYSQLPORT     || process.env.DB_PORT || 3306,
      user:     process.env.MYSQLUSER     || process.env.DB_USER,
      password: process.env.MYSQLPASSWORD || process.env.DB_PASS,
      database: process.env.MYSQLDATABASE || process.env.DB_NAME || 'cloudco3_portal',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });

export default pool;
