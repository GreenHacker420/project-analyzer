
import fs from 'fs-extra';
import path from 'path';
import { ProjectAnalysis } from '../analyzer';
import { DependencyGraph } from '../graph';

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
        let color = '#60a5fa'; // Blue-400 (Default)
        let size = 20;
        let shape = 'dot';

        if (topRiskIds.has(node.id)) {
            color = '#f43f5e'; // Rose-500 (High Risk)
            size = 35 + (node.blastRadius / 2);
            shape = 'hexagon';
        } else if (node.affectedFiles > 5) {
            color = '#fbbf24'; // Amber-400 (Medium Risk)
            size = 25;
        }

        nodes.push({
            id: node.id,
            label: path.basename(node.id),
            title: node.id, // Tooltip
            value: size,
            color: { background: color, border: '#ffffff' },
            shape: shape,
            font: { color: '#e4e4e7' }, // Zinc-200
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
                color: { color: '#52525b', opacity: 0.4 }, // Zinc-600
                dashes: false
            });
        });
    });

    const html = `
<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Projectify Analysis Report</title>
    <!-- Tailwind CSS (via CDN) -->
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    fontFamily: {
                        sans: ['Inter', 'sans-serif'],
                        mono: ['JetBrains Mono', 'monospace'],
                    },
                    colors: {
                        background: '#09090b', // zinc-950
                        surface: '#18181b',    // zinc-900
                        primary: '#3b82f6',    // blue-500
                        accent: '#f43f5e',     // rose-500
                        border: '#27272a',     // zinc-800
                    }
                }
            }
        }
    </script>
    <!-- VS Code Icons (via CDN for file icons if needed, or simplified) -->
    
    <!-- Vis.js -->
    <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
    
    <!-- Google Fonts -->
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">

    <style>
        body { 
            background-color: #09090b; 
            color: #fafafa;
            overflow: hidden; /* Prevent body scroll */
        }
        
        .glass {
            background: rgba(24, 24, 27, 0.7);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .scrollbar-hide::-webkit-scrollbar {
            display: none;
        }

        /* Custom Scrollbar for sidebars */
        .custom-scroll::-webkit-scrollbar { width: 6px; }
        .custom-scroll::-webkit-scrollbar-track { background: transparent; }
        .custom-scroll::-webkit-scrollbar-thumb { background: #27272a; border-radius: 3px; }
        .custom-scroll::-webkit-scrollbar-thumb:hover { background: #3f3f46; }

        .vis-network { outline: none; }
        
        .animate-fade-in { animation: fadeIn 0.3s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
    </style>
</head>
<body class="flex h-screen font-sans antialiased text-zinc-100 bg-background selection:bg-primary/30">

    <!-- LEFT SIDEBAR: Navigation & Stats -->
    <aside class="w-80 flex-shrink-0 border-r border-border bg-surface/50 h-full flex flex-col z-20">
        <!-- Brand -->
        <div class="h-16 flex items-center px-6 border-b border-border">
            <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-blue-500/20 mr-3">P</div>
            <div>
                <h1 class="font-bold text-lg tracking-tight">Projectify</h1>
                <p class="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">Analysis Report</p>
            </div>
        </div>

        <!-- Scrollable Content -->
        <div class="flex-1 overflow-y-auto custom-scroll p-4 space-y-6">
            
            <!-- Key Metrics Grid -->
            <div class="grid grid-cols-2 gap-3">
                <div class="glass rounded-xl p-3 hover:bg-white/5 transition-colors">
                    <p class="text-[10px] text-zinc-400 font-medium uppercase mb-1">Total Files</p>
                    <p class="text-2xl font-bold font-mono">${analysis.fileCount}</p>
                </div>
                <div class="glass rounded-xl p-3 hover:bg-white/5 transition-colors">
                    <p class="text-[10px] text-zinc-400 font-medium uppercase mb-1">Relations</p>
                    <p class="text-2xl font-bold font-mono">${edges.length}</p>
                </div>
            </div>

            <!-- Blast Radius Risks -->
            <div>
                <div class="flex items-center justify-between mb-3 px-1">
                    <h3 class="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Top Risks</h3>
                    <span class="text-[10px] bg-rose-500/10 text-rose-400 px-1.5 py-0.5 rounded border border-rose-500/20">High Impact</span>
                </div>
                <div class="space-y-1">
                    ${topRisks.map((n, i) => `
                    <button onclick="focusNode('${n.id}')" class="w-full group flex items-center justify-between p-2 rounded-lg hover:bg-white/5 transition-all text-left border border-transparent hover:border-white/5">
                        <div class="flex items-center min-w-0 gap-3">
                            <span class="text-xs font-mono text-zinc-500 w-4 text-center">${i + 1}</span>
                            <span class="text-sm font-medium text-zinc-300 truncate group-hover:text-white transition-colors" title="${n.id}">
                                ${path.basename(n.id)}
                            </span>
                        </div>
                        <div class="flex items-center gap-2">
                             <div class="h-1.5 w-12 bg-zinc-800 rounded-full overflow-hidden">
                                <div class="h-full bg-rose-500" style="width: ${Math.min(n.blastRadius, 100)}%"></div>
                             </div>
                            <span class="text-xs font-mono text-rose-400 opacity-80 group-hover:opacity-100">${n.blastRadius.toFixed(0)}%</span>
                        </div>
                    </button>
                    `).join('')}
                </div>
            </div>

            <!-- Git Evolution (Conditional) -->
            ${gitStats ? `
            <div class="border-t border-border pt-4">
                 <div class="flex items-center justify-between mb-3 px-1">
                    <h3 class="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Git Evolution</h3>
                    <span class="text-[10px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded border border-blue-500/20">Active</span>
                </div>
                
                <div class="glass rounded-xl p-4 space-y-4">
                    <div class="flex justify-between items-end">
                        <div class="text-sm text-zinc-400">Total Commits</div>
                        <div class="text-xl font-bold font-mono text-white">${gitStats.totalCommits}</div>
                    </div>
                     <div class="flex justify-between items-end">
                        <div class="text-sm text-zinc-400">Contributors</div>
                        <div class="text-xl font-bold font-mono text-white">${gitStats.authroStats.length}</div>
                    </div>
                    
                    <div class="pt-2 border-t border-white/5 space-y-2">
                         <div class="text-[10px] text-zinc-500 uppercase tracking-wider">Top Contributors</div>
                         ${gitStats.authroStats.slice(0, 3).map((a: any) => `
                            <div class="flex items-center justify-between text-xs">
                                <span class="text-zinc-300 truncate max-w-[140px]">${a.name}</span>
                                <span class="font-mono text-zinc-500 bg-zinc-800/50 px-1.5 rounded">${a.commits}</span>
                            </div>
                         `).join('')}
                    </div>
                </div>
            </div>
            ` : ''}

        </div>
        
        <!-- Footer -->
        <div class="p-4 border-t border-border bg-surface/30">
             <p class="text-[10px] text-center text-zinc-600">Generated on ${new Date().toLocaleDateString()}</p>
        </div>
    </aside>

    <!-- RIGHT CONTENT: Visualization -->
    <main class="flex-1 relative h-full bg-[#050505] overflow-hidden">
        
        <!-- Toolbar Overlay -->
        <div class="absolute top-4 left-4 right-4 z-10 flex justify-between pointer-events-none">
            <!-- Search Bar -->
            <div class="pointer-events-auto w-96 relative group">
                <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg class="h-4 w-4 text-zinc-500 group-focus-within:text-blue-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>
                <input type="text" id="search-input" 
                       class="glass w-full pl-10 pr-4 py-2.5 rounded-xl text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50 transition-all shadow-lg shadow-black/50"
                       placeholder="Search file or component..."
                       onkeydown="if(event.key === 'Enter') searchNodes()">
                <div class="absolute right-2 top-2">
                     <kbd class="hidden sm:inline-block px-1.5 h-5 text-[10px] leading-5 font-mono font-medium text-zinc-500 bg-zinc-800 rounded border border-zinc-700">Enter</kbd>
                </div>
            </div>

            <!-- Controls -->
            <div class="pointer-events-auto flex items-center gap-2">
                <button id="physics-btn" onclick="togglePhysics()" class="glass px-4 py-2.5 rounded-xl text-xs font-medium text-zinc-300 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-2 shadow-lg">
                    <span class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" id="physics-indicator"></span>
                    <span id="physics-text">Simulating</span>
                </button>
                 <button onclick="network.fit({animation: {duration: 800}})" class="glass p-2.5 rounded-xl text-zinc-300 hover:text-white hover:bg-white/10 transition-colors shadow-lg" title="Reset View">
                    <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                </button>
            </div>
        </div>

        <!-- Vis.js Network Container -->
        <div id="network" class="w-full h-full cursor-grab active:cursor-grabbing"></div>

        <!-- Floating Detail Panel (Right Side) -->
        <div id="node-details" class="absolute top-20 right-4 w-80 glass rounded-2xl p-0 shadow-2xl translate-x-[120%] transition-transform duration-300 ease-spring z-20 overflow-hidden">
             <div class="p-4 border-b border-white/5 bg-white/5 flex justify-between items-start">
                 <div>
                    <h3 class="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-0.5">Component Details</h3>
                    <p id="detail-name" class="text-sm font-semibold text-white break-all leading-tight"></p>
                 </div>
                 <button onclick="hideDetails()" class="text-zinc-500 hover:text-white transition-colors">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                 </button>
             </div>
             
             <div class="p-4 space-y-4">
                 <!-- Metrics -->
                 <div class="grid grid-cols-2 gap-2">
                     <div class="bg-black/20 rounded-lg p-2 text-center border border-white/5">
                        <div class="text-[10px] text-zinc-500 uppercase">Impact Score</div>
                        <div id="detail-blast" class="text-lg font-mono font-bold text-rose-400">--</div>
                     </div>
                      <div class="bg-black/20 rounded-lg p-2 text-center border border-white/5">
                        <div class="text-[10px] text-zinc-500 uppercase">Affected</div>
                        <div id="detail-affected" class="text-lg font-mono font-bold text-amber-400">--</div>
                     </div>
                 </div>

                 <!-- Dependencies Info -->
                 <div class="space-y-2">
                    <div class="flex justify-between text-xs px-1">
                        <span class="text-zinc-400">Dependencies (Imports)</span>
                        <span id="detail-in" class="text-white font-mono">0</span>
                    </div>
                    <div class="h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
                        <div id="bar-in" class="h-full bg-blue-500 w-0 transition-all duration-500"></div>
                    </div>
                    
                    <div class="flex justify-between text-xs px-1 mt-3">
                        <span class="text-zinc-400">Dependents (Imported By)</span>
                        <span id="detail-out" class="text-white font-mono">0</span>
                    </div>
                     <div class="h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
                        <div id="bar-out" class="h-full bg-violet-500 w-0 transition-all duration-500"></div>
                    </div>
                 </div>
             </div>
             
             <div class="p-3 bg-white/5 border-t border-white/5">
                <button class="w-full py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium text-white transition-colors">
                    View Source Analysis
                </button>
             </div>
        </div>
    </main>

    <script>
        const nodesData = ${JSON.stringify(nodes)};
        const edgesData = ${JSON.stringify(edges)};
        
        // --- Vis.js Setup ---
        const nodes = new vis.DataSet(nodesData);
        const edges = new vis.DataSet(edgesData);
        const container = document.getElementById('network');
        
        const data = { nodes: nodes, edges: edges };
        const options = {
            nodes: {
                borderWidth: 0,
                shadow: true,
                font: { face: 'Inter', size: 12, strokeWidth: 4, strokeColor: '#09090b' }
            },
            edges: {
                width: 1,
                smooth: { type: 'continuous', roundness: 0.3 },
                selectionWidth: 2,
                hoverWidth: 0
            },
            physics: {
                forceAtlas2Based: {
                    gravitationalConstant: -26,
                    centralGravity: 0.005,
                    springLength: 230,
                    springConstant: 0.18
                },
                maxVelocity: 146,
                solver: 'forceAtlas2Based',
                timestep: 0.35,
                stabilization: { enabled: true, iterations: 1000 }
            },
            interaction: {
                hover: true,
                tooltipDelay: 200,
                hideEdgesOnDrag: true,
                zoomView: true
            }
        };

        const network = new vis.Network(container, data, options);

        // --- Physics Controls ---
        let isSimulating = true;
        
        network.on("stabilizationIterationsDone", function () {
            stopPhysics();
        });

        network.on("dragStart", function () {
            if (!isSimulating) startPhysics();
        });

        function togglePhysics() {
            if (isSimulating) stopPhysics();
            else startPhysics();
        }

        function startPhysics() {
            network.setOptions({ physics: { enabled: true } });
            isSimulating = true;
            document.getElementById('physics-text').innerText = 'Simulating';
            document.getElementById('physics-indicator').className = 'w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse';
            document.getElementById('physics-indicator').style.backgroundColor = '#22c55e';
        }

        function stopPhysics() {
            network.setOptions({ physics: { enabled: false } });
            isSimulating = false;
            document.getElementById('physics-text').innerText = 'Paused';
            document.getElementById('physics-indicator').className = 'w-1.5 h-1.5 rounded-full bg-zinc-500';
            document.getElementById('physics-indicator').style.backgroundColor = '#71717a';
        }

        // --- Interaction & Details Panel ---
        const detailsPanel = document.getElementById('node-details');
        
        network.on("click", function (params) {
            if (params.nodes.length > 0) {
                const nodeId = params.nodes[0];
                const node = nodes.get(nodeId);
                showDetails(node);
            } else if (params.edges.length === 0) {
                hideDetails();
            }
        });

        function showDetails(node) {
            // Populate Data
            document.getElementById('detail-name').innerText = node.label;
            document.getElementById('detail-blast').innerText = node.data.blastRadius + '%';
            document.getElementById('detail-affected').innerText = node.data.affectedFiles;
            
            document.getElementById('detail-in').innerText = node.data.inDegree;
            document.getElementById('detail-out').innerText = node.data.outDegree;
            
            // Animate Bars (Visual flair)
            setTimeout(() => {
                const max = 20; // Arbitrary max for bar scale
                const inPct = Math.min((node.data.inDegree / max) * 100, 100);
                const outPct = Math.min((node.data.outDegree / max) * 100, 100);
                document.getElementById('bar-in').style.width = inPct + '%';
                document.getElementById('bar-out').style.width = outPct + '%';
            }, 100);

            // Show Panel
            detailsPanel.classList.remove('translate-x-[120%]');
        }

        function hideDetails() {
            detailsPanel.classList.add('translate-x-[120%]');
             network.unselectAll();
        }

        function focusNode(nodeId) {
            network.focus(nodeId, {
                scale: 1.2,
                animation: { duration: 1000, easingFunction: 'easeInOutQuart' }
            });
            network.selectNodes([nodeId]);
            const node = nodes.get(nodeId);
            showDetails(node);
        }

        function searchNodes() {
            const query = document.getElementById('search-input').value.toLowerCase();
            if (!query) return;
            
            const allNodes = nodes.get();
            const found = allNodes.find(n => n.label.toLowerCase().includes(query));
            
            if (found) {
                focusNode(found.id);
            } else {
                // Shake Animation
                const input = document.getElementById('search-input');
                input.classList.add('ring-2', 'ring-rose-500', 'translate-x-1');
                setTimeout(() => input.classList.remove('translate-x-1'), 100);
                setTimeout(() => input.classList.add('-translate-x-1'), 200);
                setTimeout(() => input.classList.remove('ring-2', 'ring-rose-500', '-translate-x-1'), 300);
            }
        }
    </script>
</body>
</html>
    `;

    await fs.writeFile(outputPath, html);
}
