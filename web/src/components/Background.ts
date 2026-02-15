import { Container, Graphics } from "pixi.js";

export interface BackgroundOptions {
  width: number;
  height: number;
  particleCount?: number;
}

export class Background extends Container {
  constructor(opts: BackgroundOptions) {
    super();

    const { width, height, particleCount = 30 } = opts;

    // Gradient overlay
    const gradient = new Graphics();
    gradient.rect(0, 0, width, height).fill({
      color: 0x0a0e14,
      alpha: 0.85,
    });
    this.addChild(gradient);

    // Animated particles
    this._addParticles(width, height, particleCount);

    // Grid pattern
    this._addGrid(width, height);
  }

  private _addParticles(width: number, height: number, count: number): void {
    const particleContainer = new Container();
    this.addChild(particleContainer);

    const particles: Array<{
      g: Graphics;
      vx: number;
      vy: number;
      life: number;
      size: number;
    }> = [];

    for (let i = 0; i < count; i++) {
      const size = Math.random() * 2 + 1;
      const g = new Graphics();
      g.circle(0, 0, size).fill({
        color: 0x00ffcc,
        alpha: Math.random() * 0.3 + 0.1,
      });
      g.x = Math.random() * width;
      g.y = Math.random() * height;
      particleContainer.addChild(g);

      particles.push({
        g,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        life: Math.random() * Math.PI * 2,
        size,
      });
    }

    // Animation loop - needs to be added externally via ticker
    const animate = () => {
      particles.forEach((p) => {
        p.g.x += p.vx;
        p.g.y += p.vy;
        p.life += 0.02;
        p.g.alpha = (0.3 + Math.sin(p.life) * 0.2) * (p.size / 3);

        if (p.g.x < 0) p.g.x = width;
        if (p.g.x > width) p.g.x = 0;
        if (p.g.y < 0) p.g.y = height;
        if (p.g.y > height) p.g.y = 0;
      });
    };

    // Store animation function for external ticker
    (this as any)._particleAnimate = animate;
  }

  private _addGrid(width: number, height: number): void {
    const grid = new Graphics();
    const gridSize = 40;

    for (let x = 0; x <= width; x += gridSize) {
      grid.moveTo(x, 0);
      grid.lineTo(x, height);
    }

    for (let y = 0; y <= height; y += gridSize) {
      grid.moveTo(0, y);
      grid.lineTo(width, y);
    }

    grid.stroke({
      width: 1,
      color: 0x00ffcc,
      alpha: 0.03,
    });

    this.addChild(grid);
  }

  // Call this from parent's ticker
  public animate(): void {
    if ((this as any)._particleAnimate) {
      (this as any)._particleAnimate();
    }
  }
}
