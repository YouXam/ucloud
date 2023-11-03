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