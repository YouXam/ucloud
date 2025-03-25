# BUPT 教学云平台 API

## 使用

以下接口均需要使用 http basic auth 鉴权，用户名和密码为学号和统一认证密码。

API base URL 为 `https://ucloud.youxam.workers.dev`。

1. **GET** `/undoneList`
    获取未完成作业列表。
2. **GET** `/homework?id=<activityId>`
    获取作业详情，其中 `activityId` 可以从未完成作业列表中获取。
3. **GET** `/search?id=<activityId>&keyword=<keyword>`
    通过作业反向搜索课程信息，其中 `keyword` 建议为作业标题。
4. **POST** `/upload`
    从指定 URL 下载文件并上传到教学云平台。
    ```ts
    type Body = {
        // 文件 URL
        url: string;
        // 文件名
        filename: string;
        // 文件 mime-type
        mime_type: string;
    }
    ```
5. **POST** `/submit`
    提交作业。
    ```ts
    type Body = {
        // 作业 ID (activityId)
        assignmentId: string;
        // 作业文字内容
        assignmentContent?: string
        // 附件列表，每一项为 `/upload` 接口返回的 resourceId
        attachmentIds: string[];
    }
    ```

## 部署

在 Cloudflare Workers 中部署。

需要先创建 D1，然后运行 `database.sql` 建表。

## 其他

[ucloud Telegram 机器人](https://github.com/YouXam/ucloud-bot/)。

## LICENSE

[GPL-3.0](LICENSE)