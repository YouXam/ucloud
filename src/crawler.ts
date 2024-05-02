
import { UserInfo, UndoneListResponse, DetailResponse, Resource, ResourceDetailResponse, PreviewUrlResponse, UndoneListItem, CourseInfo, ItemResponse } from "./types";

export async function refreshToken(refresh_token: string) {
    const body: FormData = new FormData();
    body.append("grant_type", "refresh_token");
    body.append("refresh_token", refresh_token);
    const res = await fetch("https://apiucloud.bupt.edu.cn/ykt-basics/oauth/token", {
        method: 'POST',
        headers: {
            'authorization': 'Basic cG9ydGFsOnBvcnRhbF9zZWNyZXQ='
        },
        body
    })
    const json: UserInfo = await res.json();
    return json;
}

export async function getCookieAndExecution() {
    const res = await fetch("https://auth.bupt.edu.cn/authserver/login?service=http://ucloud.bupt.edu.cn")
    const cookie = res.headers.get('set-cookie');
    if (!cookie || !cookie.length) {
        throw new Error('Failed to obtain the cookie from the HTML response');
    }
    const html = await res.text();
    const executions = html.match(/<input name="execution" value="(.*?)"/);
    if (!executions || !executions.length) {
        throw new Error('Failed to obtain the execution value from the HTML response');
    }
    return { cookie, execution: executions[1] };
}

export async function login(username: string, password: string) {
    const bodyp = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`
    const { cookie, execution } = await getCookieAndExecution();
    let response = await fetch('https://auth.bupt.edu.cn/authserver/login', {
        method: 'POST',
        headers: {
            'authority': 'auth.bupt.edu.cn',
            'content-type': 'application/x-www-form-urlencoded',
            'cookie': cookie,
            'referer': 'https://auth.bupt.edu.cn/authserver/login?service=http://ucloud.bupt.edu.cn',
            'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36 Edg/118.0.2088.61',
        },
        body: bodyp + '&submit=%E7%99%BB%E5%BD%95&type=username_password&execution=' + execution + '&_eventId=submit',
        redirect: 'manual'
    });
    if (response.status != 302) {
        if (response.status === 401) {
            throw new Error('用户名或者密码错误');
        }
        throw new Error('Failed to make the initial request: ' + response.status + ' ' + response.statusText);
    }
    let location = response.headers.get('Location');
    if (!location) {
        throw new Error('Failed to obtain the redirection URL from the response');
    }
    let urlParams = new URLSearchParams(new URL(location).search);
    let ticket = urlParams.get('ticket');
    if (!ticket) {
        throw new Error('Failed to obtain the ticket value from the redirection URL');
    }
    response = await fetch("https://apiucloud.bupt.edu.cn/ykt-basics/oauth/token", {
        "headers": {
            "accept": "application/json, text/plain, */*",
            "authorization": "Basic  cG9ydGFsOnBvcnRhbF9zZWNyZXQ=",
            "content-type": "application/x-www-form-urlencoded",
            "tenant-id": "000000",
            "Referer": "https://ucloud.bupt.edu.cn/",
            "Referrer-Policy": "strict-origin-when-cross-origin"
        },
        "body": `ticket=${ticket}&grant_type=third`,
        "method": "POST"
    });

    if (!response.ok) {
        throw new Error('Failed to obtain the token: ' + response.statusText);
    }
    let json: UserInfo = await response.json();
    return json;
}

export async function getUndoneList(userinfo: UserInfo): Promise<UndoneListResponse> {
    const res = await fetch("https://apiucloud.bupt.edu.cn/ykt-site/site/student/undone?userId=" + userinfo.user_id, {
        "headers": {
            "authorization": "Basic cG9ydGFsOnBvcnRhbF9zZWNyZXQ=",
            "blade-auth": userinfo.access_token,
            "identity": "JS005:1528800428957896705",
            "pragma": "no-cache",
            "tenant-id": "000000",
            "Referer": "https://ucloud.bupt.edu.cn/",
            "Referrer-Policy": "strict-origin-when-cross-origin"
        },
        "method": "GET"
    });
    const json: UndoneListResponse = await res.json();
    return json;
}

export async function getDetail(id: string, userinfo: UserInfo): Promise<DetailResponse> {
    const res = await fetch("https://apiucloud.bupt.edu.cn/ykt-site/work/detail?assignmentId=" + id, {
        "headers": {
            "authorization": "Basic cG9ydGFsOnBvcnRhbF9zZWNyZXQ=",
            "blade-auth": userinfo.access_token,
            "identity": "JS005:1528800428957896705",
            "Referer": "https://ucloud.bupt.edu.cn/",
            "Referrer-Policy": "strict-origin-when-cross-origin"
        },
        "body": null,
        "method": "GET"
    })
    const json: DetailResponse = await res.json();
    return json;
}

async function searchTask(siteId: string, keyword: string, token: string) {
    const res = await fetch("https://apiucloud.bupt.edu.cn/ykt-site/work/student/list", {
        "headers": {
            "authorization": "Basic cG9ydGFsOnBvcnRhbF9zZWNyZXQ=",
            "blade-auth": token,
            'content-type': 'application/json;charset=UTF-8'
        },
        "body": JSON.stringify({
            siteId,
            keyword,
            "current": 1,
            "size": 5,
        }),
        "method": "POST"
    });
    const json = await res.json();
    return json
}

export async function searchCourse(userinfo: UserInfo, id: string, keyword: string) {
    const res = await fetch("https://apiucloud.bupt.edu.cn/ykt-site/site/list/student/current?size=999999&current=1&userId=" + userinfo.user_id + "&siteRoleCode=2", {
        "headers": {
            "authorization": "Basic cG9ydGFsOnBvcnRhbF9zZWNyZXQ=",
            "blade-auth": userinfo.access_token,
        },
        "body": null,
        "method": "GET"
    });
    const json: any = await res.json();
    const list = json.data.records.map((x: any) => ({
        id: x.id,
        name: x.siteName,
        teachers: x.teachers.map((y: any) => y.name).join(', '),
    }))
    async function searchWithLimit(list: any, limit = 5) {
        for (let i = 0; i < list.length; i += limit) {
            const batch = list.slice(i, i + limit);
            const jobs = batch.map((x: any) => searchTask(x.id, keyword, userinfo.access_token));
            const ress = await Promise.all(jobs);
            for (let j = 0; j < ress.length; j++) {
                const res = ress[j];
                if (res.data.records.length > 0) {
                    for (const item of res.data.records) {
                        if (item.id == id) {
                            return batch[j];
                        }
                    }
                }
            }
        }
        return null;
    }

    return await searchWithLimit(list);
}

async function getHomeworks(siteId: string, token: string) {
    const res = await fetch("https://apiucloud.bupt.edu.cn/ykt-site/work/student/list", {
        "headers": {
            "authorization": "Basic cG9ydGFsOnBvcnRhbF9zZWNyZXQ=",
            "blade-auth": token,
            'content-type': 'application/json;charset=UTF-8'
        },
        "body": JSON.stringify({
            siteId,
            current: 1,
            size: 9999,
        }),
        "method": "POST"
    });
    const json: ItemResponse = await res.json();
    return json
}

async function getTests(siteId: string, token: string) {
    const res = await fetch(`https://apiucloud.bupt.edu.cn/ykt-site/examination/list-stu?current=1&size=999999&status=-1&siteId=${siteId}&statusSelf=%E6%9C%AA%E6%8F%90%E4%BA%A4&state=-1`, {
        "headers": {
            "authorization": "Basic cG9ydGFsOnBvcnRhbF9zZWNyZXQ=",
            "blade-auth": token
        },
    })
    const json: ItemResponse = await res.json();
    return json
}

async function getSurvey(userId: string, siteId: string, token: string) {
    const res = await fetch(`https://apiucloud.bupt.edu.cn/ykt-activity/survey/page/todo?level=1&size=9999999&userId=${userId}&siteId=${siteId}`, {
        "headers": {
            "authorization": "Basic cG9ydGFsOnBvcnRhbF9zZWNyZXQ=",
            "blade-auth": token
        },
    })
    const json: ItemResponse = await res.json();
    return json
}


export async function searchCourses(userinfo: UserInfo, items: UndoneListItem[]): Promise<Record<string, CourseInfo>> {
    const res = await fetch("https://apiucloud.bupt.edu.cn/ykt-site/site/list/student/current?size=999999&current=1&userId=" + userinfo.user_id + "&siteRoleCode=2", {
        "headers": {
            "authorization": "Basic cG9ydGFsOnBvcnRhbF9zZWNyZXQ=",
            "blade-auth": userinfo.access_token,
        },
        "body": null,
        "method": "GET"
    });
    const json: any = await res.json();
    const list: CourseInfo[] = json.data.records.map((x: any) => ({
        id: x.id,
        name: x.siteName,
        teachers: x.teachers.map((y: any) => y.name).join(', '),
    }))
    const hashMap = new Map<string, number>();
    const types: Record<number, boolean> = {}
    let count = items.length
    for (let i = 0; i < items.length; i++) {
        types[items[i].type] = true;
        hashMap.set(items[i].activityId, i);
    }
    async function searchWithLimit(list: CourseInfo[], searchFunc: typeof getHomeworks, limit = 5) {
        const result: { [key: string]: any } = {};
        for (let i = 0; i < list.length; i += limit) {
            const batch = list.slice(i, i + limit);
            const jobs = batch.map((x: any) => searchFunc(x.id, userinfo.access_token));
            const ress = await Promise.all(jobs);
            for (let j = 0; j < ress.length; j++) {
                const res = ress[j];
                if (res.data.records.length > 0) {
                    for (const item of res.data.records) {
                        if (hashMap.has(item.id)) {
                            result[item.id] = batch[j];
                            if (--count == 0) {
                                return result;
                            }
                        }
                    }
                }
            }
        }
        return result;
    }
    const result = {}
    console.log(types)
    // 问卷
    if (types[2]) {
        Object.assign(result, await searchWithLimit(list, (siteId: string, token: string) => getSurvey(userinfo.user_id, siteId, token)));
    }
    // 作业
    if (types[3]) {
        Object.assign(result, await searchWithLimit(list, getHomeworks));
    }
    // 测验
    if (types[4]) {
        Object.assign(result, await searchWithLimit(list, getTests));
    }
    return result
}
export async function getPreviewURL(resourceId: string) {
    const res = await fetch("https://apiucloud.bupt.edu.cn/blade-source/resource/preview-url?resourceId=" + resourceId)
    const json: PreviewUrlResponse = await res.json();
    return json.data.previewUrl;
}
export async function getResource(userinfo: UserInfo, resources: Resource[]) {
    if (resources.length === 0) {
        return []
    }
    const res = await fetch("https://apiucloud.bupt.edu.cn/blade-source/resource/list/byId?resourceIds=" + resources.map(x => x.resourceId).join(','), {
        "headers": {
            "authorization": "Basic cG9ydGFsOnBvcnRhbF9zZWNyZXQ=",
            "blade-auth": userinfo.access_token,
        }
    })
    const json: ResourceDetailResponse = await res.json();
    if (!json.success) {
        throw new Error(json.msg);
    }
    const ids = resources.map(x => x.resourceId);
    async function getPreviewURLWithLimit(storageIds: string[], limit = 5) {
        const result: { [key: string]: string } = {};
        for (let i = 0; i < storageIds.length; i += limit) {
            const batch = storageIds.slice(i, i + limit);
            const jobs = batch.map((x: string) => getPreviewURL(x));
            const ress = await Promise.all(jobs);
            for (let j = 0; j < ress.length; j++) {
                const res = ress[j];
                if (res) {
                    result[batch[j]] = res;
                }
            }
        }
        return result;
    }
    const urlMap = await getPreviewURLWithLimit(ids);
    const result = json.data.map(x => ({
        storageId: x.storageId,
        name: x.name,
        ext: x.ext,
        url: urlMap[x.id],
        id: x.id
    }));
    return result;
}