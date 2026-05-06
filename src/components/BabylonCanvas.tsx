import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import {
  Engine, Scene, ArcRotateCamera, HemisphericLight, DirectionalLight,
  Vector3, Color3, Color4, StandardMaterial,
  VertexData, Mesh, Plane,
} from '@babylonjs/core';

export interface SceneHandle {
  updateMeshes: (data: {
    vessels: { vertices: Float32Array; indices: Uint32Array } | null;
    tumor:   { vertices: Float32Array; indices: Uint32Array } | null;
    bone:    { vertices: Float32Array; indices: Uint32Array } | null;
  }) => void;
  setVisibility: (layer: 'vessels' | 'tumor' | 'bone', visible: boolean) => void;
  setClipPlane:  (value: number) => void;
}

interface Props {
  onReady?: () => void;
}

export const BabylonCanvas = forwardRef<SceneHandle, Props>(({ onReady }, ref) => {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const sceneRef   = useRef<Scene | null>(null);
  const cameraRef  = useRef<ArcRotateCamera | null>(null);
  const meshesRef  = useRef<Record<string, Mesh | null>>({ vessels: null, tumor: null, bone: null });

  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new Engine(canvasRef.current, true, {
      preserveDrawingBuffer: true, stencil: true,
    });
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.027, 0.039, 0.09, 1); // rich dark-navy
    sceneRef.current = scene;

    const camera = new ArcRotateCamera('cam', -Math.PI / 2, Math.PI / 3, 120, Vector3.Zero(), scene);
    camera.attachControl(canvasRef.current, true);
    camera.lowerRadiusLimit  = 5;
    camera.upperRadiusLimit  = 800;
    camera.wheelPrecision    = 0.3;
    camera.minZ              = 0.1;
    cameraRef.current = camera;

    // Three-point medical lighting
    const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
    hemi.intensity = 0.55;
    hemi.diffuse   = new Color3(0.85, 0.92, 1);
    hemi.groundColor = new Color3(0.1, 0.1, 0.15);

    const key = new DirectionalLight('key', new Vector3(-1, -2, -1.5), scene);
    key.intensity = 0.9;
    key.position  = new Vector3(60, 120, 80);

    const fill = new DirectionalLight('fill', new Vector3(1, 0.5, 1), scene);
    fill.intensity = 0.35;

    engine.runRenderLoop(() => scene.render());
    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);
    onReady?.();

    return () => {
      engine.dispose();
      window.removeEventListener('resize', onResize);
    };
  }, []);

  useImperativeHandle(ref, () => ({

    updateMeshes({ vessels, tumor, bone }) {
      const scene  = sceneRef.current;
      const camera = cameraRef.current;
      if (!scene || !camera) return;

      const configs = [
        { key: 'vessels', data: vessels, color: new Color3(0.92, 0.18, 0.18), alpha: 0.92, specPow: 64 },
        { key: 'tumor',   data: tumor,   color: new Color3(0.97, 0.62, 0.08), alpha: 0.95, specPow: 48 },
        { key: 'bone',    data: bone,    color: new Color3(0.87, 0.87, 0.87), alpha: 0.28, specPow: 16 },
      ] as const;

      let minX =  Infinity, minY =  Infinity, minZ =  Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

      for (const { key, data, color, alpha, specPow } of configs) {
        meshesRef.current[key]?.dispose();
        meshesRef.current[key] = null;
        if (!data || data.vertices.length === 0) continue;

        // ── Build mesh ──────────────────────────────────────────
        const mesh = new Mesh(key, scene);
        const vd   = new VertexData();

        const positions = Array.from(data.vertices);
        const indices   = Array.from(data.indices);
        const normals: number[] = [];
        VertexData.ComputeNormals(positions, indices, normals);
        vd.positions = positions;
        vd.indices   = indices;
        vd.normals   = normals;
        vd.applyToMesh(mesh);

        // Track bounding box for camera framing
        for (let i = 0; i < positions.length; i += 3) {
          minX = Math.min(minX, positions[i]);   maxX = Math.max(maxX, positions[i]);
          minY = Math.min(minY, positions[i+1]); maxY = Math.max(maxY, positions[i+1]);
          minZ = Math.min(minZ, positions[i+2]); maxZ = Math.max(maxZ, positions[i+2]);
        }

        // ── Material — PBR-style StandardMaterial ───────────────
        const mat = new StandardMaterial(`mat_${key}`, scene);
        mat.diffuseColor   = color;
        mat.specularColor  = new Color3(0.3, 0.3, 0.35);
        mat.specularPower  = specPow;
        mat.alpha          = alpha;
        mat.backFaceCulling = false;
        mesh.material = mat;
        meshesRef.current[key] = mesh;
      }

      // ── Auto-frame camera to fit all meshes ──────────────────
      if (minX < Infinity) {
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const cz = (minZ + maxZ) / 2;
        const diagonal = Math.sqrt(
          (maxX - minX) ** 2 + (maxY - minY) ** 2 + (maxZ - minZ) ** 2
        );
        camera.target = new Vector3(cx, cy, cz);
        camera.radius = diagonal * 1.4;
        camera.alpha  = -Math.PI / 2;
        camera.beta   = Math.PI / 3;
      }
    },

    setVisibility(layer, visible) {
      const mesh = meshesRef.current[layer];
      if (mesh) mesh.isVisible = visible;
    },

    setClipPlane(value) {
      const scene = sceneRef.current;
      if (!scene) return;
      const all = Object.values(meshesRef.current).filter(Boolean) as Mesh[];
      if (all.length === 0) return;
      let minY = Infinity, maxY = -Infinity;
      for (const m of all) {
        const b = m.getBoundingInfo().boundingBox;
        minY = Math.min(minY, b.minimumWorld.y);
        maxY = Math.max(maxY, b.maximumWorld.y);
      }
      scene.clipPlane = new Plane(0, -1, 0, minY + (maxY - minY) * value);
      if (value >= 0.999) scene.clipPlane = null;
    },

  }));

  return (
    <canvas
      ref={canvasRef}
      id="babylon-canvas"
      style={{ width: '100%', height: '100%', display: 'block', outline: 'none' }}
    />
  );
});

BabylonCanvas.displayName = 'BabylonCanvas';
