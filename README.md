# BUPT 教学云平台 API

## 使用

鉴权使用 http basic auth，用户名和密码为学号和统一认证密码。

1. `https://ucloud.youxam.workers.dev/undoneList`
    获取未完成作业列表。
2. `https://ucloud.youxam.workers.dev/homework?id=<activityId>`
    获取作业详情，其中 `activityId` 可以从未完成作业列表中获取。
3. 更多接口见 [src/worker.ts](src/worker.ts)。

## 部署

在 Cloudflare Workers 中部署。

需要先创建 D1，然后运行 `database.sql` 建表。

## 其他

[ucloud Telegram 机器人](https://github.com/YouXam/ucloud-bot/)。

## LICENSE

[GPL-3.0](LICENSE)