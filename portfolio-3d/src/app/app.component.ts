import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, PLATFORM_ID, Inject, signal } from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import * as THREE from 'three';

interface Zone { id: string; label: string; angle: number; color: number; }

const ZONES: Zone[] = [
  { id: 'home',       label: 'Home',          angle: 0,   color: 0x7c3aed },
  { id: 'projects',   label: 'Projects',       angle: 51,  color: 0x06b6d4 },
  { id: 'skills',     label: 'Skills',         angle: 103, color: 0x10b981 },
  { id: 'numbers',    label: 'By The Numbers', angle: 154, color: 0xf59e0b },
  { id: 'experience', label: 'Experience',     angle: 206, color: 0x6366f1 },
  { id: 'story',      label: 'Story',          angle: 257, color: 0xf472b6 },
  { id: 'contact',    label: 'Contact',        angle: 309, color: 0xa78bfa },
];
const RING_R = 18;

const CONTENT: Record<string, { title: string; body: string[] }> = {
  home: {
    title: 'Chandan Kumar — Senior AI Engineer',
    body: [
      '4+ years building production AI systems',
      'LangGraph · Hybrid RAG (FAISS+BM25) · FastAPI · Angular 17',
      '637 tests · 3 production AI systems · Zero shortcuts',
      'Open to Senior AI Engineer roles',
    ],
  },
  projects: {
    title: 'Production AI Systems',
    body: [
      '🔮 Aura with Rav — 18+ agents · Spiritual Intelligence Platform · 415 tests',
      '📋 Bench Resource Optimizer — Hybrid RAG · Enterprise HR AI · 222 tests',
      '📖 RunbookAI — RAGless architecture · K8s ops · 137 tests',
      '🤖 Universal AI Agent — One agent, any domain · YAML config',
      '🧠 Agentic Growth AI — LangGraph ReAct · Campaign optimization',
      '🏗️ AI System Design Blueprint — 15 production patterns',
    ],
  },
  skills: {
    title: 'Technical Depth',
    body: [
      'Python 97% · LangGraph 92% · FastAPI 95% · Angular 88% · Hybrid RAG 98%',
      'AI & LLM: LangChain · OpenAI API · Prompt Engineering · RAG Pipelines',
      'Retrieval & Memory: FAISS · BM25 · HyDE · CRAG · Cross-Encoder',
      'Real-Time: Apache Kafka · SSE Streaming',
      'DevOps: Docker · AWS · GitHub Actions',
    ],
  },
  numbers: {
    title: 'By The Numbers',
    body: [
      '637 tests · 3.6 seconds · Zero flakiness',
      '78s → 4s latency reduction (95%)',
      '18+ AI agents coordinated without conflicts',
      '$0.000137 per AI analysis (DeepSeek + semantic cache)',
      '0 hallucinated commands in RunbookAI',
      'G1–G5 guardrails: rate limit · injection · PII · faithfulness · output validation',
    ],
  },
  experience: {
    title: 'Career Timeline',
    body: [
      '🏦 Infosys → Bank of America (Nov 2023–Present) — Senior Software Engineer · Pune',
      '✈️ Infosys → Accelya / Aviation AI (Dec 2022–Nov 2023) — SWE Aviation AI · Noida',
      '⚙️ Texala (Oct 2021–Dec 2022) — Software Engineer · Noida',
      '🌱 Flyboard Ventures (Aug 2021–Oct 2021) — Junior Dev · Noida',
    ],
  },
  story: {
    title: 'From "Can\'t Spell console" to Production AI',
    body: [
      'Mechanical engineer with zero job offers',
      'A friend\'s taunt that became the fuel',
      'A bootcamp, a laptop, choice to outwork everyone — quietly',
      '2018: Day 1 NPE?? · 2020: Java + Spring Boot · 2022: Masai Bootcamp',
      '2023: Discovered LLMs · Now: 637 tests, 3 production AI systems, zero shortcuts',
    ],
  },
  contact: {
    title: 'Let\'s Build Something Real',
    body: [
      '📧 ravchandan15@gmail.com',
      '💼 linkedin.com/in/rav-chandan-kumar-singh-767374315',
      '🐙 github.com/RavSinghChandan',
      '▶️ youtube.com/@aiwithrav',
      '📱 +91 62909 09518',
    ],
  },
};

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  zones = ZONES;
  content = CONTENT;
  activeZone = signal('home');
  showModal = signal(false);
  modalZone = signal('home');

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private raf = 0;
  private t = 0;
  private camTarget = new THREE.Vector3(0, 1.6, 8);
  private camLookTarget = new THREE.Vector3(0, 0, 0);
  private camPos = new THREE.Vector3(0, 1.6, 8);
  private camLook = new THREE.Vector3(0, 0, 0);
  private zoneNodes = new Map<string, THREE.Mesh>();
  private neuralGroup!: THREE.Group;
  private particleSystem!: THREE.Points;
  private isDragging = false;
  private dragStart = { x: 0, y: 0 };
  private orbitOffset = new THREE.Vector3(0, 0, 4);

  constructor(@Inject(PLATFORM_ID) private pid: object) {}

  ngAfterViewInit() {
    if (!isPlatformBrowser(this.pid)) return;
    this.initThree();
    this.buildScene();
    this.bindEvents();
    this.loop();
  }

  private initThree() {
    const canvas = this.canvasRef.nativeElement;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x050508);
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x050508, 0.016);
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
    this.camera.position.copy(this.camPos);
  }

  private buildScene() {
    this.scene.add(new THREE.AmbientLight(0x1a1030, 3));
    const dir = new THREE.DirectionalLight(0xffffff, 1.5);
    dir.position.set(10, 20, 10);
    this.scene.add(dir);

    // Neural background mesh
    this.neuralGroup = new THREE.Group();
    this.scene.add(this.neuralGroup);
    const nPos: THREE.Vector3[] = [];
    const NCOLS = [0x7c3aed, 0x06b6d4, 0x6366f1, 0x10b981, 0xa78bfa];
    for (let i = 0; i < 100; i++) {
      const p = new THREE.Vector3((Math.random()-.5)*60, (Math.random()-.5)*25, (Math.random()-.5)*60);
      nPos.push(p);
      const g = new THREE.SphereGeometry(.07 + Math.random()*.07, 5, 5);
      const m = new THREE.MeshBasicMaterial({ color: NCOLS[i%NCOLS.length], transparent: true, opacity: .55 });
      const mesh = new THREE.Mesh(g, m); mesh.position.copy(p);
      this.neuralGroup.add(mesh);
    }
    const lv: number[] = [], lc: number[] = [];
    for (let i = 0; i < nPos.length; i++)
      for (let j = i+1; j < nPos.length; j++)
        if (nPos[i].distanceTo(nPos[j]) < 7) {
          lv.push(...nPos[i].toArray(), ...nPos[j].toArray());
          const c = new THREE.Color(NCOLS[i%NCOLS.length]);
          lc.push(c.r,c.g,c.b,c.r,c.g,c.b);
        }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lv, 3));
    lg.setAttribute('color',    new THREE.Float32BufferAttribute(lc, 3));
    this.neuralGroup.add(new THREE.LineSegments(lg,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: .07 })));

    // Zone hubs
    ZONES.forEach(zone => {
      const rad = THREE.MathUtils.degToRad(zone.angle);
      const x = Math.sin(rad) * RING_R;
      const z = -Math.cos(rad) * RING_R;

      const mat = new THREE.MeshStandardMaterial({
        color: zone.color, emissive: zone.color, emissiveIntensity: .35,
        roughness: .2, metalness: .85, transparent: true, opacity: .92,
      });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1.4, 32, 32), mat);
      mesh.position.set(x, 0, z);
      mesh.userData = { zoneId: zone.id };
      this.scene.add(mesh);
      this.zoneNodes.set(zone.id, mesh);

      // halo
      mesh.add(new THREE.Mesh(
        new THREE.SphereGeometry(2.2,16,16),
        new THREE.MeshBasicMaterial({ color: zone.color, transparent: true, opacity: .055, side: THREE.BackSide }),
      ));
      // point light
      const pl = new THREE.PointLight(zone.color, 2.5, 14);
      pl.position.set(x, 0, z); this.scene.add(pl);
      // spoke to centre
      const sp = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x,0,z), new THREE.Vector3(0,0,0)]);
      this.scene.add(new THREE.Line(sp, new THREE.LineBasicMaterial({ color: zone.color, transparent: true, opacity: .14 })));
    });

    // Central orb
    const coreMesh = new THREE.Mesh(
      new THREE.SphereGeometry(2, 32, 32),
      new THREE.MeshStandardMaterial({ color: 0x7c3aed, emissive: 0x4c1d95, emissiveIntensity: 1.4, roughness: .1, metalness: .9, transparent: true, opacity: .75 }),
    );
    this.scene.add(coreMesh);
    const coreLight = new THREE.PointLight(0x7c3aed, 5, 28);
    this.scene.add(coreLight);

    // Rings
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(3 + i*1.2, .045, 8, 64),
        new THREE.MeshBasicMaterial({ color: 0xa78bfa, transparent: true, opacity: .28 - i*.07 }),
      );
      ring.rotation.x = Math.PI/2 + i*.3;
      ring.userData = { ringIdx: i };
      this.scene.add(ring);
    }

    // Particles
    const pCount = 500, pPos = new Float32Array(pCount*3), pCol = new Float32Array(pCount*3);
    const PC = [new THREE.Color(0x7c3aed), new THREE.Color(0x06b6d4), new THREE.Color(0xa78bfa)];
    for (let i = 0; i < pCount; i++) {
      pPos[i*3]=(Math.random()-.5)*80; pPos[i*3+1]=(Math.random()-.5)*35; pPos[i*3+2]=(Math.random()-.5)*80;
      const c = PC[i%3]; pCol[i*3]=c.r; pCol[i*3+1]=c.g; pCol[i*3+2]=c.b;
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    pg.setAttribute('color',    new THREE.BufferAttribute(pCol, 3));
    this.particleSystem = new THREE.Points(pg, new THREE.PointsMaterial({ size: .11, vertexColors: true, transparent: true, opacity: .65 }));
    this.scene.add(this.particleSystem);

    // Grid
    const grid = new THREE.GridHelper(80, 40, 0x1a1040, 0x0c0818);
    grid.position.y = -3.5;
    this.scene.add(grid);
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    this.t += .008;

    this.neuralGroup.rotation.y = this.t * .04;
    this.particleSystem.rotation.y = -this.t * .018;

    this.zoneNodes.forEach((mesh, id) => {
      const active = id === this.activeZone();
      (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity =
        active ? .8 + Math.sin(this.t * 3) * .4 : .22 + Math.sin(this.t + mesh.position.x) * .08;
      mesh.scale.setScalar(active ? 1.28 : 1 + Math.sin(this.t*1.5 + mesh.position.z)*.04);
    });

    this.scene.children.forEach(obj => {
      if (obj.userData['ringIdx'] !== undefined)
        obj.rotation.z += .003 * (obj.userData['ringIdx'] % 2 === 0 ? 1 : -1);
    });

    this.camPos.lerp(this.camTarget, .05);
    this.camLook.lerp(this.camLookTarget, .05);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);

    this.renderer.render(this.scene, this.camera);
  };

  flyTo(zoneId: string) {
    this.activeZone.set(zoneId);
    const zone = ZONES.find(z => z.id === zoneId)!;
    const rad = THREE.MathUtils.degToRad(zone.angle);
    const x = Math.sin(rad) * RING_R;
    const z = -Math.cos(rad) * RING_R;
    this.camTarget.set(x * .52, 1.6, z * .52);
    this.camLookTarget.set(x, 0, z);
    this.orbitOffset.set(0, 0, 4);
  }

  openModal(zoneId: string) { this.modalZone.set(zoneId); this.showModal.set(true); }
  closeModal() { this.showModal.set(false); }

  getZoneColor(id: string) {
    const z = ZONES.find(z => z.id === id);
    return z ? '#' + z.color.toString(16).padStart(6,'0') : '#7c3aed';
  }

  private bindEvents() {
    const canvas = this.canvasRef.nativeElement;
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    canvas.addEventListener('click', e => {
      mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
      mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(mouse, this.camera);
      const hit = raycaster.intersectObjects([...this.zoneNodes.values()])[0];
      if (hit?.object.userData['zoneId']) {
        const id = hit.object.userData['zoneId'];
        this.flyTo(id);
        setTimeout(() => this.openModal(id), 600);
      }
    });

    canvas.addEventListener('mousedown', e => { this.isDragging = true; this.dragStart = { x: e.clientX, y: e.clientY }; });
    window.addEventListener('mousemove', e => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.dragStart.x;
      const dy = e.clientY - this.dragStart.y;
      const az = ZONES.find(z => z.id === this.activeZone())!;
      const rad = THREE.MathUtils.degToRad(az.angle);
      const bx = Math.sin(rad) * RING_R * .52;
      const bz = -Math.cos(rad) * RING_R * .52;
      const angle = Math.atan2(this.camPos.x - bx, this.camPos.z - bz) + dx * .005;
      const dist = 5;
      const newY = Math.max(-1, Math.min(5, this.camTarget.y - dy * .012));
      this.camTarget.set(bx + Math.sin(angle)*dist, newY, bz + Math.cos(angle)*dist);
      this.dragStart = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('mouseup', () => { this.isDragging = false; });

    window.addEventListener('resize', () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    });
  }

  ngOnDestroy() { cancelAnimationFrame(this.raf); this.renderer?.dispose(); }
}
