export interface Score {
  id?: string;
  userId: string;
  username: string;
  photoURL?: string;
  score: number;
  isGuest: boolean;
  createdAt: any; // Can be Date or Firestore Timestamp
}

export interface Player {
  y: number; // Vertical position (offset from ground level)
  vy: number; // Vertical velocity
  gravity: number;
  jumpForce: number;
  height: number;
  width: number;
  isGrounded: boolean;
  isCrouching: boolean;
}

export interface Obstacle {
  id: string; // Dynamic ID to prevent react key issues
  elClass: string;
  w: number;
  h: number;
  y: number; // height offset from bottom of game container
  x: number; // horizontal offset from left
  type: 'svg' | 'css';
  svg?: string;
}

export interface Particle {
  id: string;
  x: number;
  y: number;
  size: number;
  color: string;
  opacity: number;
  vx: number;
  vy: number;
}
