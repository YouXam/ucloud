import { Router, RouteHandler, IRequest } from 'itty-router';
import { getToken } from './auth';
import { getUndoneList, getDetail, searchCourse, searchCourses, getResource, getPreviewURL } from './crawler';
import log from './log';
import { Homework, UploadResponse, UndoneListResponse, BasicResponse } from './types';
import { UserInfo } from '@byrdocs/bupt-auth';

const jsonHeaders = { headers: { 'Content-Type': 'application/json' } }

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

	const [username, ...passwords] = atob(base64Credentials).split(':');
	const password = passwords.join(":")
	if (!username?.length || !password?.length) {
		return new Response('Unauthorized', {
			status: 401,
			headers: {
				'WWW-Authenticate': 'Basic realm="Secure Area"',
			},
		});
	}

	try {
		request.token = await getToken(username, password, env.DB, env.OCR_TOKEN);
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
		const res: UndoneListResponse = await getUndoneList(token);
		if (!res.success) {
			return new Response(res.msg, { status: 500 });
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
		const notInCacheMap = new Map(notInCache.map(x => [x.activityId, x]));
		if (notInCache.length !== 0) {
			log('UndoneList', `${inCache.length}/${res.data.undoneList.length} in cache, ${notInCache.length} not in cache, fetching...`);
			const coursesInfo = await searchCourses(token, notInCache);
			const stmt = env.DB.prepare(`INSERT INTO homeworks (id, info) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET info = excluded.info`);
			const coursesInfoArr = Object.entries(coursesInfo)
			if (coursesInfoArr.length > 0) {
				const batch = coursesInfoArr.map(([id, info]) => stmt.bind(id, JSON.stringify({
					...info,
					activityName: notInCacheMap.get(id)?.activityName,
					endTime: notInCacheMap.get(id)?.endTime,
				})));
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

		return new Response(JSON.stringify(res.data), jsonHeaders);
	})
	// 获取数据库中的缓存
	.get('/cache', async ({ query, token }, env: Env) => {
		const id = query.id;
		if (!id || typeof id !== 'string') {
			return new Response('Invalid id', { status: 400 });
		}
		const last = await env.DB.prepare(`SELECT * FROM homeworks WHERE id = ?`)
			.bind(id)
			.first();
		if (!last) {
			return new Response('Not found', { status: 404 });
		}
		return new Response(JSON.stringify({
			id: last.id,
			info: JSON.parse(last.info as string),
			endTime: last.endtime,
		}), jsonHeaders);
	})
	.get('/homework', handleAuthRoutes, async ({ query, token }, env: Env) => {
		const id = query.id;
		if (!id || typeof id !== 'string') {
			return new Response('Invalid id', { status: 400 });
		}
		const res = await getDetail(id, token);
		if (!res.success) {
			return new Response(res.msg, { status: 500 });
		}
		const info = await getInfoWithCache(token, id, res.data.assignmentTitle, env.DB);
		res.data.courseInfo = info
		if (res.data.assignmentResource.length) {
			const resource = await getResource(token, res.data.assignmentResource);
			if (resource) {
				res.data.resource = resource;
			}
		}
		return new Response(JSON.stringify(res.data), jsonHeaders);
	})

	.get('/search', handleAuthRoutes, async ({ query, token }, env: Env) => {
		const id = query.id, keyword = query.keyword;
		if (!id || typeof id !== 'string' || !keyword || typeof keyword !== 'string') {
			return new Response('Invalid arguments', { status: 400 });
		}
		const info = await getInfoWithCache(token, id, keyword, env.DB);
		return new Response(JSON.stringify(info), jsonHeaders);
	})

	.post('/upload', handleAuthRoutes, async (request, env: Env) => {
		const body: { url: string, filename: string, mime_type: string } = await request.json(), token: UserInfo = request.token;
		const downloadUrl = body.url;
		const downloadResponse = await fetch(downloadUrl);

		
		if (!downloadResponse.ok || !downloadResponse.body) {
			return new Response('Error fetching file', { status: downloadResponse.status });
		}
		const boundary = '----WebKitFormBoundaryp4BkfnvvAcH6s0Pg';
		const initialPart = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${body.filename}"\r\nContent-Type: ${body.mime_type}\r\n\r\n`;
		const endPart = `\r\n--${boundary}\r\nContent-Disposition: form-data; name="userId"\r\n\r\n${token.user_id}\r\n--${boundary}\r\nContent-Disposition: form-data; name="bizType"\r\n\r\n3\r\n--${boundary}--`;
		const { readable, writable } = new TransformStream();

		const uploadResponsePromise = fetch("https://apiucloud.bupt.edu.cn/blade-source/resource/upload/biz", {
			method: 'POST',
			body: readable,
			headers: {
				'Content-Type': `multipart/form-data; boundary=${boundary}`,
				"Authorization": "Basic cG9ydGFsOnBvcnRhbF9zZWNyZXQ=",
				"Blade-Auth": token.access_token,
			}
		});
		const writer = writable.getWriter();
		await writer.write(new TextEncoder().encode(initialPart));
		const reader = downloadResponse.body.getReader();
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}
			await writer.write(value);
		}
		await writer.write(new TextEncoder().encode(endPart));
		await writer.close();
		
		const uploadResponse = await uploadResponsePromise;
		const uploadResponseBody: UploadResponse = await uploadResponse.json();
		if (!uploadResponse.ok || !uploadResponseBody.success) {
			return new Response(JSON.stringify({
				code: uploadResponseBody.code,
				success: false,
				msg: uploadResponseBody.msg,
			}));
		}
		return new Response(JSON.stringify({
			success: true,
			code: 0,
			resourceId: uploadResponseBody.data,
			previewUrl: await getPreviewURL(uploadResponseBody.data)
		}), { headers: { 'Content-Type': 'application/json' } });
	})

	.post('/submit', handleAuthRoutes, async (request: IRequest, env: Env) => {
		const {assignmentId, assignmentContent, attachmentIds }: { assignmentId: string, attachmentIds: string[], assignmentContent: string } = await request.json(), token: UserInfo = request.token;
		if (!assignmentId || typeof assignmentId !== 'string') {
			return new Response('Invalid arguments', { status: 400 });
		}
		console.log(assignmentId, assignmentContent, attachmentIds)
		const res = await fetch("https://apiucloud.bupt.edu.cn/ykt-site/work/submit", {
			method: 'POST',
			body: JSON.stringify({
				attachmentIds: attachmentIds || [],
				assignmentContent: assignmentContent || "",
				assignmentId,
				assignmentType: 0,
				userId: token.user_id,
				groupId: "",
				commitId: ""
			}),
			headers: {
				'Content-Type': 'application/json',
				"Authorization": "Basic cG9ydGFsOnBvcnRhbF9zZWNyZXQ=",
				"Blade-Auth": token.access_token,
			}
		});
		const resBody: BasicResponse = await res.json();
		if (!resBody.success) {
			return new Response(JSON.stringify({
				success: false,
				msg: resBody.msg,
			}), { status: res.status });
		}
		return new Response(JSON.stringify({
			success: true,
		}), {
			headers: {
				'Content-Type': 'application/json',
			},
		});
	})
	.all('*', (request) => {
		return Response.redirect("https://github.com/youXam/ucloud", 302)
	});

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		return router.handle(request, env, ctx);
	},
};
