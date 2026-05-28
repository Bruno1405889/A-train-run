import { useEffect, useRef, useState } from 'react';
import { 
  playJumpSound, 
  playCrouchSound, 
  playCollectSound, 
  playHitSound, 
  playLaserChargeSound, 
  playLaserShootSound,
  playV1ActivateSound,
  playShieldExhaustSound
} from './SoundManager';
import { Sparkles, FlaskConical, Zap, Award } from 'lucide-react';

interface GameAreaProps {
  isPlaying: boolean;
  onGameOver: (finalScore: number) => void;
  onQuit: () => void;
  speedMultiplier: number;
  onGameEvent?: (type: string, value?: any) => void;
}

interface ObstacleInstance {
  id: string;
  type: 'log' | 'rock' | 'pit' | 'branch' | 'civilian';
  x: number;
  width: number;
  height: number;
  bottom: number;
  passed: boolean;
  gender?: 'male' | 'female';
  skinColor?: string;
  hairColor?: string;
  hairStyle?: string;
  shirtColor?: string;
  pantColor?: string;
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
    name: "FLORESTA DA VOUGHT (NOITE)",
    sub: "Fuga silenciosa! Desvie dos galhos e rochas sob as árvores!",
    minDistance: 0,
    bgGradient: "linear-gradient(to bottom, #020307, #060c1c, #0b162c)",
    groundBorder: "#15803d",
    groundBg: "linear-gradient(to bottom, #142517, #081009)",
    particleColor: "#00bfff"
  }
];

export default function GameArea({ isPlaying, onGameOver, onQuit, speedMultiplier, onGameEvent }: GameAreaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  
  const onGameEventRef = useRef(onGameEvent);
  useEffect(() => {
    onGameEventRef.current = onGameEvent;
  }, [onGameEvent]);
  
  // Game reactive state via refs (to prevent React re-render lag)
  const multiplierRef = useRef(1);
  const multiplierActiveRef = useRef(false);
  const laserActiveRef = useRef(false);
  
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
  const nextCivilianDistanceRef = useRef(600);
  
  // Track array lengths to avoid doing setState every frame
  const prevObsLenRef = useRef(0);
  const prevItemsLenRef = useRef(0);

  // Shield Invulnerabilities and V1 State Refs 
  const shieldActiveRef = useRef(false);
  const shieldTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const isDeadRef = useRef(false);
  const v1ChargesRef = useRef(0);

  // Key tracking
  const keysPressedRef = useRef<{ [key: string]: boolean }>({});

  // Homelander laser schedule
  const laserCycleRef = useRef({
    state: 'idle' as 'idle' | 'warning' | 'charging' | 'shooting',
    timer: 0,
    targetY: 155,
    isKiller: false,
  });

  // UI state updates maps
  const [laserWarningText, setLaserWarningText] = useState<string | null>(null);
  const [activeObstacleList, setActiveObstacleList] = useState<ObstacleInstance[]>([]);
  const [activeItemList, setActiveItemList] = useState<ItemInstance[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);

  const updateLaserUI = (state: 'idle' | 'warning' | 'charging' | 'shooting') => {
    const isKiller = laserCycleRef.current.isKiller;
    laserActiveRef.current = state === 'shooting';

    ['laser-eye-1', 'laser-eye-2'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        if (state === 'charging' || state === 'shooting') el.classList.add('animate-ping');
        else el.classList.remove('animate-ping');
      }
    });

    ['laser-beam-1', 'laser-beam-2'].forEach(id => {
      const beam = document.getElementById(id);
      if (beam) {
        // Clear previous state classes
        beam.classList.remove('!opacity-[0.98]', '!opacity-[0.6]', '!opacity-[0.3]', 'scale-y-110', 'animate-pulse');

        if (state === 'shooting') {
          beam.classList.add('!opacity-[0.98]', 'scale-y-110');
        } else if (state === 'charging') {
          beam.classList.add('!opacity-[0.6]', 'animate-pulse');
        } else if (state === 'warning') {
          beam.classList.add('!opacity-[0.3]');
        }

        // Targeting angles - fixed angle 54 specifically targeting the background near feet
        if (state === 'shooting') {
          beam.style.transform = 'rotate(54.5deg) scaleX(1.3) scaleY(1.4)';
        } else if (state !== 'idle') {
          beam.style.transform = 'rotate(54.5deg) scaleX(1.1)';
        } else {
          beam.style.transform = 'rotate(54.5deg)';
        }
      }
    });
  };

  const updateShieldUI = (active: boolean) => {
    shieldActiveRef.current = active;
    const ui = document.getElementById('ui-shield-active');
    if (ui) ui.style.display = active ? 'flex' : 'none';
    
    const ring = document.getElementById('shield-ring-active');
    if (ring) ring.style.display = active ? 'flex' : 'none';
  };

  const updateMultiplierUI = (active: boolean, value: number) => {
    multiplierActiveRef.current = active;
    multiplierRef.current = value;
    
    const ui = document.getElementById('ui-multiplier-active');
    if (ui) ui.style.display = active ? 'flex' : 'none';
    
    const text = document.getElementById('ui-multiplier-text');
    if (text) text.style.display = active ? 'block' : 'none';
    
    const trail = document.getElementById('speed-trail');
    if (trail) {
      if (active) {
        trail.style.background = 'linear-gradient(-90deg, rgba(245, 158, 11, 0.75), rgba(217, 119, 6, 0.2), transparent)';
      } else {
        trail.style.background = ''; // reset to default
      }
    }
  };

  // Keybindings listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'KeyS'].includes(e.code)) {
        e.preventDefault();
      }
      keysPressedRef.current[e.code] = true;

      if (!isPlaying) return;

      if (e.code === 'Escape' && !isDeadRef.current) {
        setIsPaused(prev => {
          const next = !prev;
          isPausedRef.current = next;
          return next;
        });
        return;
      }

      if (isPausedRef.current) return;

      // Jump activation
      if (e.code === 'ArrowUp' || e.code === 'Space') {
        if (playerGroundedRef.current) {
          playerVYRef.current = 13.0; 
          playerGroundedRef.current = false;
          jumpCountRef.current = 1;
          playJumpSound();
          createJumpRing(260 + 22, 35);
        }
      }

      // V1 Manual Activation
      if (e.code === 'KeyE') {
        if (v1ChargesRef.current > 0 && !shieldActiveRef.current && isPlaying && !isDeadRef.current) {
          v1ChargesRef.current -= 1;
          const v1el = document.getElementById('v1-count');
          if (v1el) v1el.innerText = v1ChargesRef.current.toString();
          
          updateShieldUI(true);
          playV1ActivateSound();
          
          if (shieldTimeoutRef.current) clearTimeout(shieldTimeoutRef.current);
          shieldTimeoutRef.current = setTimeout(() => {
            updateShieldUI(false);
            playShieldExhaustSound();
          }, 3000);
          
          createCompoundVFlash();
          if (onGameEventRef.current) {
            onGameEventRef.current('activate-v1');
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
      setIsPaused(false);
      isPausedRef.current = false;
      scoreRef.current = 0;
      const meterEl = document.getElementById('ui-score-meters');
      if (meterEl) meterEl.innerText = `0m`;
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

      updateMultiplierUI(false, 1);
      updateLaserUI('idle');
      updateShieldUI(false);

      if (playerRef.current) {
        playerRef.current.style.opacity = '1';
      }

      v1ChargesRef.current = 0;
      isDeadRef.current = false;
      const v1el = document.getElementById('v1-count');
      if (v1el) v1el.innerText = '0';

      // Reset shield invincibility refs
      shieldActiveRef.current = false;
      if (shieldTimeoutRef.current) {
        clearTimeout(shieldTimeoutRef.current);
        shieldTimeoutRef.current = undefined;
      }

      obstaclesRef.current = [];
      itemsRef.current = [];
      particlesRef.current = [];
      lastObstacleTypeRef.current = '';
      nextCivilianDistanceRef.current = 600;

      // Set initial zone style
      setCurrentZone(ZONES[0]);
      setActiveZoneBanner(null);
      setLaserWarningText(null);
      activeZoneIdRef.current = 1;

      laserCycleRef.current = {
        state: 'idle',
        timer: Math.floor(Math.random() * 160) + 160, 
        targetY: 155,
        isKiller: false,
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
    if (isPausedRef.current) {
      loopRef.current = requestAnimationFrame(gameStep);
      return;
    }

    if (isDeadRef.current) {
      updateParticles();
      loopRef.current = requestAnimationFrame(gameStep);
      return;
    }

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
      
      // Sync classes optimally to avoid Thrashing
      const pCL = playerRef.current.classList;
      const isCrouching = playerCrouchingRef.current;
      const isJumping = !playerGroundedRef.current;
      const isRunning = playerGroundedRef.current && !isCrouching;

      if (isCrouching && !pCL.contains('crouching')) pCL.add('crouching');
      if (!isCrouching && pCL.contains('crouching')) pCL.remove('crouching');
      
      if (isJumping && !pCL.contains('jumping')) pCL.add('jumping');
      if (!isJumping && pCL.contains('jumping')) pCL.remove('jumping');
      
      if (isRunning && !pCL.contains('running')) pCL.add('running');
      if (!isRunning && pCL.contains('running')) pCL.remove('running');
    }

    // Synchronously render positions via DOM to avoid React Virtual DOM thrashing (solves lag!)
    for (let i = 0; i < obstaclesRef.current.length; i++) {
       const el = document.getElementById(`obs-${obstaclesRef.current[i].id}`);
       if (el) el.style.transform = `translateX(${obstaclesRef.current[i].x}px)`;
    }
    for (let i = 0; i < itemsRef.current.length; i++) {
       const el = document.getElementById(`item-${itemsRef.current[i].id}`);
       if (el) el.style.transform = `translateX(${itemsRef.current[i].x}px)`;
    }

    // Only update React arrays if the length has changed
    if (obstaclesRef.current.length !== prevObsLenRef.current) {
        prevObsLenRef.current = obstaclesRef.current.length;
        setActiveObstacleList([...obstaclesRef.current]);
    }
    if (itemsRef.current.length !== prevItemsLenRef.current) {
        prevItemsLenRef.current = itemsRef.current.length;
        setActiveItemList([...itemsRef.current]);
    }

    // Gradual difficulty speed boost
    if (globalCyclesRef.current % 450 === 0) {
      curSpeedRef.current += 0.35;
    }

    // Tick score meter
    if (globalCyclesRef.current % 5 === 0) {
      scoreRef.current += multiplierRef.current;
      const meterEl = document.getElementById('ui-score-meters');
      if (meterEl) meterEl.innerText = `${scoreRef.current}m`;
      if (onGameEventRef.current) {
        onGameEventRef.current('score', scoreRef.current);
      }
    }

    loopRef.current = requestAnimationFrame(gameStep);
  };

  const updateLaserCycles = () => {
    const cycle = laserCycleRef.current;
    cycle.timer -= 1;

    if (cycle.state === 'idle') {
      if (cycle.timer <= 0) {
        cycle.state = 'warning';
        cycle.timer = 60; // 60 frames (1s) of warning
        cycle.isKiller = false;
        setLaserWarningText(null);
        updateLaserUI('warning');
      }
    } else if (cycle.state === 'warning') {
      if (cycle.timer <= 0) {
        cycle.state = 'charging';
        cycle.timer = 35; // 35 frames (0.58s) charging
        playLaserChargeSound();
        updateLaserUI('charging');
      }
    } else if (cycle.state === 'charging') {
      if (cycle.timer <= 0) {
        cycle.state = 'shooting';
        cycle.timer = 25; // 25 frames shooting visual
        updateLaserUI('shooting');
        playLaserShootSound();
        setLaserWarningText(null); 
      }
    } else if (cycle.state === 'shooting') {
      // Fire sparks on the floor surface
      if (globalCyclesRef.current % 3 === 0) {
        // Spark point physically matched to where 54deg beam contacts A-Train Heel
        createSparks(259 + Math.random() * 15, 36 + Math.random() * 4, '#ffffff');
        createSparks(265 + Math.random() * 15, 36 + Math.random() * 4, '#ff2200');
      }

      if (cycle.timer <= 0) {
        cycle.state = 'idle';
        cycle.timer = 240 + Math.floor(Math.random() * 120); // Reduced frequency (approx 4 to 6 seconds)
        cycle.isKiller = false;
        setLaserWarningText(null);
        updateLaserUI('idle');
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

      // Dynamic gap threshold ensures reaction time is constant at high-speeds. Fixed spacing stabilizes generation and avoids overlapping visuals.
      let safeSpacingThreshold = Math.max(560, currentSpeed * 45);

      // Balance constraint: if a killer laser challenge is active, give players generous spacing limit!
      const laserActive = laserCycleRef.current.isKiller && (laserCycleRef.current.state === 'warning' || laserCycleRef.current.state === 'charging' || laserCycleRef.current.state === 'shooting');
      if (laserActive) {
        safeSpacingThreshold = Math.max(780, currentSpeed * 56); // Widen spacing severely so dodging both laser and obstacles is fun and fair
      }

      if (minDistance > safeSpacingThreshold) {
        // Dynamic hazards selection
        const types: ('log' | 'rock' | 'pit' | 'branch')[] = ['log', 'log', 'rock', 'rock', 'pit', 'pit', 'branch', 'branch'];
        let selected: 'log' | 'rock' | 'pit' | 'branch' | 'civilian' = types[Math.floor(Math.random() * types.length)];

        if (scoreRef.current >= nextCivilianDistanceRef.current) {
          selected = 'civilian';
          nextCivilianDistanceRef.current += 600;
        }

        // Balanced pacing constraint: If an intense killer laser is targeting A-Train, block branches/pits to avoid impossible overlapping crouch+jump traps!
        if (laserActive && (selected === 'pit' || selected === 'branch')) {
          selected = 'rock'; // Substitute with jumping/grounded obstacles which are dodging-aligned
        }

        // Prevent frustrating identical hazard pairs (e.g. double pits)
        if (selected === lastObstacleTypeRef.current && selected !== 'civilian') {
          selected = selected === 'pit' ? 'rock' : 'log';
        }

        lastObstacleTypeRef.current = selected;
        
        // Hazard bounds setups
        let w = 65, h = 35, y = 35;
        let gender: 'male' | 'female' | undefined = undefined;
        let skinColor: string | undefined = undefined;
        let hairColor: string | undefined = undefined;
        let hairStyle: string | undefined = undefined;
        let shirtColor: string | undefined = undefined;
        let pantColor: string | undefined = undefined;

        if (selected === 'rock') { 
          w = 55; h = 45; y = 35; 
        } else if (selected === 'pit') { 
          w = 82; h = 36; y = 0; 
        } else if (selected === 'branch') { 
          w = 90; h = 40; y = 112; 
        } else if (selected === 'civilian') {
          // Tall human figure (same proportions as A-Train torso + head)
          w = 55;
          h = 90;
          y = 35;
          
          // High-fidelity random diversity parameter generators
          gender = Math.random() < 0.52 ? 'female' : 'male';
          const skinColors = ['#54321d', '#8c5837', '#fed7aa', '#fdbb74', '#92400e'];
          const hairColors = ['#111111', '#7a431d', '#d97706', '#6b7280', '#1c1917'];
          const shirtColors = ['#dc2626', '#7c3aed', '#0891b2', '#2563eb', '#16a34a', '#db2777', '#ca8a04', '#475569'];
          const pantColors = ['#1e293b', '#334155', '#0f172a', '#1e1b4b', '#78350f'];
          const hairStyles = gender === 'female' ? ['long', 'ponytail', 'bun'] : ['short', 'curly', 'bald'];

          skinColor = skinColors[Math.floor(Math.random() * skinColors.length)];
          hairColor = hairColors[Math.floor(Math.random() * hairColors.length)];
          shirtColor = shirtColors[Math.floor(Math.random() * shirtColors.length)];
          pantColor = pantColors[Math.floor(Math.random() * pantColors.length)];
          hairStyle = hairStyles[Math.floor(Math.random() * hairStyles.length)];
        }

        obstaclesRef.current.push({
          id: Math.random().toString(36).substring(2, 9),
          type: selected,
          x: 960 + Math.random() * 60,
          width: w,
          height: h,
          bottom: y,
          passed: false,
          gender,
          skinColor,
          hairColor,
          hairStyle,
          shirtColor,
          pantColor
        });
      }
    }

    // Compound V Floating collectibles serum bottle
    if (itemsRef.current.length === 0 && globalCyclesRef.current % 450 === 0 && Math.random() < 1.2 / speedMultiplier) {
      let safeItemX = 960;
      if (obstaclesRef.current.length > 0) {
        const lastObs = obstaclesRef.current[obstaclesRef.current.length - 1];
        if (lastObs.x > 800) {
          safeItemX = lastObs.x + 400; // Push generously to avoid overlapping with obstacle
        }
      }

      itemsRef.current.push({
        id: Math.random().toString(36).substring(2, 9),
        type: 'compound-v',
        x: safeItemX,
        width: 38,
        height: 52,
        bottom: 140, // Perfect elevated height for secure, unobstructed jumping
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
        if (shieldActiveRef.current) {
          // Destroys the obstacle during V1 Shield's 3-second invincibility!
          if (obs.type === 'civilian') {
            // Explode the civilian into blood splat as A-Train runs through them with active shield!
            const civLeft = obs.x;
            const civBottom = obs.bottom;
            for (let s = 0; s < 45; s++) {
              particlesRef.current.push({
                id: Math.random().toString(),
                x: civLeft + obs.width / 2,
                y: civBottom + obs.height / 2,
                vx: (Math.random() - 0.5) * 15 + 4,
                vy: Math.random() * 11 + 2,
                size: Math.random() * 6 + 4,
                color: '#ef4444',
                opacity: 1,
                life: 45 + Math.random() * 20
              });
            }
          }

          obstaclesRef.current.splice(i, 1);
          playHitSound();
          createFeedbackFlash('shield-break');
          // Disperse cool sparkly impact particles
          for (let s = 0; s < 12; s++) {
            particlesRef.current.push({
              id: Math.random().toString(),
              x: oLeft + obs.width / 2,
              y: oBottom + obs.height / 2,
              vx: (Math.random() - 0.5) * 10 - 2,
              vy: Math.random() * 8 + 1,
              size: Math.random() * 6 + 3,
              color: '#818cf8',
              opacity: 0.9,
              life: 20
            });
          }
          continue;
        } else {
          // Fatal collision! If civilian, explode them into blood first
          if (obs.type === 'civilian') {
            const civEl = document.getElementById('obs-' + obs.id);
            if (civEl) civEl.style.opacity = '0';
            
            const civLeft = obs.x;
            const civBottom = obs.bottom;
            for (let s = 0; s < 50; s++) {
              particlesRef.current.push({
                id: Math.random().toString() + s,
                x: civLeft + obs.width / 2,
                y: civBottom + obs.height / 2,
                vx: (Math.random() - 0.5) * 16 + 5,
                vy: Math.random() * 12 + 2,
                size: Math.random() * 7 + 4,
                color: '#ef4444', // Blood Red!
                opacity: 1,
                life: 45 + Math.random() * 20
              });
            }
            // Add a blood splat sound
            playHitSound(); 
            
            // Remove civilian from obstacle list and continue without dying
            obstaclesRef.current.splice(i, 1);
            continue;
          }

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
        
        // Manual V1 Charge addition (Max 2)
        if (v1ChargesRef.current < 2) {
          v1ChargesRef.current += 1;
        }
        const v1el = document.getElementById('v1-count');
        if (v1el) v1el.innerText = v1ChargesRef.current.toString();

        updateMultiplierUI(true, 3);
        scoreRef.current += 50;
        const meterEl = document.getElementById('ui-score-meters');
        if (meterEl) meterEl.innerText = `${scoreRef.current}m`;
        createCompoundVFlash();

        if (onGameEventRef.current) {
          onGameEventRef.current('collect-v', 1);
        }

        // High multiplier expires after 6 seconds
        setTimeout(() => {
          updateMultiplierUI(false, 1);
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
    // Highly optimized particle count to eliminate layout overhead and preserve 60FPS
    for (let i = 0; i < 2; i++) {
      particlesRef.current.push({
        id: Math.random().toString(),
        x,
        y,
        vx: (Math.random() - 0.6) * 10 - 2,
        vy: (Math.random() - 0.5) * 3,
        size: Math.random() * 4 + 2,
        color,
        opacity: 1,
        life: 12
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

    const container = document.getElementById('particles-container');

    // Move logic
    for (let i = particlesRef.current.length - 1; i >= 0; i--) {
      const p = particlesRef.current[i];
      p.x += p.vx;
      p.y += p.vy;
      p.opacity -= 1 / p.life;
      p.life -= 1;

      if (p.life <= 0 || p.opacity <= 0) {
        particlesRef.current.splice(i, 1);
        if (container) {
          const node = document.getElementById(`p-${p.id}`);
          if (node) node.remove();
        }
      } else if (container) {
        let node = document.getElementById(`p-${p.id}`);
        if (!node) {
          node = document.createElement('div');
          node.id = `p-${p.id}`;
          node.className = 'absolute z-[25] rounded-full pointer-events-none transform-gpu mix-blend-screen';
          node.style.width = `${p.size}px`;
          node.style.height = `${p.size}px`;
          node.style.backgroundColor = p.color;
          node.style.left = '0px';
          node.style.bottom = '0px';
          if (p.size > 6) node.style.boxShadow = `0 0 5px ${p.color}`;
          container.appendChild(node);
        }
        node.style.transform = `translate3d(${p.x}px, -${p.y}px, 0)`;
        node.style.opacity = p.opacity.toString();
      }
    }
  };

  const triggerGameOver = () => {
    playHitSound();
    isDeadRef.current = true;
    
    // Blood Disintegration
    if (playerRef.current) {
      playerRef.current.style.opacity = '0';
      
      const pLeft = 260;
      const pBottom = 29 + playerYRef.current;
      for (let s = 0; s < 50; s++) {
        particlesRef.current.push({
          id: Math.random().toString(),
          x: pLeft + playerWidthRef.current / 2,
          y: pBottom + playerHeightRef.current / 2,
          vx: (Math.random() - 0.5) * 16,
          vy: Math.random() * 12 + 2, 
          size: Math.random() * 7 + 4,
          color: '#ef4444', 
          opacity: 1,
          life: 45 + Math.random() * 20
        });
      }
    }

    // Force one last render to guarantee explosion setup locally

    setTimeout(() => {
      onGameOver(scoreRef.current);
    }, 1100); // 1.1 seconds death window to show realistic splat
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
        <div className="flex gap-4 font-mono pl-24">
          <div className="bg-slate-950/80 border-2 border-fuchsia-500 rounded-lg px-3 py-1.5 flex items-center gap-2 select-none shadow-lg">
            <FlaskConical size={14} className="text-fuchsia-400 animate-pulse" />
            <span className="text-white text-xs tracking-wider">V1 (Tecla E):</span>
            <div>
              <span id="v1-count" className="text-fuchsia-400 text-sm font-extrabold">0</span>
              <span className="text-fuchsia-500/70 text-xs font-bold pl-0.5">/2</span>
            </div>
          </div>

          <div 
            id="ui-multiplier-active" 
            className="bg-amber-950/90 border-2 border-amber-500 rounded-lg px-3 py-1.5 hidden items-center gap-2 select-none shadow-lg"
          >
            <FlaskConical size={14} className="text-amber-400" />
            <span className="text-amber-300 text-[10px] tracking-widest font-bold">X3 (COMPOSTO V)</span>
          </div>

          <div 
            id="ui-shield-active" 
            className="bg-indigo-900/80 border-2 border-indigo-400 rounded-lg px-3 py-1.5 hidden items-center gap-2 select-none shadow-lg"
          >
            <div className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
            <span className="text-indigo-200 text-[10px] tracking-wider font-bold">ESCUDO ATIVO</span>
          </div>
        </div>

        {/* Simple running circuit & Meters overlay */}
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2 bg-slate-950/85 border-2 border-slate-700 rounded-lg px-3 py-1 text-[10px] font-mono text-slate-300 select-none shadow-lg">
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: currentZone.particleColor }} />
            <span>{currentZone.name}</span>
          </div>
          <div className="flex items-center gap-2 bg-slate-950/90 border-2 border-cyan-500/50 rounded-lg px-4 py-2 text-cyan-400 select-none shadow-[0_0_15px_rgba(6,182,212,0.2)]">
            <span id="ui-score-meters" className="font-mono text-lg font-black tracking-widest text-glow-blue uppercase">0m</span>
          </div>
        </div>
      </div>

      {/* CAPTAIN PATRIA KILLER LASER WARNING tactically overlayed */}
      {laserWarningText && (
        <div className="absolute inset-x-0 top-[85px] z-30 flex justify-center items-center pointer-events-none">
          <div className="bg-red-950/95 border-2 border-red-500 rounded-xl px-4 py-2 flex items-center gap-2.5 animate-pulse shadow-[0_0_20px_rgba(239,68,68,0.4)]">
            <Zap className="text-red-400 animate-bounce" size={16} />
            <span className="text-red-200 font-mono text-[11px] font-extrabold tracking-widest uppercase animate-pulse">
              {laserWarningText}
            </span>
          </div>
        </div>
      )}

      {/* HOMELANDER (Capitão Pátria) */}
      <div 
        id="homelander" 
        className="absolute bottom-[240px] left-[-10px] w-[85px] h-[130px] z-[15] pointer-events-none"
        style={{
          animation: 'homelanderFly 2.2s infinite ease-in-out',
        }}
      >
        <svg className="w-full h-full" viewBox="0 0 40 60" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <g id="hl-star"><polygon points="5,0 6.5,3.5 10,3.5 7,6 8,9.5 5,7.5 2,9.5 3,6 0,3.5 3.5,3.5" /></g>
            <linearGradient id="hl-suit" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#071b42"/><stop offset="50%" stopColor="#144291"/><stop offset="100%" stopColor="#05122e"/></linearGradient>
            <linearGradient id="hl-cape-grad" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#800000"/><stop offset="40%" stopColor="#cc0010"/><stop offset="100%" stopColor="#660000"/></linearGradient>
            <linearGradient id="hl-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ffee55"/><stop offset="100%" stopColor="#b88300"/></linearGradient>
            <linearGradient id="hl-skin" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#ca8a65"/><stop offset="50%" stopColor="#f5caa6"/><stop offset="100%" stopColor="#aa663f"/></linearGradient>
            <linearGradient id="hl-hair" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#ffeb99"/><stop offset="100%" stopColor="#d69c0d"/></linearGradient>
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
          
          {/* Stylish muscular Back Arm (A-Train proportion) */}
          <g id="back-arm" style={{ transformOrigin: '23px 21px', transform: 'rotate(-25deg) translateY(2px) translateX(10px)', filter: 'brightness(0.65)' }}>
            <rect x="12.5" y="20" width="5.5" height="14" fill="url(#hl-suit)" rx="2.5" stroke="#010206" strokeWidth="1"/>
            <ellipse cx="15px" cy="34" rx="3.5" ry="3.5" fill="#cc0010" stroke="#010206" strokeWidth="1"/>
            <ellipse cx="15px" cy="21" rx="3.5" ry="3.5" fill="#cc0010" stroke="#010206" strokeWidth="1"/>
          </g>

          {/* Fully redesigned Legs (Straightened, matching animation structure) */}
          <g>
            <rect x="13.5" y="38" width="5.5" height="15" fill="url(#hl-suit)" rx="2" stroke="#010206" strokeWidth="1.2"/>
            {/* Red Vought Boots */}
            <path d="M12.5 49 Q 17 47.5 20 53 Q 17 55.5 12.5 54.5 Z" fill="#cc0010" stroke="#010206" strokeWidth="1"/>
            <rect x="12" y="52.5" width="7.5" height="2" fill="url(#hl-gold)" rx="1" stroke="#010206" strokeWidth="0.5"/>
          </g>

          <g>
            <rect x="21" y="38" width="5.5" height="15" fill="url(#hl-suit)" rx="2" stroke="#010206" strokeWidth="1.2"/>
            {/* Red Vought Boots */}
            <path d="M20 49 Q 24.5 47.5 27.5 53 Q 24.5 55.5 20 54.5 Z" fill="#cc0010" stroke="#010206" strokeWidth="1"/>
            <rect x="19.5" y="52.5" width="7.5" height="2" fill="url(#hl-gold)" rx="1" stroke="#010206" strokeWidth="0.5"/>
          </g>
          
          {/* Torso/Chest muscular definition */}
          <rect x="11.5" y="18" width="17" height="23" fill="url(#hl-suit)" rx="4.5" stroke="#010206" strokeWidth="1.5"/>
          <rect x="13.5" y="37" width="13" height="3" fill="url(#hl-gold)" stroke="#010206" strokeWidth="0.8"/> {/* Golden grid belt */}
          
          {/* Muscular and powerful Front Arm (A-Train style arm proportion) */}
          <g id="front-arm" transform="rotate(-65 14 20)">
            <rect x="10.5" y="20" width="5.5" height="14" fill="url(#hl-suit)" rx="2.5" stroke="#010206" strokeWidth="1.2"/>
            <ellipse cx="13.25" cy="34" rx="3.5" ry="3.5" fill="#cc0010" stroke="#010206" strokeWidth="1.2"/>
          </g>
          <ellipse cx="13" cy="18" rx="4.5" ry="3" fill="url(#hl-gold)" stroke="#010206" strokeWidth="1"/>

          {/* Head & Skin tones */}
          <rect x="14" y="5" width="12" height="13.5" fill="url(#hl-skin)" rx="4" stroke="#010206" strokeWidth="1.2"/>
          
          {/* Homelander's Redesigned Unified Coiffed Hair (Corrected proportional structure with no double layering) */}
          <g id="hl-hair-premium">
            {/* Single elegant, unified, 3D coiffed volumetric hair mass */}
            <path d="M13 10 C 11.5 5, 14 0.5, 20 0.5 C 26 0.5, 28.5 5, 27 10 C 26 11, 25 9.5, 23.5 8 C 22.5 7, 21.5 6.5, 20 6.5 C 18.5 6.5, 17.5 7, 16.5 8 C 15 9.5, 14 11, 13 10 Z" fill="url(#hl-hair)" stroke="#010206" strokeWidth="1.3" />
            {/* Fully blended subtle top locks that flow into the main body organically to prevent lines mapping */}
            <path d="M14 6 C 16 2, 24 2, 26 6 C 24 5, 16 5, 14 6 Z" fill="url(#hl-hair)" opacity="0.85" />
            {/* Fine natural hair highlights and shadow grooves */}
            <path d="M15.5 3.5 C 18 1.8, 22 1.8, 24.5 3.5" stroke="#ffffff" strokeWidth="0.8" strokeLinecap="round" fill="none" opacity="0.65" />
            <path d="M17 5 C 19 3.5, 21 3.5, 23 5" stroke="#e67e22" strokeWidth="0.7" strokeLinecap="round" fill="none" opacity="0.45" />
            <path d="M14.5 8.2 Q 16 6.2 18 7.2" stroke="#ffffff" strokeWidth="0.6" fill="none" opacity="0.4" />
          </g>

          {/* Ruby red Laser eye sockets */}
          <circle cx="21" cy="11.5" r="1.5" fill="#ff0000" />
          <circle id="laser-eye-1" cx="21" cy="11.5" r="0.7" fill="#ffffff" />
          <circle cx="25" cy="12" r="1.5" fill="#ff0000" />
          <circle id="laser-eye-2" cx="25" cy="12" r="0.7" fill="#ffffff" />
        </svg>

        {/* EYE GLOW RAY BEAM (LEFT EYE) */}
        <div 
          id="laser-beam-1"
          className="absolute top-[25px] left-[44px] w-[383px] h-[6px] bg-gradient-to-r from-[#ffffff] via-[#ff2200] to-[#ffaa00]/40 rounded-full origin-top-left z-[20] pointer-events-none transition-opacity duration-200 opacity-0" 
          style={{
            border: '1.2px solid #ff2200',
            boxShadow: '0 0 8px #ff2111',
          }}
        />

        {/* EYE GLOW RAY BEAM (RIGHT EYE) */}
        <div 
          id="laser-beam-2"
          className="absolute top-[27px] left-[52px] w-[381px] h-[6px] bg-gradient-to-r from-[#ffffff] via-[#ff2200] to-[#ffaa00]/40 rounded-full origin-top-left z-[20] pointer-events-none transition-opacity duration-200 opacity-0" 
          style={{
            border: '1.2px solid #ff2200',
            boxShadow: '0 0 8px #ff2111',
          }}
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
          id="speed-trail"
          className="absolute right-[50%] top-[10%] w-[160px] h-[75%] rounded-l-full filter blur-[3px] pointer-events-none mix-blend-screen transition-all select-none opacity-0"
          style={{
            background: `linear-gradient(-90deg, ${currentZone.particleColor}, ${currentZone.groundBorder}1a, transparent)`,
            animation: 'trailPulse 0.12s infinite alternate ease-in-out'
          }}
        />

        <div id="ui-multiplier-text" className="absolute -top-6 left-1/2 -translate-x-1/2 select-none pointer-events-none hidden">
          <span className="text-[10px] font-mono text-amber-400 font-extrabold text-glow-yellow animate-bounce uppercase">Composto V!</span>
        </div>

        <div id="shield-ring-active" className="absolute inset-[-15px] border-2 border-indigo-400/80 rounded-full z-[10] pointer-events-none flex items-center justify-center bg-indigo-500/20 mix-blend-screen hidden">
          <div className="absolute top-0 w-2 h-2 rounded-full bg-indigo-200" />
          <div className="absolute bottom-0 w-2 h-2 rounded-full bg-indigo-200" />
        </div>

        {/* Improved high-definition SVG artwork of A-Train */}
        <svg 
          className="atrain-svg w-full h-full" 
          viewBox="0 0 40 60" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
          style={{ overflow: 'visible' }}
        >
          <defs>
            <linearGradient id="at-suit" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#051740"/><stop offset="50%" stopColor="#14429e"/><stop offset="100%" stopColor="#040d24"/></linearGradient>
            <linearGradient id="at-armor" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#ffffff"/><stop offset="50%" stopColor="#dce5f1"/><stop offset="100%" stopColor="#93a8c7"/></linearGradient>
            <linearGradient id="at-skin" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#54321d"/><stop offset="50%" stopColor="#8c5837"/><stop offset="100%" stopColor="#3d2212"/></linearGradient>
            <linearGradient id="at-glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#ffffff" /><stop offset="50%" stopColor="#00ffff" /><stop offset="100%" stopColor="#004a4a" /></linearGradient>
            <linearGradient id="at-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ffdd00"/><stop offset="100%" stopColor="#aa8c00"/></linearGradient>
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
            
            {/* Professional Fade Haircut (A-Train style: very short, sharp edge-up) */}
            <path d="M15.5 6 C 15.5 2, 26.5 2, 26.5 6 C 25.5 5.5, 24.5 4.8, 21 4.8 C 17.5 4.8, 16.5 5.5, 15.5 6 Z" fill="#0c0d12" stroke="#020206" strokeWidth="1.2"/>
            {/* Fine texture lines for realistic short hair / waves */}
            <path d="M16.5 3.5 Q 21 2.5 25.5 3.5 M 17 4.5 Q 21 3.8 25 4.5" stroke="#1c1f2e" strokeWidth="0.8" fill="none" opacity="0.6" />
            <path d="M15.5 6 L 15.5 7.5 M 26.5 6 L 26.5 7.5" stroke="#0c0d12" strokeWidth="1" strokeLinecap="round" />
            
            {/* White and blue stylish sportswear sunglasses (A-train series style) */}
            <rect x="16" y="7" width="10" height="4" fill="#f0f0f0" rx="2" stroke="#020206" strokeWidth="1" />
            <path d="M16.5 7.5 L 25.5 7.5 L 24 10 L 18 10 Z" fill="#0066ff" opacity="0.85" />
          </g>
        </svg>
      </div>

      {/* DYNAMIC OBSTACLES */}
      <div id="obstacles-container">
        {activeObstacleList.map((obs, idx) => {
          return (
            <div 
              key={`obs-${obs.id}-${idx}`}
              id={`obs-${obs.id}`}
              className="absolute will-change-transform z-[15]"
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
                    <linearGradient id="log-body" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#5c3818"/>
                      <stop offset="50%" stopColor="#40250d"/>
                      <stop offset="100%" stopColor="#2a1605"/>
                    </linearGradient>
                    <linearGradient id="moss-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22c55e"/>
                      <stop offset="100%" stopColor="#15803d"/>
                    </linearGradient>
                  </defs>
                  {/* Fallen mossy tree log trunk */}
                  <rect x="2" y="10" width="61" height="20" fill="url(#log-body)" rx="5" stroke="#0c0d14" strokeWidth="2" />
                  {/* Log core and bark lines */}
                  <ellipse cx="61" cy="20" rx="3.5" ry="10" fill="#8b5a2b" stroke="#0c0d14" strokeWidth="1" />
                  <ellipse cx="61" cy="20" rx="1.5" ry="5" fill="#3d220f" />
                  <ellipse cx="3" cy="20" rx="3" ry="10" fill="#3d220f" />
                  
                  {/* Bark cracks and detail rings */}
                  <line x1="8" y1="16" x2="48" y2="16" stroke="#1c1005" strokeWidth="1.5" />
                  <line x1="14" y1="24" x2="52" y2="24" stroke="#1c1005" strokeWidth="1.5" />
                  
                  {/* Beautiful vibrant green forest moss */}
                  <path d="M6 10 C 14 6, 22 7, 30 10 C 38 7, 46 6, 54 10 Z" fill="url(#moss-grad)" stroke="#0c0d14" strokeWidth="0.8" />
                  
                  {/* Sprouting vines and weeds */}
                  <circle cx="16" cy="11" r="2.5" fill="#15803d" />
                  <circle cx="28" cy="12" r="3" fill="#166534" />
                  <circle cx="44" cy="11" r="2.5" fill="#15803d" />
                </svg>
              )}

              {obs.type === 'rock' && (
                <svg width="100%" height="100%" viewBox="0 0 55 45" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="boulder-grad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#78716c"/>
                      <stop offset="50%" stopColor="#44403c"/>
                      <stop offset="100%" stopColor="#1c1917"/>
                    </linearGradient>
                    <linearGradient id="rock-moss" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4ade80"/>
                      <stop offset="100%" stopColor="#166534"/>
                    </linearGradient>
                  </defs>
                  {/* Spooky granite boulder shape */}
                  <polygon points="27,2 48,15 52,35 34,43 14,41 3,25 9,10" fill="url(#boulder-grad)" stroke="#0c0d14" strokeWidth="2.2" />
                  {/* Forest lichen and moss coating */}
                  <polygon points="27,2 48,15 36,18 20,12 9,10" fill="url(#rock-moss)" opacity="0.9" stroke="#0c0d14" strokeWidth="0.8" />
                  {/* Granite clefts and erosion cracks */}
                  <line x1="3" y1="25" x2="28" y2="24" stroke="#1c1917" strokeWidth="1.8" />
                  <line x1="9" y1="10" x2="28" y2="24" stroke="#1c1917" strokeWidth="1.8" />
                  <line x1="48" y1="15" x2="28" y2="24" stroke="#1c1917" strokeWidth="1.8" />
                  <line x1="34" y1="43" x2="28" y2="24" stroke="#1c1917" strokeWidth="1.8" />
                  <circle cx="15" cy="30" r="3" fill="#15803d" opacity="0.8" />
                  <circle cx="42" cy="28" r="2" fill="#166534" opacity="0.8" />
                </svg>
              )}

              {obs.type === 'pit' && (
                <svg width="100%" height="100%" viewBox="0 0 85 36" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <radialGradient id="pit-hole" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="#000000"/>
                      <stop offset="80%" stopColor="#0a0a0a"/>
                      <stop offset="100%" stopColor="#1a1a1a"/>
                    </radialGradient>
                    <linearGradient id="pit-edge" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#451a03"/>
                      <stop offset="100%" stopColor="#1c1917"/>
                    </linearGradient>
                    <linearGradient id="rock-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#57534e"/>
                      <stop offset="100%" stopColor="#292524"/>
                    </linearGradient>
                  </defs>
                  
                  {/* Outer dirt rim */}
                  <ellipse cx="42.5" cy="18" rx="40" ry="16" fill="url(#pit-edge)" stroke="#292524" strokeWidth="2" />
                  
                  {/* Black hole inside */}
                  <path d="M 12 18 Q 20 5 42.5 5 Q 65 5 73 18 Q 65 31 42.5 31 Q 20 31 12 18 Z" fill="url(#pit-hole)" stroke="#000000" strokeWidth="1" />
                  
                  {/* Rocks scattered around the edge */}
                  <path d="M 5 15 L 12 11 L 18 16 L 10 20 Z" fill="url(#rock-grad)" stroke="#1c1917" strokeWidth="1" />
                  <path d="M 35 4 L 45 2 L 50 6 L 40 9 Z" fill="url(#rock-grad)" stroke="#1c1917" strokeWidth="1" />
                  <path d="M 70 12 L 78 15 L 82 22 L 72 18 Z" fill="url(#rock-grad)" stroke="#1c1917" strokeWidth="1" />
                  <path d="M 60 28 L 68 25 L 70 30 L 62 33 Z" fill="url(#rock-grad)" stroke="#1c1917" strokeWidth="1" />
                  <path d="M 25 28 L 32 30 L 30 35 L 22 32 Z" fill="url(#rock-grad)" stroke="#1c1917" strokeWidth="1" />
                </svg>
              )}

              {obs.type === 'branch' && (
                <svg width="100%" height="100%" viewBox="0 0 90 40" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="branch-body" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#5c3818"/>
                      <stop offset="100%" stopColor="#2a1605"/>
                    </linearGradient>
                    <radialGradient id="leaves-green" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="#4ade80"/>
                      <stop offset="100%" stopColor="#14532d"/>
                    </radialGradient>
                  </defs>
                  {/* Thick heavy oak wood branch spanning across */}
                  <path d="M0 6 Q 45 16 90 4" stroke="url(#branch-body)" strokeWidth="8.5" fill="none" strokeLinecap="round" />
                  <path d="M30 11 Q 48 24 55 24" stroke="url(#branch-body)" strokeWidth="4.5" fill="none" strokeLinecap="round" />
                  
                  {/* Fluffy forest leaf canopy clusters hanging low */}
                  <circle cx="20" cy="12" r="10.5" fill="url(#leaves-green)" stroke="#0c0d14" strokeWidth="0.8" />
                  <circle cx="48" cy="22" r="13" fill="url(#leaves-green)" stroke="#0c0d14" strokeWidth="1" />
                  <circle cx="58" cy="20" r="11" fill="url(#leaves-green)" stroke="#0c0d14" strokeWidth="0.8" />
                  <circle cx="78" cy="10" r="9.5" fill="url(#leaves-green)" stroke="#0c0d14" strokeWidth="0.8" />
                  
                  {/* Strangling vines dripping down */}
                  <path d="M20 18 Q 18 28 22 34" stroke="#166534" strokeWidth="1.5" fill="none" />
                  <path d="M54 28 Q 58 35 56 39" stroke="#15803d" strokeWidth="1.5" fill="none" opacity="0.8" />
                </svg>
              )}

              {obs.type === 'civilian' && (
                <svg width="100%" height="100%" viewBox="0 0 40 60" xmlns="http://www.w3.org/2000/svg" style={{ overflow: 'visible' }}>
                  <defs>
                    <linearGradient id={`civ-shirt-${obs.id}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor={obs.shirtColor || '#3b82f6'}/><stop offset="100%" stopColor="#1e3a8a"/></linearGradient>
                    <linearGradient id={`civ-pants-${obs.id}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor={obs.pantColor || '#475569'}/><stop offset="100%" stopColor="#0f172a"/></linearGradient>
                    <linearGradient id={`civ-skin-${obs.id}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor={obs.skinColor || '#fed7aa'}/><stop offset="100%" stopColor="#c2410c"/></linearGradient>
                  </defs>

                  {/* walking legs */}
                  <g className="civ-leg-back" style={{ transformOrigin: '15px 38px', animation: 'civilianWalkLegBack 0.4s infinite linear' }}>
                    <rect x="14.5" y="38" width="5.5" height="15" fill={`url(#civ-pants-${obs.id})`} rx="2" stroke="#020206" strokeWidth="1.2"/>
                    {/* Shoe */}
                    <rect x="13.5" y="52" width="7" height="3" fill="#111111" rx="1" stroke="#020206" strokeWidth="0.8"/>
                  </g>

                  <g className="civ-leg-front" style={{ transformOrigin: '21px 38px', animation: 'civilianWalkLegFront 0.4s infinite linear' }}>
                    <rect x="20.5" y="38" width="5.5" height="15" fill={`url(#civ-pants-${obs.id})`} rx="2" stroke="#020206" strokeWidth="1.2"/>
                    {/* Shoe */}
                    <rect x="19.5" y="52" width="7" height="3" fill="#111111" rx="1" stroke="#020206" strokeWidth="0.8"/>
                  </g>

                  {/* Body torso */}
                  <g className="civ-torso-group" style={{ transformOrigin: '17px 35px', animation: 'civilianWalkTorso 0.4s infinite ease-in-out alternate' }}>
                    {/* Back Arm */}
                    <g className="civ-arm-back" style={{ transformOrigin: '15px 21px', animation: 'civilianWalkArmBack 0.4s infinite ease-in-out alternate' }}>
                      <rect x="12.5" y="20" width="5.5" height="14" fill={`url(#civ-shirt-${obs.id})`} rx="2.5" stroke="#020206" strokeWidth="1"/>
                      <circle cx="15.2" cy="33" r="2.5" fill={`url(#civ-skin-${obs.id})`} stroke="#020206" strokeWidth="0.8" />
                    </g>

                    {/* Torso Shirt */}
                    <rect x="13.5" y="18" width="14.5" height="23" fill={`url(#civ-shirt-${obs.id})`} rx="4" stroke="#020206" strokeWidth="1.2"/>
                    
                    {/* Female Dress shape overlap if female and custom styled */}
                    {obs.gender === 'female' && (
                      <polygon points="13.5,30 28,30 30,41 11.5,41" fill={`url(#civ-shirt-${obs.id})`} stroke="#020206" strokeWidth="1.2" />
                    )}

                    {/* Front Arm */}
                    <g className="civ-arm-front" style={{ transformOrigin: '23px 21px', animation: 'civilianWalkArmFront 0.4s infinite ease-in-out alternate' }}>
                      <rect x="20.5" y="20" width="5.5" height="14" fill={`url(#civ-shirt-${obs.id})`} rx="2.5" stroke="#020206" strokeWidth="1.2"/>
                      <circle cx="23.2" cy="33" r="2.5" fill={`url(#civ-skin-${obs.id})`} stroke="#020206" strokeWidth="0.8" />
                    </g>

                    {/* Head & Neck */}
                    <rect x="19" y="15" width="4" height="4" fill={`url(#civ-skin-${obs.id})`} stroke="#020206" strokeWidth="0.8" />
                    <circle cx="21" cy="11.5" r="5.5" fill={`url(#civ-skin-${obs.id})`} stroke="#020206" strokeWidth="1.1" />

                    {/* Dynamic Hair Styles */}
                    {obs.hairStyle === 'short' && (
                      <path d="M15.5 10 C 15.5 5.5, 26.5 5.5, 26.5 10 C 25.5 10, 24.5 9, 21 9 Q 16.5 9, 15.5 10 Z" fill={obs.hairColor || '#111111'} stroke="#020206" strokeWidth="0.8"/>
                    )}
                    {obs.hairStyle === 'curly' && (
                      <g fill={obs.hairColor || '#111111'}>
                        <circle cx="21" cy="6" r="2.5" />
                        <circle cx="18" cy="7" r="2" />
                        <circle cx="24" cy="7" r="2" />
                        <circle cx="16" cy="10" r="2.2" />
                        <circle cx="26" cy="10" r="2.2" />
                      </g>
                    )}
                    {obs.hairStyle === 'long' && (
                      <g>
                        {/* Mane behind head */}
                        <path d="M15 11 Q 14 22 17 22 Q 21 21 21 16 Q 26 21 26 22" stroke={obs.hairColor || '#1c1c1c'} strokeWidth="3" fill="none" strokeLinecap="round" />
                        <path d="M15.5 10 C 15.5 5, 26.5 5, 26.5 10 C 25.5 9.5, 24.5 8.5, 21 8.5 C 16.5 9, 15.5 10 Z" fill={obs.hairColor || '#1c1c1c'} stroke="#020206" strokeWidth="0.8" />
                      </g>
                    )}
                    {obs.hairStyle === 'ponytail' && (
                      <g>
                        <path d="M15.5 10 C 15.5 5, 26.5 5, 26.5 10 C 25.5 9.5, 24.5 8.5, 21 8.5 Z" fill={obs.hairColor || '#1c1c1c'} stroke="#020206" strokeWidth="0.8" />
                        <path d="M15.5 10 Q 11 15 12 20" stroke={obs.hairColor || '#111111'} strokeWidth="2.5" fill="none" strokeLinecap="round" />
                        <circle cx="16" cy="11.5" r="1.5" fill="#ef4444" />
                      </g>
                    )}
                    {obs.hairStyle === 'bun' && (
                      <g>
                        <path d="M15.5 10 C 15.5 5, 26.5 5, 26.5 10 C 25.5 9.5, 24.5 8.5, 21 8.5 Z" fill={obs.hairColor || '#1c1c1c'} stroke="#020206" strokeWidth="0.8" />
                        <circle cx="21" cy="4.5" r="3" fill={obs.hairColor || '#1c1c1c'} stroke="#020206" strokeWidth="0.8" />
                      </g>
                    )}
                    {/* Little eyes for detailed face expression */}
                    <circle cx="19" cy="11.2" r="0.6" fill="#020206" />
                  </g>
                </svg>
              )}
            </div>
          );
        })}
      </div>

      {/* COMPOUND V FLOATING COLLECTIBLES */}
      <div id="items-container">
        {activeItemList.map((item, idx) => {
          return (
            <div
              key={`item-${item.id}-${idx}`}
              id={`item-${item.id}`}
              className="absolute z-[15] pointer-events-none"
              style={{
                width: `${item.width}px`,
                height: `${item.height}px`,
                bottom: `${item.bottom}px`,
                transform: `translateX(${item.x}px)`,
              }}
            >
              <div 
                className="w-full h-full"
                style={{ animation: 'floatItem 1s infinite ease-in-out alternate' }}
              >
                <svg width="100%" height="100%" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="v-liquid" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#00ffff"/><stop offset="100%" stopColor="#0044ff"/></linearGradient>
                  <linearGradient id="v-glass" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="rgba(255,255,255,0.85)"/><stop offset="40%" stopColor="rgba(255,255,255,0.25)"/><stop offset="100%" stopColor="rgba(250,255,255,0.55)"/></linearGradient>
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
            </div>
          );
        })}
      </div>

      {/* PARTICLES ENGINE */}
      <div id="particles-container"></div>

      {/* Style Animations helpers */}
      {isPaused && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="w-[400px] bg-slate-950/92 border-4 border-indigo-500 rounded-3xl p-10 shadow-[0_0_50px_rgba(99,102,241,0.22)] flex flex-col items-center gap-4 backdrop-blur text-center relative">
            <h2 className="font-mono text-4xl tracking-tighter text-glow-blue italic font-black text-white leading-none uppercase">PAUSADO</h2>
            <p className="font-tech text-[10px] tracking-[0.2em] text-cyan-400 font-bold uppercase mb-4 select-none animate-pulse">SISTEMA VOUGHT EM ESPERA</p>
            
            <div className="flex flex-col gap-3 w-full">
              <button
                onClick={() => {
                  setIsPaused(false);
                  isPausedRef.current = false;
                }}
                className="w-full flex items-center justify-center gap-2.5 px-6 py-4 bg-gradient-to-r from-cyan-500 via-indigo-600 to-fuchsia-600 hover:from-cyan-400 hover:via-indigo-500 hover:to-fuchsia-500 border-2 border-cyan-400 text-white font-mono text-xs tracking-widest font-black rounded-xl shadow-[0_0_20px_rgba(6,182,212,0.4)] transition duration-155 hover:scale-[1.02] active:scale-[0.98] cursor-pointer uppercase"
              >
                Continuar
              </button>
              <button
                onClick={onQuit}
                className="w-full flex items-center justify-center gap-2.5 px-6 py-4 bg-slate-900 hover:bg-slate-800 border-2 border-slate-700 text-red-400 hover:text-red-300 hover:border-red-500/50 font-mono text-xs tracking-widest font-black rounded-xl transition duration-155 hover:scale-[1.02] active:scale-[0.98] cursor-pointer uppercase"
              >
                Menu Principal
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes civilianWalkLegFront {
          0% { transform: rotate(-30deg); }
          50% { transform: rotate(25deg); }
          100% { transform: rotate(-30deg); }
        }
        @keyframes civilianWalkLegBack {
          0% { transform: rotate(25deg); }
          50% { transform: rotate(-30deg); }
          100% { transform: rotate(25deg); }
        }
        @keyframes civilianWalkArmFront {
          0% { transform: rotate(35deg); }
          100% { transform: rotate(-35deg); }
        }
        @keyframes civilianWalkArmBack {
          0% { transform: rotate(-35deg); }
          100% { transform: rotate(35deg); }
        }
        @keyframes civilianWalkTorso {
          0% { transform: translateY(0px) rotate(-1deg); }
          100% { transform: translateY(1.5px) rotate(1.5deg); }
        }

        @keyframes homelanderFly {
          0% { transform: translateY(0px) rotate(3deg); }
          50% { transform: translateY(-13px) rotate(-1.5deg); }
          100% { transform: translateY(0px) rotate(3deg); }
        }
        @keyframes capeWave {
          0% { transform: scaleX(0.96) skewY(-1deg) rotate(-1deg); }
          100% { transform: scaleX(1.15) skewY(5deg) rotate(3deg); }
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
          0% { transform: translateY(0px) rotate(7deg); }
          100% { transform: translateY(4px) rotate(10deg); }
        }
        @keyframes floatItem {
          0% { transform: translateY(0px); }
          100% { transform: translateY(-10px); }
        }
        @keyframes trailPulse {
          0% { transform: scaleX(0.9) scaleY(1); opacity: 0.75; }
          100% { transform: scaleX(1.15) scaleY(0.85); opacity: 0.45; }
        }
        
        /* Removed heavy layout transition matrix interpolations on character limbs to fix extreme lag when crouching/jumping */

        /* Running cycles only active when player has the .running class */
        .running .at-leg-front {
          transform-origin: 21px 38px;
          animation: legRunFront 0.18s infinite linear;
          transition: none !important;
        }
        .running .at-leg-back {
          transform-origin: 15px 38px;
          animation: legRunBack 0.18s infinite linear;
          transition: none !important;
        }
        .running .at-torso-group {
          transform-origin: 17px 35px;
          animation: torsoBob 0.09s infinite ease-in-out alternate;
          transition: none !important;
        }
        .running .at-arm {
          transform-origin: 23px 21px;
          animation: armRun 0.18s infinite ease-in-out alternate;
          transition: none !important;
        }
        .running .at-arm-back {
          transform-origin: 15px 21px;
          animation: armRunBack 0.18s infinite ease-in-out alternate;
          transition: none !important;
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
          transform: translateY(16px);
        }
        .crouching .at-torso-group {
          transform: rotate(25deg) translate(2px, 3px) !important;
        }
        .crouching .at-leg-front {
          transform: rotate(-55deg) translate(3px, -4px) !important;
          transition: none !important;
        }
        .crouching .at-leg-back {
          transform: rotate(55deg) translate(-2px, -4px) !important;
          transition: none !important;
        }
        .crouching .at-arm {
          transform: rotate(-75deg) translate(1px, -1px) !important;
          transition: none !important;
        }
        .crouching .at-arm-back {
          transform: rotate(75deg) translate(-1px, -1px) !important;
          transition: none !important;
        }
        
        /* Realistic Dying States - Crash Tumble, slide and stop flat on floor */
        .dying .atrain-svg {
          transform-origin: 20px 50px;
          animation: atrainRealisticDeath 1.1s cubic-bezier(0.1, 0.8, 0.3, 1) forwards !important;
          transition: none !important;
        }
        .dying .at-torso-group {
          transform: rotate(85deg) translate(6px, 14px) !important;
          transition: transform 0.25s cubic-bezier(0.25, 0.8, 0.25, 1) !important;
        }
        .dying .at-leg-front {
          transform: rotate(-80deg) translate(4px, -10px) !important;
          transition: transform 0.25s cubic-bezier(0.25, 0.8, 0.25, 1) !important;
        }
        .dying .at-leg-back {
          transform: rotate(85deg) translate(-6px, -4px) !important;
          transition: transform 0.25s cubic-bezier(0.25, 0.8, 0.25, 1) !important;
        }
        .dying .at-arm {
          transform: rotate(-135deg) translate(2px, 2px) !important;
          transition: transform 0.25s cubic-bezier(0.25, 0.8, 0.25, 1) !important;
        }
        .dying .at-arm-back {
          transform: rotate(115deg) translate(-2px, 2px) !important;
          transition: transform 0.25s cubic-bezier(0.25, 0.8, 0.25, 1) !important;
        }

        @keyframes atrainRealisticDeath {
          0% {
            transform: translateY(0px) rotate(0deg) translateX(0px);
          }
          15% {
            /* Leap backward/upward from crash impact, starting first forward roll tumbling */
            transform: translateY(-28px) rotate(55deg) translateX(-12px);
          }
          35% {
            /* Midair full roll tumbling */
            transform: translateY(-14px) rotate(140deg) translateX(-25px);
          }
          55% {
            /* Crash down on ground on shoulders */
            transform: translateY(2px) rotate(220deg) translateX(-42px);
          }
          75% {
            /* Sliding friction flat roll */
            transform: translateY(4px) rotate(270deg) translateX(-62px);
          }
          100% {
            /* Completely flat skidded and slumped to rest on the dirt tracks */
            transform: translateY(4px) rotate(270deg) translateX(-78px);
          }
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
