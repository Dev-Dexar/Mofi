import type { Artboard, Mat2D, Node, RiveCanvas } from '@rive-app/canvas-advanced'

/**
 * The animation engine for the mascot (a Rive file with a head, a body and a single white eye, no hands). The file's own animation is not
 * played. Instead every moving quantity is a spring that chases a target, and each frame the head, body and whole figure are moved by
 * those numbers, so moods glide into each other and a jump can crouch, stretch, land and squash. Everything the file lacks is drawn over
 * or behind it with the Canvas2D context: a new eye (it blinks, looks about, squints, shows $ and hearts), hands and arms, a chest light,
 * an aura, a crown and sunglasses that appear by themselves, and particles. The classic principles are in: anticipation, squash and stretch, follow-through, overlapping action.
 */

export type VoltMood = 'idle' | 'happy' | 'excited' | 'cool' | 'sleepy' | 'think' | 'sad' | 'proud' | 'love' | 'rich'
export type Burst = 'coins' | 'hearts' | 'sparkles' | 'confetti' | 'zzz' | 'question'

// ----- where things are in the file (artboard units, measured from the artwork) -----
const EYE = { x: 38, y: -111.6, rx: 37, ry: 46 } // in the head's own space
const BODY_H = 164 // the body's height below its origin, so it can be squashed toward the ground
const SHOULDER = { l: [-66, 34], r: [72, 34] } as const // in the body's own space
const HEAD_BOX = { left: -135, right: 93, top: -211, neck: 4 } // in the head's own space
const FACE_CENTRE = [232, 150] // artboard space: where particles come from
const GROUND_Y = 436

interface Pose {
  open: number
  pupil: number
  lid: number
  lidTilt: number
  joy: number
  money: number
  heart: number
  headRot: number
  headDy: number
  armL: number
  armR: number
  wave: number
  tilt: number
  puff: number
  glow: number
  coin: number
  shades: number
  lookX: number
  lookY: number
}
const base: Pose = {
  open: 1,
  pupil: 1,
  lid: 0,
  lidTilt: 0,
  joy: 0,
  money: 0,
  heart: 0,
  headRot: 0,
  headDy: 0,
  armL: 10,
  armR: 10,
  wave: 0,
  tilt: 0,
  puff: 0,
  glow: 0.7,
  coin: 0,
  shades: 0,
  lookX: 0,
  lookY: 0,
}
const pose = (p: Partial<Pose>): Pose => ({ ...base, ...p })

const POSES: Record<VoltMood, Pose> = {
  idle: pose({}),
  happy: pose({ joy: 0.0, glow: 0.9, headRot: -0.04, armL: 16, armR: 16 }),
  excited: pose({ open: 1.1, pupil: 1.2, armL: 152, armR: 152, wave: 1, glow: 1.3, headRot: -0.06, headDy: -6, puff: 0.03 }),
  cool: pose({ open: 0.85, lid: 0.28, shades: 1, glow: 0.85, headRot: 0.05, armL: 8, armR: 8 }),
  sleepy: pose({ open: 0.04, lid: 0.0, glow: 0.3, headRot: 0.16, headDy: 8, armL: 6, armR: 6, tilt: 0.03 }),
  think: pose({ open: 0.95, lid: 0.12, lidTilt: -0.35, headRot: -0.14, glow: 0.8, armR: 120, armL: 10, lookX: 0.8, lookY: -0.8 }),
  sad: pose({ open: 0.9, pupil: 1.25, lid: 0.3, lidTilt: 0.9, headRot: 0.12, headDy: 10, glow: 0.35, armL: 4, armR: 4 }),
  proud: pose({ joy: 1, puff: 0.06, glow: 1.15, headRot: -0.08, armL: 22, armR: 22 }),
  love: pose({ heart: 1, joy: 0, glow: 1.1, headRot: -0.07, armL: 30, armR: 30 }),
  rich: pose({ money: 1, glow: 1.4, armL: 152, armR: 150, wave: 0.7, coin: 1, puff: 0.03, headRot: -0.05 }),
}

class Spring {
  x: number
  v = 0
  t: number
  k: number
  c: number
  constructor(t: number, k = 140, c = 18) {
    this.x = this.t = t
    this.k = k
    this.c = c
  }
  step(dt: number) {
    this.v += (this.k * (this.t - this.x) - this.c * this.v) * dt
    this.x += this.v * dt
  }
}

/** The colour of its glow and light follows the news: green by default, gold when money is coming in, and so on */
const ACCENT: Record<VoltMood, string> = {
  idle: '#10b981',
  happy: '#10b981',
  excited: '#34d399',
  cool: '#10b981',
  sleepy: '#10b981',
  think: '#60a5fa',
  sad: '#64748b',
  proud: '#f5c542',
  love: '#fb7185',
  rich: '#f5c542',
}
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

interface Particle {
  kind: Burst
  x: number
  y: number
  vx: number
  vy: number
  g: number
  age: number
  life: number
  rot: number
  vr: number
  phase: number
  hue: number
}

type SpringKey = keyof Pose | 'hopY' | 'crouch' | 'spin'

export class MascotRig {
  private rive: RiveCanvas
  private board: Artboard
  private mascot: Node
  private body: Node
  private head: Node
  private baseM: [number, number]
  private baseB: [number, number]
  private baseH: [number, number, number]
  private s: Record<SpringKey, Spring>
  private t = 0
  private baseMood: VoltMood = 'idle'
  private flashMood: VoltMood | null = null
  private flashTimer = 0
  private timers: number[] = []
  private talking = false
  private blinkAt = 2
  private blinkU = -1
  private pointerAt = -99
  private pointer = { x: 0, y: 0 }
  private glanceAt = 3
  private glance = { x: 0, y: 0 }
  private spinU = -1
  private shineU = -1
  private nextShine = 8
  private questionAt = 2.5
  private zzzAt = 0
  private particles: Particle[] = []
  private reduced: boolean
  private view = { xx: 1, xy: 0, yx: 0, yy: 1, tx: 0, ty: 0 }
  private headW = { xx: 1, xy: 0, yx: 0, yy: 1, tx: 0, ty: 0 }
  private bodyW = { xx: 1, xy: 0, yx: 0, yy: 1, tx: 0, ty: 0 }
  private hands: { x: number; y: number }[] = [] // where the hands are, in the body's space, so they can be drawn in front of it

  constructor(rive: RiveCanvas, board: Artboard, reduced: boolean) {
    this.rive = rive
    this.board = board
    this.reduced = reduced
    this.mascot = board.node('mascot')
    this.body = board.node('Body')
    this.head = board.node('Head')
    this.baseM = [this.mascot.x, this.mascot.y]
    this.baseB = [this.body.x, this.body.y]
    this.baseH = [this.head.x, this.head.y, this.head.rotation]
    const b = base
    const sp = (v: number, k?: number, c?: number) => new Spring(v, k, c)
    this.s = {
      open: sp(b.open, 260, 24),
      pupil: sp(b.pupil, 200, 22),
      lid: sp(b.lid, 220, 22),
      lidTilt: sp(b.lidTilt, 200, 22),
      joy: sp(b.joy, 190, 21),
      money: sp(b.money, 180, 20),
      heart: sp(b.heart, 180, 20),
      headRot: sp(b.headRot, 120, 14), // the head trails the body a little
      headDy: sp(b.headDy, 150, 16),
      armL: sp(b.armL, 120, 11), // loose, so they swing on after the body stops
      armR: sp(b.armR, 110, 10.5),
      wave: sp(b.wave, 120, 16),
      tilt: sp(b.tilt, 110, 12),
      puff: sp(b.puff, 160, 14),
      glow: sp(b.glow, 70, 13),
      coin: sp(b.coin, 130, 15),
      shades: sp(b.shades, 150, 13),
      lookX: sp(0, 230, 24),
      lookY: sp(0, 230, 24),
      hopY: sp(0, 230, 15),
      crouch: sp(0, 400, 26),
      spin: sp(0, 90, 18),
    }
    this.aim('idle')
  }

  // ----- what the outside can ask for -----
  setMood(m: VoltMood) {
    this.baseMood = m
    if (!this.flashMood) this.aim(m)
  }
  flash(m: VoltMood, ms: number) {
    this.flashMood = m
    this.aim(m)
    window.clearTimeout(this.flashTimer)
    this.flashTimer = window.setTimeout(() => {
      this.flashMood = null
      this.aim(this.baseMood)
    }, ms)
  }
  look(x: number, y: number) {
    this.pointer = { x: clamp(x, -1, 1), y: clamp(y, -1, 1) }
    this.pointerAt = this.t
  }
  setTalking(on: boolean) {
    this.talking = on
  }
  /** Crouch, then spring up */
  hop(power = 1) {
    if (this.reduced) return
    this.s.crouch.t = 1
    this.later(100, () => {
      this.s.crouch.t = 0
      this.s.hopY.v = -520 * power
    })
  }
  /** A full backflip in the air */
  flip() {
    if (this.reduced || this.spinU >= 0) return
    this.spinU = 0
    this.hop(1.5)
  }
  shine() {
    if (!this.reduced) this.shineU = 0
  }
  burst(kind: Burst, n = 14) {
    if (this.reduced) return
    for (let i = 0; i < n; i++) this.emit(kind, i, n)
  }
  /** Works out how the artwork fits `frame`: the part of the (larger) canvas, in device pixels, that the mascot itself occupies */
  resize(frame: { minX: number; minY: number; maxX: number; maxY: number }) {
    const m = this.rive.computeAlignment(this.rive.Fit.contain, this.rive.Alignment.center, frame, this.board.bounds)
    this.view = { xx: m.xx, xy: m.xy, yx: m.yx, yy: m.yy, tx: m.tx, ty: m.ty }
  }
  destroy() {
    this.timers.forEach((id) => window.clearTimeout(id))
    window.clearTimeout(this.flashTimer)
    this.particles = []
  }

  private later(ms: number, fn: () => void) {
    this.timers.push(window.setTimeout(fn, ms))
  }

  private aim(m: VoltMood) {
    const q = POSES[m]
    ;(
      [
        'open',
        'pupil',
        'lid',
        'lidTilt',
        'joy',
        'money',
        'heart',
        'headRot',
        'headDy',
        'armL',
        'armR',
        'wave',
        'tilt',
        'puff',
        'glow',
        'coin',
        'shades',
      ] as const
    ).forEach((k) => {
      this.s[k].t = q[k]
      if (this.reduced) {
        this.s[k].x = q[k]
        this.s[k].v = 0
      }
    })
  }

  // ----- each frame -----
  /** Moves the springs on and poses the artwork. Call once per frame, before draw(). */
  update(dt: number) {
    const s = this.s
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)))
    const h = dt / steps
    this.t += dt
    const t = this.t
    const mood = this.flashMood ?? this.baseMood

    const bias = POSES[mood]
    const active = t - this.pointerAt < 3.5
    if (!active && t > this.glanceAt) {
      this.glance = Math.random() < 0.35 ? { x: 0, y: 0 } : { x: Math.random() * 1.6 - 0.8, y: Math.random() * 1.1 - 0.5 }
      this.glanceAt = t + 1.8 + Math.random() * 2.8
    }
    const target = active ? this.pointer : this.glance
    s.lookX.t = bias.lookX !== 0 && !active ? bias.lookX : target.x
    s.lookY.t = bias.lookY !== 0 && !active ? bias.lookY : target.y
    // talking: the head nods and the eye squashes in time with the words
    if (this.talking) s.headDy.t = POSES[mood].headDy + 4 * Math.abs(Math.sin(t * 11))

    for (let i = 0; i < steps; i++) Object.values(s).forEach((sp) => sp.step(h))

    if (this.blinkU < 0 && t > this.blinkAt && s.joy.x < 0.5 && mood !== 'sleepy') {
      this.blinkU = 0
      this.blinkAt = t + 2.4 + Math.random() * 3.4
      if (Math.random() < 0.18) this.blinkAt = t + 0.28
    }
    if (this.blinkU >= 0) {
      this.blinkU += dt / 0.17
      if (this.blinkU >= 1) this.blinkU = -1
    }
    if (this.spinU >= 0) {
      this.spinU += dt / 0.9
      if (this.spinU >= 1) this.spinU = -1
    }
    if (this.shineU >= 0) {
      this.shineU += dt / 1.0
      if (this.shineU >= 1) this.shineU = -1
    } else if (t > this.nextShine && mood !== 'sleepy' && mood !== 'sad') {
      this.shineU = 0
      this.nextShine = t + 9 + Math.random() * 6
    }
    if (mood === 'sleepy' && t > this.zzzAt) {
      this.emit('zzz', 0, 1)
      this.zzzAt = t + 1.7
    }
    if (mood === 'think' && t > this.questionAt) {
      this.emit('question', 0, 1)
      this.questionAt = t + 3.2
    }
    this.stepParticles(dt)

    // ----- pose the artwork -----
    const breath = Math.sin(t * 1.9) * 0.012
    const air = clamp(-s.hopY.v * 0.00045, -0.1, 0.14)
    const land = clamp(s.hopY.x, 0, 10) * 0.01
    const sy = clamp(1 + breath + air - land - s.crouch.x * 0.17, 0.7, 1.2) // body height
    const flip = this.spinU >= 0 ? (this.spinU < 0.5 ? 2 * this.spinU * this.spinU : 1 - Math.pow(-2 * this.spinU + 2, 2) / 2) * 2 * Math.PI : 0
    this.mascot.x = this.baseM[0]
    this.mascot.y = this.baseM[1] + s.hopY.x
    this.mascot.rotation = s.tilt.x + flip
    this.body.scaleY = sy * (1 + s.puff.x)
    this.body.scaleX = (1 / Math.sqrt(sy) + s.crouch.x * 0.06) * (1 + s.puff.x)
    const drop = BODY_H * (1 - sy) // keeps the feet on the ground, and the head on the shoulders
    this.body.y = this.baseB[1] + drop
    this.head.x = this.baseH[0]
    this.head.y = this.baseH[1] + drop + s.headDy.x
    this.head.rotation = this.baseH[2] + s.headRot.x
    this.board.advance(0)

    const hw = this.head.worldTransform()
    this.headW = { xx: hw.xx, xy: hw.xy, yx: hw.yx, yy: hw.yy, tx: hw.tx, ty: hw.ty }
    const bw = this.body.worldTransform()
    this.bodyW = { xx: bw.xx, xy: bw.xy, yx: bw.yx, yy: bw.yy, tx: bw.tx, ty: bw.ty }
    ;(hw as Mat2D & { delete?: () => void }).delete?.()
    ;(bw as Mat2D & { delete?: () => void }).delete?.()
  }

  // ----- drawing -----
  /** What goes behind the artwork: the aura, the shadow and the arms */
  drawBack(ctx: CanvasRenderingContext2D) {
    const v = this.view
    const s = this.s
    ctx.save()
    ctx.setTransform(v.xx, v.xy, v.yx, v.yy, v.tx, v.ty)

    // the shadow on the ground
    const up = clamp(-s.hopY.x, 0, 60)
    ctx.fillStyle = `rgba(0,0,0,${0.5 - up * 0.004})`
    ctx.beginPath()
    ctx.ellipse(245, GROUND_Y, 92 - up * 0.5, 11 - up * 0.08, 0, 0, Math.PI * 2)
    ctx.fill()

    // arms, in the body's space, so they squash with it; the body covers their roots
    ctx.transform(this.bodyW.xx, this.bodyW.xy, this.bodyW.yx, this.bodyW.yy, this.bodyW.tx, this.bodyW.ty)
    const wave = clamp(s.wave.x, 0, 1) * Math.sin(this.t * 12) * 14
    const arm = (root: readonly [number, number], deg: number, side: 1 | -1, withCoin: boolean) => {
      const a = ((deg + side * wave) * Math.PI) / 180
      const len = 62
      const hx = root[0] + side * Math.sin(a) * len
      const hy = root[1] + Math.cos(a) * len
      ctx.lineCap = 'round'
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 27
      ctx.beginPath()
      ctx.moveTo(root[0], root[1])
      ctx.lineTo(hx, hy)
      ctx.stroke()
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 19
      ctx.stroke()
      this.hands.push({ x: hx, y: hy })
      if (withCoin && s.coin.x > 0.05) this.drawCoin(ctx, hx, hy - 30 * s.coin.x, clamp(s.coin.x, 0, 1))
    }
    this.hands = []
    arm(SHOULDER.l, s.armL.x, -1, false)
    arm(SHOULDER.r, s.armR.x, 1, true)
    ctx.restore()
  }

  /** What goes over the artwork: the face, the chest light, accessories and particles */
  drawFront(ctx: CanvasRenderingContext2D) {
    const v = this.view
    const t = this.t
    const mood = this.flashMood ?? this.baseMood
    const accent = ACCENT[mood]
    ctx.save()
    ctx.setTransform(v.xx, v.xy, v.yx, v.yy, v.tx, v.ty)

    // ----- the chest light and the hands (body space) -----
    ctx.save()
    ctx.transform(this.bodyW.xx, this.bodyW.xy, this.bodyW.yx, this.bodyW.yy, this.bodyW.tx, this.bodyW.ty)
    for (const hand of this.hands) {
      ctx.fillStyle = '#000'
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 4.5
      ctx.beginPath()
      ctx.arc(hand.x, hand.y, 17, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
    const light =
      mood === 'rich'
        ? '#f5c542'
        : mood === 'think'
          ? '#60a5fa'
          : mood === 'sad'
            ? '#64748b'
            : mood === 'love'
              ? '#fb7185'
              : mood === 'sleepy'
                ? rgba(accent, 0.35)
                : accent
    const beat = mood === 'sleepy' ? 0.5 + Math.sin(t * 1.2) * 0.2 : 0.75 + Math.sin(t * (this.talking ? 9 : 2.4)) * 0.25
    ctx.fillStyle = '#000'
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.arc(6, 86, 13, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = light
    ctx.globalAlpha = beat
    ctx.shadowColor = light
    ctx.shadowBlur = 14
    ctx.beginPath()
    ctx.arc(6, 86, 6.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.shadowBlur = 0
    ctx.restore()

    // ----- the head's space: the face and what it wears -----
    ctx.save()
    ctx.transform(this.headW.xx, this.headW.xy, this.headW.yx, this.headW.yy, this.headW.tx, this.headW.ty)
    this.drawFace(ctx)
    // a crown when it has every reason to be proud
    if (mood === 'proud') {
      ctx.fillStyle = '#f5c542'
      ctx.strokeStyle = '#7c5b0b'
      ctx.lineWidth = 5
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(-60, HEAD_BOX.top + 22)
      ctx.lineTo(-52, HEAD_BOX.top - 38)
      ctx.lineTo(-24, HEAD_BOX.top - 8)
      ctx.lineTo(4, HEAD_BOX.top - 48)
      ctx.lineTo(32, HEAD_BOX.top - 8)
      ctx.lineTo(60, HEAD_BOX.top - 38)
      ctx.lineTo(64, HEAD_BOX.top + 22)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = accent
      for (const x of [-52, 4, 60]) {
        ctx.beginPath()
        ctx.arc(x, HEAD_BOX.top - 22 + (x === 4 ? -12 : 0), 6, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.restore()

    // ----- particles (artboard space) -----
    this.drawParticles(ctx)
    ctx.restore()
  }

  private drawFace(ctx: CanvasRenderingContext2D) {
    const s = this.s
    const blink = this.blinkU >= 0 ? Math.sin(Math.PI * Math.min(this.blinkU, 1)) : 0
    const joy = clamp(s.joy.x, 0, 1)
    const open = clamp(s.open.x, 0, 1.15) * (1 - blink * 0.95)
    const cx = EYE.x + s.lookX.x * 7
    const cy = EYE.y + s.lookY.x * 6
    const talk = this.talking ? 1 + Math.sin(this.t * 22) * 0.04 : 1

    // wipe the file's own eye, then draw ours in its place
    ctx.fillStyle = '#000'
    ctx.beginPath()
    ctx.ellipse(EYE.x, EYE.y, EYE.rx + 7, EYE.ry + 7, 0, 0, Math.PI * 2)
    ctx.fill()

    if (joy > 0.02) {
      // a beaming eye: an arch
      ctx.globalAlpha = joy
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 13
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(cx - 28, cy + 14)
      ctx.quadraticCurveTo(cx, cy - 34, cx + 28, cy + 14)
      ctx.stroke()
      ctx.globalAlpha = 1
    }
    const eyeA = 1 - joy
    if (eyeA > 0.02) {
      ctx.save()
      ctx.globalAlpha = eyeA
      const ry = Math.max(EYE.ry * open * talk, 2.5)
      ctx.beginPath()
      ctx.ellipse(cx, cy, EYE.rx, ry, 0, 0, Math.PI * 2)
      ctx.clip()
      ctx.fillStyle = '#fff'
      ctx.fillRect(cx - 60, cy - 70, 120, 140)
      const money = clamp(s.money.x, 0, 1)
      const heart = clamp(s.heart.x, 0, 1)
      if (money > 0.02) {
        ctx.globalAlpha = eyeA * money
        ctx.fillStyle = '#b8891a'
        ctx.font = '900 70px Inter, system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('$', cx, cy + 3)
        ctx.globalAlpha = eyeA
      }
      if (heart > 0.02) {
        ctx.globalAlpha = eyeA * heart
        ctx.fillStyle = '#fb7185'
        this.heartPath(ctx, cx, cy + 2, 30 + Math.sin(this.t * 7) * 2)
        ctx.fill()
        ctx.globalAlpha = eyeA
      }
      if (money < 0.5 && heart < 0.5) {
        const pr = 15 * s.pupil.x
        const px = cx + s.lookX.x * 14
        const py = cy + s.lookY.x * 16
        ctx.fillStyle = '#000'
        ctx.beginPath()
        ctx.arc(px, py, pr, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#fff'
        ctx.beginPath()
        ctx.arc(px + 5, py - 6, 4.4, 0, Math.PI * 2)
        ctx.fill()
      }
      // a lid sliding down from the top: tired, sad, doubtful
      const lid = clamp(s.lid.x, 0, 1)
      if (lid > 0.01) {
        const edge = cy - ry + lid * 2 * ry
        const tilt = s.lidTilt.x * 22
        ctx.fillStyle = '#000'
        ctx.beginPath()
        ctx.moveTo(cx - 70, cy - 90)
        ctx.lineTo(cx + 70, cy - 90)
        ctx.lineTo(cx + 70, edge + tilt)
        ctx.lineTo(cx - 70, edge - tilt)
        ctx.closePath()
        ctx.fill()
      }
      ctx.restore()
    }

    // the sunglasses that drop on for "cool"
    const sh = clamp(s.shades.x, 0, 1.1)
    if (sh > 0.02) {
      const drop = (1 - clamp(sh, 0, 1)) * -90
      ctx.save()
      ctx.globalAlpha = clamp(sh * 1.4, 0, 1)
      ctx.translate(0, drop)
      ctx.fillStyle = '#0b0f19'
      ctx.strokeStyle = '#e5e7eb'
      ctx.lineWidth = 6
      ctx.beginPath()
      ctx.roundRect(EYE.x - 54, EYE.y - 28, 108, 58, [10, 10, 30, 30])
      ctx.fill()
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(EYE.x - 54, EYE.y - 12)
      ctx.lineTo(HEAD_BOX.left + 6, EYE.y - 30)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(255,255,255,.55)'
      ctx.lineWidth = 6
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(EYE.x - 30, EYE.y - 12)
      ctx.lineTo(EYE.x - 8, EYE.y - 12)
      ctx.stroke()
      ctx.restore()
    }

    // a sparkle on the eye now and then
    if (this.shineU >= 0) {
      const k = Math.sin(this.shineU * Math.PI)
      ctx.fillStyle = '#fff'
      ctx.save()
      ctx.translate(EYE.x + 22, EYE.y - 30)
      ctx.scale(k, k)
      ctx.beginPath()
      for (let i = 0; i < 8; i++) {
        const r = i % 2 ? 4 : 17
        const an = (i * Math.PI) / 4
        ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r)
      }
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }
  }

  private heartPath(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
    const w = size
    ctx.beginPath()
    ctx.moveTo(x, y + w * 0.9)
    ctx.bezierCurveTo(x - w * 1.5, y - w * 0.1, x - w * 0.8, y - w * 1.1, x, y - w * 0.45)
    ctx.bezierCurveTo(x + w * 0.8, y - w * 1.1, x + w * 1.5, y - w * 0.1, x, y + w * 0.9)
    ctx.closePath()
  }

  private drawCoin(ctx: CanvasRenderingContext2D, x: number, y: number, k: number) {
    const sx = Math.cos(this.t * 5)
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(Math.max(Math.abs(sx), 0.12) * k, k)
    ctx.fillStyle = '#f5c542'
    ctx.strokeStyle = '#9a7412'
    ctx.lineWidth = 3.5
    ctx.beginPath()
    ctx.arc(0, 0, 17, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(0, 0, 11, 0, Math.PI * 2)
    ctx.stroke()
    if (sx > 0) {
      ctx.fillStyle = '#9a7412'
      ctx.font = '900 16px Inter, system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('$', 0, 1)
    }
    ctx.restore()
  }

  // ----- particles -----
  private emit(kind: Burst, i: number, n: number) {
    const ang = (i / n) * Math.PI * 2 + Math.random() * 0.6
    const x = FACE_CENTRE[0] + (Math.random() - 0.5) * 60
    const y = FACE_CENTRE[1] + (Math.random() - 0.5) * 40
    const mk = (vx: number, vy: number, g: number, life: number, vr: number): Particle => ({
      kind,
      x,
      y,
      vx,
      vy,
      g,
      age: 0,
      life,
      rot: Math.random() * 6,
      vr,
      phase: Math.random() * 6,
      hue: i,
    })
    let p: Particle
    if (kind === 'coins') p = mk(Math.cos(ang) * (90 + Math.random() * 140), -280 - Math.random() * 220, 900, 1.5 + Math.random() * 0.5, 0)
    else if (kind === 'hearts') p = mk((Math.random() - 0.5) * 120, -110 - Math.random() * 80, -20, 1.7 + Math.random() * 0.6, (Math.random() - 0.5) * 2)
    else if (kind === 'sparkles')
      p = mk(Math.cos(ang) * (80 + Math.random() * 100), Math.sin(ang) * (80 + Math.random() * 100), 0, 0.9 + Math.random() * 0.4, 0)
    else if (kind === 'confetti')
      p = mk(Math.cos(ang) * (170 + Math.random() * 170), -220 - Math.random() * 300, 760, 1.5 + Math.random() * 0.6, (Math.random() - 0.5) * 12)
    else if (kind === 'zzz') p = { ...mk(18, -34, 0, 2.3, 0), x: 330, y: 70 }
    else p = { ...mk(8, -40, 0, 2.2, 0), x: 330, y: 70 }
    this.particles.push(p)
  }

  private stepParticles(dt: number) {
    this.particles = this.particles.filter((p) => {
      p.age += dt
      if (p.age >= p.life) return false
      p.vy += p.g * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.rot += p.vr * dt
      return true
    })
  }

  private drawParticles(ctx: CanvasRenderingContext2D) {
    const accent = ACCENT[this.flashMood ?? this.baseMood]
    for (const p of this.particles) {
      const fade = clamp((p.life - p.age) / (p.life * 0.35), 0, 1)
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.globalAlpha = fade
      if (p.kind === 'coins') {
        ctx.scale(1.3, 1.3)
        const sx = Math.max(Math.abs(Math.cos(p.age * 9 + p.phase)), 0.15)
        ctx.scale(sx, 1)
        ctx.fillStyle = '#f5c542'
        ctx.strokeStyle = '#9a7412'
        ctx.lineWidth = 2.6
        ctx.beginPath()
        ctx.arc(0, 0, 11, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(0, 0, 6.6, 0, Math.PI * 2)
        ctx.stroke()
      } else if (p.kind === 'hearts') {
        ctx.rotate(p.rot * 0.2)
        ctx.fillStyle = '#fb7185'
        this.heartPath(ctx, 0, 0, 11)
        ctx.fill()
      } else if (p.kind === 'sparkles') {
        ctx.rotate(p.rot)
        ctx.fillStyle = p.hue % 2 ? '#fde68a' : accent
        ctx.beginPath()
        for (let i = 0; i < 8; i++) {
          const r = i % 2 ? 3 : 12
          const an = (i * Math.PI) / 4
          ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r)
        }
        ctx.closePath()
        ctx.fill()
      } else if (p.kind === 'confetti') {
        ctx.rotate(p.rot)
        ctx.fillStyle = [accent, '#fde68a', '#60a5fa', '#f472b6', '#ffffff'][p.hue % 5]
        ctx.fillRect(-6, -3.5, 12, 7)
      } else {
        const size = (p.kind === 'zzz' ? 30 : 40) * (0.8 + p.age * 0.25)
        ctx.fillStyle = p.kind === 'zzz' ? '#e2e8f0' : '#93c5fd'
        ctx.font = `900 ${size}px Inter, system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(p.kind === 'zzz' ? 'z' : '?', 0, 0)
      }
      ctx.restore()
    }
  }
}
