'use client';

import React from 'react';
import { EdgeProps, getBezierPath, EdgeLabelRenderer } from 'reactflow';

interface CustomEdgeProps extends EdgeProps {
  data?: {
    hasMultiplePaths?: boolean;
    onConfigureRouting?: () => void;
  };
}

export default function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
}: CustomEdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  // Posicionar emoji mais próximo da origem (25% do caminho)
  const adjustedLabelX = sourceX + (labelX - sourceX) * 0.4;
  const adjustedLabelY = sourceY + (labelY - sourceY) * 0.4;

  return (
    <>
      <path
        id={id}
        style={style}
        className="react-flow__edge-path"
        d={edgePath}
        markerEnd={markerEnd}
      />
      {data?.hasMultiplePaths && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${adjustedLabelX}px,${adjustedLabelY}px)`,
              fontSize: 24,
              cursor: 'pointer',
              pointerEvents: 'all',
              background: 'white',
              borderRadius: '50%',
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              border: '2px solid #FEF3C7',
              transition: 'all 0.2s',
            }}
            onClick={(e) => {
              e.stopPropagation();
              data?.onConfigureRouting?.();
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = `translate(-50%, -50%) translate(${adjustedLabelX}px,${adjustedLabelY}px) scale(1.1)`;
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = `translate(-50%, -50%) translate(${adjustedLabelX}px,${adjustedLabelY}px) scale(1)`;
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
            }}
            title="Configurar condições de roteamento"
          >
            🔀
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
