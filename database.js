import {Pool} from 'pg';

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
  // user: 'postgres',
  // host: 'localhost',
  // database: 'SkillVault',
  // password: 'Post@#$1',
  // port: 6000,
});

export default db;