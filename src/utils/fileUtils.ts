
import fs from 'fs-extra';
import path from 'path';

export async function readFileSafe(filePath: string): Promise<string | null> {
    try {
        return await fs.readFile(filePath, 'utf-8');
    } catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
        return null;
    }
}

export function isTextFile(filePath: string): boolean {
    // Simple heuristic, can be improved
    const ext = path.extname(filePath).toLowerCase();
    const binaryExts = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.exe', '.bin', '.pyc'];
    return !binaryExts.includes(ext);
}
