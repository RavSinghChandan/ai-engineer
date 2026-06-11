import {
  Component, ElementRef, ViewChild, AfterViewInit,
  OnDestroy, PLATFORM_ID, Inject, ChangeDetectionStrategy
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import * as THREE from 'three';

@Component({
  selector: 'app-scene3d',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="s3d-wrap">
      <canvas #canvas class="s3d-canvas"></canvas>
      <div class="s3d-label">
        <div class="s3d-name">Chandan Kumar</div>
        <div class="s3d-role">Senior AI Engineer · Neural Intelligence</div>
        <a href="/" class="s3d-back">← Back to Portfolio</a>
      </div>
      <div class="s3d-hint">Drag to orbit</div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .s3d-wrap {
      position: fixed; inset: 0;
      background: #09090b;
      overflow: hidden;
    }
    .s3d-canvas {
      display: block;
      position: absolute; inset: 0;
      width: 100%; height: 100%;
      outline: none;
    }
    .s3d-label {
      position: absolute; top: 2.5rem; left: 50%;
      transform: translateX(-50%);
      text-align: center; pointer-events: none; z-index: 10;
    }
    .s3d-name {
      font-family: system-ui, sans-serif;
      font-size: clamp(1.6rem, 4vw, 2.6rem);
      font-weight: 900; letter-spacing: -0.04em;
      background: linear-gradient(135deg, #a78bfa 0%, #06b6d4 100%);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    }
    .s3d-role {
      font-family: system-ui, sans-serif;
      font-size: 0.8rem; color: #71717a;
      letter-spacing: 0.08em; text-transform: uppercase;
      margin-top: 0.4rem;
    }
    .s3d-back {
      display: inline-block; margin-top: 1rem;
      font-family: system-ui, sans-serif;
      font-size: 0.78rem; color: #7c3aed;
      text-decoration: none; pointer-events: auto;
      border: 1px solid rgba(124,58,237,0.4);
      padding: 0.3rem 0.9rem; border-radius: 999px;
      transition: background 0.2s;
      &:hover { background: rgba(124,58,237,0.15); }
    }
    .s3d-hint {
      position: absolute; bottom: 1.5rem; left: 50%;
      transform: translateX(-50%);
      font-family: system-ui, sans-serif;
      font-size: 0.7rem; color: #3f3f46;
      letter-spacing: 0.1em; text-transform: uppercase;
      pointer-events: none;
    }
  `],
})
export class Scene3dComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private raf = 0;
  private isDragging = false;
  private prevMouse = { x: 0, y: 0 };
  private spherical = { theta: 0, phi: Math.PI / 2.5 };
  private radius = 5;
  private group!: THREE.Group;

  constructor(@Inject(PLATFORM_ID) private platformId: object) {}

  ngAfterViewInit() {
    if (!isPlatformBrowser(this.platformId)) return;
    this.initScene();
    this.bindEvents();
    this.animate();
  }

  private initScene() {
    const canvas = this.canvasRef.nativeElement;
    const w = window.innerWidth;
    const h = window.innerHeight;

    // Set canvas pixel dimensions explicitly before WebGL context creation
    canvas.width  = w * window.devicePixelRatio;
    canvas.height = h * window.devicePixelRatio;
    canvas.style.width  = w + 'px';
    canvas.style.height = h + 'px';

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(w, h);

    // Scene
    this.scene = new THREE.Scene();

    // Camera
    this.camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 100);
    this.updateCamera();

    // Group that holds everything — we rotate this on drag
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.buildNeuralCluster();
  }

  private buildNeuralCluster() {
    const NODE_COUNT = 80;
    const COLORS = [0x7c3aed, 0x06b6d4, 0x6366f1, 0x10b981, 0xa78bfa, 0x0891b2];

    // Place nodes on a sphere surface with slight random offset
    const positions: THREE.Vector3[] = [];
    for (let i = 0; i < NODE_COUNT; i++) {
      const theta = Math.acos(1 - 2 * (i + 0.5) / NODE_COUNT);
      const phi   = Math.PI * (1 + Math.sqrt(5)) * i;
      const r     = 1.8 + (Math.random() - 0.5) * 1.2;
      positions.push(new THREE.Vector3(
        r * Math.sin(theta) * Math.cos(phi),
        r * Math.sin(theta) * Math.sin(phi),
        r * Math.cos(theta),
      ));
    }

    // Soma (neuron cell body) — glowing sphere per node
    positions.forEach((pos, i) => {
      const color = COLORS[i % COLORS.length];
      const size  = 0.04 + Math.random() * 0.05;

      // Core sphere
      const geo  = new THREE.SphereGeometry(size, 8, 8);
      const mat  = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
      this.group.add(mesh);

      // Soft glow halo (larger transparent sphere)
      const haloGeo = new THREE.SphereGeometry(size * 4, 8, 8);
      const haloMat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.07, side: THREE.BackSide,
      });
      const halo = new THREE.Mesh(haloGeo, haloMat);
      halo.position.copy(pos);
      this.group.add(halo);
    });

    // Axon lines — connect nearby nodes (sparse, like real axons)
    const lineMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.18, vertexColors: true });
    const lineGeo = new THREE.BufferGeometry();
    const lineVerts: number[] = [];
    const lineColors: number[] = [];

    for (let i = 0; i < positions.length; i++) {
      let connections = 0;
      for (let j = i + 1; j < positions.length; j++) {
        if (connections >= 3) break;
        const d = positions[i].distanceTo(positions[j]);
        if (d < 1.4) {
          lineVerts.push(...positions[i].toArray(), ...positions[j].toArray());
          const c = new THREE.Color(COLORS[i % COLORS.length]);
          lineColors.push(c.r, c.g, c.b, c.r, c.g, c.b);
          connections++;
        }
      }
    }

    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(lineVerts, 3));
    lineGeo.setAttribute('color',    new THREE.Float32BufferAttribute(lineColors, 3));
    const lines = new THREE.LineSegments(lineGeo, lineMat);
    this.group.add(lines);

    // Signal particles — small bright dots orbiting the cluster
    const signalGeo  = new THREE.BufferGeometry();
    const sigCount   = 40;
    const sigPos     = new Float32Array(sigCount * 3);
    const sigColors  = new Float32Array(sigCount * 3);
    for (let i = 0; i < sigCount; i++) {
      const c = new THREE.Color(COLORS[i % COLORS.length]);
      sigColors[i*3]   = c.r;
      sigColors[i*3+1] = c.g;
      sigColors[i*3+2] = c.b;
    }
    signalGeo.setAttribute('position', new THREE.BufferAttribute(sigPos, 3));
    signalGeo.setAttribute('color',    new THREE.BufferAttribute(sigColors, 3));
    const signalMat = new THREE.PointsMaterial({
      size: 0.06, vertexColors: true, transparent: true, opacity: 0.95,
    });
    const signals = new THREE.Points(signalGeo, signalMat);
    this.group.add(signals);
    (this.group as any)._signals    = signals;
    (this.group as any)._sigAngles  = Array.from({ length: sigCount }, (_, i) => i * (Math.PI * 2 / sigCount));
    (this.group as any)._sigRadii   = Array.from({ length: sigCount }, () => 1.6 + Math.random() * 0.8);
    (this.group as any)._sigTilts   = Array.from({ length: sigCount }, () => (Math.random() - 0.5) * Math.PI);
  }

  private t = 0;
  private animate = () => {
    this.raf = requestAnimationFrame(this.animate);
    this.t += 0.008;

    // Slow auto-rotate when not dragging
    if (!this.isDragging) {
      this.spherical.theta += 0.003;
      this.updateCamera();
    }

    // Animate signal particles along orbital paths
    const signals  = (this.group as any)._signals as THREE.Points;
    const angles   = (this.group as any)._sigAngles  as number[];
    const radii    = (this.group as any)._sigRadii   as number[];
    const tilts    = (this.group as any)._sigTilts   as number[];
    if (signals) {
      const pos = signals.geometry.attributes['position'] as THREE.BufferAttribute;
      for (let i = 0; i < angles.length; i++) {
        angles[i] += 0.018 + i * 0.0003;
        const r = radii[i];
        const tilt = tilts[i];
        pos.setXYZ(i,
          r * Math.cos(angles[i]),
          r * Math.sin(angles[i]) * Math.sin(tilt),
          r * Math.sin(angles[i]) * Math.cos(tilt),
        );
      }
      pos.needsUpdate = true;
    }

    this.renderer.render(this.scene, this.camera);
  };

  private updateCamera() {
    const { theta, phi } = this.spherical;
    this.camera.position.set(
      this.radius * Math.sin(phi) * Math.cos(theta),
      this.radius * Math.cos(phi),
      this.radius * Math.sin(phi) * Math.sin(theta),
    );
    this.camera.lookAt(0, 0, 0);
  }

  private bindEvents() {
    const canvas = this.canvasRef.nativeElement;

    const onDown = (x: number, y: number) => {
      this.isDragging = true;
      this.prevMouse = { x, y };
    };
    const onMove = (x: number, y: number) => {
      if (!this.isDragging) return;
      const dx = x - this.prevMouse.x;
      const dy = y - this.prevMouse.y;
      this.spherical.theta -= dx * 0.005;
      this.spherical.phi   = Math.max(0.3, Math.min(Math.PI - 0.3, this.spherical.phi + dy * 0.005));
      this.prevMouse = { x, y };
      this.updateCamera();
    };
    const onUp = () => { this.isDragging = false; };

    canvas.addEventListener('mousedown',  e => onDown(e.clientX, e.clientY));
    canvas.addEventListener('mousemove',  e => onMove(e.clientX, e.clientY));
    canvas.addEventListener('mouseup',    onUp);
    canvas.addEventListener('mouseleave', onUp);
    canvas.addEventListener('touchstart', e => onDown(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
    canvas.addEventListener('touchmove',  e => { e.preventDefault(); onMove(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
    canvas.addEventListener('touchend',   onUp);

    const onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);
    (this as any)._onResize = onResize;
  }

  ngOnDestroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', (this as any)._onResize);
    this.renderer?.dispose();
  }
}
