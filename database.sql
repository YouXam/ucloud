-- 删除 users, homeworks, shorturl 表
DROP TABLE IF EXISTS shorturl;
DROP TABLE IF EXISTS homeworks;
DROP TABLE IF EXISTS users;

-- 创建 users 表
CREATE TABLE users (
    username VARCHAR(255) PRIMARY KEY,
    password VARCHAR(255),
    userinfo TEXT
);

-- 创建 homeworks 表
CREATE TABLE homeworks (
    id VARCHAR(255) PRIMARY KEY,
    info TEXT
);

-- 创建 shorturl 表
CREATE TABLE shorturl (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key VARCHAR(255) UNIQUE,
    homework_id VARCHAR(255),
    username VARCHAR(255)
);
