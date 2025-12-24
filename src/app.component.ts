
import { Component, ChangeDetectionStrategy, signal, WritableSignal, effect, computed, OnInit, OnDestroy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Character, Projectile, Vector2, GameObject, Obstacle, Pickup, Particle, MuzzleFlash, EnergyZone, TerrainPatch, KillFeedItem, MapTheme } from './game.models';

// --- THEMES ---
const THEMES: MapTheme[] = [
    { name: 'Island', backgroundColor: '#2f855a', terrainPatchColors: ['#68d391', '#48bb78'], obstacleColors: { tree: '#276749', rock: '#718096' } },
    { name: 'Lava', backgroundColor: '#1a202c', terrainPatchColors: [], obstacleColors: { tree: '#2d3748', rock: '#1a202c' }, hazard: { type: 'lava', color: '#f56565', damage: 0.5 } },
    { name: 'Desert', backgroundColor: '#fbd38d', terrainPatchColors: ['#f6e05e', '#eddea4'], obstacleColors: { tree: '#2f855a', rock: '#b7791f' } },
    { name: 'Archipelago', backgroundColor: '#4299e1', terrainPatchColors: ['#2f855a', '#38a169'], obstacleColors: { tree: '#276749', rock: '#a0aec0' } },
    { name: 'Luxury', backgroundColor: '#4a5568', terrainPatchColors: ['#e2e8f0', '#90cdf4'], obstacleColors: { tree: '#2c5282', rock: '#718096' } }
];
const BOT_NAMES = ["Shadow_Striker", "Pixel_Pro", "Cyber_Gladiator", "Robo_Hunter", "Quantum_Leaper", "Bot_Bandit", "Circuit_Slayer", "Data_Demon", "Silicon_Samurai", "Voltage_Viper"];

// --- CONSTANTS ---
const PLAYER_ID = 0;
const PLAYER_SPEED = 4; const PLAYER_SIZE = 40; const PLAYER_INITIAL_AMMO = 50; const PLAYER_MAX_AMMO = 100; const PLAYER_PROJECTILE_DAMAGE = 10;
const PLAYER_DASH_FORCE = 25; const PLAYER_DASH_DURATION = 150; const PLAYER_DASH_COOLDOWN = 2000;
const BOT_COUNT = 49; const BOT_SIZE = 40; const BOT_SHOOT_RANGE = 600; const BOT_SHOOT_COOLDOWN = 1500; const BOT_PROJECTILE_DAMAGE = 5;
const PROJECTILE_SPEED = 10; const PROJECTILE_SIZE = 8; const HIT_FLASH_DURATION = 150;
const PICKUP_SIZE = 35; const HEALTH_PICKUP_VALUE = 25; const AMMO_PICKUP_VALUE = 20; const ENERGY_ZONE_FORCE = 3;

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit, OnDestroy {
  public readonly MAP_SIZE = 4000;
  private cdr = inject(ChangeDetectorRef);

  // Game & Map State
  gameState = signal<'playing' | 'gameOver' | 'victory'>('playing');
  currentMapTheme = signal<MapTheme>(THEMES[0]);
  
  // Game Object Signals
  player = signal<Character | null>(null);
  bots = signal<Character[]>([]);
  projectiles = signal<Projectile[]>([]);
  obstacles = signal<Obstacle[]>([]);
  pickups = signal<Pickup[]>([]);
  particles = signal<Particle[]>([]);
  muzzleFlashes = signal<MuzzleFlash[]>([]);
  energyZones = signal<EnergyZone[]>([]);
  terrainPatches = signal<TerrainPatch[]>([]);
  killFeed = signal<KillFeedItem[]>([]);

  // Camera & Input State
  cameraPosition = signal<Vector2>({ x: 0, y: 0 });
  private keysPressed: { [key: string]: boolean } = {};
  private mousePosition: Vector2 = { x: 0, y: 0 };
  
  // Computed Signals
  playerAngle = computed(() => { const p = this.player(); if(!p) return 0; const sW = window.innerWidth, sH = window.innerHeight; const psp = { x: sW/2, y: sH/2}; const dx = this.mousePosition.x-psp.x, dy = this.mousePosition.y-psp.y; return Math.atan2(dy, dx) * (180/Math.PI); });
  dashCooldownProgress = computed(() => { const p = this.player(); if(!p || !p.dashCooldown) return 1; return Math.min(1, (Date.now() - p.lastDashTimestamp) / p.dashCooldown); });

  private gameLoopHandle: number = 0;
  private lastTimestamp: number = 0;
  private nextId = 1;

  constructor() {
    effect(() => { if (this.gameState() !== 'playing') cancelAnimationFrame(this.gameLoopHandle); else if (this.gameLoopHandle === 0) { this.lastTimestamp = performance.now(); this.gameLoopHandle = requestAnimationFrame(this.gameLoop); } });
    effect(() => { if(this.bots().length === 0 && this.gameState() === 'playing' && this.player() !== null) this.gameState.set('victory'); });
  }

  ngOnInit() { this.setupEventListeners(); this.restartGame(); }
  ngOnDestroy() { this.cleanupEventListeners(); cancelAnimationFrame(this.gameLoopHandle); }

  private setupEventListeners() { window.addEventListener('keydown', this.handleKeyDown); window.addEventListener('keyup', this.handleKeyUp); }
  private cleanupEventListeners() { window.removeEventListener('keydown', this.handleKeyDown); window.removeEventListener('keyup', this.handleKeyUp); }
  private handleKeyDown = (e: KeyboardEvent) => { const key = e.key.toLowerCase(); this.keysPressed[key] = true; if (key === 'e') this.dash(); };
  private handleKeyUp = (e: KeyboardEvent) => { this.keysPressed[e.key.toLowerCase()] = false; };
  onMouseMove = (event: MouseEvent) => { this.mousePosition = { x: event.clientX, y: event.clientY }; };
  onMouseDown = (event: MouseEvent) => { if (this.gameState() === 'playing') this.shoot(PLAYER_ID); };

  restartGame() {
    this.nextId = 1; this.keysPressed = {};
    const playerStartPos = { x: this.MAP_SIZE / 2, y: this.MAP_SIZE / 2 };
    this.currentMapTheme.set(THEMES[Math.floor(Math.random() * THEMES.length)]);
    
    this.player.set({
      id: PLAYER_ID, name: 'You', position: playerStartPos, velocity: { x: 0, y: 0 }, size: PLAYER_SIZE, health: 100, maxHealth: 100, color: 'bg-blue-500', isHit: false, hitTimestamp: 0, lastShotTimestamp: 0, angle: 0, ammo: PLAYER_INITIAL_AMMO, maxAmmo: PLAYER_MAX_AMMO, isDashing: false, dashCooldown: PLAYER_DASH_COOLDOWN, lastDashTimestamp: 0,
    });
    
    this.cameraPosition.set({ x: -playerStartPos.x + window.innerWidth / 2, y: -playerStartPos.y + window.innerHeight / 2 });

    const theme = this.currentMapTheme();
    this.obstacles.set(this.generateObstacles(80, theme));
    this.bots.set(this.generateBots(BOT_COUNT));
    this.pickups.set(this.generatePickups(20, 20));
    this.energyZones.set(this.generateEnergyZones(5));
    this.terrainPatches.set(this.generateTerrainPatches(40, theme));
    this.projectiles.set([]); this.particles.set([]); this.muzzleFlashes.set([]); this.killFeed.set([]);
    this.gameState.set('playing');
  }
  
  private generateBots(count: number): Character[] { return Array.from({ length: count }, (_, i) => ({ id: this.nextId++, name: `${BOT_NAMES[i % BOT_NAMES.length]}${Math.floor(i / BOT_NAMES.length) || ''}`, position: this.getRandomPosition(BOT_SIZE), velocity: { x: 0, y: 0 }, size: BOT_SIZE, health: 50, maxHealth: 50, color: 'bg-yellow-500', isHit: false, hitTimestamp: 0, lastShotTimestamp: 0, angle: 0, isDashing: false, dashCooldown: 0, lastDashTimestamp: 0 })); }
  private generateObstacles(count: number, theme: MapTheme): Obstacle[] { return Array.from({ length: count }, () => { const isRock = Math.random() > 0.5; const size = isRock ? Math.random() * 120 + 80 : Math.random() * 40 + 30; return { id: this.nextId++, position: this.getRandomPosition(size), size: size, color: isRock ? theme.obstacleColors.rock : theme.obstacleColors.tree, obstacleType: isRock ? 'rock' : 'tree' }; }); }
  private generatePickups(h: number, a: number): Pickup[] { const p: Pickup[] = []; for (let i=0;i<h;i++) p.push({ id: this.nextId++, pickupType: 'health', value: HEALTH_PICKUP_VALUE, position: this.getRandomPosition(PICKUP_SIZE), size: PICKUP_SIZE, color:''}); for (let i=0;i<a;i++) p.push({ id: this.nextId++, pickupType: 'ammo', value: AMMO_PICKUP_VALUE, position: this.getRandomPosition(PICKUP_SIZE), size: PICKUP_SIZE, color:''}); return p; }
  private generateEnergyZones(count: number): EnergyZone[] { return Array.from({ length: count }, () => { const size = Math.random() * 200 + 150; return { id: this.nextId++, position: this.getRandomPosition(size), size: size, color: '', pushForce: ENERGY_ZONE_FORCE }; }); }
  private generateTerrainPatches(count: number, theme: MapTheme): TerrainPatch[] { const patches: TerrainPatch[] = []; for(let i = 0; i < count; i++) { const isHazard = !!theme.hazard && Math.random() < 0.3; patches.push({ id: this.nextId++, position: { x: Math.random() * this.MAP_SIZE, y: Math.random() * this.MAP_SIZE }, size: { width: Math.random() * 300 + 150, height: Math.random() * 300 + 150 }, color: isHazard ? theme.hazard!.color : theme.terrainPatchColors[Math.floor(Math.random()*theme.terrainPatchColors.length)], borderRadius: `${Math.random()*30+20}% ${Math.random()*30+20}% ${Math.random()*30+20}% ${Math.random()*30+20}%`, isHazard, hazardType: isHazard ? theme.hazard!.type : undefined }); } return patches; }

  private getRandomPosition(objectSize: number): Vector2 { let pos: Vector2; let colliding: boolean; const allObjects = [...this.obstacles(), ...this.bots(), ...this.energyZones(), this.player()].filter(Boolean) as GameObject[]; do { colliding = false; pos = { x: Math.random()*(this.MAP_SIZE-100)+50, y: Math.random()*(this.MAP_SIZE-100)+50 }; for (const obj of allObjects) { if (this.isColliding({ position: pos, size: objectSize } as GameObject, obj)) { colliding = true; break; } } } while (colliding); return pos; }

  private shoot(ownerId: number, target?: Vector2) { const isPlayer = ownerId === PLAYER_ID; const owner = isPlayer ? this.player() : this.bots().find(b => b.id === ownerId); if (!owner) return; if(isPlayer && (!owner.ammo || owner.ammo <= 0)) return; if(isPlayer && owner.ammo) owner.ammo--; let angleRad: number, angleDeg: number; if(isPlayer) { angleDeg = this.playerAngle(); angleRad = angleDeg * (Math.PI / 180); } else if (target) { const dx = target.x - owner.position.x; const dy = target.y - owner.position.y; angleRad = Math.atan2(dy, dx); angleDeg = angleRad * (180 / Math.PI); } else return; this.projectiles.update(p => [...p, { id: this.nextId++, position: { ...owner.position }, velocity: { x: Math.cos(angleRad) * PROJECTILE_SPEED, y: Math.sin(angleRad) * PROJECTILE_SPEED }, size: PROJECTILE_SIZE, color: isPlayer ? '#fBBF24' : '#ef4444', ownerId: owner.id, damage: isPlayer ? PLAYER_PROJECTILE_DAMAGE : BOT_PROJECTILE_DAMAGE, }]); this.muzzleFlashes.update(f => [...f, { id: this.nextId++, position: {...owner.position}, angle: angleDeg, size: 40, life: 50, maxLife: 50, color: '' }]); }
  
  private createImpactEffect(position: Vector2, color: string) { const p: Particle[] = []; for(let i=0; i<5; i++) { const angle = Math.random()*2*Math.PI; const speed = Math.random()*3+1; p.push({ id: this.nextId++, position: {...position}, velocity: {x: Math.cos(angle)*speed, y: Math.sin(angle)*speed }, size: Math.random()*4+2, life: 200, maxLife: 200, color}); } this.particles.update(ps => [...ps, ...p]); }

  private dash() { this.player.update(p => { if (!p || p.isDashing || Date.now() - p.lastDashTimestamp < p.dashCooldown) return p; p.isDashing = true; p.lastDashTimestamp = Date.now(); setTimeout(() => this.player.update(pi => { if (pi) pi.isDashing = false; return pi; }), PLAYER_DASH_DURATION); this.createImpactEffect(p.position, 'white'); return p; }); }
  
  private addKillFeedItem(killer: Character, victim: Character) { const newItem: KillFeedItem = { id: this.nextId++, killerName: killer.name, victimName: victim.name, timestamp: Date.now() }; this.killFeed.update(kf => [...kf, newItem]); setTimeout(() => this.killFeed.update(kf => kf.filter(item => item.id !== newItem.id)), 5000); }

  private gameLoop = (timestamp: number) => {
    const deltaTime = Math.min(2, (timestamp - this.lastTimestamp) / 16.67); this.lastTimestamp = timestamp;
    this.updatePlayer(deltaTime); this.updateBots(deltaTime); this.updateProjectiles(deltaTime);
    this.updateParticles(deltaTime); this.updateMuzzleFlashes(deltaTime); this.updateCamera(deltaTime);
    this.checkCollisions(); this.checkPickups(); this.cleanup();
    this.cdr.detectChanges(); this.gameLoopHandle = requestAnimationFrame(this.gameLoop);
  };
  
  private updatePlayer(dt: number) { this.player.update(p => this.updateCharacter(p, dt)); }
  private updateBots(dt: number) { const player = this.player(); if(!player) return; this.bots.update(bots => bots.map(bot => { const updatedBot = this.updateCharacter(bot, dt, player); if(updatedBot) { const dx = player.position.x - updatedBot.position.x; const dy = player.position.y - updatedBot.position.y; const dist = Math.sqrt(dx*dx+dy*dy); updatedBot.angle = Math.atan2(dy, dx)*(180/Math.PI); if(dist < BOT_SHOOT_RANGE && Date.now() - updatedBot.lastShotTimestamp > BOT_SHOOT_COOLDOWN) { this.shoot(updatedBot.id, player.position); updatedBot.lastShotTimestamp = Date.now(); } } return updatedBot; }).filter(b => b !== null) as Character[]); }

  private updateCharacter<T extends Character | null>(char: T, deltaTime: number, target?: Character): T {
    if(!char) return null; let vx = 0, vy = 0; const isPlayer = char.id === PLAYER_ID;
    if (char.isDashing) { if(isPlayer) { if (this.keysPressed['w']) vy=-1; if (this.keysPressed['s']) vy=1; if (this.keysPressed['a']) vx=-1; if (this.keysPressed['d']) vx=1; } const mag = Math.sqrt(vx*vx+vy*vy) || 1; char.velocity.x = (vx/mag)*PLAYER_DASH_FORCE; char.velocity.y = (vy/mag)*PLAYER_DASH_FORCE; this.particles.update(p => [...p, { id: this.nextId++, position: {...char.position}, velocity: {x:0,y:0}, size: char.size, life: 100, maxLife: 100, color: 'rgba(255,255,255,0.5)'}]); } else { if(isPlayer) { if (this.keysPressed['w']) vy=-1; if (this.keysPressed['s']) vy=1; if (this.keysPressed['a']) vx=-1; if (this.keysPressed['d']) vx=1; } else if(target) { const dx = target.position.x - char.position.x, dy = target.position.y - char.position.y, dist = Math.sqrt(dx*dx + dy*dy); if (dist > char.size*2) { vx = dx/dist; vy = dy/dist; } } const mag = Math.sqrt(vx*vx + vy*vy); const speed = isPlayer ? PLAYER_SPEED : PLAYER_SPEED*0.65; char.velocity.x = mag > 0 ? (vx/mag)*speed : 0; char.velocity.y = mag > 0 ? (vy/mag)*speed : 0; }
    for(const zone of this.energyZones()) { if(this.isColliding(char, zone)) { const dx = char.position.x-zone.position.x, dy = char.position.y-zone.position.y, dist = Math.sqrt(dx*dx+dy*dy) || 1; char.velocity.x += (dx/dist)*zone.pushForce; char.velocity.y += (dy/dist)*zone.pushForce; } }
    const theme = this.currentMapTheme(); if(theme.hazard) { for(const patch of this.terrainPatches()) { if(patch.isHazard && this.isColliding(char, { position: patch.position, size: Math.min(patch.size.width, patch.size.height) } as GameObject)) { char.health -= theme.hazard.damage * deltaTime; char.isHit = true; char.hitTimestamp = Date.now(); } } }
    const prevPos = { ...char.position }; char.position.x += char.velocity.x*deltaTime; char.position.y += char.velocity.y*deltaTime; char.position.x = Math.max(char.size/2, Math.min(this.MAP_SIZE - char.size/2, char.position.x)); char.position.y = Math.max(char.size/2, Math.min(this.MAP_SIZE - char.size/2, char.position.y)); for(const obstacle of this.obstacles()) if (this.isColliding(char, obstacle)) { char.position = prevPos; break; } if(char.isHit && Date.now() - char.hitTimestamp > HIT_FLASH_DURATION) char.isHit = false;
    return char;
  }

  private updateProjectiles(dt: number) { this.projectiles.update(ps => ps.map(p => ({...p, position:{x:p.position.x+p.velocity.x*dt, y:p.position.y+p.velocity.y*dt}})).filter(p => p.position.x>0 && p.position.x<this.MAP_SIZE && p.position.y>0 && p.position.y<this.MAP_SIZE)); }
  private updateParticles(dt: number) { this.particles.update(ps => ps.map(p => ({...p, life:p.life-16*dt, position:{x:p.position.x+p.velocity.x*dt*0.5, y:p.position.y+p.velocity.y*dt*0.5}})).filter(p => p.life>0)); }
  private updateMuzzleFlashes(dt: number) { this.muzzleFlashes.update(fs => fs.map(f => ({...f, life:f.life-16*dt})).filter(f => f.life>0)); }
  
  private updateCamera(dt: number) { const p = this.player(); if(!p) return; const targetX = -p.position.x + window.innerWidth/2, targetY = -p.position.y + window.innerHeight/2; this.cameraPosition.update(pos => ({ x: pos.x+(targetX-pos.x)*0.1*dt, y: pos.y+(targetY-pos.y)*0.1*dt })); }

  private checkCollisions() { const pr = new Set<number>(); for (const proj of this.projectiles()) { const targets = proj.ownerId === PLAYER_ID ? this.bots() : (this.player() ? [this.player()!] : []); for(const target of targets) { if (this.isColliding(proj, target)) { target.health -= proj.damage; target.isHit = true; target.hitTimestamp = Date.now(); pr.add(proj.id); this.createImpactEffect(proj.position, '#FF5555'); } } for(const obstacle of this.obstacles()) if(this.isColliding(proj, obstacle)){ pr.add(proj.id); this.createImpactEffect(proj.position, '#AAAAAA'); } } if (pr.size > 0) this.projectiles.update(p => p.filter(proj => !pr.has(proj.id))); }
  private checkPickups() { const p = this.player(); if (!p) return; const pr = new Set<number>(); for(const pickup of this.pickups()) { if(this.isColliding(p, pickup)) { if(pickup.pickupType==='health') p.health=Math.min(p.maxHealth, p.health+pickup.value); if(pickup.pickupType==='ammo' && p.ammo!==undefined && p.maxAmmo!==undefined) p.ammo=Math.min(p.maxAmmo, p.ammo+pickup.value); pr.add(pickup.id); } } if(pr.size>0) this.pickups.update(curr => curr.filter(pi => !pr.has(pi.id))); }
  private isColliding(a: GameObject, b: GameObject): boolean { const dx = a.position.x-b.position.x, dy = a.position.y-b.position.y; return Math.sqrt(dx*dx+dy*dy) < (a.size/2+b.size/2); }
  private cleanup() { const p = this.player(); if (!p) return; const eliminatedBots = this.bots().filter(bot => bot.health <= 0); for (const bot of eliminatedBots) { this.addKillFeedItem(p, bot); } this.bots.update(bots => bots.filter(bot => bot.health > 0)); if(p.health <= 0) { this.player.set(null); this.gameState.set('gameOver'); } }
}
