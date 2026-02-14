import { _decorator, Component, Node, Label, Button, UITransform, Color, Vec2 } from 'cc';
import * as OneA2BLogic from './OneA2BLogic';
import { buildKeyboard } from './DynamicNumpad';

const { ccclass } = _decorator;

// 布局常量（与设计分辨率一致，Canvas 可能左对齐，需把根节点放到画布中心）
const CANVAS_W = 1280;
const CANVAS_H = 720;
const CENTER_X = CANVAS_W / 2;
const CENTER_Y = CANVAS_H / 2;
const UI_SCALE = 1.35;
const SECTION_GAP = 24;
const TOP_H = 72;
const HISTORY_H = 220;
const INPUT_H = 88;
const KEYBOARD_H = 400;
const SLOT_PLACEHOLDER = '_';
const ROUND_SEC = 120;
const HISTORY_ITEM_HEIGHT = 26;
const ANCHOR_CENTER = new Vec2(0.5, 0.5);

export interface ActionTimelineItem {
  timestamp: number;
  guessCode: string;
  result: string;
}

@ccclass('GameController')
export class GameController extends Component {
  private gameRoot: Node | null = null;
  private topArea: Node | null = null;
  private historyArea: Node | null = null;
  private inputArea: Node | null = null;
  private keyboardArea: Node | null = null;

  private timerLabel: Label | null = null;
  private historyContent: Node | null = null;
  private slotLabels: Label[] = [];
  private feedbackLabel: Label | null = null;

  private secret = '';
  private currentInput = '';
  private timerRemain = 0;
  private gameStartTime = 0;
  private actionTimeline: ActionTimelineItem[] = [];

  onLoad() {
    const root = new Node('GameRoot');
    const rootT = root.addComponent(UITransform);
    rootT.setContentSize(CANVAS_W, CANVAS_H);
    rootT.setAnchorPoint(ANCHOR_CENTER);
    this.node.addChild(root);
    root.setPosition(CENTER_X, CENTER_Y, 0);
    root.setScale(UI_SCALE, UI_SCALE, 1);
    this.gameRoot = root;

    // 以 GameRoot 中心为原点，y 向上为正，区域间留 SECTION_GAP 避免重合
    const yTop = CENTER_Y - TOP_H / 2;
    const yHist = yTop - TOP_H / 2 - SECTION_GAP - HISTORY_H / 2;
    const yIn = yHist - HISTORY_H / 2 - SECTION_GAP - INPUT_H / 2;
    const yKb = yIn - INPUT_H / 2 - SECTION_GAP - KEYBOARD_H / 2;

    this.topArea = this.createTopArea(root);
    this.topArea.setPosition(0, yTop, 0);

    this.historyArea = this.createHistoryArea(root);
    this.historyArea.setPosition(0, yHist, 0);

    this.inputArea = this.createInputArea(root);
    this.inputArea.setPosition(0, yIn, 0);

    this.keyboardArea = this.createKeyboardArea(root);
    this.keyboardArea.setPosition(0, yKb, 0);

    this.startGame();
  }

  private createTopArea(parent: Node): Node {
    const area = new Node('TopArea');
    const areaT = area.addComponent(UITransform);
    areaT.setContentSize(CANVAS_W, TOP_H);
    areaT.setAnchorPoint(ANCHOR_CENTER);
    parent.addChild(area);

    const timerNode = new Node('TimerLabel');
    const timerT = timerNode.addComponent(UITransform);
    timerT.setContentSize(140, 56);
    timerT.setAnchorPoint(ANCHOR_CENTER);
    const label = timerNode.addComponent(Label);
    label.string = String(ROUND_SEC);
    label.fontSize = 42;
    label.color = new Color(255, 255, 255, 255);
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    area.addChild(timerNode);
    this.timerLabel = label;
    return area;
  }

  private createHistoryArea(parent: Node): Node {
    const area = new Node('HistoryArea');
    const areaT = area.addComponent(UITransform);
    areaT.setContentSize(CANVAS_W, HISTORY_H);
    areaT.setAnchorPoint(ANCHOR_CENTER);
    parent.addChild(area);

    const content = new Node('HistoryContent');
    const contentT = content.addComponent(UITransform);
    contentT.setContentSize(CANVAS_W - 40, HISTORY_H - 20);
    contentT.setAnchorPoint(new Vec2(0.5, 1));
    area.addChild(content);
    this.historyContent = content;
    return area;
  }

  private createInputArea(parent: Node): Node {
    const area = new Node('InputArea');
    const areaT = area.addComponent(UITransform);
    areaT.setContentSize(CANVAS_W, INPUT_H);
    areaT.setAnchorPoint(ANCHOR_CENTER);
    parent.addChild(area);

    const slotContainer = new Node('SlotContainer');
    const slotT = slotContainer.addComponent(UITransform);
    slotT.setContentSize(280, 52);
    slotT.setAnchorPoint(ANCHOR_CENTER);
    area.addChild(slotContainer);
    const slotW = 56;
    const gap = 12;
    const startX = -(4 * slotW + 3 * gap) / 2 + slotW / 2 + gap / 2;
    for (let i = 0; i < 4; i++) {
      const slot = new Node(`Slot_${i}`);
      slot.addComponent(UITransform).setContentSize(slotW, 52);
      slot.setPosition(startX + i * (slotW + gap), 0, 0);
      const l = slot.addComponent(Label);
      l.string = SLOT_PLACEHOLDER;
      l.fontSize = 36;
      l.color = new Color(255, 255, 255, 255);
      slotContainer.addChild(slot);
      this.slotLabels.push(l);
    }

    const fbNode = new Node('FeedbackLabel');
    fbNode.addComponent(UITransform).setContentSize(200, 36);
    fbNode.setPosition(0, -38, 0);
    const fb = fbNode.addComponent(Label);
    fb.string = '';
    fb.fontSize = 28;
    fb.color = new Color(200, 220, 255, 255);
    area.addChild(fbNode);
    this.feedbackLabel = fb;
    return area;
  }

  private createKeyboardArea(parent: Node): Node {
    const area = new Node('KeyboardArea');
    const areaT = area.addComponent(UITransform);
    areaT.setContentSize(CANVAS_W, KEYBOARD_H);
    areaT.setAnchorPoint(ANCHOR_CENTER);
    parent.addChild(area);
    buildKeyboard(area, {
      onDigit: (d) => this.onDigit(d),
      onDel: () => this.onDel(),
      onConfirm: () => this.onConfirm(),
    });
    return area;
  }

  private refreshSlots() {
    for (let i = 0; i < 4; i++) {
      this.slotLabels[i].string = this.currentInput[i] ?? SLOT_PLACEHOLDER;
    }
  }

  onDigit(digit: string) {
    if (this.currentInput.length >= 4) return;
    this.currentInput += digit;
    this.refreshSlots();
  }

  onDel() {
    if (this.currentInput.length === 0) return;
    this.currentInput = this.currentInput.slice(0, -1);
    this.refreshSlots();
  }

  onConfirm() {
    if (this.currentInput.length !== 4) return;
    const result = OneA2BLogic.evaluate(this.secret, this.currentInput);
    if (result === '') {
      this.currentInput = '';
      this.refreshSlots();
      return;
    }
    if (this.feedbackLabel) this.feedbackLabel.string = result;
    this.appendHistory(this.currentInput, result);
    this.actionTimeline.push({
      timestamp: Date.now() - this.gameStartTime,
      guessCode: this.currentInput,
      result,
    });
    this.currentInput = '';
    this.refreshSlots();
    if (result === '4A0B') {
      this.unschedule(this.onTimerTick);
      this.showResultPopup(true);
    }
  }

  private appendHistory(guess: string, result: string) {
    if (!this.historyContent) return;
    const count = this.historyContent.children.length;
    const item = new Node(`HistoryItem_${count}`);
    item.addComponent(UITransform).setContentSize(CANVAS_W - 80, HISTORY_ITEM_HEIGHT);
    item.setPosition(0, -count * HISTORY_ITEM_HEIGHT, 0);
    const label = item.addComponent(Label);
    label.string = `${guess} → ${result}`;
    label.fontSize = 24;
    label.color = new Color(255, 255, 255, 255);
    this.historyContent.addChild(item);
  }

  private onTimerTick = () => {
    this.timerRemain--;
    if (this.timerLabel) this.timerLabel.string = String(this.timerRemain);
    if (this.timerRemain <= 0) {
      this.unschedule(this.onTimerTick);
      this.showResultPopup(false);
    }
  };

  startGame() {
    this.secret = OneA2BLogic.generateSecret();
    this.gameStartTime = Date.now();
    this.actionTimeline = [];
    this.currentInput = '';
    this.refreshSlots();
    if (this.feedbackLabel) this.feedbackLabel.string = '';
    if (this.historyContent) {
      this.historyContent.removeAllChildren();
    }
    this.timerRemain = ROUND_SEC;
    if (this.timerLabel) this.timerLabel.string = String(ROUND_SEC);
    this.unschedule(this.onTimerTick);
    this.schedule(this.onTimerTick, 1);
  }

  private showResultPopup(won: boolean) {
    const mask = new Node('PopupMask');
    mask.addComponent(UITransform).setContentSize(CANVAS_W, CANVAS_H);
    mask.setPosition(0, 0, 0);
    const box = new Node('ResultBox');
    box.addComponent(UITransform).setContentSize(320, 180);
    const title = new Node('Title');
    title.addComponent(UITransform).setContentSize(300, 50);
    title.setPosition(0, 40, 0);
    const titleLabel = title.addComponent(Label);
    titleLabel.string = won ? '胜利' : '失败';
    titleLabel.fontSize = 42;
    titleLabel.color = won ? new Color(100, 255, 100, 255) : new Color(255, 100, 100, 255);
    box.addChild(title);
    const btnNode = new Node('BtnRetry');
    btnNode.addComponent(UITransform).setContentSize(120, 44);
    btnNode.setPosition(0, -50, 0);
    const btnLabel = new Node('Label');
    btnLabel.addComponent(UITransform).setContentSize(100, 30);
    const lbl = btnLabel.addComponent(Label);
    lbl.string = '再试';
    lbl.fontSize = 24;
    lbl.color = new Color(255, 255, 255, 255);
    btnNode.addChild(btnLabel);
    btnNode.addComponent(Button);
    box.addChild(btnNode);
    this.gameRoot!.addChild(mask);
    mask.addChild(box);
    btnNode.on(Button.EventType.CLICK, () => {
      mask.destroy();
      this.startGame();
    }, this);
  }
}
