import React, { useEffect, useRef, useState } from 'react';
import { VaultAccountOverview, VAULT_CONTRACT_ID, EXPECTED_OWNER_ID } from '../../types/contract';
import { formatNear } from '../../utils/formatters';

interface LivingNodeNetworkProps {
  variant?: 'hero' | 'dashboard';
  vaultData?: VaultAccountOverview | null;
  className?: string;
  height?: number;
  interactive?: boolean;
}

interface NetworkNode {
  id: string;
  label: string;
  sublabel: string;
  type: 'agent' | 'vault' | 'owner' | 'consensus' | 'destination';
  status: 'active' | 'revoked' | 'pending';
  x: number;
  y: number;
  z?: number;
  baseRadius: number;
  color: string;
  haloColor: string;
  details: string;
}

interface NetworkEdge {
  from: string;
  to: string;
  label?: string;
  active: boolean;
  speed: number;
  color: string;
}

interface Particle {
  edgeIndex: number;
  progress: number;
  speed: number;
  size: number;
  color: string;
}

interface AmbientParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
}

export const LivingNodeNetwork: React.FC<LivingNodeNetworkProps> = ({
  variant = 'hero',
  vaultData,
  className = '',
  height = 380,
  interactive = true,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredNode, setHoveredNode] = useState<NetworkNode | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    const dpr = window.devicePixelRatio || 1;
    const width = container.clientWidth || 800;
    const heightPx = height;
    const isMobile = width < 520;

    canvas.width = width * dpr;
    canvas.height = heightPx * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${heightPx}px`;
    ctx.scale(dpr, dpr);

    // Build Nodes based on variant and real contract state
    let nodes: NetworkNode[] = [];
    let edges: NetworkEdge[] = [];

    if (variant === 'hero') {
      nodes = [
        {
          id: 'owner',
          label: 'Vault Owner',
          sublabel: 'Governance & Limits',
          type: 'owner',
          status: 'active',
          x: width * 0.16,
          y: heightPx * 0.28,
          baseRadius: 28,
          color: '#4B505C',
          haloColor: 'rgba(75, 80, 92, 0.08)',
          details: 'Full governance key. Configures spending caps, approvals, pause & withdrawals.',
        },
        {
          id: 'agent_alpha',
          label: 'AI Agent Alpha',
          sublabel: 'Function-Call Key',
          type: 'agent',
          status: 'active',
          x: width * 0.16,
          y: heightPx * 0.72,
          baseRadius: 26,
          color: '#008752',
          haloColor: 'rgba(0, 192, 118, 0.15)',
          details: 'Authorized Autonomous Agent. Restricted to request_payment() method only.',
        },
        {
          id: 'vault',
          label: 'NEAR AI Vault',
          sublabel: VAULT_CONTRACT_ID,
          type: 'vault',
          status: vaultData?.isPaused ? 'pending' : 'active',
          x: width * 0.50,
          y: heightPx * 0.50,
          baseRadius: 38,
          color: '#008752',
          haloColor: 'rgba(0, 192, 118, 0.22)',
          details: `Smart Contract Vault. Solvency: ${vaultData ? formatNear(vaultData.availableLiquidBalance, 2) : '0.15'} N Liquid, Daily Cap: 2.0 N.`,
        },
        {
          id: 'consensus',
          label: 'NEAR Protocol',
          sublabel: 'Testnet Shards',
          type: 'consensus',
          status: 'active',
          x: width * 0.82,
          y: heightPx * 0.30,
          baseRadius: 27,
          color: '#4B505C',
          haloColor: 'rgba(75, 80, 92, 0.08)',
          details: 'Asynchronous cross-contract call runtime & 1-second finality settlement.',
        },
        {
          id: 'merchant',
          label: 'Allowlisted Destination',
          sublabel: vaultData?.policy?.destination_allowlist?.[0] || 'whiteice2105.testnet',
          type: 'destination',
          status: 'active',
          x: width * 0.82,
          y: heightPx * 0.72,
          baseRadius: 26,
          color: '#008752',
          haloColor: 'rgba(0, 192, 118, 0.15)',
          details: 'Pre-approved destination. Eligible for instant automatic payments under threshold.',
        },
      ];

      edges = [
        { from: 'owner', to: 'vault', label: 'Policy Sync & Approvals', active: true, speed: 0.005, color: '#4B505C' },
        { from: 'agent_alpha', to: 'vault', label: 'Payment Intent (request_payment)', active: true, speed: 0.009, color: '#008752' },
        { from: 'vault', to: 'consensus', label: 'Promise Dispatch', active: true, speed: 0.008, color: '#008752' },
        { from: 'consensus', to: 'merchant', label: 'Direct Settlement', active: true, speed: 0.010, color: '#008752' },
      ];
    } else {
      // Dashboard variant: Live topology
      nodes = [
        {
          id: 'owner',
          label: 'Owner Key',
          sublabel: vaultData ? vaultData.ownerId : EXPECTED_OWNER_ID,
          type: 'owner',
          status: 'active',
          x: width * (isMobile ? 0.16 : 0.15),
          y: heightPx * (isMobile ? 0.58 : 0.5),
          baseRadius: isMobile ? 18 : 24,
          color: '#4B505C',
          haloColor: 'rgba(75, 80, 92, 0.08)',
          details: 'Governance Signer',
        },
        {
          id: 'agent',
          label: 'Agent Delegate',
          sublabel: vaultData?.authorizedAgents?.[0] || 'Delegated Agent',
          type: 'agent',
          status: 'active',
          x: width * (isMobile ? 0.38 : 0.38),
          y: heightPx * (isMobile ? 0.32 : 0.28),
          baseRadius: isMobile ? 17 : 22,
          color: '#008752',
          haloColor: 'rgba(0, 192, 118, 0.15)',
          details: 'Key restricted: request_payment only',
        },
        {
          id: 'vault',
          label: 'Smart Vault',
          sublabel: VAULT_CONTRACT_ID,
          type: 'vault',
          status: vaultData?.isPaused ? 'pending' : 'active',
          x: width * (isMobile ? 0.62 : 0.62),
          y: heightPx * (isMobile ? 0.58 : 0.5),
          baseRadius: isMobile ? 24 : 32,
          color: '#008752',
          haloColor: 'rgba(0, 192, 118, 0.22)',
          details: `Active Balance: ${vaultData ? formatNear(vaultData.availableLiquidBalance, 2) : '0.15'} N Liquid`,
        },
        {
          id: 'merchant',
          label: 'Merchant',
          sublabel: vaultData?.policy?.destination_allowlist?.[0] || 'whiteice2105.testnet',
          type: 'destination',
          status: 'active',
          x: width * (isMobile ? 0.84 : 0.85),
          y: heightPx * (isMobile ? 0.32 : 0.5),
          baseRadius: isMobile ? 18 : 24,
          color: '#008752',
          haloColor: 'rgba(0, 192, 118, 0.15)',
          details: 'Verified Destination Target',
        },
      ];

      edges = [
        { from: 'owner', to: 'vault', active: true, speed: 0.005, color: '#4B505C' },
        { from: 'agent', to: 'vault', active: true, speed: 0.009, color: '#008752' },
        { from: 'vault', to: 'merchant', active: true, speed: 0.009, color: '#008752' },
      ];
    }

    // Directional conduit flowing energy packets
    const particles: Particle[] = [];
    edges.forEach((edge, edgeIndex) => {
      for (let i = 0; i < 4; i++) {
        particles.push({
          edgeIndex,
          progress: i * 0.25,
          speed: edge.speed * (0.85 + Math.random() * 0.3),
          size: 3.5,
          color: edge.color,
        });
      }
    });

    // Ambient floating 3D atmospheric particles
    const ambientParticles: AmbientParticle[] = Array.from({ length: 32 }, () => ({
      x: Math.random() * width,
      y: Math.random() * heightPx,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.25,
      size: 1.2 + Math.random() * 1.6,
      alpha: 0.15 + Math.random() * 0.2,
    }));

    let time = 0;

    const render = () => {
      time += 0.02;
      ctx.clearRect(0, 0, width, heightPx);

      // 0. Render subtle ambient floating particles (Background atmospheric layer)
      ambientParticles.forEach(ap => {
        ap.x += ap.vx;
        ap.y += ap.vy;
        if (ap.x < 0) ap.x = width;
        if (ap.x > width) ap.x = 0;
        if (ap.y < 0) ap.y = heightPx;
        if (ap.y > heightPx) ap.y = 0;

        ctx.beginPath();
        ctx.arc(ap.x, ap.y, ap.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 135, 82, ${ap.alpha * 0.5})`;
        ctx.fill();
      });

      // 1. Draw connecting conduits (Curved Bezier Conduits)
      edges.forEach(edge => {
        const fromNode = nodes.find(n => n.id === edge.from);
        const toNode = nodes.find(n => n.id === edge.to);
        if (!fromNode || !toNode) return;

        const midX = (fromNode.x + toNode.x) / 2;
        const midY = (fromNode.y + toNode.y) / 2;
        const dx = toNode.x - fromNode.x;
        const dy = toNode.y - fromNode.y;
        const normalX = -dy * 0.12;
        const normalY = dx * 0.12;

        ctx.beginPath();
        ctx.moveTo(fromNode.x, fromNode.y);
        ctx.quadraticCurveTo(midX + normalX, midY + normalY, toNode.x, toNode.y);

        // Conduit background trace
        ctx.strokeStyle = 'rgba(216, 213, 202, 0.65)';
        ctx.lineWidth = 2.0;
        ctx.stroke();

        // Subtle green/charcoal pulse line
        ctx.strokeStyle = edge.color === '#008752' ? 'rgba(0, 135, 82, 0.35)' : 'rgba(75, 80, 92, 0.25)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 6]);
        ctx.lineDashOffset = -time * 20;
        ctx.stroke();
        ctx.setLineDash([]);
      });

      // 2. Draw animated moving data particles
      particles.forEach(p => {
        const edge = edges[p.edgeIndex];
        if (!edge) return;
        const fromNode = nodes.find(n => n.id === edge.from);
        const toNode = nodes.find(n => n.id === edge.to);
        if (!fromNode || !toNode) return;

        p.progress += p.speed;
        if (p.progress > 1) p.progress = 0;

        const midX = (fromNode.x + toNode.x) / 2;
        const midY = (fromNode.y + toNode.y) / 2;
        const dx = toNode.x - fromNode.x;
        const dy = toNode.y - fromNode.y;
        const normalX = -dy * 0.12;
        const normalY = dx * 0.12;

        const t = p.progress;
        const cpX = midX + normalX;
        const cpY = midY + normalY;
        const px = Math.pow(1 - t, 2) * fromNode.x + 2 * (1 - t) * t * cpX + Math.pow(t, 2) * toNode.x;
        const py = Math.pow(1 - t, 2) * fromNode.y + 2 * (1 - t) * t * cpY + Math.pow(t, 2) * toNode.y;

        // Particle core
        ctx.beginPath();
        ctx.arc(px, py, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color === '#008752' ? '#008752' : '#4B505C';
        ctx.fill();

        // Trailing glow
        ctx.beginPath();
        ctx.arc(px, py, p.size * 2, 0, Math.PI * 2);
        ctx.fillStyle = p.color === '#008752' ? 'rgba(0, 135, 82, 0.20)' : 'rgba(75, 80, 92, 0.12)';
        ctx.fill();
      });

      // 3. Draw Nodes with living breathing pulses & dimensional glass layering
      nodes.forEach(node => {
        const isHovered = hoveredNode?.id === node.id;
        const pulse = Math.sin(time * 3 + node.x * 0.05) * 3.5;
        const currentRadius = node.baseRadius + (isHovered ? 3 : 0);

        // Ambient breathing halo
        ctx.beginPath();
        ctx.arc(node.x, node.y, currentRadius + 10 + pulse, 0, Math.PI * 2);
        ctx.fillStyle = node.haloColor;
        ctx.fill();

        // Dimensional Liquid Glass Disc Backing
        ctx.beginPath();
        ctx.arc(node.x, node.y, currentRadius, 0, Math.PI * 2);
        const glassGrad = ctx.createRadialGradient(
          node.x - currentRadius * 0.3,
          node.y - currentRadius * 0.3,
          0,
          node.x,
          node.y,
          currentRadius
        );
        glassGrad.addColorStop(0, '#FFFFFF');
        glassGrad.addColorStop(0.7, '#FAF9F4');
        glassGrad.addColorStop(1, '#F2EFEB');
        ctx.fillStyle = glassGrad;
        ctx.shadowColor = 'rgba(17, 18, 21, 0.08)';
        ctx.shadowBlur = isHovered ? 18 : 10;
        ctx.shadowOffsetY = 4;
        ctx.fill();
        ctx.shadowColor = 'transparent';

        // Colored node ring with specular shine
        ctx.lineWidth = isHovered ? 3 : 2;
        ctx.strokeStyle = node.color;
        ctx.stroke();

        // Inner glowing core nucleus
        const coreR = currentRadius * 0.42 + Math.sin(time * 2.5 + node.x) * 1.5;
        const innerGrad = ctx.createRadialGradient(
          node.x,
          node.y,
          0,
          node.x,
          node.y,
          coreR
        );
        if (node.color === '#008752') {
          innerGrad.addColorStop(0, '#00C076');
          innerGrad.addColorStop(0.6, '#008752');
          innerGrad.addColorStop(1, 'rgba(0, 135, 82, 0.2)');
        } else {
          innerGrad.addColorStop(0, '#6A707E');
          innerGrad.addColorStop(0.6, '#4B505C');
          innerGrad.addColorStop(1, 'rgba(75, 80, 92, 0.2)');
        }

        ctx.beginPath();
        ctx.arc(node.x, node.y, coreR, 0, Math.PI * 2);
        ctx.fillStyle = innerGrad;
        ctx.fill();

        // Specular glint
        ctx.beginPath();
        ctx.arc(node.x - currentRadius * 0.3, node.y - currentRadius * 0.3, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fill();

        // Clean typography label below node
        ctx.textAlign = 'center';
        ctx.font = isMobile ? '700 10px "Plus Jakarta Sans", sans-serif' : '700 12px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = '#111215';
        ctx.fillText(node.label, node.x, node.y + currentRadius + (isMobile ? 14 : 18));

        // Sublabel (monospace)
        if (!isMobile) {
          ctx.font = '500 10px "JetBrains Mono", monospace';
          ctx.fillStyle = '#707584';
          ctx.fillText(node.sublabel, node.x, node.y + currentRadius + 32);
        }
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    // Mouse interaction listener
    const handleMouseMove = (e: MouseEvent) => {
      if (!interactive) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      setMousePos({ x: e.clientX, y: e.clientY });

      const found = nodes.find(node => {
        const dist = Math.hypot(node.x - mx, node.y - my);
        return dist <= node.baseRadius + 12;
      });

      setHoveredNode(found || null);
    };

    const handleMouseLeave = () => {
      setHoveredNode(null);
      setMousePos(null);
    };

    if (interactive) {
      canvas.addEventListener('mousemove', handleMouseMove);
      canvas.addEventListener('mouseleave', handleMouseLeave);
    }

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (interactive) {
        canvas.removeEventListener('mousemove', handleMouseMove);
        canvas.removeEventListener('mouseleave', handleMouseLeave);
      }
    };
  }, [variant, vaultData, interactive, height]);

  return (
    <div ref={containerRef} className={`relative w-full overflow-hidden ${className}`}>
      <canvas
        ref={canvasRef}
        className="w-full block select-none cursor-default"
      />

      {/* Floating Liquid Glass Tooltip when inspecting nodes */}
      {hoveredNode && mousePos && (
        <div
          className="fixed z-50 pointer-events-none p-4 rounded-2xl bg-white/85 backdrop-blur-xl border border-white/90 text-charcoal-900 shadow-elevation max-w-xs transition-opacity duration-150 animate-in fade-in"
          style={{
            left: `${mousePos.x + 16}px`,
            top: `${mousePos.y + 16}px`,
          }}
        >
          <div className="flex items-center gap-2.5">
            <span
              className="w-2.5 h-2.5 rounded-full ring-2 ring-white shadow-soft"
              style={{ backgroundColor: hoveredNode.color }}
            />
            <span className="font-extrabold text-xs font-sans text-charcoal-900">{hoveredNode.label}</span>
          </div>
          <p className="text-[11px] font-mono text-charcoal-500 mt-1">{hoveredNode.sublabel}</p>
          <p className="text-xs text-charcoal-600 mt-2.5 leading-relaxed font-sans border-t border-border/60 pt-2">
            {hoveredNode.details}
          </p>
        </div>
      )}
    </div>
  );
};
