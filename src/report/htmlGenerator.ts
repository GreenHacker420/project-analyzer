
import fs from 'fs-extra';
import path from 'path';
import { ProjectAnalysis } from '../analyzer';
import { DependencyGraph } from '../graph';

export async function generateHtmlReport(
    projectPath: string,
    analysis: ProjectAnalysis,
    graph: DependencyGraph,
    outputPath: string
) {
    const nodes: any[] = [];
    const edges: any[] = [];
    const topRisks = graph.getTopBlastRadius(10);
    const topRiskIds = new Set(topRisks.map(n => n.id));

    graph.getNodes().forEach(node => {
        let color = '#3b82f6'; // Blue-500
        let size = 20;

        if (topRiskIds.has(node.id)) {
            color = '#ef4444'; // Red-500
            size = 30 + (node.blastRadius / 2);
        } else if (node.affectedFiles > 0) {
            color = '#eab308'; // Yellow-500
            size = 25;
        }

        nodes.push({
            id: node.id,
            label: path.basename(node.id),
            title: `${path.basename(node.id)}`,
            value: size,
            color: color,
            data: {
                fullPath: node.id,
                blastRadius: node.blastRadius.toFixed(2),
                affectedFiles: node.affectedFiles,
                inDegree: node.inDegree, // Deps
                outDegree: node.outDegree // Dependents
            }
        });
    });

    graph.getEdges().forEach((targets, source) => {
        targets.forEach(target => {
            edges.push({ from: source, to: target, arrows: 'to', color: { color: '#71717a', opacity: 0.3 } });
        });
    });

    const html = `
<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Projectify Analysis</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    fontFamily: { sans: ['Inter', 'sans-serif'] },
                    colors: {
                        background: '#09090b', // zinc-950
                        foreground: '#fafafa', // zinc-50
                        card: '#18181b', // zinc-900
                        'card-foreground': '#fafafa',
                        popover: '#18181b',
                        'popover-foreground': '#fafafa',
                        primary: '#fafafa',
                        'primary-foreground': '#18181b',
                        secondary: '#27272a', // zinc-800
                        'secondary-foreground': '#fafafa',
                        muted: '#27272a',
                        'muted-foreground': '#a1a1aa', // zinc-400
                        accent: '#27272a',
                        'accent-foreground': '#fafafa',
                        destructive: '#7f1d1d',
                        'destructive-foreground': '#fafafa',
                        border: '#27272a',
                        input: '#27272a',
                        ring: '#d4d4d8',
                    }
                }
            }
        }
    </script>
    <style>
        body { background-color: #09090b; color: #fafafa; }
        .vis-network { outline: none; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #09090b; }
        ::-webkit-scrollbar-thumb { background: #27272a; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #3f3f46; }
    </style>
</head>
<body class="flex h-screen overflow-hidden font-sans">

    <!-- Sidebar -->
    <div class="w-80 h-full border-r border-border bg-background flex flex-col z-20 shadow-2xl relative">
        <div class="p-6 border-b border-border">
            <div class="flex items-center gap-2 mb-1">
                <div class="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-black font-bold text-lg">P</div>
                <h1 class="text-xl font-bold tracking-tight">Projectify</h1>
            </div>
            <p class="text-xs text-muted-foreground truncate" title="${projectPath}">${projectPath}</p>
        </div>

        <div class="flex-1 overflow-y-auto p-4 space-y-6">
            <!-- Stats Grid -->
            <div class="grid grid-cols-2 gap-3">
                <div class="bg-card border border-border rounded-xl p-3 shadow-sm">
                    <div class="text-xs text-muted-foreground font-medium mb-1">Files</div>
                    <div class="text-2xl font-bold tracking-tight">${analysis.fileCount}</div>
                </div>
                <div class="bg-card border border-border rounded-xl p-3 shadow-sm">
                    <div class="text-xs text-muted-foreground font-medium mb-1">Relations</div>
                    <div class="text-2xl font-bold tracking-tight">${edges.length}</div>
                </div>
            </div>

            <!-- Risk Section -->
            <div>
                <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">High Impact Components</h3>
                <div class="space-y-2">
                    ${topRisks.map(n => `
                    <div onclick="focusNode('${n.id}')" class="group flex items-center justify-between p-2 rounded-lg hover:bg-accent transition-colors cursor-pointer border border-transparent hover:border-border">
                        <div class="flex items-center gap-3 overflow-hidden">
                            <div class="w-2 h-2 rounded-full bg-red-500 shrink-0"></div>
                            <span class="text-sm font-medium truncate group-hover:text-white text-zinc-300" title="${n.id}">${path.basename(n.id)}</span>
                        </div>
                        <span class="text-xs font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded text-[10px]">${n.blastRadius.toFixed(0)}%</span>
                    </div>
                    `).join('')}
                </div>
            </div>

            <!-- Node Details Panel (Dynamic) -->
            <div id="node-details" class="hidden animate-in slide-in-from-left-4 fade-in duration-200">
                <div class="border-t border-border my-4"></div>
                <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">Selection Details</h3>
                
                <div class="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
                    <div class="p-3 bg-secondary/30 border-b border-border">
                        <h2 id="detail-name" class="text-sm font-semibold break-all text-white"></h2>
                    </div>
                    <div class="p-3 space-y-3">
                        <div class="flex justify-between items-center text-sm">
                            <span class="text-muted-foreground">Impact Score</span>
                            <span class="font-mono font-medium text-white" id="detail-blast"></span>
                        </div>
                        <div class="flex justify-between items-center text-sm">
                            <span class="text-muted-foreground">Affected Files</span>
                            <span class="font-mono font-medium text-white" id="detail-affected"></span>
                        </div>
                         <div class="flex justify-between items-center text-sm">
                            <span class="text-muted-foreground">Dependencies</span>
                            <span class="font-mono font-medium text-white" id="detail-out"></span>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="p-4 border-t border-border text-center">
            <p class="text-[10px] text-muted-foreground">Generated by Projectify 2.0</p>
        </div>
    </div>

    <!-- Main Content -->
    <div class="flex-1 relative bg-background">
        <!-- Toolbar -->
        <div class="absolute top-4 left-4 right-4 z-10 flex justify-between pointer-events-none">
            <!-- Search -->
            <div class="pointer-events-auto bg-card/80 backdrop-blur-md border border-border shadow-lg rounded-lg p-1.5 flex items-center w-80 transition-all focus-within:ring-2 focus-within:ring-white/20">
                <svg class="w-4 h-4 ml-2 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                <input type="text" id="search-input" 
                       class="bg-transparent border-none outline-none text-sm ml-2 w-full text-foreground placeholder:text-muted-foreground"
                       placeholder="Search components..." 
                       onkeydown="if(event.key === 'Enter') searchNodes()">
            </div>

            <!-- Actions -->
            <div class="pointer-events-auto flex items-center gap-2">
                <button id="physics-btn" onclick="togglePhysics()" class="h-9 px-4 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 text-sm font-medium transition-colors shadow-sm border border-border">
                    Running...
                </button>
                <button onclick="network.fit()" class="h-9 w-9 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center shadow-md transition-transform active:scale-95">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path></svg>
                </button>
            </div>
        </div>

        <div id="network" class="w-full h-full"></div>
    </div>

    <script>
        const nodesData = ${JSON.stringify(nodes)};
        const edgesData = ${JSON.stringify(edges)};
        
        const nodes = new vis.DataSet(nodesData);
        const edges = new vis.DataSet(edgesData);

        const container = document.getElementById('network');
        const data = { nodes: nodes, edges: edges };
        const options = {
            nodes: {
                shape: 'dot',
                font: { color: '#fafafa', face: 'Inter', size: 14, strokeWidth: 0, vadjust: -30 }, // Labels below
                borderWidth: 0,
                shadow: { enabled: true, color: 'rgba(0,0,0,0.5)', size: 10, x: 0, y: 5 },
                scaling: {
                    min: 10, max: 30,
                    label: { enabled: true, min: 14, max: 14 } // Consistent font
                }
            },
            edges: {
                width: 1,
                smooth: { type: 'continuous', roundness: 0.5 },
                color: { inherit: 'from', opacity: 0.5 }
            },
            physics: {
                stabilization: {
                    enabled: true,
                    iterations: 2000,
                    updateInterval: 50,
                },
                barnesHut: {
                    gravitationalConstant: -30000,
                    centralGravity: 0.1,
                    springLength: 200,
                    springConstant: 0.02,
                    damping: 0.3,
                    avoidOverlap: 0.5
                },
                minVelocity: 0.75
            },
            interaction: {
                hover: true,
                tooltipDelay: 100,
                hideEdgesOnDrag: true,
                dragNodes: true,
                navigationButtons: false, 
                keyboard: true,
                zoomView: true
            }
        };

        const network = new vis.Network(container, data, options);
        
        // Physics Logic
        let isStable = false;
        network.on("stabilizationIterationsDone", function () {
            network.setOptions( { physics: false } );
            document.getElementById('physics-btn').innerText = 'Paused';
            document.getElementById('physics-btn').classList.add('opacity-70');
            isStable = true;
        });

        network.on("dragStart", function () {
            if (isStable) { // Auto-resume on drag
                 network.setOptions( { physics: true } );
                 document.getElementById('physics-btn').innerText = 'Running...';
                 document.getElementById('physics-btn').classList.remove('opacity-70');
            }
        });

        function togglePhysics() {
            const btn = document.getElementById('physics-btn');
            const isRunning = btn.innerText.includes('Running');
            
            if (isRunning) {
                network.setOptions( { physics: false } );
                btn.innerText = 'Paused';
                btn.classList.add('opacity-70');
            } else {
                network.setOptions( { physics: true } );
                btn.innerText = 'Running...';
                btn.classList.remove('opacity-70');
            }
        }

        // Interaction Logic
        network.on("click", function (params) {
            if (params.nodes.length > 0) {
                const nodeId = params.nodes[0];
                const node = nodes.get(nodeId);
                showDetails(node);
            } else {
                document.getElementById('node-details').classList.add('hidden');
            }
        });

        function showDetails(node) {
            const el = document.getElementById('node-details');
            el.classList.remove('hidden');
            
            document.getElementById('detail-name').innerText = node.label;
            document.getElementById('detail-name').title = node.label;
            document.getElementById('detail-blast').innerText = node.data.blastRadius + '%';
            document.getElementById('detail-affected').innerText = node.data.affectedFiles;
            document.getElementById('detail-out').innerText = node.data.outDegree; 
        }

        function focusNode(nodeId) {
            network.focus(nodeId, {
                scale: 1.5,
                animation: { duration: 1000, easingFunction: 'easeInOutQuad' }
            });
            const node = nodes.get(nodeId);
            showDetails(node);
            network.selectNodes([nodeId]);
        }
        
        function searchNodes() {
            const query = document.getElementById('search-input').value.toLowerCase();
            if (!query) return;
            
            const allNodes = nodes.get();
            const found = allNodes.find(n => n.label.toLowerCase().includes(query));
            
            if (found) {
                focusNode(found.id);
            } else {
                // Shake effect on input
                const imp = document.getElementById('search-input').parentElement;
                imp.classList.add('ring-2', 'ring-red-500');
                setTimeout(() => imp.classList.remove('ring-2', 'ring-red-500'), 500);
            }
        }
    </script>
</body>
</html>
  `;

    await fs.writeFile(outputPath, html);
}
