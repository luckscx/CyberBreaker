import { Application } from "pixi.js";
import { Game } from "@/Game";

async function bootstrap() {
  const root = document.querySelector<HTMLDivElement>("#game-root");
  if (!root) throw new Error("#game-root not found");

  const app = new Application();
  await app.init({
    resizeTo: root,
    background: 0x0a0a12,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio, 2),
    autoDensity: true,
  });
  root.appendChild(app.canvas);

  const game = new Game(app);
  game.start();
}
bootstrap();
