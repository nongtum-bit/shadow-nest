const GAME_CODES = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowLeft",
  "ArrowDown",
  "ArrowRight",
  "Space",
  "ShiftLeft",
  "ShiftRight",
  "ControlLeft",
  "ControlRight",
  "KeyC",
  "KeyR",
  "KeyE",
  "KeyF",
  "KeyQ",
  "Digit1",
  "Digit2",
  "KeyP",
  "Escape",
  "KeyV",
]);

export type Actions = {
  moveX: number;
  moveY: number;
  lookX: number;
  lookY: number;
  jump: boolean;
  crouch: boolean;
  sprint: boolean;
  fire: boolean;
  ads: boolean;
  reload: boolean;
  melee: boolean;
  interact: boolean;
  weapon1: boolean;
  weapon2: boolean;
  weaponNext: boolean;
  pause: boolean;
};

export class Input {
  keys = new Set<string>();
  override: string[] | null = null;
  mouseDX = 0;
  mouseDY = 0;
  fireHeld = false;
  adsHeld = false;
  touchMoveX = 0;
  touchMoveY = 0;
  touchLookX = 0;
  touchLookY = 0;
  touchFire = false;
  touchAds = false;
  touchJump = false;
  touchCrouch = false;
  touchReload = false;
  touchMelee = false;
  touchWeapon = false;
  touchInteract = false;
  lookSens = 0.0022;
  private prev: Record<string, boolean> = {};
  private attached = false;

  attach(target: HTMLElement) {
    if (this.attached) return;
    this.attached = true;
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onBlur = this.onBlur.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
    this.onContext = this.onContext.bind(this);
    this.onWheel = this.onWheel.bind(this);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.onBlur);
    target.addEventListener("mousemove", this.onMouseMove);
    target.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    target.addEventListener("contextmenu", this.onContext);
    target.addEventListener("wheel", this.onWheel, { passive: false });
  }

  detach(target: HTMLElement) {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("visibilitychange", this.onBlur);
    target.removeEventListener("mousemove", this.onMouseMove);
    target.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    target.removeEventListener("contextmenu", this.onContext);
    target.removeEventListener("wheel", this.onWheel);
    this.keys.clear();
  }

  setKeys(codes: string[]) {
    this.override = codes;
  }

  sample(): Actions & { just: Record<string, boolean> } {
    const src = this.override ? new Set(this.override) : this.keys;
    const up = src.has("KeyW") || src.has("ArrowUp");
    const down = src.has("KeyS") || src.has("ArrowDown");
    const left = src.has("KeyA") || src.has("ArrowLeft");
    const right = src.has("KeyD") || src.has("ArrowRight");
    let moveX = (right ? 1 : 0) - (left ? 1 : 0) + this.touchMoveX;
    let moveY = (up ? 1 : 0) - (down ? 1 : 0) + this.touchMoveY;
    const mag = Math.hypot(moveX, moveY);
    if (mag > 1) {
      moveX /= mag;
      moveY /= mag;
    }

    const lookX = this.mouseDX + this.touchLookX;
    const lookY = this.mouseDY + this.touchLookY;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.touchLookX = 0;
    this.touchLookY = 0;

    const actions: Actions = {
      moveX,
      moveY,
      lookX,
      lookY,
      jump: src.has("Space") || this.touchJump,
      crouch: src.has("ControlLeft") || src.has("ControlRight") || src.has("KeyC") || this.touchCrouch,
      sprint: src.has("ShiftLeft") || src.has("ShiftRight"),
      fire: this.fireHeld || this.touchFire,
      ads: this.adsHeld || this.touchAds,
      reload: src.has("KeyR") || this.touchReload,
      melee: src.has("KeyF") || this.touchMelee,
      interact: src.has("KeyE") || this.touchInteract,
      weapon1: src.has("Digit1"),
      weapon2: src.has("Digit2"),
      weaponNext: this.touchWeapon,
      pause: src.has("Escape") || src.has("KeyP"),
    };

    const just: Record<string, boolean> = {};
    const flags: (keyof Actions)[] = [
      "jump",
      "reload",
      "melee",
      "interact",
      "weapon1",
      "weapon2",
      "weaponNext",
      "pause",
      "fire",
      "crouch",
    ];
    for (const k of flags) {
      const v = Boolean(actions[k]);
      just[k] = v && !this.prev[k];
      this.prev[k] = v;
    }
    this.touchWeapon = false;
    this.touchReload = false;
    this.touchMelee = false;
    this.touchInteract = false;
    this.touchJump = false;

    return { ...actions, just };
  }

  private onKeyDown(e: KeyboardEvent) {
    if (e.repeat) return;
    if (GAME_CODES.has(e.code)) e.preventDefault();
    this.keys.add(e.code);
  }

  private onKeyUp(e: KeyboardEvent) {
    this.keys.delete(e.code);
  }

  private onBlur() {
    this.keys.clear();
    this.fireHeld = false;
    this.adsHeld = false;
  }

  private onMouseMove(e: MouseEvent) {
    if (document.pointerLockElement) {
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    }
  }

  private onMouseDown(e: MouseEvent) {
    if (e.button === 0) this.fireHeld = true;
    if (e.button === 2) this.adsHeld = true;
  }

  private onMouseUp(e: MouseEvent) {
    if (e.button === 0) this.fireHeld = false;
    if (e.button === 2) this.adsHeld = false;
  }

  private onContext(e: Event) {
    e.preventDefault();
  }

  private weaponCycle = 0;
  private onWheel(e: WheelEvent) {
    e.preventDefault();
    this.weaponCycle++;
    this.touchWeapon = true;
  }
}
