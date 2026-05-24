import { useEffect, useRef, useState } from 'react';
import { 
  playJumpSound, 
  playCrouchSound, 
  playCollectSound, 
  playHitSound, 
  playLaserChargeSound, 
  playLaserShootSound 
} from './SoundManager';
import { Sparkles, FlaskConical, Zap, Award } from 'lucide-react';

interface GameAreaProps {
  isPlaying: boolean;
  onGameOver: (finalScore: number) => void;
  speedMultiplier: number;
}

interface ObstacleInstance {
  id: string;
  type: 'log' | 'rock' | 'pit' | 'branch';
  x: number;
  width: number;
  height: number;
  bottom: number;
  passed: boolean;
}

interface ItemInstance {
  id: string;
  type: 'compound-v';
  x: number;
  width: number;
  height: number;
  bottom: number;
}

interface ParticleInstance {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  opacity: number;
  life: number;
}

interface ZoneType {
  id: number;
  name: string;
  sub: string;
  minDistance: number;
  bgGradient: string; 
  groundBorder: string; 
  groundBg: string; 
  particleColor: string;
}

const ZONES: ZoneType[] = [
  {
    id: 1,
    name: "NOVA YORK: CENTRO",
    sub: "Fase 1: Corrida pelas avenidas externas da Vought",
    minDistance: 0,
    bgGradient: "linear-gradient(to bottom, #07091e, #0e1236, #1b2057)",
    groundBorder: "#1e5e22",
    groundBg: "linear-gradient(to bottom, #422613, #1f1108)",
    particleColor: "#00ffff"
  },
  {
    id: 2,
    name: "TÚNEL SUBTERRÂNEO NEON",
    sub: "Fase 2: Segredos industriais em altíssima velocidade",
    minDistance: 250,
    bgGradient: "linear-gradient(to bottom, #11011c, #2a033b, #46055c)",
    groundBorder: "#00d2ff",
    groundBg: "linear-gradient(to bottom, #191c2b, #0c0d14)",
    particleColor: "#e000ff"
  },
  {
    id: 3,
    name: "LABORATÓRIO RESTRITO COMPOSTO V",
    sub: "Fase 3: Alvos biológicos e químicos experimentais",
    minDistance: 600,
    bgGradient: "linear-gradient(to bottom, #01140d, #032e20, #064c34)",
    groundBorder: "#39ff14",
    groundBg: "linear-gradient(to bottom, #101c13, #060d09)",
    particleColor: "#39ff14"
  },
  {
    id: 4,
    name: "TEMPESTADE RETRO-APOCALÍPTICA",
    sub: "Fase Final: Sobreviva à fúria máxima do Capitão Pátria!",
    minDistance: 1100,
    bgGradient: "linear-gradient(to bottom, #1f0101, #3c0303, #610505)",
    groundBorder: "#ff2200",
    groundBg: "linear-gradient(to bottom, #210d0d, #0d0404)",
    particleColor: "#ff4400"
  }
];

export default function GameArea({ isPlaying, onGameOver, speedMultiplier }: GameAreaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  
  // Game reactive state
  const [currentScore, setCurrentScore] = useState(0);
  const [multiplier, setMultiplier] = useState(1);
  const [multiplierActive, setMultiplierActive] = useState(false);
  const [laserWarning, setLaserWarning] = useState(false);
  const [laserActive, setLaserActive] = useState(false);
  const [shieldActive, setShieldActive] = useState(false); 
  const [jumpCount, setJumpCount] = useState(0);

  // Runway zones/phases state
  const [currentZone, setCurrentZone] = useState<ZoneType>(ZONES[0]);
  const [activeZoneBanner, setActiveZoneBanner] = useState<ZoneType | null>(null);
  const activeZoneIdRef = useRef(1);

  // Core loop state variables via refs (speeds up physical updates to 60fps)
  const scoreRef = useRef(0);
  const curSpeedRef = useRef(9.5);
  const globalCyclesRef = useRef(0);
  const loopRef = useRef<number | null>(null);

  // Player physics
  const playerYRef = useRef(0);
  const playerVYRef = useRef(0);
  const playerGroundedRef = useRef(true);
  const playerCrouchingRef = useRef(false);
  const playerHeightRef = useRef(94);
  const playerWidthRef = useRef(45);
  const jumpCountRef = useRef(0);

  // Background parallax x coordinates
  const starsRef = useRef(0);
  const farRef = useRef(0);
  const midRef = useRef(0);
  const groundScrollRef = useRef(0);

  // Obstacles, Items, Particles
  const obstaclesRef = useRef<ObstacleInstance[]>([]);
  const itemsRef = useRef<ItemInstance[]>([]);
  const particlesRef = useRef<ParticleInstance[]>([]);
  const lastObstacleTypeRef = useRef<string>('');

  // Key tracking
  const keysPressedRef = useRef<{ [key: string]: boolean }>({});

  // Homelander laser schedule
  const laserCycleRef = useRef({
    state: 'idle' as 'idle' | 'charging' | 'shooting',
    timer: 0,
    targetY: 155,
  });

  // UI state updates maps
  const [activeObstacleList, setActiveObstacleList] = useState<ObstacleInstance[]>([]);
  const [activeItemList, setActiveItemList] = useState<ItemInstance[]>([]);
  const [activeParticleList, setActiveParticleList] = useState<ParticleInstance[]>([]);

  // Keybindings listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'KeyS'].includes(e.code)) {
        e.preventDefault();
      }
      keysPressedRef.current[e.code] = true;

      if (!isPlaying) return;

      // Jump activation
      if (e.code === 'ArrowUp' || e.code === 'Space') {
        if (playerGroundedRef.current) {
          playerVYRef.current = 13.0; 
          playerGroundedRef.current = false;
          jumpCountRef.current = 1;
          setJumpCount(1);
          playJumpSound();
          createJumpRing(260 + 22, 35);
        } else if (jumpCountRef.current === 1) {
          // Double Flip jump
          playerVYRef.current = 9.5;
          jumpCountRef.current = 2;
          setJumpCount(2);
          playJumpSound();
          createJumpRing(260 + 22, 35 + playerYRef.current);
          
          // Double jump visual burst
          for (let i = 0; i < 8; i++) {
            particlesRef.current.push({
              id: Math.random().toString(),
              x: 260 + 22,
              y: 35 + playerYRef.current,
              vx: -12 + Math.random() * 4,
              vy: (Math.random() - 0.5) * 6,
              size: Math.random() * 6 + 3,
              color: '#ffc600',
              opacity: 0.9,
              life: 15
            });
          }
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressedRef.current[e.code] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isPlaying]);

  // Handle level states resets
  useEffect(() => {
    if (isPlaying) {
      scoreRef.current = 0;
      setCurrentScore(0);
      curSpeedRef.current = 9.8;
      globalCyclesRef.current = 0;
      
      playerYRef.current = 0;
      playerVYRef.current = 0;
      playerGroundedRef.current = true;
      playerCrouchingRef.current = false;
      playerHeightRef.current = 94;
      playerWidthRef.current = 45;
      jumpCountRef.current = 0;

      starsRef.current = 0;
      farRef.current = 0;
      midRef.current = 0;
      groundScrollRef.current = 0;

      setMultiplier(1);
      setMultiplierActive(false);
      setLaserWarning(false);
      setLaserActive(false);
      setShieldActive(false);
      setJumpCount(0);

      obstaclesRef.current = [];
      itemsRef.current = [];
      particlesRef.current = [];
      lastObstacleTypeRef.current = '';

      // Set initial zone style
      setCurrentZone(ZONES[0]);
      setActiveZoneBanner(null);
      activeZoneIdRef.current = 1;

      laserCycleRef.current = {
        state: 'idle',
        timer: Math.floor(Math.random() * 160) + 160, 
        targetY: 155,
      };

      if (loopRef.current) cancelAnimationFrame(loopRef.current);
      loopRef.current = requestAnimationFrame(gameStep);
    } else {
      if (loopRef.current) cancelAnimationFrame(loopRef.current);
    }

    return () => {
      if (loopRef.current) cancelAnimationFrame(loopRef.current);
    };
  }, [isPlaying]);

  // Main engine step loop
  const gameStep = () => {
    globalCyclesRef.current += 1;
    const currentSpeed = curSpeedRef.current * speedMultiplier;

    // 1. Controls check
    const isPressingCrouch = keysPressedRef.current['ArrowDown'] || keysPressedRef.current['KeyS'];
    
    if (isPressingCrouch) {
      if (playerGroundedRef.current && !playerCrouchingRef.current) {
        playerCrouchingRef.current = true;
        playerHeightRef.current = 48;
        playCrouchSound();
      } else if (!playerGroundedRef.current) {
        // Fast-descend physical trick
        playerVYRef.current -= 1.8;
      }
    } else if (playerCrouchingRef.current) {
      playerCrouchingRef.current = false;
      playerHeightRef.current = 94;
    }

    // 2. Gravity mechanics
    if (!playerGroundedRef.current) {
      playerVYRef.current -= 0.65; // High precision responsive gravity
      playerYRef.current += playerVYRef.current;
      
      // Limit the maximum jump height of A-Train
      if (playerYRef.current > 135) {
        playerYRef.current = 135;
        if (playerVYRef.current > 0) playerVYRef.current = 0;
      }
      
      if (playerYRef.current <= 0) {
        playerYRef.current = 0;
        playerVYRef.current = 0;
        playerGroundedRef.current = true;
        jumpCountRef.current = 0;
        setJumpCount(0);
      }
    }

    // 3. Multi-parallax translation scroll
    starsRef.current -= currentSpeed * 0.04;
    farRef.current -= currentSpeed * 0.10;
    midRef.current -= currentSpeed * 0.30;
    groundScrollRef.current -= currentSpeed * 1.0;

    // Direct background offset DOM manipulation to handle full 60fps refresh rate
    const starsEl = document.getElementById('g-stars');
    const bFarEl = document.getElementById('g-far');
    const bMidEl = document.getElementById('g-mid');
    const gStripesEl = document.getElementById('ground-stripes');
    
    if (starsEl) starsEl.style.backgroundPositionX = `${starsRef.current}px`;
    if (bFarEl) bFarEl.style.backgroundPositionX = `${farRef.current}px`;
    if (bMidEl) bMidEl.style.backgroundPositionX = `${midRef.current}px`;
    if (gStripesEl) gStripesEl.style.backgroundPositionX = `${groundScrollRef.current}px`;

    // 4. Update the Homelander threat routine
    updateLaserCycles();

    // 5. Track Zones stages progression
    const currentDistance = scoreRef.current;
    let computedZone = ZONES[0];
    for (let j = ZONES.length - 1; j >= 0; j--) {
      if (currentDistance >= ZONES[j].minDistance) {
        computedZone = ZONES[j];
        break;
      }
    }

    if (computedZone.id !== activeZoneIdRef.current) {
      activeZoneIdRef.current = computedZone.id;
      setCurrentZone(computedZone);
      setActiveZoneBanner(computedZone);
      // Fade out stage alert header after 3 seconds
      setTimeout(() => {
        setActiveZoneBanner((prev) => prev && prev.id === computedZone.id ? null : prev);
      }, 3000);
    }

    // 6. Spawn items and dynamic obstacles with security bounds
    spawnManager(currentSpeed);

    // 7. Physical movement and box bounding checks
    updateAndCheckCollisions(currentSpeed);

    // 8. Particle updates
    updateParticles();

    // 9. Sync visuals directly via DOM classes to avoid React stutter delay
    if (playerRef.current) {
      playerRef.current.style.bottom = `${29 + playerYRef.current}px`;
      
      // Sync classes instantly
      if (playerCrouchingRef.current) {
        playerRef.current.classList.add('crouching');
        playerRef.current.classList.remove('running');
      } else {
        playerRef.current.classList.remove('crouching');
      }

      if (!playerGroundedRef.current) {
        playerRef.current.classList.add('jumping');
        playerRef.current.classList.remove('running');
      } else {
        playerRef.current.classList.remove('jumping');
      }

      if (playerGroundedRef.current && !playerCrouchingRef.current) {
        playerRef.current.classList.add('running');
      }
    }

    // Synchronously render arrays
    setActiveObstacleList([...obstaclesRef.current]);
    setActiveItemList([...itemsRef.current]);

    // Gradual difficulty speed boost
    if (globalCyclesRef.current % 450 === 0) {
      curSpeedRef.current += 0.35;
    }

    // Tick score meter
    if (globalCyclesRef.current % 5 === 0) {
      scoreRef.current += multiplier;
      setCurrentScore(scoreRef.current);
    }

    loopRef.current = requestAnimationFrame(gameStep);
  };

  const updateLaserCycles = () => {
    const cycle = laserCycleRef.current;
    cycle.timer -= 1;

    if (cycle.state === 'idle') {
      if (cycle.timer <= 0) {
        cycle.state = 'charging';
        cycle.timer = 50; 
        setLaserWarning(true);
        playLaserChargeSound();
      }
    } else if (cycle.state === 'charging') {
      if (cycle.timer <= 0) {
        cycle.state = 'shooting';
        cycle.timer = 110; 
        setLaserWarning(false);
        setLaserActive(true);
        playLaserShootSound();
      }
    } else if (cycle.state === 'shooting') {
      // Fire sparks high in the sky background rather than at player feet level
      if (globalCyclesRef.current % 3 === 0) {
        createSparks(420 + Math.random() * 120, 180 + Math.random() * 40, '#ff0033');
      }

      // COLLISION REMOVED: Homelander's laser is purely figurative and shoots high overhead, keeping the runner safe!

      if (cycle.timer <= 0) {
        cycle.state = 'idle';
        cycle.timer = Math.floor(Math.random() * 220) + 160; 
        setLaserActive(false);
      }
    }
  };

  const spawnManager = (currentSpeed: number) => {
    // Generate obstacles with speed-adapted gap security to prevent overlap bugs
    if (obstaclesRef.current.length < 3) {
      let minDistance = 1000;
      if (obstaclesRef.current.length > 0) {
        const lastObs = obstaclesRef.current[obstaclesRef.current.length - 1];
        minDistance = 960 - lastObs.x;
      }

      // Dynamic gap threshold ensures reaction time is constant at high-speeds
      const safeSpacingThreshold = Math.max(330, currentSpeed * 35 + (Math.random() * 120));

      if (minDistance > safeSpacingThreshold) {
        // Dynamic hazards selection
        const types: ('log' | 'rock' | 'pit' | 'branch')[] = ['log', 'rock', 'pit', 'branch'];
        let selected = types[Math.floor(Math.random() * types.length)];

        // Prevent frustrating identical hazard pairs (e.g. double pits or branches)
        if (selected === lastObstacleTypeRef.current) {
          selected = selected === 'pit' ? 'rock' : 'log';
        }

        lastObstacleTypeRef.current = selected;
        
        // Hazard bounds setups
        let w = 65, h = 35, y = 35;
        if (selected === 'rock') { w = 55; h = 45; y = 35; } 
        else if (selected === 'pit') { w = 82; h = 36; y = 0; } 
        else if (selected === 'branch') { w = 90; h = 40; y = 112; } // Heights adapted for perfect crouch ducking

        obstaclesRef.current.push({
          id: Math.random().toString(36).substring(2, 9),
          type: selected,
          x: 960 + Math.random() * 60,
          width: w,
          height: h,
          bottom: y,
          passed: false
        });
      }
    }

    // Compound V Floating collectibles serum bottle
    if (itemsRef.current.length === 0 && globalCyclesRef.current % 460 === 0) {
      itemsRef.current.push({
        id: Math.random().toString(36).substring(2, 9),
        type: 'compound-v',
        x: 960,
        width: 38,
        height: 52,
        bottom: Math.random() > 0.5 ? 120 : 60, 
      });
    }
  };

  const updateAndCheckCollisions = (currentSpeed: number) => {
    const pLeft = 260 + 8;
    const pRight = 260 + playerWidthRef.current - 8;
    const pBottom = 35 + playerYRef.current;
    const pTop = pBottom + playerHeightRef.current;

    // A/ Colliders for Obstacles
    for (let i = obstaclesRef.current.length - 1; i >= 0; i--) {
      const obs = obstaclesRef.current[i];
      obs.x -= currentSpeed;

      const oLeft = obs.x;
      const oRight = obs.x + obs.width;
      const oBottom = obs.bottom;
      const oTop = obs.bottom + obs.height;

      if (oLeft < pRight && oRight > pLeft && pTop > oBottom && pBottom < oTop) {
        if (shieldActive) {
          setShieldActive(false);
          obstaclesRef.current.splice(i, 1);
          playHitSound();
          createFeedbackFlash('shield-break');
          continue;
        } else {
          triggerGameOver();
          return;
        }
      }

      if (obs.x < -140) {
        obstaclesRef.current.splice(i, 1);
      }
    }

    // B/ Collectibles serum items
    for (let i = itemsRef.current.length - 1; i >= 0; i--) {
      const item = itemsRef.current[i];
      item.x -= currentSpeed;

      const iLeft = item.x;
      const iRight = item.x + item.width;
      const iBottom = item.bottom;
      const iTop = item.bottom + item.height;

      if (iLeft < pRight && iRight > pLeft && pTop > iBottom && pBottom < iTop) {
        playCollectSound();
        setShieldActive(true);
        setMultiplier(3);
        setMultiplierActive(true);
        scoreRef.current += 50; 
        createCompoundVFlash();

        // High multiplier expires after a few seconds
        setTimeout(() => {
          setMultiplier(1);
          setMultiplierActive(false);
        }, 6000);

        itemsRef.current.splice(i, 1);
        continue;
      }

      if (item.x < -100) {
        itemsRef.current.splice(i, 1);
      }
    }
  };

  const createCompoundVFlash = () => {
    if (containerRef.current) {
      const flash = document.createElement('div');
      flash.className = 'absolute inset-0 z-10 pointer-events-none animate-pulse';
      flash.style.background = 'rgba(0, 255, 255, 0.18)';
      containerRef.current.appendChild(flash);
      setTimeout(() => flash.remove(), 400);
    }

    for (let i = 0; i < 22; i++) {
      particlesRef.current.push({
        id: Math.random().toString(),
        x: 260 + 20,
        y: 35 + playerYRef.current + 35,
        vx: (Math.random() - 0.5) * 12,
        vy: (Math.random() - 0.5) * 12,
        size: Math.random() * 7 + 4,
        color: '#00ffff',
        opacity: 1,
        life: 28
      });
    }
  };

  const createFeedbackFlash = (type: 'shield-break') => {
    const flashColor = type === 'shield-break' ? 'rgba(239, 68, 68, 0.35)' : 'rgba(255, 255, 255, 0.3)';
    if (containerRef.current) {
      const d = document.createElement('div');
      d.className = 'absolute inset-0 pointer-events-none z-10';
      d.style.backgroundColor = flashColor;
      containerRef.current.appendChild(d);
      setTimeout(() => d.remove(), 350);

      containerRef.current.classList.add('animate-bounce');
      setTimeout(() => containerRef.current?.classList.remove('animate-bounce'), 450);
    }
  };

  const createJumpRing = (x: number, y: number) => {
    const jetColor = currentZone.particleColor;
    for (let i = 0; i < 9; i++) {
      particlesRef.current.push({
        id: Math.random().toString(),
        x,
        y,
        vx: (Math.random() - 0.5) * 6,
        vy: (Math.random()) * -3,
        size: Math.random() * 5 + 3,
        color: jetColor,
        opacity: 0.85,
        life: 22
      });
    }
  };

  const createSparks = (x: number, y: number, color: string) => {
    for (let i = 0; i < 5; i++) {
      particlesRef.current.push({
        id: Math.random().toString(),
        x,
        y,
        vx: (Math.random() - 0.6) * 11 - 3,
        vy: (Math.random() - 0.5) * 4,
        size: Math.random() * 5 + 2,
        color,
        opacity: 1,
        life: 14
      });
    }
  };

  const updateParticles = () => {
    // Spark trails while running
    if (playerGroundedRef.current && globalCyclesRef.current % 3 === 0) {
      particlesRef.current.push({
        id: Math.random().toString(),
        x: 270 + (playerCrouchingRef.current ? 25 : 5),
        y: 35 + Math.random() * 5,
        vx: -6 + Math.random() * 2,
        vy: Math.random() * 2,
        size: Math.random() * 6 + 4,
        color: currentZone.particleColor, 
        opacity: 0.9,
        life: 22
      });
    }

    // Move logic
    for (let i = particlesRef.current.length - 1; i >= 0; i--) {
      const p = particlesRef.current[i];
      p.x += p.vx;
      p.y += p.vy;
      p.opacity -= 1 / p.life;
      p.life -= 1;

      if (p.life <= 0 || p.opacity <= 0) {
        particlesRef.current.splice(i, 1);
      }
    }

    setActiveParticleList([...particlesRef.current]);
  };

  const triggerGameOver = () => {
    playHitSound();
    if (loopRef.current) cancelAnimationFrame(loopRef.current);
    
    // Disperse massive sparks at death coordinate
    for (let i = 0; i < 35; i++) {
      particlesRef.current.push({
        id: Math.random().toString(),
        x: 260 + 22,
        y: 35 + playerYRef.current + 45,
        vx: (Math.random() - 0.5) * 15,
        vy: (Math.random() - 0.3) * 13,
        size: Math.random() * 9 + 4,
        color: i % 2 === 0 ? '#ef4444' : '#00ffd8',
        opacity: 1,
        life: 40
      });
    }
    
    setActiveParticleList([...particlesRef.current]);

    setTimeout(() => {
      onGameOver(scoreRef.current);
    }, 850);
  };

  return (
    <div 
      ref={containerRef}
      id="game-universe" 
      className="relative w-[960px] h-[420px] border-4 border-slate-700 rounded-3xl overflow-hidden shadow-2xl transition-all duration-700"
      style={{
        background: currentZone.bgGradient
      }}
    >
      {/* Parallax layers */}
      <div id="g-stars" className="absolute top-0 w-[200%] h-[250px] bg-[radial-gradient(1.5px_1.5px_at_15%_25%,#fff,transparent),radial-gradient(2px_2px_at_45%_15%,rgba(200,220,255,0.9),transparent),radial-gradient(1.5px_1.5px_at_75%_35%,rgba(255,255,255,0.7),transparent),radial-gradient(3px_3px_at_85%_10%,#fff,transparent)] bg-[size:250px_250px] opacity-75 z-1 transition-transform" />
      
      {/* Decorative Atmosphere Moon */}
      <div className="absolute top-[35px] right-[130px] w-20 h-20 bg-gradient-to-br from-white via-slate-100 to-slate-400 rounded-full z-1 shadow-[0_0_40px_rgba(255,255,255,0.4)] border border-white/10" />
      
      {/* Back layers tree parallax */}
      <div id="g-far" className="absolute bottom-[35px] w-[200%] h-[180px] z-2 opacity-50" style={{ backgroundImage: `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="240" height="180" viewBox="0 0 240 180"><defs><linearGradient id="tf" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="%231a284f"/><stop offset="100%" stop-color="%230f1833"/></linearGradient></defs><g fill="url(%23tf)"><path d="M40 20 L60 60 H20 Z"/><path d="M40 50 L70 100 H10 Z"/><path d="M40 80 L80 140 H0 Z"/><rect x="30" y="140" width="20" height="40"/><path d="M120 40 L135 70 H105 Z"/><path d="M120 60 L145 100 H95 Z"/><path d="M120 90 L155 140 H85 Z"/><rect x="110" y="140" width="20" height="40"/><path d="M200 10 L225 55 H175 Z"/><path d="M200 45 L235 95 H165 Z"/><path d="M200 80 L240 140 H160 Z"/><rect x="190" y="140" width="20" height="40"/></g></svg>')`, backgroundRepeat: 'repeat-x', backgroundPosition: 'bottom' }} />
      <div id="g-mid" className="absolute bottom-[35px] w-[200%] h-[140px] z-3 opacity-60" style={{ backgroundImage: `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="240" height="140" viewBox="0 0 240 140"><defs><linearGradient id="tm1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="%2312383b"/><stop offset="100%" stop-color="%23061414"/></linearGradient><linearGradient id="tm2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="%231d5257"/><stop offset="100%" stop-color="%230a2124"/></linearGradient></defs><g><path d="M60 10 L90 60 H30 Z" fill="url(%23tm1)"/><path d="M60 40 L110 110 H10 Z" fill="url(%23tm1)"/><path d="M60 10 L90 60 H75 Z" fill="url(%23tm2)"/><path d="M60 40 L110 110 H95 Z" fill="url(%23tm2)"/><rect x="50" y="110" width="20" height="30" fill="%232b1709" rx="3"/></g><g><path d="M180 20 L205 65 H155 Z" fill="url(%23tm1)"/><path d="M180 50 L225 110 H135 Z" fill="url(%23tm1)"/><path d="M180 20 L205 65 H190 Z" fill="url(%23tm2)"/><path d="M180 50 L225 110 H205 Z" fill="url(%23tm2)"/><rect x="170" y="110" width="20" height="30" fill="%232b1709" rx="3"/></g></svg>')`, backgroundRepeat: 'repeat-x', backgroundPosition: 'bottom' }} />

      {/* Atmospheric depth fog */}
      <div className="absolute bottom-[35px] w-full h-[150px] bg-gradient-to-t from-black/50 to-transparent pointer-events-none z-4" />

      {/* Dynamic floor with track boundaries */}
      <div 
        id="ground" 
        className="absolute bottom-0 w-full h-[35px] shadow-inner z-[14] transition-all duration-700 overflow-hidden" 
        style={{
          borderTop: `6px solid ${currentZone.groundBorder}`,
          background: currentZone.groundBg
        }}
      >
        {/* Scrolling lane stripes to differentiate tracks and boost high quality speed feel */}
        <div 
          id="ground-stripes"
          className="w-[300%] h-1 opacity-60 absolute top-[12px] bg-repeat-x pointer-events-none"
          style={{
            backgroundImage: `repeating-linear-gradient(90deg, ${currentZone.particleColor} 0px, ${currentZone.particleColor} 25px, transparent 25px, transparent 75px)`,
            backgroundSize: '100px 100%'
          }}
        />
      </div>

      {/* Top dashboard panels */}
      <div className="absolute top-4 left-4 right-4 z-20 flex justify-between items-center">
        <div className="flex gap-4 font-mono">
          <div className="bg-slate-950/80 border-2 border-cyan-500 rounded-lg px-3 py-1.5 flex items-center gap-2 select-none shadow-lg">
            <Zap size={14} className="text-cyan-400 animate-pulse" />
            <span className="text-white text-xs tracking-wider">Distância:</span>
            <span className="text-cyan-400 text-sm font-extrabold">{currentScore}m</span>
          </div>

          {multiplierActive && (
            <div className="bg-amber-950/90 border-2 border-amber-500 rounded-lg px-3 py-1.5 flex items-center gap-2 select-none shadow-lg">
              <FlaskConical size={14} className="text-amber-400" />
              <span className="text-amber-300 text-[10px] tracking-widest font-bold">X3 (COMPOSTO V)</span>
            </div>
          )}

          {shieldActive && (
            <div className="bg-indigo-900/80 border-2 border-indigo-400 rounded-lg px-3 py-1.5 flex items-center gap-2 select-none shadow-lg">
              <div className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
              <span className="text-indigo-200 text-[10px] tracking-wider font-bold">ESCUDO ATIVO</span>
            </div>
          )}
        </div>

        {/* Phase Zone Title overlay */}
        <div className="flex items-center gap-2 bg-slate-950/85 border-2 border-slate-700 rounded-lg px-3 py-1 text-[10px] font-mono text-slate-300 select-none shadow-lg">
          <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: currentZone.particleColor }} />
          <span>FASE {currentZone.id}: {currentZone.name}</span>
        </div>
      </div>

      {/* Cinematic Slide phase notification */}
      {activeZoneBanner && (
        <div className="absolute inset-x-0 top-1/3 -translate-y-1/2 flex justify-center items-center z-30 select-none pointer-events-none">
          <div className="bg-slate-950/95 border-2 border-cyan-400 px-6 py-4 rounded-xl shadow-2xl backdrop-blur max-w-lg text-center transform scale-95 animate-pulse">
            <h3 className="text-cyan-400 font-mono text-sm tracking-widest font-black uppercase flex items-center justify-center gap-2">
              <Award className="text-yellow-400" size={16} /> Nova Fase do Percurso!
            </h3>
            <p className="font-mono text-[11px] text-white font-extrabold mt-1 uppercase">{activeZoneBanner.name}</p>
            <p className="font-sans text-[9px] text-slate-400 mt-0.5">{activeZoneBanner.sub}</p>
          </div>
        </div>
      )}

      {/* Laser threat indicator warnings */}
      {laserWarning && (
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-1.5 select-none pointer-events-none">
          <span className="text-red-500 font-mono text-sm text-glow-red animate-ping tracking-widest font-black uppercase">¡FÚRIA DE LASER DO PATRIA!</span>
          <span className="text-slate-300 font-sans text-[10px] uppercase tracking-wider bg-red-950/80 border border-red-500 rounded px-2 py-0.5">Visão térmica cruzando os céus!</span>
        </div>
      )}

      {/* HOMELANDER (Capitão Pátria) */}
      <div 
        id="homelander" 
        className="absolute bottom-[200px] left-[50px] w-[85px] h-[130px] z-[15] pointer-events-none"
        style={{
          animation: 'homelanderFly 2.2s infinite ease-in-out',
        }}
      >
        <svg className="w-full h-full filter drop-shadow-[5px_22px_12px_rgba(0,0,0,0.55)]" viewBox="0 0 40 60" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <g id="hl-star"><polygon points="5,0 6.5,3.5 10,3.5 7,6 8,9.5 5,7.5 2,9.5 3,6 0,3.5 3.5,3.5" /></g>
            <linearGradient id="hl-suit" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#071b42"/><stop offset="50%" stop-color="#144291"/><stop offset="100%" stop-color="#05122e"/></linearGradient>
            <linearGradient id="hl-cape-grad" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#800000"/><stop offset="40%" stop-color="#cc0010"/><stop offset="100%" stop-color="#660000"/></linearGradient>
            <linearGradient id="hl-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ffee55"/><stop offset="100%" stop-color="#b88300"/></linearGradient>
            <linearGradient id="hl-skin" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#ca8a65"/><stop offset="50%" stop-color="#f5caa6"/><stop offset="100%" stop-color="#aa663f"/></linearGradient>
            <linearGradient id="hl-hair" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ffeb99"/><stop offset="100%" stop-color="#d69c0d"/></linearGradient>
          </defs>
          
          {/* Cape waves dynamically */}
          <g 
            className="hl-cape" 
            style={{ 
              transformOrigin: '15px 15px',
              animation: 'capeWave 0.25s infinite ease-in-out alternate' 
            }}
          >
            <path d="M12 15 C 4 32, 6 56, 12 56 C 18 56, 26 36, 26 15 Z" fill="url(#hl-cape-grad)" stroke="#010206" strokeWidth="1.2"/>
            <use href="#hl-star" transform="translate(10, 20) scale(0.25)" fill="white" opacity="0.9"/>
            <use href="#hl-star" transform="translate(14, 25) scale(0.2)" fill="white" opacity="0.9"/>
            <use href="#hl-star" transform="translate(9, 30) scale(0.25)" fill="white" opacity="0.9"/>
            <use href="#hl-star" transform="translate(15, 34) scale(0.2)" fill="white" opacity="0.9"/>
            <use href="#hl-star" transform="translate(11, 40) scale(0.25)" fill="white" opacity="0.9"/>
            <use href="#hl-star" transform="translate(18, 22) scale(0.25)" fill="white" opacity="0.9"/>
            <use href="#hl-star" transform="translate(20, 28) scale(0.2)" fill="white" opacity="0.9"/>
            <use href="#hl-star" transform="translate(17, 44) scale(0.25)" fill="white" opacity="0.9"/>
            <use href="#hl-star" transform="translate(13, 50) scale(0.2)" fill="white" opacity="0.9"/>
          </g>

          {/* Golden Eagle shoulder traps on Back */}
          <ellipse cx="27" cy="18" rx="4.5" ry="3" fill="url(#hl-gold)" stroke="#010206" strokeWidth="1"/>
          
          {/* Back arm */}
          <g id="back-arm">
            <rect x="25" y="19" width="5.5" height="17" fill="url(#hl-suit)" rx="2" transform="rotate(22 26 19)" stroke="#010206" strokeWidth="1"/>
            <rect x="25" y="29" width="5.5" height="7.5" fill="#cc0010" rx="1.5" transform="rotate(22 26 19)" stroke="#010206" strokeWidth="1"/>
          </g>

          {/* Detailed muscular legs */}
          <rect x="13.5" y="40" width="5.5" height="15" fill="url(#hl-suit)" rx="2" stroke="#010206" strokeWidth="1.2"/>
          <rect x="21" y="40" width="5.5" height="15" fill="url(#hl-suit)" rx="2" stroke="#010206" strokeWidth="1.2"/>
          
          <path d="M12 47 Q 16 47 18 55 Q 16 58 12 58 Z" fill="#cc0010" stroke="#010206" strokeWidth="1"/>
          <path d="M19.5 47 Q 23.5 47 25.5 55 Q 23.5 58 19.5 58 Z" fill="#cc0010" stroke="#010206" strokeWidth="1"/>
          
          {/* Torso/Chest muscular definition */}
          <rect x="11.5" y="18" width="17" height="23" fill="url(#hl-suit)" rx="4.5" stroke="#010206" strokeWidth="1.5"/>
          <rect x="13.5" y="37" width="13" height="3" fill="url(#hl-gold)" stroke="#010206" strokeWidth="0.8"/> {/* Golden grid belt */}
          
          {/* Muscular Front arm */}
          <g id="front-arm" transform="rotate(-75 13 20)">
            <rect x="11.5" y="18" width="5.5" height="18" fill="url(#hl-suit)" rx="2" stroke="#010206" strokeWidth="1"/>
            <rect x="11.5" y="30" width="5.5" height="8" fill="#cc0010" rx="1.5" stroke="#010206" strokeWidth="1"/>
          </g>
          <ellipse cx="13" cy="18" rx="4.5" ry="3" fill="url(#hl-gold)" stroke="#010206" strokeWidth="1"/>

          {/* Head & Skin tones */}
          <rect x="14" y="5" width="12" height="13.5" fill="url(#hl-skin)" rx="4" stroke="#010206" strokeWidth="1.2"/>
          
          {/* Golden Blonde Hair detail */}
          <path d="M13 9 C 13 -1, 27 -1, 27 7 C 25 3, 22 4, 19.5 5 C 18 4, 15 3, 13 9 Z" fill="url(#hl-hair)" stroke="#010206" strokeWidth="1"/>
          <path d="M27 7 C 27 10, 24 11, 23 8 C 24 6, 26 5, 27 7 Z" fill="url(#hl-hair)" stroke="#010206" strokeWidth="0.8"/>
          <polygon points="13,8 13,11 15,9" fill="url(#hl-hair)" stroke="#010206" strokeWidth="0.5"/> 
          <polygon points="27,7 27,10 25,8" fill="url(#hl-hair)" stroke="#010206" strokeWidth="0.5"/> 

          {/* Ruby red Laser eye sockets */}
          <circle cx="21" cy="11.5" r="1.5" fill="#ff0000" />
          <circle cx="21" cy="11.5" r="0.7" fill="#ffffff" className={`${laserWarning ? 'animate-ping' : ''}`} />
          <circle cx="25" cy="12" r="1.5" fill="#ff0000" />
          <circle cx="25" cy="12" r="0.7" fill="#ffffff" className={`${laserWarning ? 'animate-ping' : ''}`} />
        </svg>

        {/* EYE GLOW RAY BEAM (Cinematic overhead) */}
        <div 
          className={`absolute top-[40px] left-[55px] w-[600px] h-3.5 bg-gradient-to-r from-[#ff0000] via-[#ffffff] to-[#ff2222] rounded-full origin-top-left -rotate-[6deg] shadow-[0_0_20px_#ff1a1a,0_0_40px_#ff0000] z-16 transition-opacity opacity-0 pointer-events-none duration-100 ${
            laserActive ? '!opacity-[0.98] animate-pulse scale-y-125' : ''
          }`} 
        />
      </div>

      {/* A-TRAIN (Trem Bala) */}
      <div 
        ref={playerRef}
        id="atrain" 
        className="absolute bottom-[29px] left-[260px] w-[70px] h-[105px] z-[15] origin-bottom transition-transform duration-700"
      >
        {/* Dynamic Speed trails */}
        <div 
          className="absolute right-[50%] top-[10%] w-[160px] h-[75%] rounded-l-full filter blur-[3px] pointer-events-none mix-blend-screen transition-all select-none opacity-0"
          style={{
            background: multiplierActive 
              ? 'linear-gradient(-90deg, rgba(245, 158, 11, 0.75), rgba(217, 119, 6, 0.2), transparent)' 
              : `linear-gradient(-90deg, ${currentZone.particleColor}, ${currentZone.groundBorder}1a, transparent)`,
            animation: 'trailPulse 0.12s infinite alternate ease-in-out'
          }}
        />

        {multiplierActive && (
          <div className="absolute -top-6 left-1/2 -translate-x-1/2 select-none pointer-events-none">
            <span className="text-[10px] font-mono text-amber-400 font-extrabold text-glow-yellow animate-bounce uppercase">Composto V!</span>
          </div>
        )}

        {shieldActive && (
          <div className="absolute inset-[-15px] border-2 border-indigo-400/55 rounded-full z-20 pointer-events-none animate-spin-slow flex items-center justify-center bg-indigo-500/10 shadow-[0_0_20px_rgba(100,100,250,0.3)]">
            <div className="absolute top-0 w-3 h-3 rounded-full bg-indigo-300" />
            <div className="absolute bottom-0 w-3 h-3 rounded-full bg-indigo-300" />
          </div>
        )}

        {/* Improved high-definition SVG artwork of A-Train */}
        <svg 
          className="w-full h-full filter drop-shadow-[5px_12px_8px_rgba(0,0,0,0.45)]" 
          viewBox="0 0 40 60" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="at-suit" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#051740"/><stop offset="50%" stop-color="#14429e"/><stop offset="100%" stop-color="#040d24"/></linearGradient>
            <linearGradient id="at-armor" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#ffffff"/><stop offset="50%" stop-color="#dce5f1"/><stop offset="100%" stop-color="#93a8c7"/></linearGradient>
            <linearGradient id="at-skin" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#54321d"/><stop offset="50%" stop-color="#8c5837"/><stop offset="100%" stop-color="#3d2212"/></linearGradient>
            <linearGradient id="at-glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ffffff" /><stop offset="50%" stop-color="#00ffff" /><stop offset="100%" stop-color="#004a4a" /></linearGradient>
            <linearGradient id="at-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ffdd00"/><stop offset="100%" stop-color="#aa8c00"/></linearGradient>
          </defs>

          {/* Athletics boots and legs with sprint animation cycle */}
          <g 
            className="at-leg-back" 
            style={{ transformOrigin: '15px 38px' }}
          >
            <rect x="14.5" y="38" width="5.5" height="15" fill="url(#at-suit)" rx="2" stroke="#020206" strokeWidth="1.2"/>
            {/* White trim running shoe */}
            <path d="M13.5 49 Q 18 47.5 21 53 Q 18 55.5 13.5 54.5 Z" fill="url(#at-armor)" stroke="#020206" strokeWidth="1"/>
            <rect x="13" y="52.5" width="7.5" height="2" fill="url(#at-gold)" rx="1" stroke="#020206" strokeWidth="0.5"/>
          </g>

          <g 
            className="at-leg-front" 
            style={{ transformOrigin: '21px 38px' }}
          >
            <rect x="20.5" y="38" width="5.5" height="15" fill="url(#at-suit)" rx="2" stroke="#020206" strokeWidth="1.2"/>
            {/* White trim running shoe */}
            <path d="M19.5 49 Q 24 47.5 27 53 Q 24 55.5 19.5 54.5 Z" fill="url(#at-armor)" stroke="#020206" strokeWidth="1"/>
            <rect x="19" y="52.5" width="7.5" height="2" fill="url(#at-gold)" rx="1" stroke="#020206" strokeWidth="0.5"/>
          </g>
          
          <g 
            className="at-torso-group" 
            style={{ transformOrigin: '17px 35px' }}
          >
            {/* Back Arm swing */}
            <g 
              className="at-arm-back" 
              style={{ transformOrigin: '15px 21px', filter: 'brightness(0.65)' }}
            >
              <rect x="12.5" y="20" width="5.5" height="14" fill="url(#at-suit)" rx="2.5" stroke="#020206" strokeWidth="1"/>
              <ellipse cx="15px" cy="21" rx="3.5" ry="3.5" fill="url(#at-armor)" stroke="#020206" strokeWidth="1"/>
            </g>

            {/* Premium detailed suit muscle mesh and chest armour */}
            <rect x="13.5" y="18" width="14.5" height="23" fill="url(#at-suit)" rx="5" stroke="#020206" strokeWidth="1.2"/>
            <path d="M16.5 20 Q 20.5 21.5 24.5 20 V 30 C 20.5 32, 16.5 31, 16.5 20 Z" fill="url(#at-armor)" stroke="#020206" strokeWidth="1.2"/>
            {/* Golden lightning belt accent */}
            <path d="M13.5 35 L 18 36 L 20 34 L 23 36 L 28 35" stroke="url(#at-gold)" strokeWidth="2" fill="none" />
            
            {/* Front Arm Swing */}
            <g 
              className="at-arm" 
              style={{ transformOrigin: '23px 21px' }}
            >
              <rect x="20.5" y="20" width="5.5" height="14" fill="url(#at-suit)" rx="2.5" stroke="#020206" strokeWidth="1.2"/>
              <ellipse cx="23px" cy="21" rx="3.5" ry="3.5" fill="url(#at-armor)" stroke="#020206" strokeWidth="1.2"/>
            </g>
            
            {/* Sleek silver high-tech helmet with shiny visor */}
            <rect x="16" y="5" width="10" height="12.5" fill="url(#at-skin)" rx="4" stroke="#020206" strokeWidth="1.2"/>
            <path d="M15.5 5 C 15.5 -0.5, 26.5 -0.5, 26.5 5 C 25.5 4, 16.5 3.5, 15.5 5 Z" fill="url(#at-suit)" stroke="#020206" strokeWidth="1.2"/>
            {/* Glowing neon visors */}
            <rect x="16" y="7" width="10" height="4.5" fill="url(#at-glass)" rx="2.2" stroke="#020206" strokeWidth="1" />
            <ellipse cx="21" cy="9.2" rx="1.5" ry="1.5" fill="#ffffff" className="animate-ping" />
          </g>
        </svg>
      </div>

      {/* DYNAMIC OBSTACLES */}
      <div id="obstacles-container">
        {activeObstacleList.map((obs) => {
          return (
            <div 
              key={obs.id}
              className="absolute will-change-transform z-[15] filter drop-shadow-[4px_10px_8px_rgba(0,0,0,0.55)]"
              style={{
                width: `${obs.width}px`,
                height: `${obs.height}px`,
                bottom: `${obs.bottom}px`,
                transform: `translateX(${obs.x}px)`,
              }}
            >
              {obs.type === 'log' && (
                <svg width="100%" height="100%" viewBox="0 0 65 35" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="log-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#8c5222"/><stop offset="50%" stop-color="#593211"/><stop offset="100%" stop-color="#361a07"/></linearGradient>
                  </defs>
                  <rect width="65" height="35" fill="url(#log-grad)" rx="7" />
                  <path d="M10 5 H50 V11 H10 Z" fill="#325a1d" opacity="0.85" /> 
                  <ellipse cx="58" cy="17" rx="5.5" ry="11.5" fill="#a87140"/>
                  <ellipse cx="58" cy="17" rx="3" ry="7.5" fill="#543114"/>
                  <line x1="12" y1="18" x2="35" y2="18" stroke="#361a07" strokeWidth="2.5" />
                  <line x1="22" y1="24" x2="48" y2="24" stroke="#361a07" strokeWidth="2.5" />
                </svg>
              )}

              {obs.type === 'rock' && (
                <svg width="100%" height="100%" viewBox="0 0 55 45" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <radialGradient id="rock-grad" cx="35%" cy="30%" r="70%"><stop offset="0%" stop-color="#abb6c7"/><stop offset="50%" stop-color="#5f6b7c"/><stop offset="100%" stop-color="#313945"/></radialGradient>
                  </defs>
                  <path d="M22 2 Q 42 6 52 18 Q 57 41 33 43 Q 7 43 5 31 Q 2 13 22 2 Z" fill="url(#rock-grad)"/>
                  <path d="M22 6 L 26 15 L 18 25" stroke="#1d2228" strokeWidth="2.5" fill="none" />
                  <path d="M38 10 L 32 20 L 42 32" stroke="#1d2228" strokeWidth="2.5" fill="none" />
                </svg>
              )}

              {obs.type === 'pit' && (
                <div 
                  className="absolute inset-0 rounded-lg flex flex-col items-center justify-center border-x-4 border-slate-700 bg-black/90 shadow-[inset_0_10px_20px_rgba(0,255,255,0.7)]"
                >
                  <div className="w-[85%] h-2.5 bg-cyan-400 animate-pulse rounded-full opacity-90 shadow-[0_0_12px_#00ffff]" />
                  <span className="text-[8px] font-mono text-cyan-300 font-black animate-pulse uppercase mt-1 tracking-widest">ENERGIA</span>
                </div>
              )}

              {obs.type === 'branch' && (
                <svg width="100%" height="100%" viewBox="0 0 90 45" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="br-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#593417"/><stop offset="100%" stop-color="#2c1606"/></linearGradient>
                    <radialGradient id="lf-grad" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#52ae58"/><stop offset="100%" stop-color="#1e5422"/></radialGradient>
                  </defs>
                  <path d="M0 2 H90 V14 Q 45 22 0 14 Z" fill="url(#br-grad)" />
                  <circle cx="20" cy="24" r="14" fill="url(#lf-grad)"/>
                  <circle cx="50" cy="28" r="16" fill="url(#lf-grad)"/>
                  <circle cx="78" cy="20" r="12" fill="url(#lf-grad)"/>
                  <line x1="20" y1="2" x2="20" y2="24" stroke="#593417" strokeWidth="2" />
                  <line x1="50" y1="2" x2="50" y2="28" stroke="#593417" strokeWidth="2" />
                </svg>
              )}
            </div>
          );
        })}
      </div>

      {/* COMPOUND V FLOATING COLLECTIBLES */}
      <div id="items-container">
        {activeItemList.map((item) => {
          return (
            <div
              key={item.id}
              className="absolute z-[15] filter drop-shadow-[0_0_10px_rgba(0,255,255,0.85)] pointer-events-none"
              style={{
                width: `${item.width}px`,
                height: `${item.height}px`,
                bottom: `${item.bottom}px`,
                transform: `translateX(${item.x}px)`,
                animation: 'floatItem 1s infinite ease-in-out alternate'
              }}
            >
              <svg width="100%" height="100%" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="v-liquid" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#00ffff"/><stop offset="100%" stop-color="#0044ff"/></linearGradient>
                  <linearGradient id="v-glass" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="rgba(255,255,255,0.85)"/><stop offset="40%" stop-color="rgba(255,255,255,0.25)"/><stop offset="100%" stop-color="rgba(250,255,255,0.55)"/></linearGradient>
                </defs>
                {/* Silver steel cap */}
                <rect x="8" y="2" width="14" height="6.5" fill="#d1d8e2" rx="1.5" />
                <rect x="10" y="5" width="10" height="3" fill="#8f9da5" />
                
                {/* Vought label card tag */}
                <rect x="10" y="16" width="10" height="13" fill="#ffffff" rx="1" />
                <path d="M12 25 L 15 17.5 L 18 25 H 16 L 15 21 L 14 25 Z" fill="#0044ff" /> 

                {/* Crystal flask tube */}
                <rect x="5" y="8" width="20" height="28" fill="url(#v-glass)" rx="3.5" stroke="#ccd2db" strokeWidth="1.5" />
                
                {/* Glowing neon composite serum */}
                <rect x="7" y="11" width="16" height="23" fill="url(#v-liquid)" rx="2" opacity="0.9" />
                <circle cx="11" cy="28" r="1.5" fill="#ffffff" opacity="0.8" className="animate-pulse" />
                <circle cx="18" cy="18" r="1" fill="#ffffff" opacity="0.95" className="animate-pulse" />
              </svg>
            </div>
          );
        })}
      </div>

      {/* PARTICLES ENGINE */}
      <div id="particles-container">
        {activeParticleList.map((p) => {
          return (
            <div 
              key={p.id}
              className="absolute pointer-events-none rounded-full"
              style={{
                width: `${p.size}px`,
                height: `${p.size}px`,
                left: `${p.x}px`,
                bottom: `${p.y}px`,
                backgroundColor: p.color,
                opacity: p.opacity,
                boxShadow: `0 0 6px ${p.color}`,
                mixBlendMode: 'screen'
              }}
            />
          );
        })}
      </div>

      {/* Style Animations helpers */}
      <style>{`
        @keyframes homelanderFly {
          0% { transform: translateY(0px) rotate(4deg); }
          50% { transform: translateY(-16px) rotate(2deg); }
          100% { transform: translateY(0px) rotate(4deg); }
        }
        @keyframes capeWave {
          0% { transform: scaleX(1) skewY(0deg); }
          100% { transform: scaleX(1.18) skewY(5deg); }
        }
        @keyframes legRunFront {
          0% { transform: rotate(-55deg) translateY(0px); }
          50% { transform: rotate(50deg) translateY(-4px); }
          100% { transform: rotate(-55deg) translateY(0px); }
        }
        @keyframes legRunBack {
          0% { transform: rotate(50deg) translateY(-4px); }
          50% { transform: rotate(-55deg) translateY(0px); }
          100% { transform: rotate(50deg) translateY(-4px); }
        }
        @keyframes armRun {
          0% { transform: rotate(65deg); }
          100% { transform: rotate(-55deg); }
        }
        @keyframes armRunBack {
          0% { transform: rotate(-65deg); }
          100% { transform: rotate(55deg); }
        }
        @keyframes torsoBob {
          0% { transform: translateY(0px) rotate(8deg); }
          100% { transform: translateY(5px) rotate(11deg); }
        }
        @keyframes floatItem {
          0% { transform: translateY(0px); }
          100% { transform: translateY(-10px); }
        }
        @keyframes trailPulse {
          0% { transform: scaleX(0.9) scaleY(1); opacity: 0.75; }
          100% { transform: scaleX(1.15) scaleY(0.85); opacity: 0.45; }
        }
        /* Running cycles only active when player has the .running class */
        .running .at-leg-front {
          transform-origin: 21px 38px;
          animation: legRunFront 0.18s infinite linear;
        }
        .running .at-leg-back {
          transform-origin: 15px 38px;
          animation: legRunBack 0.18s infinite linear;
        }
        .running .at-torso-group {
          transform-origin: 17px 35px;
          animation: torsoBob 0.09s infinite ease-in-out alternate;
        }
        .running .at-arm {
          transform-origin: 23px 21px;
          animation: armRun 0.18s infinite ease-in-out alternate;
        }
        .running .at-arm-back {
          transform-origin: 15px 21px;
          animation: armRunBack 0.18s infinite ease-in-out alternate;
        }

        .jumping .at-torso-group {
          transform: translateY(-2px) rotate(4deg) !important;
        }
        .jumping .at-leg-front {
          transform: rotate(-35deg) translateY(-5px) !important;
        }
        .jumping .at-leg-back {
          transform: rotate(15deg) translateY(1px) !important;
        }
        .jumping .at-arm {
          transform: rotate(-75deg) !important;
        }
        .jumping .at-arm-back {
          transform: rotate(35deg) !important;
        }
        .crouching .atrain-svg {
          transform: translateY(30px) rotate(18deg);
        }
        .crouching .at-torso-group {
          transform: rotate(18deg) translateY(3px) !important;
        }
        .crouching .at-leg-front {
          transform: rotate(80deg) translate(-4px, -11px) !important;
        }
        .crouching .at-leg-back {
          transform: rotate(-60deg) translate(6px, -4px) !important;
        }
        .crouching .at-arm {
          transform: rotate(-95deg) translateY(-4px) !important;
        }
        .animate-spin-slow {
          animation: spin 5s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
