import { _decorator, Component, Node, Label, Button, UITransform, Color, Vec2, Prefab, Sprite, SpriteFrame, resources } from 'cc';
import * as OneA2BLogic from './OneA2BLogic';
import { buildKeyboard } from './DynamicNumpad';
import { Network, type GhostRecord } from './Network';
import { GameAudio } from './GameAudio';
import { addGradientBg } from './GradientBg';

const { ccclass, property } = _decorator;

const DESIGN_W = 1280;
const DESIGN_H = 720;
const UI_SCALE = 1.35;
const SECTION_GAP = 24;
const BOTTOM_MARGIN = 624;
const TOP_MARGIN = 120;
const TOP_H = 72;
const HISTORY_H = 220;
const INPUT_H = 88;
const KEYBOARD_H = 400;
const SLOT_PLACEHOLDER = '_';
const ROUND_SEC = 120;
const HISTORY_ITEM_HEIGHT = 26;
const ANCHOR_CENTER = new Vec2(0.5, 0.5);

/** 场景中布局节点名称，挂到 Canvas 下即可在编辑器里拖动调整位置，避免重叠 */
export const LAYOUT_NAMES = {
  倒计时区: '倒计时区',
  历史区: '历史区',
  结果展示区: '结果展示区',
  数字输入区: '数字输入区',
  键盘区: '键盘区',
} as const;

export interface ActionTimelineItem {
  timestamp: number;
  guessCode: string;
  result: string;
  usedSkill?: string;
}

export interface IViewBootstrap {
  showLobby(): void;
  showLeaderboard(): void;
}

@ccclass('GameController')
export class GameController extends Component {
  @property(Prefab)
  buttonPrefab: Prefab | null = null;
  /** 服务器根地址，留空则用默认 http://localhost:3000 */
  @property
  serverUrl = '';

  /** 方式 A：由 GameBootstrap 注入，用于「返回大厅」 */
  bootstrap: IViewBootstrap | null = null;

  setBootstrap(b: IViewBootstrap) {
    this.bootstrap = b;
  }

  private ghostRecord: GhostRecord | null = null;

  setGhostRecord(record: GhostRecord | null) {
    this.ghostRecord = record;
  }

  private gameRoot: Node | null = null;
  private topArea: Node | null = null;
  private historyArea: Node | null = null;
  private inputArea: Node | null = null;
  private keyboardArea: Node | null = null;
  private keyboardContainer: Node | null = null;

  private timerLabel: Label | null = null;
  private historyContent: Node | null = null;
  private slotLabels: Label[] = [];
  private feedbackLabel: Label | null = null;
  private ghostStepLabel: Label | null = null;

  private viewW = DESIGN_W;
  private viewH = DESIGN_H;
  private secret = '';
  private currentInput = '';
  private timerRemain = 0;
  private gameStartTime = 0;
  private actionTimeline: ActionTimelineItem[] = [];

  onLoad() {
    if (this.serverUrl) Network.baseUrl = this.serverUrl;
    if (!this.node.getComponent(GameAudio)) this.node.addComponent(GameAudio);
    const layout = this.findLayoutNodes();
    if (layout) {
      this.gameRoot = null;
      this.buildContentInLayout(layout);
    } else {
      const ut = this.node.getComponent(UITransform);
      const c = ut?.contentSize;
      if (c && c.width > 0 && c.height > 0) {
        this.viewW = c.width;
        this.viewH = c.height;
      }
      const cx = this.viewW / 2;
      const halfH = this.viewH / 2;
      const root = new Node('GameRoot');
      const rootT = root.addComponent(UITransform);
      rootT.setContentSize(this.viewW, this.viewH);
      rootT.setAnchorPoint(ANCHOR_CENTER);
      this.node.addChild(root);
      const isUnderBattleRoot = this.node.name === 'BattleRoot';
      root.setPosition(isUnderBattleRoot ? 0 : cx, isUnderBattleRoot ? 0 : halfH, 0);
      root.setScale(UI_SCALE, UI_SCALE, 1);
      this.gameRoot = root;
      // 倒计时在顶部，历史在倒计时正下方；键盘贴底，输入区在键盘上方
      const yTop = (halfH - TOP_MARGIN - TOP_H / 2) / UI_SCALE;
      const yHist = yTop - TOP_H / 2 - SECTION_GAP - HISTORY_H / 2;
      const yKb = -halfH + KEYBOARD_H / 2 + BOTTOM_MARGIN;
      const yIn = yKb + KEYBOARD_H / 2 + SECTION_GAP + INPUT_H / 2;
      this.topArea = this.createTopArea(root);
      this.topArea.setPosition(0, yTop, 0);
      this.historyArea = this.createHistoryArea(root);
      this.historyArea.setPosition(0, yHist, 0);
      this.inputArea = this.createInputArea(root);
      this.inputArea.setPosition(0, yIn, 0);
      this.keyboardArea = this.createKeyboardArea(root);
      this.keyboardArea.setPosition(0, yKb, 0);
      if (this.ghostRecord) {
        const ghostNode = new Node('GhostStep');
        ghostNode.addComponent(UITransform).setContentSize(this.viewW - 80, 28);
        ghostNode.setPosition(0, yHist + HISTORY_H / 2 + 15, 0);
        const gl = ghostNode.addComponent(Label);
        gl.string = '对手: —';
        gl.fontSize = 22;
        gl.color = new Color(200, 200, 255, 255);
        root.addChild(ghostNode);
        this.ghostStepLabel = gl;
      }
    }
    this.ensureLoginThenStart();
  }

  private findLayoutNodes(): { 倒计时区: Node; 历史区: Node; 结果展示区: Node; 数字输入区: Node; 键盘区: Node } | null {
    const a = this.node.getChildByName(LAYOUT_NAMES.倒计时区);
    const b = this.node.getChildByName(LAYOUT_NAMES.历史区);
    const c = this.node.getChildByName(LAYOUT_NAMES.结果展示区);
    const d = this.node.getChildByName(LAYOUT_NAMES.数字输入区);
    const e = this.node.getChildByName(LAYOUT_NAMES.键盘区);
    if (a && b && c && d && e) return { 倒计时区: a, 历史区: b, 结果展示区: c, 数字输入区: d, 键盘区: e };
    return null;
  }

  private buildContentInLayout(layout: { 倒计时区: Node; 历史区: Node; 结果展示区: Node; 数字输入区: Node; 键盘区: Node }) {
    this.createTimerContent(layout.倒计时区);
    this.createHistoryContent(layout.历史区);
    this.createFeedbackContent(layout.结果展示区);
    this.createSlotsContent(layout.数字输入区);
    this.createKeyboardContent(layout.键盘区);
  }

  private createTimerContent(parent: Node) {
    const timerNode = new Node('TimerLabel');
    const timerT = timerNode.addComponent(UITransform);
    timerT.setContentSize(140, 56);
    timerT.setAnchorPoint(ANCHOR_CENTER);
    const label = timerNode.addComponent(Label);
    label.string = String(ROUND_SEC);
    label.fontSize = 42;
    label.color = new Color(255, 255, 255, 255);
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    parent.addChild(timerNode);
    this.timerLabel = label;
  }

  private createHistoryContent(parent: Node) {
    const content = new Node('HistoryContent');
    const contentT = content.addComponent(UITransform);
    contentT.setContentSize(this.viewW - 40, HISTORY_H - 20);
    contentT.setAnchorPoint(new Vec2(0.5, 1));
    parent.addChild(content);
    this.historyContent = content;
  }

  private createFeedbackContent(parent: Node) {
    const fbNode = new Node('FeedbackLabel');
    fbNode.addComponent(UITransform).setContentSize(200, 36);
    fbNode.setPosition(0, 0, 0);
    const fb = fbNode.addComponent(Label);
    fb.string = '';
    fb.fontSize = 28;
    fb.color = new Color(200, 220, 255, 255);
    parent.addChild(fbNode);
    this.feedbackLabel = fb;
  }

  private createSlotsContent(parent: Node) {
    const slotContainer = new Node('SlotContainer');
    const slotT = slotContainer.addComponent(UITransform);
    slotT.setContentSize(280, 52);
    slotT.setAnchorPoint(ANCHOR_CENTER);
    slotContainer.setPosition(0, 0, 0);
    parent.addChild(slotContainer);
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
  }

  private createKeyboardContent(parent: Node) {
    this.keyboardContainer = buildKeyboard(parent, {
      onDigit: (d) => this.onDigit(d),
      onDel: () => this.onDel(),
      onConfirm: () => this.onConfirm(),
    }, this.buttonPrefab);
  }

  private async ensureLoginThenStart() {
    if (!Network.getToken()) {
      const res = await Network.guestLogin();
      if (res.code !== 0) console.warn('[Network] guest login failed:', res.message);
    }
    this.startGame();
  }

  private createTopArea(parent: Node): Node {
    const area = new Node('TopArea');
    const areaT = area.addComponent(UITransform);
    areaT.setContentSize(this.viewW, TOP_H);
    areaT.setAnchorPoint(ANCHOR_CENTER);
    parent.addChild(area);

    const btnBack = new Node('BtnBackLobby');
    btnBack.addComponent(UITransform).setContentSize(100, 40);
    // GameRoot 有 UI_SCALE，左侧超出父节点会被裁掉，按钮 x 需在可视范围内
    const visibleLeft = -this.viewW / 2 / UI_SCALE;
    btnBack.setPosition(visibleLeft + 55, 0, 0);
    const lblBack = new Node('Label');
    lblBack.addComponent(UITransform).setContentSize(90, 28);
    const lBack = lblBack.addComponent(Label);
    lBack.string = '返回大厅';
    lBack.fontSize = 22;
    lBack.color = new Color(255, 255, 255, 255);
    btnBack.addChild(lblBack);
    btnBack.addComponent(Button);
    area.addChild(btnBack);
    btnBack.on(Button.EventType.CLICK, () => this.bootstrap?.showLobby(), this);

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
    areaT.setContentSize(this.viewW, HISTORY_H);
    areaT.setAnchorPoint(ANCHOR_CENTER);
    parent.addChild(area);

    const content = new Node('HistoryContent');
    const contentT = content.addComponent(UITransform);
    contentT.setContentSize(this.viewW - 40, HISTORY_H - 20);
    contentT.setAnchorPoint(new Vec2(0.5, 1));
    area.addChild(content);
    this.historyContent = content;
    return area;
  }

  private createInputArea(parent: Node): Node {
    const area = new Node('InputArea');
    const areaT = area.addComponent(UITransform);
    areaT.setContentSize(this.viewW, INPUT_H);
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
    areaT.setContentSize(this.viewW, KEYBOARD_H);
    areaT.setAnchorPoint(ANCHOR_CENTER);
    parent.addChild(area);
    this.keyboardContainer = buildKeyboard(area, {
      onDigit: (d) => this.onDigit(d),
      onDel: () => this.onDel(),
      onConfirm: () => this.onConfirm(),
    }, this.buttonPrefab);
    return area;
  }

  /** 已输入过的数字键灰掉，避免重复输入 */
  private refreshDigitButtonStates() {
    if (!this.keyboardContainer) return;
    const digits = '0123456789';
    for (const d of digits) {
      const keyNode = this.keyboardContainer.getChildByName(`Key_${d}`);
      if (!keyNode) continue;
      const btn = keyNode.getComponent(Button);
      if (btn) btn.interactable = !this.currentInput.includes(d);
    }
  }

  private refreshSlots() {
    for (let i = 0; i < 4; i++) {
      this.slotLabels[i].string = this.currentInput[i] ?? SLOT_PLACEHOLDER;
    }
    this.refreshDigitButtonStates();
  }

  onDigit(digit: string) {
    if (this.currentInput.length >= 4) return;
    GameAudio.playClick();
    this.currentInput += digit;
    this.refreshSlots();
  }

  onDel() {
    if (this.currentInput.length === 0) return;
    GameAudio.playBack();
    this.currentInput = this.currentInput.slice(0, -1);
    this.refreshSlots();
  }

  onConfirm() {
    if (this.currentInput.length !== 4) return;
    const result = OneA2BLogic.evaluate(this.secret, this.currentInput);
    if (result === '') {
      GameAudio.playError();
      this.currentInput = '';
      this.refreshSlots();
      return;
    }
    GameAudio.playConfirm();
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
    item.addComponent(UITransform).setContentSize(this.viewW - 80, HISTORY_ITEM_HEIGHT);
    item.setPosition(0, -count * HISTORY_ITEM_HEIGHT, 0);
    const label = item.addComponent(Label);
    label.string = `${guess} → ${result}`;
    label.fontSize = 24;
    label.color = new Color(255, 255, 255, 255);
    this.historyContent.addChild(item);
  }

  private reportMatchFinish(isWin: boolean) {
    if (!Network.getToken()) return;
    const totalTimeMs = Date.now() - this.gameStartTime;
    Network.finishMatch({
      targetCode: this.secret,
      totalTimeMs,
      actionTimeline: this.actionTimeline,
      isWin,
    }).then((res) => {
      if (res.code !== 0) console.warn('[Network] match/finish failed:', res.message);
    });
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
    if (this.ghostStepLabel) this.ghostStepLabel.string = '对手: —';
    this.timerRemain = ROUND_SEC;
    if (this.timerLabel) this.timerLabel.string = String(ROUND_SEC);
    this.unschedule(this.onTimerTick);
    this.schedule(this.onTimerTick, 1);
    if (this.ghostRecord?.actionTimeline?.length) {
      this.scheduleGhostReplay();
    }
  }

  private scheduleGhostReplay() {
    const timeline = this.ghostRecord!.actionTimeline;
    const start = this.gameStartTime;
    timeline.forEach((item) => {
      const delay = Math.max(0, item.timestamp - (Date.now() - start)) / 1000;
      this.scheduleOnce(() => {
        if (this.gameStartTime !== start) return;
        if (this.ghostStepLabel) this.ghostStepLabel.string = `对手: ${item.guessCode} → ${item.result}`;
        if (item.result === '4A0B') {
          this.unschedule(this.onTimerTick);
          this.showResultPopup(false);
        }
      }, delay);
    });
  }

  private showResultPopup(won: boolean) {
    this.reportMatchFinish(won);
    if (won) GameAudio.playConfirm(); else GameAudio.playError();
    const mask = new Node('PopupMask');
    const maskUt = mask.addComponent(UITransform);
    maskUt.setContentSize(this.viewW, this.viewH);
    maskUt.setAnchorPoint(ANCHOR_CENTER);
    mask.setPosition(0, 0, 0);
    addGradientBg(mask, this.viewW, this.viewH,
      new Color(0, 0, 20, 200),
      new Color(0, 0, 8, 230)
    );
    const box = new Node('ResultBox');
    const boxUt = box.addComponent(UITransform);
    boxUt.setContentSize(360, 220);
    boxUt.setAnchorPoint(ANCHOR_CENTER);
    addGradientBg(box, 360, 220,
      new Color(55, 40, 90, 255),
      new Color(30, 22, 55, 255)
    );
    const iconPath = won ? 'textures/checkmark/spriteFrame' : 'textures/exclamation/spriteFrame';
    const iconNode = new Node('ResultIcon');
    iconNode.addComponent(UITransform).setContentSize(48, 48);
    iconNode.setPosition(-100, 40, 0);
    const sprite = iconNode.addComponent(Sprite);
    box.addChild(iconNode);
    resources.load(iconPath, SpriteFrame, (err, sf) => {
      if (!err && sf) sprite.spriteFrame = sf;
    });
    const title = new Node('Title');
    title.addComponent(UITransform).setContentSize(300, 50);
    title.setPosition(0, 40, 0);
    const titleLabel = title.addComponent(Label);
    titleLabel.string = won ? '胜利' : '失败';
    titleLabel.fontSize = 42;
    titleLabel.color = won ? new Color(100, 255, 100, 255) : new Color(255, 100, 100, 255);
    box.addChild(title);
    const btnRetry = new Node('BtnRetry');
    btnRetry.addComponent(UITransform).setContentSize(120, 44);
    btnRetry.setPosition(-100, -40, 0);
    const lblRetry = new Node('Label');
    lblRetry.addComponent(UITransform).setContentSize(100, 30);
    const lr = lblRetry.addComponent(Label);
    lr.string = '再试';
    lr.fontSize = 24;
    lr.color = new Color(255, 255, 255, 255);
    btnRetry.addChild(lblRetry);
    btnRetry.addComponent(Button);
    box.addChild(btnRetry);

    const btnLobby = new Node('BtnLobby');
    btnLobby.addComponent(UITransform).setContentSize(120, 44);
    btnLobby.setPosition(100, -40, 0);
    const lblLobby = new Node('Label');
    lblLobby.addComponent(UITransform).setContentSize(100, 30);
    const ll = lblLobby.addComponent(Label);
    ll.string = '返回大厅';
    ll.fontSize = 22;
    ll.color = new Color(255, 255, 255, 255);
    btnLobby.addChild(lblLobby);
    btnLobby.addComponent(Button);
    box.addChild(btnLobby);

    const btnRank = new Node('BtnRank');
    btnRank.addComponent(UITransform).setContentSize(120, 44);
    btnRank.setPosition(0, -85, 0);
    const lblRank = new Node('Label');
    lblRank.addComponent(UITransform).setContentSize(100, 30);
    const lRank = lblRank.addComponent(Label);
    lRank.string = '排行榜';
    lRank.fontSize = 22;
    lRank.color = new Color(255, 255, 255, 255);
    btnRank.addChild(lblRank);
    btnRank.addComponent(Button);
    box.addChild(btnRank);

    (this.gameRoot ?? this.node).addChild(mask);
    mask.addChild(box);

    btnRetry.on(Button.EventType.CLICK, () => {
      mask.destroy();
      this.startGame();
    }, this);
    btnLobby.on(Button.EventType.CLICK, () => {
      mask.destroy();
      this.bootstrap?.showLobby();
    }, this);
    btnRank.on(Button.EventType.CLICK, () => {
      mask.destroy();
      this.bootstrap?.showLeaderboard?.();
    }, this);
  }
}
