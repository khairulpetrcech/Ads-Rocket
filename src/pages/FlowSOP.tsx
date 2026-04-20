import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  Connection,
  MarkerType,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { v4 as uuidv4 } from 'uuid';

import { ProcessNode, DecisionNode, CircleYesNode, CircleNoNode } from '../components/FlowSOP/CustomNodes';

const nodeTypes = {
  default: ProcessNode,
  diamond: DecisionNode,
  circle_yes: CircleYesNode,
  circle_no: CircleNoNode,
};

const initialNodes = [
  {
    id: '1',
    type: 'default',
    data: { label: 'Submit Job\nApplication', hoverText: 'Applicant submits resume and portfolio' },
    position: { x: 250, y: 150 },
  },
];

// Use module-level variables to bypass cross-browser dataTransfer stringification bugs
let draggedNodeType: string | null = null;
let draggedNodeLabel: string | null = null;

const Sidebar = () => {
  const onDragStart = (event: React.DragEvent, nodeType: string, label: string) => {
    draggedNodeType = nodeType;
    draggedNodeLabel = label;
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <aside className="w-64 bg-white border-r border-slate-200 p-4 flex flex-col gap-4">
      <h3 className="font-bold text-slate-800 text-lg mb-2">Shapes Palette</h3>
      <div className="text-sm text-slate-500 mb-4">Drag and drop shapes to the canvas.</div>
      
      <div 
        className="flex items-center justify-center p-3 bg-[#f1f8ed] border border-[#8dbf84] rounded-xl shadow-sm cursor-grab hover:shadow-md transition-all text-sm font-medium text-slate-700" 
        onDragStart={(event) => onDragStart(event, 'default', 'Process')} 
        draggable
      >
        Process
      </div>

      <div 
        className="flex items-center justify-center w-[80px] h-[80px] mx-auto bg-[#f1f8ed] border border-[#8dbf84] shadow-sm transform cursor-grab hover:shadow-md transition-all relative"
        style={{ clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }}
        onDragStart={(event) => onDragStart(event, 'diamond', 'Decision')} 
        draggable
      >
        <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-slate-700 transform -rotate-45 p-1 text-center">Decision</span>
      </div>

      <div className="flex gap-4 justify-center">
        <div 
          className="flex items-center justify-center w-[50px] h-[50px] bg-[#e6f0fa] border border-[#4a8cdb] rounded-full shadow-sm cursor-grab hover:shadow-md transition-all text-xs font-bold text-[#4a8cdb]"
          onDragStart={(event) => onDragStart(event, 'circle_yes', 'YES')} 
          draggable
        >
          YES
        </div>
        <div 
          className="flex items-center justify-center w-[50px] h-[50px] bg-[#fdf0ef] border border-[#df645e] rounded-full shadow-sm cursor-grab hover:shadow-md transition-all text-xs font-bold text-[#df645e]"
          onDragStart={(event) => onDragStart(event, 'circle_no', 'NO')} 
          draggable
        >
          NO
        </div>
      </div>
    </aside>
  );
};

const Flowboard = () => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const { screenToFlowPosition } = useReactFlow();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Load from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem('ar_flow_sop_data');
    if (saved) {
      try {
        const { nodes: savedNodes, edges: savedEdges } = JSON.parse(saved);
        if (savedNodes && savedNodes.length > 0) setNodes(savedNodes);
        if (savedEdges && savedEdges.length > 0) setEdges(savedEdges);
      } catch (e) {
        console.error("Failed to parse saved flow data");
      }
    }
  }, [setNodes, setEdges]);

  // Save to local storage automatically
  useEffect(() => {
    if (nodes.length > 0 || edges.length > 0) {
      localStorage.setItem('ar_flow_sop_data', JSON.stringify({ nodes, edges }));
    }
  }, [nodes, edges]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' }, style: { strokeWidth: 2, stroke: '#94a3b8' } }, eds)),
    [setEdges],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      if (!draggedNodeType || !draggedNodeLabel) {
        return;
      }

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode = {
        id: uuidv4(),
        type: draggedNodeType,
        position,
        data: { label: draggedNodeLabel, hoverText: 'Double click to edit label and hover text' },
      };

      setNodes((nds) => nds.concat(newNode));
      
      // Reset after drop
      draggedNodeType = null;
      draggedNodeLabel = null;
    },
    [screenToFlowPosition, setNodes],
  );

  const onNodeDoubleClick = (event: React.MouseEvent, node: any) => {
    setSelectedNodeId(node.id);
  };

  const updateNodeData = (id: string, label: string, hoverText: string) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === id) {
          n.data = { ...n.data, label, hoverText };
        }
        return n;
      })
    );
    setSelectedNodeId(null);
  };

  return (
    <div className="flex-1 h-full relative flex flex-col">
       <div className="absolute top-4 right-4 z-10 flex gap-2">
            <button 
                onClick={() => { setNodes([]); setEdges([]); }} 
                className="px-4 py-2 text-sm font-semibold text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition shadow-sm border border-red-100"
            >
                Clear Canvas
            </button>
        </div>
        <div className="flex-1 h-full w-full" ref={reactFlowWrapper} onDrop={onDrop} onDragOver={onDragOver}>
            <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeDoubleClick={onNodeDoubleClick}
            nodeTypes={nodeTypes}
            fitView
            className="bg-[#fcfdfd]"
            >
            <Controls className="bg-white shadow-md border-slate-100 text-slate-700 fill-slate-700" />
            <Background color="#cbd5e1" gap={20} size={1.5} />
            </ReactFlow>

            {/* Edit Modal */}
            {selectedNodeId && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
                <div className="bg-white p-6 rounded-xl shadow-xl w-96 max-w-full">
                <h3 className="text-lg font-bold text-slate-800 mb-4">Edit Shape</h3>
                
                {(() => {
                    const node = nodes.find(n => n.id === selectedNodeId);
                    if (!node) return null;
                    return (
                    <form onSubmit={(e) => {
                        e.preventDefault();
                        const formData = new FormData(e.currentTarget);
                        updateNodeData(node.id, formData.get('label') as string, formData.get('hoverText') as string);
                    }}>
                        <div className="mb-4">
                        <label className="block text-sm font-medium text-slate-700 mb-1">Label</label>
                        <input 
                            name="label" 
                            defaultValue={node.data.label} 
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" 
                            autoFocus
                        />
                        </div>
                        <div className="mb-6">
                        <label className="block text-sm font-medium text-slate-700 mb-1">Hover Tooltip Text</label>
                        <textarea 
                            name="hoverText" 
                            defaultValue={node.data.hoverText} 
                            rows={3} 
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" 
                            placeholder="Text to show on hover"
                        />
                        </div>
                        <div className="flex justify-end gap-2">
                        <button 
                            type="button" 
                            onClick={() => setSelectedNodeId(null)} 
                            className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit" 
                            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition"
                        >
                            Save Changes
                        </button>
                        </div>
                    </form>
                    );
                })()}
                </div>
            </div>
            )}
        </div>
    </div>
  );
};

const Flow = () => {
    return (
        <div className="flex flex-col h-full bg-[#f8fafc]">
          <div className="mb-6 flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Flow SOP</h1>
              <p className="text-slate-500 mt-1">Design your aesthetic standard operating procedures</p>
            </div>
          </div>
    
          <div className="flex flex-row flex-1 h-full min-h-[600px] bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <ReactFlowProvider>
              <Sidebar />
              <Flowboard />
            </ReactFlowProvider>
          </div>
        </div>
      );
}

export default Flow;
