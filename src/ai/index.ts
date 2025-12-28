
import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOllama } from "@langchain/ollama";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { MemorySaver } from "@langchain/langgraph";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { GraphNode } from '../graph';

export type AiProviderType = 'openai' | 'gemini' | 'ollama';

export class CodeIntelligence {
    private agent: any;
    private config: any;

    constructor(provider: AiProviderType, apiKey: string, modelName?: string) {
        let model;

        // Initialize Model based on Provider
        if (provider === 'openai') {
            if (!apiKey) throw new Error("OpenAI API Key required");
            model = new ChatOpenAI({
                apiKey,
                modelName: modelName || 'gpt-4o',
                temperature: 0
            });
        } else if (provider === 'gemini') {
            if (!apiKey) throw new Error("Gemini API Key required");
            model = new ChatGoogleGenerativeAI({
                apiKey,
                model: modelName || 'gemini-1.5-flash',
                temperature: 0
            });
        } else if (provider === 'ollama') {
            model = new ChatOllama({
                baseUrl: 'http://localhost:11434',
                model: modelName || 'llama3',
                temperature: 0
            });
        } else {
            throw new Error(`Unsupported provider: ${provider}`);
        }

        // Initialize Memory
        const checkpointer = new MemorySaver();

        // Create Agent
        this.agent = createReactAgent({
            llm: model as any,
            tools: [],
            checkpointSaver: checkpointer as any
        });

        // Config for thread persistence
        this.config = { configurable: { thread_id: "project-analysis-session" } };
    }

    private async askAgent(systemPrompt: string, userContent: string): Promise<string> {
        const result = await this.agent.invoke(
            {
                messages: [
                    new SystemMessage(systemPrompt),
                    new HumanMessage(userContent)
                ]
            },
            this.config
        );

        const lastMessage = result.messages[result.messages.length - 1];
        return lastMessage.content as string;
    }

    async summarizeFile(fileName: string, content: string): Promise<string> {
        return this.askAgent(
            'You are an expert code analyst. Summarize the purpose of this file in 1-2 sentences.',
            `File: ${fileName}\n\nCode:\n${content.substring(0, 5000)}`
        );
    }

    async analyzeBlastRadius(node: GraphNode): Promise<string> {
        return this.askAgent(
            'You are an expert software architect. Explain why this file has a high blast radius and the risks involved.',
            `File: ${node.id} is imported by ${node.affectedFiles} other files (${node.blastRadius.toFixed(2)}% of the codebase).`
        );
    }

    async generateProjectSummary(fileCount: number, topRisks: GraphNode[], files: string[]): Promise<string> {
        return this.askAgent(
            'You are a technical lead. Provide a high-level summary of this project based on the file statistics and high-risk components.',
            `
            Project Statistics:
            - Total Files: ${fileCount}
            
            Key Components (High Dependency/Risk):
            ${topRisks.map(n => `- ${n.id} (Impacts ${n.affectedFiles} files)`).join('\n')}
            
            File List Sample:
            ${files.slice(0, 50).join('\n')}
            
            Please provide:
            1. An estimated architecture type.
            2. Key risks.
            3. Recommendations.
            `
        );
    }

    async analyzeGitHistory(gitStats: any): Promise<string> {
        return this.askAgent(
            'You are a technical lead analyzing project evolution. Provide insights based on commit history.',
            `
            Git History Statistics:
            - Total Commits: ${gitStats.totalCommits}
            - Active Authors: ${gitStats.authroStats.length}
            
            Top Authors:
            ${gitStats.authroStats.slice(0, 5).map((a: any) => `- ${a.name}: ${a.commits} commits`).join('\n')}
            
            Recent Activity:
            ${gitStats.recentActivity.join('\n')}
            `
        );
    }
}
