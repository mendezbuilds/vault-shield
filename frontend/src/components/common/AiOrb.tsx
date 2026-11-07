import React, { useEffect, useRef } from 'react';

interface AiOrbProps {
  size?: number;
  className?: string;
  glowColor?: string;
  coreColor?: string;
  interactive?: boolean;
}

export const AiOrb: React.FC<AiOrbProps> = ({
  size = 320,
  className = '',
  glowColor = '#00C076',
  coreColor = '#008752',
  interactive = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0, isHovering: false });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    const dpr = window.devicePixelRatio || 1;
    const width = size;
    const height = size;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Orbiting atmospheric energy particles
    const particleCount = 24;
    const particles = Array.from({ length: particleCount }, (_, i) => ({
      angle: (i / particleCount) * Math.PI * 2,
      speed: 0.008 + (i % 5) * 0.003,
      radiusX: (size * 0.46) + ((i * 17) % (size * 0.12)),
      radiusY: (size * 0.18) + ((i * 11) % (size * 0.08)),
      tilt: -0.35 + (i % 3) * 0.1,
      size: 1.5 + (i % 3) * 0.8,
      alpha: 0.3 + (i % 4) * 0.18,
    }));

    let time = 0;

    const render = () => {
      time += 0.02;

      // Smooth mouse interpolation (spring feel)
      mouseRef.current.x += (mouseRef.current.targetX - mouseRef.current.x) * 0.08;
      mouseRef.current.y += (mouseRef.current.targetY - mouseRef.current.y) * 0.08;

      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;
      const baseR = size * 0.36;

      const tiltX = mouseRef.current.x * 24;
      const tiltY = mouseRef.current.y * 24;

      // 1. Atmospheric Ambient Glow
      const ambientGlow = ctx.createRadialGradient(
        cx + tiltX * 0.5,
        cy + tiltY * 0.5,
        baseR * 0.2,
        cx,
        cy,
        baseR * 1.5
      );
      ambientGlow.addColorStop(0, 'rgba(0, 192, 118, 0.16)');
      ambientGlow.addColorStop(0.5, 'rgba(0, 192, 118, 0.04)');
      ambientGlow.addColorStop(1, 'rgba(251, 251, 249, 0)');

      ctx.beginPath();
      ctx.arc(cx, cy, baseR * 1.5, 0, Math.PI * 2);
      ctx.fillStyle = ambientGlow;
      ctx.fill();

      // 2. Draw background orbiting particles (Z < 0)
      particles.forEach(p => {
        p.angle += p.speed;
        const z = Math.sin(p.angle);
        if (z < 0) {
          const rawX = Math.cos(p.angle) * p.radiusX;
          const rawY = Math.sin(p.angle) * p.radiusY;
          // Apply tilt rotation
          const px = cx + rawX * Math.cos(p.tilt) - rawY * Math.sin(p.tilt);
          const py = cy + rawX * Math.sin(p.tilt) + rawY * Math.cos(p.tilt);

          ctx.beginPath();
          ctx.arc(px, py, p.size * (0.8 + z * 0.3), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(0, 135, 82, ${Math.max(0.1, p.alpha * (0.6 + z * 0.4))})`;
          ctx.fill();
        }
      });

      // 3. Liquid Glass Morphing Outer Shell
      // Compute organic perturbed perimeter
      const points = 48;
      ctx.beginPath();
      for (let i = 0; i <= points; i++) {
        const theta = (i / points) * Math.PI * 2;
        // Harmonic organic displacement waves
        const wave1 = Math.sin(theta * 3 + time * 1.2) * 4.5;
        const wave2 = Math.cos(theta * 2 - time * 0.9) * 3.0;
        const wave3 = Math.sin(theta * 5 + time * 1.6) * 1.8;
        const r = baseR + wave1 + wave2 + wave3;

        const x = cx + Math.cos(theta) * r;
        const y = cy + Math.sin(theta) * r;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();

      // Shell Base Gradient (Glass volume)
      const shellGrad = ctx.createRadialGradient(
        cx - baseR * 0.3 + tiltX,
        cy - baseR * 0.35 + tiltY,
        baseR * 0.1,
        cx,
        cy,
        baseR
      );
      shellGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
      shellGrad.addColorStop(0.35, 'rgba(247, 246, 241, 0.75)');
      shellGrad.addColorStop(0.7, 'rgba(235, 249, 243, 0.6)');
      shellGrad.addColorStop(0.92, 'rgba(0, 192, 118, 0.22)');
      shellGrad.addColorStop(1, 'rgba(0, 135, 82, 0.45)');

      ctx.fillStyle = shellGrad;
      ctx.shadowColor = 'rgba(17, 18, 21, 0.08)';
      ctx.shadowBlur = 28;
      ctx.shadowOffsetY = 12;
      ctx.fill();
      ctx.shadowColor = 'transparent';

      // Shell Specular Glass Border
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 1.8;
      ctx.stroke();

      // 4. Inner Intelligent Energy Core (Nucleus)
      const coreR = baseR * 0.42 + Math.sin(time * 2.2) * 3.5;
      const coreGrad = ctx.createRadialGradient(
        cx + tiltX * 0.7,
        cy + tiltY * 0.7,
        0,
        cx,
        cy,
        coreR * 1.2
      );
      coreGrad.addColorStop(0, 'rgba(0, 192, 118, 0.85)');
      coreGrad.addColorStop(0.45, 'rgba(0, 135, 82, 0.6)');
      coreGrad.addColorStop(0.85, 'rgba(0, 135, 82, 0.15)');
      coreGrad.addColorStop(1, 'rgba(0, 135, 82, 0)');

      ctx.beginPath();
      ctx.arc(cx + tiltX * 0.3, cy + tiltY * 0.3, coreR, 0, Math.PI * 2);
      ctx.fillStyle = coreGrad;
      ctx.fill();

      // 5. Caustic Refraction Internal Rings
      for (let ring = 1; ring <= 2; ring++) {
        const ringRadius = baseR * (0.6 + ring * 0.16) + Math.cos(time * 1.5 + ring) * 3;
        ctx.beginPath();
        ctx.ellipse(
          cx + tiltX * 0.4,
          cy + tiltY * 0.4,
          ringRadius,
          ringRadius * 0.45,
          time * 0.4 * (ring === 1 ? 1 : -1),
          0,
          Math.PI * 2
        );
        ctx.strokeStyle = ring === 1 ? 'rgba(0, 192, 118, 0.28)' : 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      // 6. Top-Left Primary Specular Glare (Realistic Glass Lens Glint)
      const glintX = cx - baseR * 0.42 + tiltX * 0.6;
      const glintY = cy - baseR * 0.45 + tiltY * 0.6;
      const glintGrad = ctx.createRadialGradient(glintX, glintY, 0, glintX, glintY, baseR * 0.35);
      glintGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
      glintGrad.addColorStop(0.4, 'rgba(255, 255, 255, 0.45)');
      glintGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

      ctx.beginPath();
      ctx.ellipse(glintX, glintY, baseR * 0.28, baseR * 0.16, -Math.PI / 4, 0, Math.PI * 2);
      ctx.fillStyle = glintGrad;
      ctx.fill();

      // 7. Secondary Rim Crescent (Fresnel Edge Reflection)
      ctx.beginPath();
      ctx.arc(cx, cy, baseR - 1.5, Math.PI * 0.75, Math.PI * 1.4);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.lineWidth = 2.2;
      ctx.stroke();

      // Bottom emerald rim highlight
      ctx.beginPath();
      ctx.arc(cx, cy, baseR - 1.5, 0, Math.PI * 0.5);
      ctx.strokeStyle = 'rgba(0, 192, 118, 0.4)';
      ctx.lineWidth = 1.8;
      ctx.stroke();

      // 8. Foreground orbiting particles (Z >= 0)
      particles.forEach(p => {
        const z = Math.sin(p.angle);
        if (z >= 0) {
          const rawX = Math.cos(p.angle) * p.radiusX;
          const rawY = Math.sin(p.angle) * p.radiusY;
          const px = cx + rawX * Math.cos(p.tilt) - rawY * Math.sin(p.tilt);
          const py = cy + rawX * Math.sin(p.tilt) + rawY * Math.cos(p.tilt);

          ctx.beginPath();
          ctx.arc(px, py, p.size * (1 + z * 0.4), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(0, 192, 118, ${Math.min(1, p.alpha * (1 + z * 0.5))})`;
          ctx.shadowColor = 'rgba(0, 192, 118, 0.5)';
          ctx.shadowBlur = 6;
          ctx.fill();
          ctx.shadowColor = 'transparent';
        }
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    // Mouse tracking
    const handleMouseMove = (e: MouseEvent) => {
      if (!interactive) return;
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      mouseRef.current.targetX = Math.max(-0.5, Math.min(0.5, x));
      mouseRef.current.targetY = Math.max(-0.5, Math.min(0.5, y));
    };

    const handleMouseLeave = () => {
      mouseRef.current.targetX = 0;
      mouseRef.current.targetY = 0;
    };

    if (interactive) {
      window.addEventListener('mousemove', handleMouseMove);
      canvas.addEventListener('mouseleave', handleMouseLeave);
    }

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (interactive) {
        window.removeEventListener('mousemove', handleMouseMove);
        canvas.removeEventListener('mouseleave', handleMouseLeave);
      }
    };
  }, [size, glowColor, coreColor, interactive]);

  return (
    <div
      className={`relative inline-flex items-center justify-center select-none ${className}`}
      style={{ width: size, height: size }}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full block cursor-pointer transition-transform duration-300 hover:scale-[1.02]"
      />
    </div>
  );
};

