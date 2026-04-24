import React, { useState, useCallback, useEffect } from 'react';
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

const defaultInitialNodes = [
  {
    id: '1',
    type: 'default' as const,
    data: { label: 'Start', hoverText: 'Double click to edit' },
    position: { x: 250, y: 150 },
  },
];

// Module-level drag state
let draggedNodeType: string | null = null;
let draggedNodeLabel: string | null = null;

const Sidebar = () => {
  const onDragStart = (event: React.DragEvent, nodeType: string, label: string) => {
    draggedNodeType = nodeType;
    draggedNodeLabel = label;
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="w-56 bg-white border-r border-slate-200 p-4 flex flex-col gap-4" style={{ flexShrink: 0 }}>
      <h3 className="font-bold text-slate-800 text-base mb-1">Shapes Palette</h3>
      <div className="text-xs text-slate-500 mb-2">Drag shapes onto the canvas</div>
      
      <div 
        className="flex items-center justify-center p-3 bg-[#f1f8ed] border border-[#8dbf84] rounded-xl shadow-sm cursor-grab hover:shadow-md transition-all text-sm font-medium text-slate-700" 
        onDragStart={(event) => onDragStart(event, 'default', 'Process')} 
        draggable
      >
        Process
      </div>

      <div 
        className="flex items-center justify-center w-[80px] h-[80px] mx-auto bg-[#f1f8ed] border border-[#8dbf84] shadow-sm cursor-grab hover:shadow-md transition-all"
        style={{ clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }}
        onDragStart={(event) => onDragStart(event, 'diamond', 'Decision')} 
        draggable
      >
        <span className="text-xs font-medium text-slate-700">Decision</span>
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
    </div>
  );
};

const Flowboard = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState(defaultInitialNodes);
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
      event.stopPropagation();

      const type = draggedNodeType;
      const label = draggedNodeLabel;

      if (!type || !label) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode = {
        id: uuidv4(),
        type: type as 'default',
        position,
        data: { label, hoverText: 'Double click to edit' },
      };

      setNodes((nds) => [...nds, newNode]);
      draggedNodeType = null;
      draggedNodeLabel = null;
    },
    [screenToFlowPosition, setNodes],
  );

  const onNodeDoubleClick = useCallback((_event: React.MouseEvent, node: any) => {
    setSelectedNodeId(node.id);
  }, []);

  const updateNodeData = useCallback((id: string, label: string, hoverText: string) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === id) {
          return { ...n, data: { ...n.data, label, hoverText } };
        }
        return n;
      })
    );
    setSelectedNodeId(null);
  }, [setNodes]);

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <button 
          onClick={() => { setNodes([]); setEdges([]); localStorage.removeItem('ar_flow_sop_data'); }} 
          className="px-4 py-2 text-sm font-semibold text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition shadow-sm border border-red-100"
        >
          Clear Canvas
        </button>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeDoubleClick={onNodeDoubleClick}
        nodeTypes={nodeTypes}
        fitView
      >
        <Controls />
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
                    <input name="label" defaultValue={node.data.label as string} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" autoFocus />
                  </div>
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Hover Tooltip Text</label>
                    <textarea name="hoverText" defaultValue={node.data.hoverText as string} rows={3} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Text to show on hover" />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setSelectedNodeId(null)} className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition">Cancel</button>
                    <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition">Save Changes</button>
                  </div>
                </form>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};

const FlowSOP = () => {
  return (
    <div>
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Flow SOP</h1>
          <p className="text-slate-500 mt-1">Design your aesthetic standard operating procedures</p>
        </div>
      </div>
  
      {/* Fixed-height container - ReactFlow MUST have explicit pixel height */}
      <div 
        className="relative bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden"
        style={{ height: 'calc(100vh - 200px)', minHeight: '500px', display: 'flex' }}
      >
        <ReactFlowProvider>
          <Sidebar />
          {/* This wrapper div gets explicit width/height from the flex parent above */}
          <div style={{ flex: 1, position: 'relative' }}>
            <Flowboard />
          </div>
        </ReactFlowProvider>
      </div>
    </div>
  );
};

export default FlowSOP;
