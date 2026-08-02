import { NextRequest } from "next/server";

export function extractId(req: NextRequest, index: number): string {
    const segments = new URL(req.url).pathname.split("/");
    const segmentValue = segments[index];
    if (!segmentValue) {
        throw new Error(`Segment value not found at index ${index}. Path segments were: ${segments.join('/')}`);
    }
    return segmentValue;
}