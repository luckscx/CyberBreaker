import type { Application } from "pixi.js";
import { Container, Graphics, Text } from "pixi.js";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/Button";
import { Background } from "@/components/Background";
import { getNickname, setNickname, validateNickname } from "@/services/settingsManager";

export interface SettingsSceneOptions {
  onBack: () => void;
}

export class SettingsScene extends Container {
  private bg: Background;
  private nicknameInputBg: Graphics;
  private nicknameText: Text;
  private errorText: Text;
  private inputActive = false;
  private currentNickname = "";
  private htmlInput: HTMLInputElement | null = null;

  constructor(private app: Application, opts: SettingsSceneOptions) {
    super();

    const w = app.screen.width;
    const h = app.screen.height;
    const cx = w / 2;

    // Add animated background
    this.bg = new Background({
      width: w,
      height: h,
      particleCount: 25,
    });
    this.addChild(this.bg);

    // Back button
    const backButton = new BackButton({
      x: 12,
      y: 12,
      onClick: () => opts.onBack(),
    });
    this.addChild(backButton);

    // Title
    const title = new Text({
      text: "设置",
      style: { fontFamily: "system-ui", fontSize: 24, fill: 0x00ffcc, fontWeight: "bold" },
    });
    title.anchor.set(0.5);
    title.x = cx;
    title.y = 60;
    this.addChild(title);

    // Nickname section
    const nicknameLabel = new Text({
      text: "玩家昵称",
      style: { fontFamily: "system-ui", fontSize: 14, fill: 0x99aabb },
    });
    nicknameLabel.anchor.set(0, 0.5);
    nicknameLabel.x = cx - 150;
    nicknameLabel.y = 140;
    this.addChild(nicknameLabel);

    // Nickname input background
    this.nicknameInputBg = new Graphics();
    this.nicknameInputBg.roundRect(cx - 150, 160, 300, 44, 8).fill({ color: 0x1a2332 });
    this.nicknameInputBg.roundRect(cx - 150, 160, 300, 44, 8).stroke({ width: 2, color: 0x334455 });
    this.nicknameInputBg.eventMode = "static";
    this.nicknameInputBg.cursor = "text";
    this.nicknameInputBg.on("pointerdown", () => this._activateInput());
    this.addChild(this.nicknameInputBg);

    // Current nickname
    this.currentNickname = getNickname();
    this.nicknameText = new Text({
      text: this.currentNickname,
      style: { fontFamily: "system-ui", fontSize: 16, fill: 0xffffff },
    });
    this.nicknameText.anchor.set(0, 0.5);
    this.nicknameText.x = cx - 140;
    this.nicknameText.y = 182;
    this.addChild(this.nicknameText);

    // Hint text
    const hintText = new Text({
      text: "点击输入框修改昵称（2-10个字符）",
      style: { fontFamily: "system-ui", fontSize: 11, fill: 0x668899 },
    });
    hintText.anchor.set(0.5);
    hintText.x = cx;
    hintText.y = 214;
    this.addChild(hintText);

    // Error text
    this.errorText = new Text({
      text: "",
      style: { fontFamily: "system-ui", fontSize: 12, fill: 0xff6644 },
    });
    this.errorText.anchor.set(0.5);
    this.errorText.x = cx;
    this.errorText.y = 234;
    this.addChild(this.errorText);

    // Save button
    const saveBtn = new Button({
      label: "保存昵称",
      width: 160,
      height: 48,
      fontSize: 16,
      onClick: () => this._saveNickname(),
    });
    saveBtn.x = cx;
    saveBtn.y = 280;
    this.addChild(saveBtn);

    // Setup keyboard input
    this._setupMobileInput();

    // Start animation
    this.app.ticker.add(this._animate, this);
  }

  override destroy(options?: Parameters<Container["destroy"]>[0]): void {
    this.app.ticker.remove(this._animate, this);
    this._removeHtmlInput();
    super.destroy(options);
  }

  private _animate = (): void => {
    this.bg.animate();
  };

  private _activateInput(): void {
    this.inputActive = true;
    this.nicknameInputBg.clear();
    this.nicknameInputBg.roundRect(this.app.screen.width / 2 - 150, 160, 300, 44, 8).fill({ color: 0x1a2332 });
    this.nicknameInputBg.roundRect(this.app.screen.width / 2 - 150, 160, 300, 44, 8).stroke({ width: 2, color: 0x00ffcc });
    this.errorText.text = "";

    // Create and focus HTML input for mobile
    this._createHtmlInput();
  }

  private _deactivateInput(): void {
    this.inputActive = false;
    this.nicknameInputBg.clear();
    this.nicknameInputBg.roundRect(this.app.screen.width / 2 - 150, 160, 300, 44, 8).fill({ color: 0x1a2332 });
    this.nicknameInputBg.roundRect(this.app.screen.width / 2 - 150, 160, 300, 44, 8).stroke({ width: 2, color: 0x334455 });
    this.nicknameText.text = this.currentNickname;

    // Remove HTML input
    this._removeHtmlInput();
  }

  private _createHtmlInput(): void {
    // Remove existing input if any
    this._removeHtmlInput();

    // Create HTML input element
    this.htmlInput = document.createElement("input");
    this.htmlInput.type = "text";
    this.htmlInput.value = this.currentNickname;
    this.htmlInput.maxLength = 10;
    this.htmlInput.placeholder = "输入昵称";
    this.htmlInput.style.position = "absolute";
    this.htmlInput.style.left = `${this.app.screen.width / 2 - 150}px`;
    this.htmlInput.style.top = "160px";
    this.htmlInput.style.width = "300px";
    this.htmlInput.style.height = "44px";
    this.htmlInput.style.fontSize = "16px";
    this.htmlInput.style.padding = "0 10px";
    this.htmlInput.style.border = "2px solid #00ffcc";
    this.htmlInput.style.borderRadius = "8px";
    this.htmlInput.style.backgroundColor = "#1a2332";
    this.htmlInput.style.color = "#ffffff";
    this.htmlInput.style.outline = "none";
    this.htmlInput.style.fontFamily = "system-ui";
    this.htmlInput.style.zIndex = "1000";

    // Handle input changes
    this.htmlInput.addEventListener("input", (e) => {
      this.currentNickname = (e.target as HTMLInputElement).value;
      this.nicknameText.text = this.currentNickname;
    });

    // Handle Enter key
    this.htmlInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this._saveNickname();
      } else if (e.key === "Escape") {
        this.currentNickname = getNickname();
        this._deactivateInput();
      }
    });

    // Handle blur (click outside)
    this.htmlInput.addEventListener("blur", () => {
      setTimeout(() => {
        if (this.htmlInput) {
          this._deactivateInput();
        }
      }, 100);
    });

    document.body.appendChild(this.htmlInput);
    this.htmlInput.focus();

    // Hide the Pixi text while input is active
    this.nicknameText.alpha = 0;
  }

  private _removeHtmlInput(): void {
    if (this.htmlInput) {
      if (this.htmlInput.parentNode) {
        this.htmlInput.parentNode.removeChild(this.htmlInput);
      }
      this.htmlInput = null;
    }
    this.nicknameText.alpha = 1;
  }

  private _setupMobileInput(): void {
    // No need for window keyboard listener anymore
    // Mobile input is handled by HTML input element
  }

  private _saveNickname(): void {
    const validation = validateNickname(this.currentNickname);

    if (!validation.valid) {
      this.errorText.text = validation.error || "昵称格式错误";
      return;
    }

    setNickname(this.currentNickname);
    this.errorText.text = "";
    this.errorText.style.fill = 0x00ff88;
    this.errorText.text = "✓ 保存成功";

    setTimeout(() => {
      this.errorText.text = "";
      this.errorText.style.fill = 0xff6644;
    }, 2000);

    this._deactivateInput();
  }
}
