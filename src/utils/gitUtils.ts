import simpleGit, { SimpleGit, LogResult } from 'simple-git';
import path from 'path';

export interface AuthorStats {
    name: string;
    email: string;
    commits: number;
}

export interface GitAnalysisResult {
    totalCommits: number;
    lastCommitDate: string;
    authroStats: AuthorStats[];
    recentActivity: string[];
}

export class GitService {
    private git: SimpleGit;

    constructor(projectPath: string) {
        this.git = simpleGit(projectPath);
    }

    async isRepo(): Promise<boolean> {
        return await this.git.checkIsRepo();
    }

    async getAnalysis(limit: number = 50): Promise<GitAnalysisResult | null> {
        try {
            if (!await this.isRepo()) {
                return null;
            }

            const log: LogResult = await this.git.log({ maxCount: limit });

            const authorMap = new Map<string, AuthorStats>();

            log.all.forEach(commit => {
                const key = commit.author_email;
                if (!authorMap.has(key)) {
                    authorMap.set(key, {
                        name: commit.author_name,
                        email: commit.author_email,
                        commits: 0
                    });
                }
                const stats = authorMap.get(key)!;
                stats.commits++;
            });

            return {
                totalCommits: log.total,
                lastCommitDate: log.latest?.date || new Date().toISOString(),
                authroStats: Array.from(authorMap.values()).sort((a, b) => b.commits - a.commits),
                recentActivity: log.all.slice(0, 10).map(c => `[${c.date.substring(0, 10)}] ${c.message} (${c.author_name})`)
            };

        } catch (error) {
            console.error('Git analysis failed:', error);
            return null;
        }
    }
}
