import React, { memo, useState } from 'react';
import { Handle, Position } from '@xyflow/react';

interface CustomNodeProps {
  data: {
    label: string;
    hoverText?: string;
    type?: 'default' | 'diamond' | 'circle_yes' | 'circle_no';
  };
}

export const ProcessNode = memo(({ data }: CustomNodeProps) => {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div 
      className="relative flex items-center justify-center min-w-[150px] min-h-[60px] bg-[#f1f8ed] border-2 border-[#8dbf84] rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing px-4 py-2"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <Handle type="target" position={Position.Left} className="w-2 h-2 !bg-[#8dbf84]" />
      <div className="text-sm font-medium text-slate-700 text-center">
        {data.label}
      </div>
      <Handle type="source" position={Position.Right} className="w-2 h-2 !bg-[#8dbf84]" />

      {showTooltip && data.hoverText && (
        <div className="absolute z-50 bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-max max-w-xs bg-slate-800 text-white text-xs rounded-lg px-3 py-2 shadow-lg whitespace-pre-wrap">
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
          {data.hoverText}
        </div>
      )}
    </div>
  );
});

export const DecisionNode = memo(({ data }: CustomNodeProps) => {
    const [showTooltip, setShowTooltip] = useState(false);
  
    return (
      <div 
        className="relative flex items-center justify-center w-[120px] h-[120px] cursor-grab active:cursor-grabbing"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <div className="absolute inset-0 bg-[#f1f8ed] border-2 border-[#8dbf84] shadow-sm hover:shadow-md transition-shadow transform rotate-45 rounded-lg" />
        <Handle type="target" position={Position.Top} className="w-2 h-2 !bg-[#8dbf84] top-[-5px]" />
        <Handle type="target" position={Position.Left} className="w-2 h-2 !bg-[#8dbf84] left-[-5px]" />
        <div className="relative z-10 text-sm font-medium text-slate-700 text-center px-4 leading-tight">
          {data.label}
        </div>
        <Handle type="source" position={Position.Bottom} className="w-2 h-2 !bg-[#8dbf84] bottom-[-5px]" />
        <Handle type="source" position={Position.Right} className="w-2 h-2 !bg-[#8dbf84] right-[-5px]" />
  
        {showTooltip && data.hoverText && (
          <div className="absolute z-50 bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-max max-w-xs bg-slate-800 text-white text-xs rounded-lg px-3 py-2 shadow-lg whitespace-pre-wrap">
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
            {data.hoverText}
          </div>
        )}
      </div>
    );
});

export const CircleYesNode = memo(({ data }: CustomNodeProps) => {
    const [showTooltip, setShowTooltip] = useState(false);
  
    return (
      <div 
        className="relative flex items-center justify-center w-[60px] h-[60px] bg-[#e6f0fa] border-2 border-[#4a8cdb] rounded-full shadow-sm hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <Handle type="target" position={Position.Left} className="w-2 h-2 !bg-[#4a8cdb]" />
        <div className="text-sm font-bold text-[#4a8cdb]">
          YES
        </div>
        <Handle type="source" position={Position.Right} className="w-2 h-2 !bg-[#4a8cdb]" />
        <Handle type="source" position={Position.Bottom} className="w-2 h-2 !bg-[#4a8cdb]" />
  
        {showTooltip && data.hoverText && (
          <div className="absolute z-50 bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-max max-w-xs bg-slate-800 text-white text-xs rounded-lg px-3 py-2 shadow-lg whitespace-pre-wrap">
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
            {data.hoverText}
          </div>
        )}
      </div>
    );
});

export const CircleNoNode = memo(({ data }: CustomNodeProps) => {
    const [showTooltip, setShowTooltip] = useState(false);
  
    return (
      <div 
        className="relative flex items-center justify-center w-[60px] h-[60px] bg-[#fdf0ef] border-2 border-[#df645e] rounded-full shadow-sm hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <Handle type="target" position={Position.Left} className="w-2 h-2 !bg-[#df645e]" />
        <div className="text-sm font-bold text-[#df645e]">
          NO
        </div>
        <Handle type="source" position={Position.Right} className="w-2 h-2 !bg-[#df645e]" />
        <Handle type="source" position={Position.Bottom} className="w-2 h-2 !bg-[#df645e]" />
  
        {showTooltip && data.hoverText && (
          <div className="absolute z-50 bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-max max-w-xs bg-slate-800 text-white text-xs rounded-lg px-3 py-2 shadow-lg whitespace-pre-wrap">
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
            {data.hoverText}
          </div>
        )}
      </div>
    );
});
