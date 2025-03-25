import { UserRecord } from "./types";
import { type UserInfo, byrdocs_login, refresh } from "@byrdocs/bupt-auth";
import log from "./log";

function base64UrlDecode(str: string) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) {
        str += '=';
    }
    return decodeURIComponent(atob(str).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
}

function isExpire(token: string) {
    try {
        const payload: {
            exp: number
        } = JSON.parse(base64UrlDecode(token.split('.')[1]))
        return payload.exp < Date.now() / 1000;
    } catch (err) {
        log('Auth', 'Token parse error', err);
        return true;
    }
}


export async function getToken(username: string, password: string | null, db: D1Database, ocr_token: string) {
    const users: D1Result<UserRecord> = await db.prepare('SELECT * FROM users WHERE username = ?')
        .bind(username)
        .all();
    async function reLogin() {
        if (!password?.length) throw new Error('Password required');
        const userinfo = await byrdocs_login(username, password, ocr_token);
        await db.prepare('INSERT INTO users (username, password, userinfo) VALUES (?,?,?) ON CONFLICT (username) DO UPDATE SET password = excluded.password, userinfo = excluded.userinfo')
            .bind(username, password, JSON.stringify(userinfo))
            .run();
        return userinfo;
    }
    if (users.results.length === 0) return reLogin();
    const user = users.results[0];
    if (password?.length && user.password !== password) return reLogin();
    const userinfo: UserInfo = JSON.parse(user.userinfo);
    if (isExpire(userinfo.refresh_token)) {
        log('Auth', 'Refresh_token expired, relogin');
        return reLogin();
    }
    if (isExpire(userinfo.access_token)) {
        log('Auth', 'Access_token expired, refresh_token');
        const newUserinfo = await refresh(userinfo.refresh_token);
        await db.prepare('UPDATE users SET userinfo = ? WHERE username = ?')
            .bind(JSON.stringify(newUserinfo), username)
            .run();
        return newUserinfo;
    }
    log('Auth', 'Use cached token');
    return userinfo;
}