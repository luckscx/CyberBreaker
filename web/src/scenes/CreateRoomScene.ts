import type { Application } from "pixi.js";
import { Container, Text } from "pixi.js";
import { Button } from "@/components/Button";
import { playClick } from "@/audio/click";

export interface CreateRoomSceneOptions {
  roomId: string;
  joinUrl: string;
  onEnter: () => void;
  onBack: () => void;
}

export class CreateRoomScene extends Container {
  constructor(
    app: Application,
    opts: CreateRoomSceneOptions
  ) {
    super();
    const w = app.screen.width;
    const cx = w / 2;

    const back = new Button({
      label: "返回",
      width: 72,
      onClick: () => {
        playClick();
        opts.onBack();
      },
    });
    back.x = 60;
    back.y = 50;
    this.addChild(back);

    const title = new Text({
      text: "房间已创建",
      style: { fontFamily: "system-ui", fontSize: 26, fill: 0x00ffcc },
    });
    title.anchor.set(0.5);
    title.x = cx;
    title.y = 100;
    this.addChild(title);

    const hint = new Text({
      text: "分享链接邀请对方加入",
      style: { fontFamily: "system-ui", fontSize: 14, fill: 0x888888 },
    });
    hint.anchor.set(0.5);
    hint.x = cx;
    hint.y = 140;
    this.addChild(hint);

    const linkText = new Text({
      text: opts.joinUrl,
      style: { fontFamily: "system-ui", fontSize: 12, fill: 0xaaaaaa, wordWrap: true, wordWrapWidth: w - 80 },
    });
    linkText.anchor.set(0.5, 0);
    linkText.x = cx;
    linkText.y = 175;
    this.addChild(linkText);

    let copyStatusText = "复制链接";
    const copyBtn = new Button({
      label: copyStatusText,
      width: 140,
      onClick: () => {
        playClick();
        navigator.clipboard.writeText(opts.joinUrl).then(
          () => {
            copyStatusText = "已复制";
            (copyBtn.getChildAt(1) as Text).text = copyStatusText;
          },
          () => {
            copyStatusText = "复制失败";
            (copyBtn.getChildAt(1) as Text).text = copyStatusText;
          }
        );
      },
    });
    copyBtn.x = cx - 75;
    copyBtn.y = 260;
    this.addChild(copyBtn);

    const enterBtn = new Button({
      label: "进入房间",
      width: 140,
      onClick: () => {
        playClick();
        opts.onEnter();
      },
    });
    enterBtn.x = cx + 75;
    enterBtn.y = 260;
    this.addChild(enterBtn);
  }
}
