
export interface UserRecord {
    username: string;
    password: string;
    userinfo: string
}

export interface CourseInfo {
    id: string;
    name: string;
    teachers: string;
}
export interface UndoneListItem {
    siteId: number;
    siteName: string;
    activityName: string;
    activityId: string;
    type: number;
    endTime: string;
    assignmentType: number;
    evaluationStatus: number;
    isOpenEvaluation: number;
    courseInfo?: CourseInfo
}
export interface UndoneList {
    siteNum: number;
    undoneNum: number;
    undoneList: UndoneListItem[];
}

export interface Resource {
    resourceId: string;
    resourceName: string;
    resourceType: string;
}

export interface Detail {
    id: string;
    assignmentTitle: string;
    assignmentContent: string;
    assignmentComment: string;
    className: string;
    chapterName: string;
    assignmentType: number;
    noSubmitNum: number;
    totalNum: number;
    stayReadNum: number;
    alreadyReadNum: number;
    isGroupExcellent: number;
    assignmentBeginTime: string;
    assignmentEndTime: string;
    isOvertimeCommit: number;
    assignmentStatus: number;
    teamId: number;
    isOpenEvaluation: number;
    status: number;
    groupScore: number;
    assignmentScore: number;
    assignmentResource: Array<Resource>;
    assignmentMutualEvaluation: any;
    courseInfo?: object;
    key?: string;
    resource?: ResourceDetail[];
}

export interface ResourceDetail {
    storageId: string;
    name: string;
    ext: string;
    id: string;
}

export interface Homework {
    id: string;
    info: string;
}

export interface BasicResponse {
    success: boolean;
    msg: string;
    code: number;
}

export type ItemResponse = {
    data: {
        records: Array<{
            id: string;
        }>
    }
}

export type UndoneListResponse = { data: UndoneList } & BasicResponse;
export type DetailResponse = { data: Detail } & BasicResponse;
export type ResourceDetailResponse = { data: ResourceDetail[] } & BasicResponse;
export type PreviewUrlResponse = { data: { previewUrl: string } } & BasicResponse;
export type UploadResponse = { data: string } & BasicResponse;