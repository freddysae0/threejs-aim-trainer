import * as THREE from "three";
import { EffectComposer, FXAAShader, RenderPass, ShaderPass } from "three/examples/jsm/Addons.js";
import CustomOutlinePass from "./CustomPass/CustomOutlinePass";

/**
 * Base quality bounds. The renderer will dynamically clamp the pixel ratio
 * between these values depending on the current performance budget.
 */
const MIN_PIXEL_RATIO = 1;
const MAX_PIXEL_RATIO = 1.5;

export default class Renderer {
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  camera: THREE.PerspectiveCamera;
  private fxaaPass: ShaderPass;
  private outlinePass: CustomOutlinePass;
  private basePixelRatio: number;
  private currentPixelRatio: number;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, canvas?: HTMLCanvasElement) {
    this.camera = camera;

    // Determine initial pixel ratio based on device capabilities.
    this.basePixelRatio = Math.min(
      MAX_PIXEL_RATIO,
      Math.max(MIN_PIXEL_RATIO, window.devicePixelRatio)
    );
    this.currentPixelRatio = this.basePixelRatio;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(this.currentPixelRatio);

    this.composer = new EffectComposer(this.renderer);
    this.composer.setPixelRatio(this.currentPixelRatio);
    this.composer.setSize(window.innerWidth, window.innerHeight);

    // 1) Base render
    const renderPass = new RenderPass(scene, camera);
    this.composer.addPass(renderPass);

    // 2) Outline (after scene render, before AA)
    this.outlinePass = new CustomOutlinePass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      scene,
      camera,
      {
        edgeStrength: 1.0,
        edgeThreshold: 0.0025,
        thickness: 1.0,
        normalThreshold: 0.15,
        normalStrength: 1.0,
        outlineColor: 0x000000,
      }
    );
    this.composer.addPass(this.outlinePass);

    // 3) FXAA at the end
    this.fxaaPass = new ShaderPass(FXAAShader);
    this.fxaaPass.material.uniforms["resolution"].value.set(
      1 / (window.innerWidth * this.currentPixelRatio),
      1 / (window.innerHeight * this.currentPixelRatio)
    );
    this.composer.addPass(this.fxaaPass);

    // Handle resize
    window.addEventListener("resize", () => {
      const width = window.innerWidth;
      const height = window.innerHeight;

      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();

      this.renderer.setSize(width, height);
      this.composer.setSize(width, height);

      // update passes
      this.fxaaPass.material.uniforms["resolution"].value.set(
        1 / (width * this.currentPixelRatio),
        1 / (height * this.currentPixelRatio)
      );
      this.outlinePass.setSize(width, height);
    });
  }

  get instance() {
    // Return composer so your Loop uses composer.render()
    return this.composer;
  }

  /**
   * Adjust post-processing quality dynamically. When the number of players
   * (or any other load indicator) exceeds the provided threshold, expensive
   * passes are disabled and the pixel ratio is reduced to maintain
   * performance.
   */
  adjustForPlayers(playerCount: number, threshold = 4) {
    const heavyLoad = playerCount > threshold;
    const targetPixelRatio = heavyLoad ? MIN_PIXEL_RATIO : this.basePixelRatio;

    // Update pixel ratios only if there is a change.
    if (targetPixelRatio !== this.currentPixelRatio) {
      this.currentPixelRatio = targetPixelRatio;
      this.renderer.setPixelRatio(this.currentPixelRatio);
      this.composer.setPixelRatio(this.currentPixelRatio);
      this.fxaaPass.material.uniforms["resolution"].value.set(
        1 / (window.innerWidth * this.currentPixelRatio),
        1 / (window.innerHeight * this.currentPixelRatio)
      );
    }

    // Toggle expensive passes
    this.fxaaPass.enabled = !heavyLoad;
    this.outlinePass.enabled = !heavyLoad;
  }
}
