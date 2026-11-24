import raytraceShaderCode from './raytrace.wgsl?raw';

export interface RendererDiagnostics {
  backend: 'webgpu';
  width: number;
  height: number;
  dpr: number;
  isIdleThrottled: boolean;
  renderedFrames: number;
  lastFrameMs: number;
  validationErrors: string[];
}

export class WebGPURaytracer {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: GPUCanvasContext;
  private readonly device: GPUDevice;
  private readonly format: GPUTextureFormat;
  private readonly pipeline: GPURenderPipeline;
  private readonly renderUniformBuffer: GPUBuffer;
  private readonly sceneStorageBuffer: GPUBuffer;
  private readonly bindGroup: GPUBindGroup;
  private readonly renderUniformData = new Float32Array(4);
  private readonly validationErrors: string[] = [];

  private readonly isSoftwareAdapter: boolean;

  private width = 1;
  private height = 1;
  private dpr = 1;
  private renderedFrames = 0;
  private lastFrameMs = 0;
  private isIdleThrottled = false;

  private constructor(
    canvas: HTMLCanvasElement,
    context: GPUCanvasContext,
    device: GPUDevice,
    format: GPUTextureFormat,
    sceneByteLength: number,
    isSoftwareAdapter: boolean,
  ) {
    this.canvas = canvas;
    this.context = context;
    this.device = device;
    this.format = format;
    this.isSoftwareAdapter = isSoftwareAdapter;

    this.device.addEventListener('uncapturederror', (event) => {
      this.validationErrors.push(event.error.message);
    });

    const shaderModule = this.device.createShaderModule({
      label: 'pearl-loom-raytrace-wgsl',
      code: raytraceShaderCode,
    });

    this.renderUniformBuffer = this.device.createBuffer({
      label: 'render-uniforms',
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.sceneStorageBuffer = this.device.createBuffer({
      label: 'scene-storage',
      size: Math.max(256, sceneByteLength),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.pipeline = this.device.createRenderPipeline({
      label: 'pearl-loom-raytrace-pipeline',
      layout: 'auto',
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [{ format: this.format }],
      },
      primitive: {
        topology: 'triangle-list',
      },
    });

    this.bindGroup = this.device.createBindGroup({
      label: 'pearl-loom-bind-group',
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.renderUniformBuffer } },
        { binding: 1, resource: { buffer: this.sceneStorageBuffer } },
      ],
    });
  }

  static async create(
    canvas: HTMLCanvasElement,
    sceneByteLength: number,
  ): Promise<WebGPURaytracer> {
    if (!('gpu' in navigator) || !navigator.gpu) {
      throw new Error('navigator.gpu is unavailable in this browser context.');
    }

    const adapter =
      (await navigator.gpu.requestAdapter({ powerPreference: 'low-power' })) ??
      (await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })) ??
      (await navigator.gpu.requestAdapter({ forceFallbackAdapter: true }));
    if (!adapter) {
      throw new Error('Failed to acquire a WebGPU adapter.');
    }

    const arch = (adapter.info?.architecture ?? '').toLowerCase();
    const desc = (adapter.info?.description ?? '').toLowerCase();
    const isSoftware =
      Boolean((adapter as GPUAdapter & { isFallbackAdapter?: boolean }).isFallbackAdapter) ||
      arch.includes('swiftshader') ||
      desc.includes('swiftshader');

    const device = await adapter.requestDevice();
    const context = canvas.getContext('webgpu');
    if (!context) {
      throw new Error('Failed to acquire WebGPU canvas context.');
    }

    const format = navigator.gpu.getPreferredCanvasFormat();
    const instance = new WebGPURaytracer(canvas, context, device, format, sceneByteLength, isSoftware);
    instance.resize();
    context.configure({
      device,
      format,
      alphaMode: 'opaque',
    });

    return instance;
  }

  resize(maxDpr = 1.75): void {
    const cap = this.isSoftwareAdapter ? 0.75 : maxDpr;
    const dpr = Math.min(window.devicePixelRatio || 1, cap);
    const rect = this.canvas.getBoundingClientRect();
    const cssW = Math.max(1, Math.floor(rect.width || window.innerWidth));
    const cssH = Math.max(1, Math.floor(rect.height || window.innerHeight));
    const nextW = Math.max(1, Math.floor(cssW * dpr));
    const nextH = Math.max(1, Math.floor(cssH * dpr));

    this.dpr = dpr;
    if (this.canvas.width !== nextW || this.canvas.height !== nextH) {
      this.canvas.width = nextW;
      this.canvas.height = nextH;
    }
    this.width = this.canvas.width;
    this.height = this.canvas.height;
  }

  setIdleThrottled(throttled: boolean): void {
    this.isIdleThrottled = throttled;
  }

  render(sceneView: Float32Array, elapsedSec: number): void {
    const t0 = performance.now();
    this.renderUniformData[0] = this.width;
    this.renderUniformData[1] = this.height;
    this.renderUniformData[2] = elapsedSec;
    this.renderUniformData[3] = 0;

    this.device.queue.writeBuffer(this.renderUniformBuffer, 0, this.renderUniformData);
    this.device.queue.writeBuffer(
      this.sceneStorageBuffer,
      0,
      sceneView.buffer,
      sceneView.byteOffset,
      sceneView.byteLength,
    );

    const encoder = this.device.createCommandEncoder({ label: 'pearl-loom-encoder' });
    const textureView = this.context.getCurrentTexture().createView();

    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: textureView,
          clearValue: { r: 0.08, g: 0.09, b: 0.14, a: 1.0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(3, 1, 0, 0);
    pass.end();

    this.device.queue.submit([encoder.finish()]);
    this.renderedFrames++;
    this.lastFrameMs = performance.now() - t0;
  }

  async flush(): Promise<void> {
    await this.device.queue.onSubmittedWorkDone();
  }

  getDiagnostics(): RendererDiagnostics {
    return {
      backend: 'webgpu',
      width: this.width,
      height: this.height,
      dpr: this.dpr,
      isIdleThrottled: this.isIdleThrottled,
      renderedFrames: this.renderedFrames,
      lastFrameMs: this.lastFrameMs,
      validationErrors: [...this.validationErrors],
    };
  }
}
