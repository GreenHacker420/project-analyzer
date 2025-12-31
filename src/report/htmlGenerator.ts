import fs from 'fs-extra';
import path from 'path';
import { ProjectAnalysis } from '../analyzer';
import { DependencyGraph } from '../graph';

// Helper to escape JSON for HTML injection
const safeJSON = (data: any) => {
    return JSON.stringify(data)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026');
};

export async function generateHtmlReport(
    projectPath: string,
    analysis: ProjectAnalysis,
    graph: DependencyGraph,
    outputPath: string,
    gitStats?: any
) {
    const nodes: any[] = [];
    const edges: any[] = [];
    const topRisks = graph.getTopBlastRadius(10);
    const topRiskIds = new Set(topRisks.map(n => n.id));

    // Calculate node sizes and colors
    graph.getNodes().forEach(node => {
        let color = '#22d3ee'; // Cyan-400 (Default)
        let size = 20;
        let shape = 'dot';
        let shadowColor = 'rgba(34, 211, 238, 0.4)';

        if (topRiskIds.has(node.id)) {
            color = '#f472b6'; // Pink-400 (High Risk)
            shadowColor = 'rgba(244, 114, 182, 0.6)';
            size = 35 + (node.blastRadius / 2);
            shape = 'diamond';
        } else if (node.affectedFiles > 5) {
            color = '#818cf8'; // Indigo-400 (Medium)
            shadowColor = 'rgba(129, 140, 248, 0.5)';
            size = 25;
        }

        nodes.push({
            id: node.id,
            label: path.basename(node.id),
            title: undefined,
            value: size,
            color: {
                background: color,
                border: '#ffffff',
                highlight: { background: '#ffffff', border: color }
            },
            shape: shape,
            font: { color: '#a5f3fc', face: 'JetBrains Mono', strokeWidth: 0, size: 14 },
            shadow: { enabled: true, color: shadowColor, size: 15, x: 0, y: 0 },
            data: {
                fullPath: node.id,
                blastRadius: node.blastRadius.toFixed(2),
                affectedFiles: node.affectedFiles,
                inDegree: node.inDegree,
                outDegree: node.outDegree
            }
        });
    });

    graph.getEdges().forEach((targets, source) => {
        targets.forEach(target => {
            edges.push({
                from: source,
                to: target,
                arrows: 'to',
                color: { color: '#1e293b', opacity: 0.2, highlight: '#38bdf8' }, // Slate-800
                dashes: false,
                width: 1
            });
        });
    });

    // Aggregate functions for the view
    const functionsList: any[] = [];
    const relativeFiles: Record<string, any> = {};
    const absoluteProjectPath = path.resolve(projectPath);

    Object.entries(analysis.files).forEach(([file, data]) => {
        // Normalize path for frontend (relative + forward slashes)
        let relPath = path.relative(absoluteProjectPath, file);
        if (path.sep === '\\') {
            relPath = relPath.replace(/\\/g, '/');
        }
        relativeFiles[relPath] = data;

        data.functions.forEach((fn: any) => {
            // Handle both old (string) and new (FunctionInfo) formats safely
            if (typeof fn === 'object') {
                functionsList.push({
                    name: fn.name,
                    line: fn.line,
                    file: relPath, // Use relative path here too
                    params: fn.params || [],
                    doc: fn.doc || '',
                    code: fn.code || ''
                });
            } else {
                functionsList.push({
                    name: fn,
                    line: 0,
                    file: relPath,
                    params: [],
                    doc: '',
                    code: ''
                });
            }
        });
    });

    // --- DEPENDENCY USAGE LOGIC ---
    const depUsageData: Record<string, string[]> = {};
    const dependencies = analysis.dependencies || {};

    // Initialize usage arrays
    Object.keys(dependencies).forEach(dep => depUsageData[dep] = []);

    // Scan all files imports to map back to dependencies
    Object.entries(relativeFiles).forEach(([relPath, data]: [string, any]) => {
        if (data.imports && Array.isArray(data.imports)) {
            data.imports.forEach((imp: string) => {
                // Check against all dependencies (exact match or scoped/subpath)
                // e.g. import 'react' matches dep 'react'
                // e.g. import 'lodash/map' matches dep 'lodash'
                const matchedDep = Object.keys(dependencies).find(depName => {
                    return imp === depName || imp.startsWith(depName + '/');
                });

                if (matchedDep) {
                    if (!depUsageData[matchedDep].includes(relPath)) {
                        depUsageData[matchedDep].push(relPath);
                    }
                }
            });
        }
    });


    // --- TEMPLATE LOADING ---
    const templatePath = path.join(__dirname, 'template.html');
    let html = '';

    try {
        html = await fs.readFile(templatePath, 'utf-8');
    } catch (e) {
        console.error('Error reading HTML template:', e);
        html = '<h1>Error loading template. Ensure dist/report/template.html exists.</h1>';
    }

    // --- DATA INJECTION ---
    const base64JSON = (data: any) => Buffer.from(JSON.stringify(data)).toString('base64');

    html = html.replace('{{NODES_JSON}}', () => base64JSON(nodes));
    html = html.replace('{{EDGES_JSON}}', () => base64JSON(edges));
    html = html.replace('{{FUNCTIONS_JSON}}', () => base64JSON(functionsList));
    html = html.replace('{{FILES_JSON}}', () => base64JSON(relativeFiles));
    html = html.replace('{{DEPS_JSON}}', () => base64JSON(dependencies));
    html = html.replace('{{DEP_USAGE_JSON}}', () => base64JSON(depUsageData));

    await fs.writeFile(outputPath, html);
}
