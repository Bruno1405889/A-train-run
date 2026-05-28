import { useState, useEffect, useRef } from 'react';
import { submitScore, fetchUserPersonalBest, isFirebaseDummy } from './firebaseService';
import { generateRandomNickname } from './components/VoughtNicknames';
import { motion, AnimatePresence } from 'motion/react';
import GameArea from './components/GameArea';
import Leaderboard from './components/Leaderboard';
import { 
  Trophy, 
  Play, 
  LogOut, 
  Check, 
  User as UserIcon, 
  ShieldAlert, 
  Zap, 
  Sparkles, 
  BookOpen, 
  RefreshCw,
  Info,
  Users
} from 'lucide-react';

interface GameUser {
  uid: string;
  displayName: string;
  photoURL?: string;
  isGuest: boolean;
}

interface Achievement {
  id: string;
  title: string;
  description: string;
  conditionDescription: string;
  iconType: 'distance' | 'collect' | 'v1';
}

const ACHIEVEMENTS_DEF: Achievement[] = [
  { id: 'dist_100', title: 'Velocidade Inicial', description: 'Correu 100 metros com sucesso!', conditionDescription: 'Corra 100m', iconType: 'distance' },
  { id: 'dist_500', title: 'Super Velocista', description: 'Rompeu as barreiras dos 500 metros!', conditionDescription: 'Corra 500m', iconType: 'distance' },
  { id: 'dist_1000', title: 'O Trem-Bala', description: 'Correu 1000 metros e ultrapassou os limites!', conditionDescription: 'Corra 1000m', iconType: 'distance' },
  { id: 'collect_1', title: 'Fórmula Secreta', description: 'Coletou seu primeiro frasco de Composto V!', conditionDescription: 'Colete 1 Composto V', iconType: 'collect' },
  { id: 'collect_5', title: 'Dose Química', description: 'Coletou 5 frascos de Composto V nesta corrida!', conditionDescription: 'Colete 5 Compostos V', iconType: 'collect' },
  { id: 'activate_v1', title: 'Poder Atômico', description: 'Ativou o soro de invisibilidade e supervelocidade V1!', conditionDescription: 'Ative o V1 manualmente (Tecla E)', iconType: 'v1' },
];

export default function App() {
  const [user, setUser] = useState<GameUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [screen, setScreen] = useState<'login' | 'menu' | 'playing' | 'gameover' | 'leaderboard'>('login');
  
  // Scoring parameters
  const [lastScore, setLastScore] = useState(0);
  const [personalBest, setPersonalBest] = useState(0);
  const [scoreSubmitted, setScoreSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form Inputs
  const [guestName, setGuestName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showAbout, setShowAbout] = useState(false);
  const [showTeam, setShowTeam] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);

  // Achievements states
  const [unlockedIds, setUnlockedIds] = useState<string[]>([]);
  const unlockedIdsRef = useRef<string[]>([]);
  const [notifications, setNotifications] = useState<{ id: string; title: string; description: string }[]>([]);
  const [runVCollected, setRunVCollected] = useState(0);

  // Sync ref with current unlockedIds state
  useEffect(() => {
    unlockedIdsRef.current = unlockedIds;
  }, [unlockedIds]);

  // Difficulty configurations (speed multipliers)
  const [speedMultiplier, setSpeedMultiplier] = useState(1.0);

  useEffect(() => {
    // Check local guest sessions
    const savedGuest = localStorage.getItem('atrain_guest_user');
    if (savedGuest) {
      try {
        const guestObj = JSON.parse(savedGuest) as GameUser;
        setUser(guestObj);
        setScreen('menu');
        
        // Fetch Personal Best from LocalStorage
        const localPb = localStorage.getItem(`atrain_pb_${guestObj.displayName}`);
        setPersonalBest(localPb ? parseInt(localPb, 10) : 0);
      } catch (e) {
        setUser(null);
        setScreen('login');
      }
    } else {
      setUser(null);
      setScreen('login');
    }
    
    setAuthLoading(false);
    setGuestName(generateRandomNickname());
  }, []);

  useEffect(() => {
    if (user) {
      const unlocked: string[] = [];
      ACHIEVEMENTS_DEF.forEach(ach => {
        const key = `atrain_ach_${user.displayName}_${ach.id}`;
        if (localStorage.getItem(key) === 'true') {
          unlocked.push(ach.id);
        }
      });
      setUnlockedIds(unlocked);
    } else {
      setUnlockedIds([]);
    }
  }, [user]);

  const handleStartGame = () => {
    setRunVCollected(0);
    setScreen('playing');
  };

  const handleGameEvent = (type: string, value?: any) => {
    if (!user) return;

    const unlock = (id: string) => {
      // Avoid state set if already listed as unlocked
      if (unlockedIdsRef.current.includes(id)) return;

      const key = `atrain_ach_${user.displayName}_${id}`;
      if (localStorage.getItem(key) === 'true') {
        if (!unlockedIdsRef.current.includes(id)) {
          setUnlockedIds(prev => {
            if (prev.includes(id)) return prev;
            return [...prev, id];
          });
        }
        return;
      }

      localStorage.setItem(key, 'true');
      setUnlockedIds(prev => {
        if (prev.includes(id)) return prev;
        return [...prev, id];
      });

      const ach = ACHIEVEMENTS_DEF.find(a => a.id === id);
      if (ach) {
        const uniqueId = `${id}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const newNotif = {
          id: uniqueId,
          title: ach.title,
          description: ach.description
        };
        setNotifications(prev => [...prev, newNotif]);

        setTimeout(() => {
          setNotifications(prev => prev.filter(n => n.id !== uniqueId));
        }, 4500);
      }
    };

    if (type === 'score') {
      const currentScore = value as number;
      if (currentScore >= 100) unlock('dist_100');
      if (currentScore >= 500) unlock('dist_500');
      if (currentScore >= 1000) unlock('dist_1000');
    } else if (type === 'collect-v') {
      setRunVCollected(prev => {
        const next = prev + 1;
        if (next >= 1) unlock('collect_1');
        if (next >= 5) unlock('collect_5');
        return next;
      });
    } else if (type === 'activate-v1') {
      unlock('activate_v1');
    }
  };

  const handleGuestLogin = () => {
    const sanitized = guestName.trim().replace(/[^a-zA-Z0-9_\-\s]/g, '');
    if (!sanitized) {
      setErrorMessage('Por favor, defina um nome válido!');
      return;
    }
    if (sanitized.length > 20) {
      setErrorMessage('Escolha um nome de no máximo 20 letras.');
      return;
    }

    const guestId = `player_${Math.random().toString(36).substring(2, 9)}`;
    const guestUser: GameUser = {
      uid: guestId,
      displayName: sanitized,
      isGuest: true
    };

    localStorage.setItem('atrain_guest_user', JSON.stringify(guestUser));
    setUser(guestUser);
    
    // Read local personal best
    const savedPb = localStorage.getItem(`atrain_pb_${sanitized}`);
    setPersonalBest(savedPb ? parseInt(savedPb, 10) : 0);
    
    setScreen('menu');
  };

  const handleLogout = () => {
    localStorage.removeItem('atrain_guest_user');
    setUser(null);
    setScreen('login');
  };

  const handleGenerateName = () => {
    setGuestName(generateRandomNickname());
  };

  const handleGameOver = async (score: number) => {
    setLastScore(score);
    setScreen('gameover');
    setScoreSubmitted(false);

    // Save personal best if broken
    if (score > personalBest) {
      setPersonalBest(score);
      if (user) {
        localStorage.setItem(`atrain_pb_${user.displayName}`, score.toString());
      }
    }

    // Auto record valid high scores (> 3 meters) to Leaderboard
    const shouldSubmit = score > 3 && user;
    if (shouldSubmit) {
      setSubmitting(true);
      try {
        await submitScore({
          userId: `guest_${user.displayName}`,
          username: user.displayName,
          photoURL: user.photoURL || '',
          score: score,
          isGuest: true
        });
        setScoreSubmitted(true);
      } catch (err) {
        console.error('Failed to submit score:', err);
      } finally {
        setSubmitting(false);
      }
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#020207] text-slate-100 flex flex-col justify-center items-center relative p-6 overflow-hidden select-none">
      
      {/* Immersive background loop video from files */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover z-0 opacity-40 filter brightness-[0.35] pointer-events-none"
      >
        <source src="/bg-video.mp4" type="video/mp4" />
      </video>

      {/* Background Matrix & CRT scanline retro atmosphere styling */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.3)_50%),linear-gradient(90deg,rgba(0,255,255,0.03),rgba(255,0,0,0.02),rgba(0,0,255,0.03))] bg-[size:100%_4px,4px_100%] pointer-events-none z-50 opacity-20" />
      <div className="absolute inset-0 bg-radial-gradient from-transparent via-[#010103]/85 to-[#010103] pointer-events-none z-10" />

      {authLoading ? (
        <div className="flex flex-col items-center gap-4 z-20">
          <RefreshCw className="animate-spin text-cyan-400" size={40} />
          <span className="font-mono text-xs tracking-wider text-cyan-400 animate-pulse uppercase">Carregando Sistema...</span>
        </div>
      ) : (
        <>
          <AnimatePresence mode="wait">
          
          {/* SCREEN: ARCHIVE LOGIN */}
          {screen === 'login' && (
            <motion.div 
              key="login"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="w-full max-w-[490px] bg-slate-950/92 border-4 border-cyan-500 rounded-3xl p-10 relative shadow-[0_0_50px_rgba(6,182,212,0.22)] backdrop-blur text-center z-20"
            >
              {/* Vought Tech header emblem badge */}
              <div className="mx-auto w-10 h-10 bg-gradient-to-br from-cyan-600 to-blue-700 border-2 border-cyan-400 rounded-xl flex items-center justify-center shadow-[0_0_12px_rgba(6,182,212,0.5)] mb-4 select-none">
                <Zap className="text-white fill-white animate-pulse" size={18} />
              </div>

              <h1 className="font-mono text-3xl tracking-tighter text-glow-blue italic font-black text-white uppercase leading-none">
                A-TRAIN RUN
              </h1>
              <p className="font-tech text-[10px] tracking-[0.2em] text-cyan-400 font-bold uppercase mb-6 select-none">
                VOUGHT RACING SYSTEM
              </p>

              {errorMessage && (
                <div className="mb-5 text-[11px] font-mono bg-red-950/70 border border-red-500/50 rounded-xl p-3 text-red-400 flex items-center gap-2 text-left">
                  <ShieldAlert size={14} className="shrink-0 text-red-500" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Login Actions Option cards */}
              <div className="flex flex-col gap-4">
                
                {/* Local Guest profile */}
                <div className="bg-slate-950 p-4 rounded-xl border-2 border-slate-800 text-left">
                  <label className="block text-[9.5px] font-mono text-slate-400 uppercase tracking-widest mb-2">
                    CRIAR SUA CONTA LOCAL:
                  </label>
                  
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="Nome do corredor..."
                      maxLength={20}
                      className="flex-1 bg-slate-900 border border-slate-700 px-3 py-2 rounded-lg text-xs font-mono text-slate-100 outline-none focus:border-cyan-400 transition"
                    />
                    <button
                      onClick={handleGenerateName}
                      title="Sugerir Nickname"
                      className="p-2 border border-slate-700 bg-slate-800 hover:bg-slate-700 rounded-lg text-cyan-400 hover:text-cyan-300 transition duration-150 active:scale-95"
                    >
                      <RefreshCw size={15} />
                    </button>
                  </div>

                  <button
                    onClick={handleGuestLogin}
                    className="w-full mt-3 py-3 bg-gradient-to-r from-cyan-600 to-blue-700 hover:from-cyan-500 hover:to-blue-600 text-white font-mono text-[11px] tracking-widest rounded-xl border-2 border-cyan-400/80 transition duration-150 active:scale-95 uppercase font-bold"
                  >
                    Iniciar Jogo
                  </button>
                </div>
              </div>

              {/* Rules Manual controls panel */}
              <div className="mt-6 pt-5 border-t border-slate-800 text-left">
                <p className="uppercase font-mono text-[10px] text-slate-400 font-bold flex items-center gap-1 mb-3 select-none">
                  <BookOpen size={12} className="text-cyan-400" /> GUIA DE CONTROLES:
                </p>
                <div className="space-y-2.5 text-[10.5px] font-sans text-slate-400">
                  <div className="flex items-center justify-between">
                    <span>Pular</span>
                    <span className="font-mono text-[9.5px] bg-slate-950 px-2 py-0.5 rounded border border-slate-700 text-cyan-400 select-all font-bold">ESPAÇO / SETA CIMA</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Abaixar (Esquivar do Laser)</span>
                    <span className="font-mono text-[9.5px] bg-slate-950 px-2 py-0.5 rounded border border-slate-700 text-cyan-400 select-all font-bold">SETA BAIXO / S</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Ativar V-1 (Invencibilidade 3s)</span>
                    <span className="font-mono text-[9.5px] bg-slate-950 px-2 py-0.5 rounded border border-slate-700 text-fuchsia-400 select-all font-bold">TECLA E</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* SCREEN: MAIN MENU */}
          {screen === 'menu' && user && (
            <motion.div 
              key="menu"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="w-full max-w-[490px] bg-slate-950/92 border-4 border-indigo-500 rounded-3xl p-10 shadow-[0_0_50px_rgba(99,102,241,0.22)] backdrop-blur text-center z-10 relative"
            >
              {/* Profile Card & Session status block */}
              <div className="flex items-center justify-between bg-slate-950 p-4 rounded-xl border-2 border-slate-800 mb-6 text-left">
                <div className="flex items-center gap-3.5 min-w-0">
                  {user.photoURL ? (
                    <img 
                      referrerPolicy="no-referrer"
                      src={user.photoURL} 
                      alt={user.displayName} 
                      className="w-10 h-10 rounded-full border-2 border-cyan-400 object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center border-2 border-amber-500 select-none">
                      <UserIcon size={18} className="text-slate-400" />
                    </div>
                  )}

                  <div className="min-w-0 flex flex-col">
                    <span className="truncate font-mono text-xs font-black text-white uppercase tracking-wider">
                      {user.displayName}
                    </span>
                    <div className="mt-0.5 select-none text-[8px] font-mono uppercase tracking-widest">
                      <span className="bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded text-amber-400">Atleta Vought</span>
                    </div>
                  </div>
                </div>

                <button 
                  onClick={handleLogout}
                  className="p-1.5 text-slate-500 hover:text-red-400 rounded transition duration-150 active:scale-95"
                  title="Sair"
                >
                  <LogOut size={16} />
                </button>
              </div>

              <h1 className="font-mono text-3xl tracking-tighter text-glow-blue italic font-black text-white leading-none">
                A-TRAIN RUN
              </h1>
              <p className="font-tech text-[9px] tracking-[0.2em] text-cyan-400 font-bold uppercase mb-6 select-none animate-pulse">
                CAMPANHA DE DESEMPENHO COSMO
              </p>

              {/* Record PB Panel */}
              <div className="mb-6 bg-gradient-to-r from-cyan-950/20 to-indigo-950/30 border-2 border-cyan-500/30 rounded-xl p-4 flex items-center justify-between select-none">
                <div className="flex items-center gap-2 text-cyan-400">
                  <Trophy size={18} className="text-yellow-400" />
                  <span className="font-mono text-[10px] tracking-widest uppercase">Recorde Pessoal:</span>
                </div>
                <span className="font-mono text-lg font-black text-cyan-300 text-glow-blue">{personalBest}m</span>
              </div>

              {/* Primary action runs */}
              <div className="flex flex-col gap-3">
                <button
                  onClick={handleStartGame}
                  className="w-full flex items-center justify-center gap-2.5 px-6 py-4 bg-gradient-to-r from-cyan-500 via-indigo-600 to-fuchsia-600 hover:from-cyan-400 hover:via-indigo-500 hover:to-fuchsia-500 border-2 border-cyan-400 text-white font-mono text-xs tracking-widest font-black rounded-xl shadow-[0_0_20px_rgba(6,182,212,0.4)] transition duration-155 hover:scale-[1.02] active:scale-[0.98] cursor-pointer uppercase"
                >
                  <Play size={15} strokeWidth={3} className="text-white fill-white" />
                  Iniciar Corrida
                </button>
                <button
                  onClick={() => setShowAbout(true)}
                  className="w-full flex items-center justify-center gap-2.5 px-6 py-3 bg-slate-800 hover:bg-slate-700 border-2 border-slate-700 hover:border-slate-600 text-slate-200 font-mono text-[10px] tracking-widest font-bold rounded-xl transition duration-150 active:scale-95 uppercase"
                >
                  <Info size={14} className="text-slate-400" />
                  Sobre
                </button>
                <button
                  onClick={() => setShowTeam(true)}
                  className="w-full flex items-center justify-center gap-2.5 px-6 py-3 bg-slate-800 hover:bg-slate-700 border-2 border-slate-700 hover:border-slate-600 text-slate-200 font-mono text-[10px] tracking-widest font-bold rounded-xl transition duration-150 active:scale-95 uppercase"
                >
                  <Users size={14} className="text-slate-400" />
                  Equipe do projeto
                </button>
                <button
                  onClick={() => setShowAchievements(true)}
                  className="w-full flex items-center justify-center gap-2.5 px-6 py-3 bg-slate-800 hover:bg-slate-700 border-2 border-slate-700 hover:border-slate-600 text-slate-200 font-mono text-[10px] tracking-widest font-bold rounded-xl transition duration-150 active:scale-95 uppercase"
                >
                  <Trophy size={14} className="text-yellow-400" />
                  Conquistas
                </button>
              </div>

              {/* Difficulty speeds settings */}
              <div className="mt-6 pt-5 border-t border-slate-850 flex items-center justify-between select-none font-mono text-[9px] uppercase tracking-wider">
                <span className="text-slate-500">Dificuldade Inicial:</span>
                <div className="flex gap-1">
                  <button 
                    onClick={() => setSpeedMultiplier(0.85)} 
                    className={`px-2 py-1 rounded-md border text-[9px] transition uppercase font-bold cursor-pointer ${speedMultiplier === 0.85 ? 'border-amber-400 bg-amber-500/10 text-amber-400' : 'border-slate-800 text-slate-600 hover:text-slate-400'}`}
                  >
                    Fácil
                  </button>
                  <button 
                    onClick={() => setSpeedMultiplier(1.0)} 
                    className={`px-2 py-1 rounded-md border text-[9px] transition uppercase font-bold cursor-pointer ${speedMultiplier === 1.0 ? 'border-cyan-400 bg-cyan-500/10 text-cyan-400' : 'border-slate-800 text-slate-600 hover:text-slate-400'}`}
                  >
                    Normal
                  </button>
                  <button 
                    onClick={() => setSpeedMultiplier(1.2)} 
                    className={`px-2 py-1 rounded-md border text-[9px] transition uppercase font-bold cursor-pointer ${speedMultiplier === 1.2 ? 'border-red-400 bg-red-500/10 text-red-400' : 'border-slate-800 text-slate-600 hover:text-slate-400'}`}
                  >
                    Herói
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* SCREEN: ACTIVE GAME ENGINE AREA */}
          {screen === 'playing' && (
            <motion.div 
              key="playing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="z-10"
            >
              <GameArea 
                isPlaying={screen === 'playing'}
                onGameOver={handleGameOver}
                onQuit={() => setScreen('menu')}
                speedMultiplier={speedMultiplier}
                onGameEvent={handleGameEvent}
              />
            </motion.div>
          )}

          {/* SCREEN: GAME OVER WRAPUP */}
          {screen === 'gameover' && user && (
            <motion.div 
              key="gameover"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-[450px] bg-slate-950/92 border-4 border-red-500 rounded-3xl p-10 shadow-[0_0_50px_rgba(239,68,68,0.22)] backdrop-blur text-center z-20"
            >
              <h1 className="font-mono text-3xl tracking-tighter text-glow-red italic font-black text-red-500 uppercase mb-3 select-none">
                FIM DE JOGO
              </h1>

              {/* Result indicators card */}
              <div className="bg-slate-950 p-5 rounded-2xl border-2 border-slate-800 text-center mb-5 select-none">
                <span className="block text-[9px] font-mono text-slate-500 uppercase tracking-widest mb-1">Resultado da Corrida</span>
                <span className="block font-mono text-3xl font-black text-cyan-400 text-glow-blue">{lastScore}m</span>
                
                {lastScore > 0 && lastScore >= personalBest && (
                  <div className="mt-3 inline-flex items-center gap-1.5 bg-yellow-500/10 border border-yellow-500/30 px-3 py-1 rounded-md text-[9px] font-mono text-yellow-400 uppercase tracking-wider animate-pulse">
                    <Sparkles size={11} className="text-yellow-400" /> Recorde Batido !
                  </div>
                )}
              </div>

              {/* Database sync information status feedback */}
              <div className="mb-6 py-2 px-3 bg-slate-950 rounded-lg border border-slate-800 text-center select-none font-mono text-[9px]">
                {submitting ? (
                  <span className="text-cyan-400 tracking-wider animate-pulse uppercase">Gravando resultado no Placar Vought...</span>
                ) : scoreSubmitted ? (
                  <span className="text-emerald-400 tracking-wider flex items-center justify-center gap-1 uppercase font-bold">
                    <Check size={12} strokeWidth={3} /> {isFirebaseDummy() ? "Recorde Gravado no Placar Local!" : "Corrida Registrada com Sucesso!"}
                  </span>
                ) : lastScore <= 3 ? (
                  <span className="text-slate-500 tracking-wider uppercase">Pontuação mínima não alcançada para o ranking.</span>
                ) : (
                  <span className="text-amber-400 tracking-wider uppercase font-bold">Recorde de {personalBest}m salvo localmente.</span>
                )}
              </div>

              {/* Post game buttons layout */}
              <div className="flex flex-col gap-2.5">
                <button
                  onClick={handleStartGame}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 border-2 border-red-400 text-white font-mono text-xs tracking-widest font-black rounded-xl shadow-lg transition duration-150 active:scale-95 cursor-pointer uppercase"
                >
                  Correr Novamente
                </button>

                <button
                  onClick={() => setScreen('menu')}
                  className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 border-2 border-slate-700 text-slate-300 hover:text-white font-mono text-xs tracking-wider rounded-xl transition duration-150 active:scale-95 cursor-pointer uppercase"
                >
                  Menu Inicial
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* SCREEN: ABOUT MODAL */}
        <AnimatePresence>
          {showAbout && (
            <motion.div
              key="modal-about"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm shadow-2xl"
            >
              <div className="w-full max-w-[400px] bg-slate-900 border-2 border-cyan-500 rounded-3xl p-8 relative flex flex-col text-left text-slate-200">
                <h2 className="font-mono text-xl text-glow-blue italic font-black text-white uppercase mb-4 flex items-center gap-2">
                  <Info size={20} className="text-cyan-400" /> Sobre o Jogo
                </h2>
                <p className="font-sans text-sm leading-relaxed mb-6">
                  Um jogo inspirado no T-rex game do Chrome, mas com temática de The boys, o jogo segue o mesmo estilo do famoso "jogo do dinossauro do Chrome", mas com algumas mecânicas diferentes, mapa, personagens, menu e temática.
                </p>
                <button
                  onClick={() => setShowAbout(false)}
                  className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-mono text-[11px] tracking-widest rounded-xl transition duration-150 active:scale-95 uppercase font-bold"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          )}

          {/* SCREEN: TEAM MODAL */}
          {showTeam && (
            <motion.div
              key="modal-team"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm shadow-2xl"
            >
              <div className="w-full max-w-[400px] bg-slate-900 border-2 border-indigo-500 rounded-3xl p-8 relative flex flex-col text-left text-slate-200">
                <h2 className="font-mono text-xl text-glow-blue italic font-black text-white uppercase mb-5 flex items-center gap-2">
                  <Users size={20} className="text-indigo-400" /> Equipe do projeto
                </h2>
                <div className="flex flex-col gap-4 mb-6">
                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                    <h3 className="font-mono text-sm font-bold text-green-500 uppercase">Bruno</h3>
                    <p className="font-sans text-xs text-slate-400 mt-1">Desenvolvedor, Designer</p>
                  </div>
                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                    <h3 className="font-mono text-sm font-bold text-white uppercase">Breno</h3>
                    <p className="font-sans text-xs text-slate-400 mt-1">Roteirista, Designer</p>
                  </div>
                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                    <h3 className="font-mono text-sm font-bold text-red-500 uppercase">Henrrique(Xurrasco)</h3>
                    <p className="font-sans text-xs text-slate-400 mt-1">Designer</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowTeam(false)}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-[11px] tracking-widest rounded-xl transition duration-150 active:scale-95 uppercase font-bold"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          )}

          {/* SCREEN: ACHIEVEMENTS MODAL */}
          {showAchievements && (
            <motion.div
              key="modal-achievements"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm shadow-2xl"
            >
              <div className="w-full max-w-[430px] max-h-[90vh] bg-slate-900 border-2 border-yellow-500 rounded-3xl p-8 relative flex flex-col text-left text-slate-200 overflow-hidden">
                <h2 className="font-mono text-xl text-glow-blue italic font-black text-white uppercase mb-1 flex items-center gap-2">
                  <Trophy size={20} className="text-yellow-400" /> Suas Conquistas
                </h2>
                <p className="font-tech text-[8px] tracking-[0.15em] text-yellow-500 uppercase font-bold mb-4 select-none">
                  Métricas de Desempenho Vought
                </p>

                <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3 mb-6 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-slate-950">
                  {ACHIEVEMENTS_DEF.map((ach, idx) => {
                    const isUnlocked = unlockedIds.includes(ach.id);
                    return (
                      <div 
                        key={`ach-${ach.id}-${idx}`} 
                        className={`p-3.5 rounded-xl border transition-all duration-200 ${
                          isUnlocked 
                            ? 'bg-gradient-to-r from-yellow-950/25 to-slate-950 border-yellow-500/50 shadow-[0_0_12px_rgba(234,179,8,0.08)]' 
                            : 'bg-slate-950/40 border-slate-800/80 opacity-60'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                            isUnlocked 
                              ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400' 
                              : 'bg-slate-900 border-slate-800 text-slate-600'
                          }`}>
                            {ach.iconType === 'distance' && <Zap size={15} />}
                            {ach.iconType === 'collect' && <Sparkles size={15} />}
                            {ach.iconType === 'v1' && <BookOpen size={15} />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <h3 className={`font-mono text-[11.5px] font-black uppercase tracking-wider ${
                                isUnlocked ? 'text-white' : 'text-slate-500'
                              }`}>
                                {ach.title}
                              </h3>
                              <span className={`font-mono text-[8px] uppercase px-1.5 py-0.5 rounded border ${
                                isUnlocked 
                                  ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400' 
                                  : 'bg-slate-900 border-slate-800/50 text-slate-500'
                              }`}>
                                {isUnlocked ? 'Desbloqueado' : 'Bloqueado'}
                              </span>
                            </div>
                            <p className="font-sans text-[11px] text-slate-400 mt-1">
                              {ach.description}
                            </p>
                            <p className="font-mono text-[8.5px] text-slate-500 uppercase tracking-widest mt-1.5 flex items-center gap-1">
                              <span className="w-1 h-1 rounded-full bg-slate-600" />
                              Requisito: {ach.conditionDescription}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button
                  onClick={() => setShowAchievements(false)}
                  className="w-full py-3 bg-yellow-600 hover:bg-yellow-500 text-white font-mono text-[11px] tracking-widest rounded-xl transition duration-150 active:scale-95 uppercase font-bold"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Dynamic Achievement Notifications Overlay */}
        <div className="fixed top-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none max-w-sm w-full">
          <AnimatePresence>
            {notifications.map((notif, idx) => (
              <motion.div
                key={`notif-${notif.id}-${idx}`}
                initial={{ opacity: 0, x: 50, y: -20, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 50, scale: 0.9, transition: { duration: 0.2 } }}
                className="bg-slate-950/95 border-2 border-yellow-500 rounded-2xl p-4 shadow-[0_0_25px_rgba(234,179,8,0.30)] backdrop-blur text-left flex gap-3 pointer-events-auto select-none"
              >
                <div className="w-10 h-10 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-center justify-center shrink-0">
                  <Trophy className="text-yellow-400" size={18} />
                </div>
                <div>
                  <span className="block text-[9px] font-mono text-yellow-500 tracking-widest uppercase font-black">Conquista Desbloqueada!</span>
                  <span className="block font-mono text-sm font-bold text-white uppercase mt-0.5">{notif.title}</span>
                  <span className="block font-sans text-xs text-slate-400 mt-1">{notif.description}</span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </>
    )}
  </div>
);
}
