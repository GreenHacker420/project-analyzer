
import glob from 'fast-glob';
import path from 'path';
import { isTextFile } from '../utils/fileUtils';

export interface ScanOptions {
    path: string;
    ignore?: string[];
}

export async function scanProject(options: ScanOptions): Promise<string[]> {
    const rootPath = path.resolve(options.path);

    const entries = await glob('**/*', {
        cwd: rootPath,
        dot: false,
        absolute: true,
        ignore: [
            '**/node_modules/**',
            '**/dist/**',
            '**/build/**',
            '**/.git/**',
            '**/.env*',
            '**/__pycache__/**',
            ...(options.ignore || [])
        ],
        onlyFiles: true
    });

    // Filter for text files only (or meaningful code files)
    return entries.filter(isTextFile);
}
