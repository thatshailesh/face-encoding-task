export interface ImageMetadata {
    filename: string;
    filetype?: string;
    filesize?: number;
    imageUrl: string;
    imageId: string;
}

export interface SessionData {
    sessionId: string;
    metadata: ImageMetadata[]
    startTime: number;
}