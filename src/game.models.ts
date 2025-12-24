
export interface Vector2 {
  x: number;
  y: number;
}

export interface GameObject {
  id: number;
  position: Vector2;
  size: number;
  color: string;
}

export interface Character extends GameObject {
  name: string;
  health: number;
  maxHealth: number;
  velocity: Vector2;
  isHit: boolean;
  hitTimestamp: number;
  lastShotTimestamp: number;
  angle: number;
  ammo?: number;
  maxAmmo?: number;
  isDashing: boolean;
  dashCooldown: number;
  lastDashTimestamp: number;
}

export interface Projectile extends GameObject {
  velocity: Vector2;
  ownerId: number;
  damage: number;
}

export interface Obstacle extends GameObject {
  obstacleType: 'tree' | 'rock';
}

export interface Pickup extends GameObject {
    pickupType: 'health' | 'ammo';
    value: number;
}

export interface Particle extends GameObject {
    life: number;
    maxLife: number;
    velocity: Vector2;
}

export interface MuzzleFlash extends GameObject {
    life: number;
    maxLife: number;
    angle: number;
}

export interface EnergyZone extends GameObject {
    pushForce: number;
}

export interface TerrainPatch {
    id: number;
    position: Vector2;
    size: { width: number; height: number };
    color: string;
    borderRadius: string;
    isHazard?: boolean;
    hazardType?: 'lava';
}

export interface KillFeedItem {
    id: number;
    killerName: string;
    victimName: string;
    timestamp: number;
}

export interface MapTheme {
    name: string;
    backgroundColor: string;
    terrainPatchColors: string[];
    obstacleColors: {
        tree: string;
        rock: string;
    };
    hazard?: {
        type: 'lava';
        color: string;
        damage: number;
    }
}
