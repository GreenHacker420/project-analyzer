
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { GraphNode } from '../graph';

export class CodeIntelligence {
    private model: ChatOpenAI;

    constructor(apiKey: string) {
        this.model = new ChatOpenAI({
            openAIApiKey: apiKey,
            temperature: 0,
            modelName: 'gpt-4o' 
        });
    }

    async summarizeFile(fileName: string, content: string): Promise<string> {
        const response = await this.model.invoke([
            new SystemMessage('You are an expert code analyst. Summarize the purpose of this file in 1-2 sentencs.'),
            new HumanMessage(`File: ${fileName}\n\nCode:\n${content.substring(0, 4000)}`) // Truncate if too long
        ]);
        return response.content as string;
    }

    async analyzeBlastRadius(node: GraphNode): Promise<string> {
        const response = await this.model.invoke([
            new SystemMessage('You are an expert software architect. Explain why this file has a high blast radius and the risks involved.'),
            new HumanMessage(`File: ${node.id} is imported by ${node.affectedFiles} other files (${node.blastRadius.toFixed(2)}% of the codebase).`)
        ]);
        return response.content as string;
    }

    async generateProjectSummary(fileCount: number, topRisks: GraphNode[], files: string[]): Promise<string> {
        const response = await this.model.invoke([
            new SystemMessage('You are a technical lead. Provide a high-level summary of this project based on the file statistics and high-risk components.'),
            new HumanMessage(`
            Project Statistics:
            - Total Files: ${fileCount}
            
            Key Components (High Dependency/Risk):
            ${topRisks.map(n => `- ${n.id} (Impacts ${n.affectedFiles} files)`).join('\n')}
            
            File List Sample:
            ${files.slice(0, 50).join('\n')}
            ... and more.
            
            Please provide:
            1. An estimated architecture type (CLI, Web App, Library, etc.).
            2. Key risks based on the high-dependency components.
            3. Recommendations for improvement.
          `)
        ]);
        return response.content as string;
    }
}
