import { Router, RouteHandler, IRequest } from 'itty-router';
import { getToken } from './auth';
import { getUndoneList, getDetail, searchCourse, searchCourses, getResource } from './crawler';
import { html } from './preview';
import log from './log';
import { UserInfo, Homework, UndoneList, UndoneListItem, UndoneListResult } from './types';
import { v4 as uuid } from 'uuid'

function isNumeric(str: string) {
	if (str.length === 0) return false;
	for (let i = 0; i < str.length; i++) {
		if (!Number.isInteger(Number(str[i]))) {
			return false;
		}
	}
	return true;
}

const handleAuthRoutes: RouteHandler = async (request: IRequest, env: Env, ctx: ExecutionContext) => {
	const authHeader = request.headers.get('Authorization');
	if (!authHeader || !authHeader.startsWith('Basic ')) {
		return new Response('Unauthorized', {
			status: 401,
			headers: {
				'WWW-Authenticate': 'Basic realm="Secure Area"',
			},
		});
	}

	const base64Credentials = authHeader.split(' ')[1];
	const credentials = atob(base64Credentials).split(':');
	const username = credentials[0];
	const password = credentials[1];
	if (!username?.length || !password?.length) {
		return new Response('Unauthorized', {
			status: 401,
			headers: {
				'WWW-Authenticate': 'Basic realm="Secure Area"',
			},
		});
	}

	try {
		request.token = await getToken(username, password, env.DB);
	} catch (err: any) {
		return new Response(err.toString(), { status: 401 });
	}
};

async function getInfoWithCache(userinfo: UserInfo, id: string, keyword: string, db: D1Database) {
	const last = await db.prepare(`SELECT info FROM homeworks WHERE id = ?`)
		.bind(id)
		.first();
	if (last && typeof last.info === 'string') {
		
		log('Search', 'Use cached course info')
		return JSON.parse(last.info)
	}
	const courseInfo = await searchCourse(userinfo, id, keyword);
	await db.prepare(`INSERT INTO homeworks (id, info) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET info = excluded.info`)
		.bind(id, JSON.stringify(courseInfo))
		.run();
	return courseInfo;
}
const router = Router();

router
	.get('/undoneList', handleAuthRoutes, async ({ token }, env: Env) => {
		const res: UndoneListResult = await getUndoneList(token);
		if (!res.success) {
			return new Response(res.message, { status: 500 });
		}
		const ids = res.data.undoneList.map((item) => item.activityId)
			.filter(id => isNumeric(id))
			.join(',');
		const inCache: Homework[] = ((await env.DB.prepare(`SELECT id,info FROM homeworks WHERE id IN (${ids})`).raw()) as string[][])
			.map((row: string[]) => ({
				id: row[0],
				info: row[1],
			}));
		const inCacheMap = new Map(inCache.map(x => [x.id, x]));
		const notInCache = res.data.undoneList.filter((item) => !inCacheMap.has(item.activityId));
		if (notInCache.length !== 0) {
			log('UndoneList', `${inCache.length}/${res.data.undoneList.length} in cache, ${notInCache.length} not in cache, fetching...`);
			const coursesInfo = await searchCourses(token, notInCache.map((item) => item.activityId));
			const stmt = env.DB.prepare(`INSERT INTO homeworks (id, info) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET info = excluded.info`)
			const coursesInfoArr = Object.entries(coursesInfo)
			if (coursesInfoArr.length > 0) {
				const batch = coursesInfoArr.map(([id, info]) => stmt.bind(id, JSON.stringify(info)));
				await env.DB.batch(batch);
			}
			res.data.undoneList = res.data.undoneList.map(item => {
				if (inCacheMap.has(item.activityId)) {
					return {
						...item,
						courseInfo: JSON.parse(inCacheMap.get(item.activityId)?.info || '{}'),
					}
				}
				return {
					...item,
					courseInfo: coursesInfo[item.activityId],
				}
			})
		} else {
			log('UndoneList', `All ${res.data.undoneList.length} items hit cache`)
			res.data.undoneList = res.data.undoneList.map(item => ({
				...item,
				courseInfo: JSON.parse(inCacheMap.get(item.activityId)?.info || '{}'),
			}))
		}

		return new Response(JSON.stringify(res.data), {
			headers: {
				'Content-Type': 'application/json',
			},
		});
	})

	.get('/homework', handleAuthRoutes, async ({ query, token }, env: Env) => {
		const id = query.id;
		if (!id || typeof id !== 'string') {
			return new Response('Invalid id', { status: 400 });
		}
		const res = await getDetail(id, token);
		if (!res.success) {
			return new Response(res.message, { status: 500 });
		}
		const info = await getInfoWithCache(token, id, res.data.assignmentTitle, env.DB);
		res.data.courseInfo = info
		if (res.data.assignmentResource.length) {
			const resource = await getResource(token, res.data.assignmentResource);
			if (resource) {
				res.data.resource = resource;
			}
		}
		return new Response(JSON.stringify(res.data), {
			headers: {
				'Content-Type': 'application/json',
			},
		});
	})

	.get('/search', handleAuthRoutes, async ({ query, token }, env: Env) => {
		const id = query.id, keyword = query.keyword;
		if (!id || typeof id !== 'string' || !keyword || typeof keyword !== 'string') {
			return new Response('Invalid arguments', { status: 400 });
		}
		const info = await getInfoWithCache(token, id, keyword, env.DB);
		return new Response(JSON.stringify(info), {
			headers: {
				'Content-Type': 'application/json',
			},
		});
	})

	.all('*', (request) => {
		const url = new URL(request.url);
		return new Response(`Not Found: ${url.pathname}`, { status: 404 });
	});

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		return router.handle(request, env, ctx);
	},
};
