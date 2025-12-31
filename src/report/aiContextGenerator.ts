import fs from 'fs-extra';
// Import the custom DependencyGraph class, NOT graphology
import { DependencyGraph } from '../graph';

interface AiContextFile {
    path: string;
    imports: string[];
    importedBy: string[];
    blastRadius: number;
    description: string;
}

export async function generateAiContext(
    graph: DependencyGraph,
    analysis: any,
    outputPath: string
): Promise<void> {

    const contextFiles: AiContextFile[] = [];

    // Get nodes from the custom DependencyGraph
    // nodes is a Map<string, GraphNode>
    const nodes = graph.getNodes();
    const edges = graph.getEdges();

    nodes.forEach((nodeData, nodeId) => {
        // nodeData has: id, inDegree, outDegree, blastRadius, affectedFiles

        // Imports (Outgoing edges)
        const importsSet = edges.get(nodeId);
        const imports = importsSet ? Array.from(importsSet) : [];

        // Imported By (Incoming edges)
        // We can't easily get incoming from 'edges' map directly without iterating or using reverseEdges if exposed.
        // But we computed 'blastRadius' / 'affectedFiles' already.
        // The user wants strictly "Used By" (Direct Dependents).
        // Since DependencyGraph likely has reverseEdges private, we must iterate 'edges' to find who imports this node.
        const importedBy: string[] = [];
        edges.forEach((targets, source) => {
            if (targets.has(nodeId)) {
                importedBy.push(source);
            }
        });

        let description = "Module";
        if (nodeId.endsWith('.ts')) description = "TypeScript Module";
        if (nodeId.endsWith('.py')) description = "Python Script";

        // Simple heuristic for importance using pre-calculated blast radius (which is %)
        if (nodeData.blastRadius > 5) description += " (High Impact Core Utility)";
        else if (nodeData.blastRadius > 2) description += " (Shared Utility)";

        contextFiles.push({
            path: nodeId,
            imports: imports,
            importedBy: importedBy,
            blastRadius: nodeData.blastRadius,
            description: description
        });
    });

    // Sort by Blast Radius (Descending)
    contextFiles.sort((a, b) => b.blastRadius - a.blastRadius);

    let mdContent = `# Project Codebase Context for AI Assistants\n\n`;
    mdContent += `> This file is auto-generated to provide context about the project structure, dependencies, and impact analysis.\n\n`;
    mdContent += `## System Overview\n\n`;
    mdContent += `- **Total Files**: ${contextFiles.length}\n`;
    mdContent += `- **High Impact Files**: ${contextFiles.filter(f => f.blastRadius > 5).length}\n\n`;

    mdContent += `## File Dependency & Impact Analysis\n\n`;

    contextFiles.forEach(file => {
        mdContent += `### 📄 \`${file.path}\`\n`;
        mdContent += `- **Type**: ${file.description}\n`;
        mdContent += `- **Blast Radius**: ${file.blastRadius.toFixed(2)}% of codebase affected\n`;

        if (file.imports.length > 0) {
            mdContent += `- **Imports**: \`${file.imports.join('`, `')}\`\n`;
        }

        if (file.importedBy.length > 0) {
            mdContent += `- **Used By**: \`${file.importedBy.join('`, `')}\`\n`;
            mdContent += `  > ⚠️ **Impact Warning**: Modifying this file will affect imports in: ${file.importedBy.slice(0, 5).join(', ')}${file.importedBy.length > 5 ? '...' : ''}\n`;
        } else {
            mdContent += `- **Usage**: Leaf node (Entry point or unused).\n`;
        }

        mdContent += `\n---\n\n`;
    });

    await fs.writeFile(outputPath, mdContent);
}
