import { useState, useEffect } from 'react';
import { auth, googleProvider, signInWithPopup, signOut } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
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
  RefreshCw 
} from 'lucide-react';

interface GameUser {
  uid: string;
  displayName: string;
  photoURL?: string;
  isGuest: boolean;
}

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

  // Difficulty configurations (speed multipliers)
  const [speedMultiplier, setSpeedMultiplier] = useState(1.0);

  // Handle Firebase auth state updates
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: User | null) => {
      setAuthLoading(true);
      if (firebaseUser) {
        const loggedUser: GameUser = {
          uid: firebaseUser.uid,
          displayName: firebaseUser.displayName || 'Corredor Anônimo',
          photoURL: firebaseUser.photoURL || '',
          isGuest: false
        };
        setUser(loggedUser);
        setScreen('menu');
        
        // Fetch Personal Best from Cloud Database
        const cloudPb = await fetchUserPersonalBest(firebaseUser.uid);
        setPersonalBest(cloudPb);
      } else {
        // No Google user, check local guest sessions
        const savedGuest = localStorage.getItem('atrain_guest_user');
        if (savedGuest) {
          try {
            const guestObj = JSON.parse(savedGuest) as GameUser;
            setUser(guestObj);
            setScreen('menu');
            
            // Fetch Personal Best from LocalStorage for Guests
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
      }
      setAuthLoading(false);
    });

    setGuestName(generateRandomNickname());

    return () => unsubscribe();
  }, []);

  // Google authentication popup
  const handleGoogleLogin = async () => {
    setErrorMessage(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.error(err);
      setErrorMessage('Falha ao autenticar com o Google. Tente novamente.');
    }
  };

  // Guest authentication login
  const handleGuestLogin = () => {
    const sanitized = guestName.trim().replace(/[^a-zA-Z0-9_\-\s]/g, '');
    if (!sanitized) {
      setErrorMessage('Por favor, defina um apelido válido!');
      return;
    }
    if (sanitized.length > 20) {
      setErrorMessage('Escolha um apelido de no máximo 20 letras.');
      return;
    }

    const guestId = `guest_${Math.random().toString(36).substring(2, 9)}`;
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

  const handleLogout = async () => {
    if (user?.isGuest) {
      localStorage.removeItem('atrain_guest_user');
      setUser(null);
      setScreen('login');
    } else {
      await signOut(auth);
    }
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
        // Sync guest score locally
        if (user.isGuest) {
          localStorage.setItem(`atrain_pb_${user.displayName}`, score.toString());
        }
      }
    }

    // Auto record valid high scores (> 3 meters) to Leaderboard
    const shouldSubmit = score > 3 && user && (!user.isGuest || isFirebaseDummy());
    if (shouldSubmit) {
      setSubmitting(true);
      try {
        await submitScore({
          userId: user.isGuest ? `guest_${user.displayName}` : user.uid,
          username: user.displayName,
          photoURL: user.photoURL || '',
          score: score,
          isGuest: user.isGuest
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
          <span className="font-mono text-xs tracking-wider text-cyan-400 animate-pulse uppercase">Sincronizando com o Servidor Vought...</span>
        </div>
      ) : (
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
                
                {/* Method A: Google Connection */}
                <button
                  onClick={handleGoogleLogin}
                  className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-cyan-600 to-blue-700 hover:from-cyan-500 hover:to-blue-600 border-2 border-cyan-400/80 text-white font-mono text-xs tracking-widest font-extrabold rounded-xl shadow-lg transition duration-200 hover:scale-[1.02] active:scale-[0.98] cursor-pointer uppercase"
                >
                  <svg className="w-4 h-4 shrink-0 text-cyan-200" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="currentColor"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  Conectar via Google
                </button>

                <div className="flex items-center my-1 select-none">
                  <div className="flex-1 h-[1px] bg-slate-800" />
                  <span className="px-3 font-mono text-[9px] text-slate-500 tracking-wider">OU REGISTRE VISITANTE</span>
                  <div className="flex-1 h-[1px] bg-slate-800" />
                </div>

                {/* Method B: Fast Guest profile */}
                <div className="bg-slate-950 p-4 rounded-xl border-2 border-slate-800 text-left">
                  <label className="block text-[9.5px] font-mono text-slate-400 uppercase tracking-widest mb-2">
                    NICKNAME DO ATLETA:
                  </label>
                  
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="Codinome Vought..."
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
                    className="w-full mt-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-mono text-[11px] tracking-widest rounded-lg border border-slate-700 transition duration-150 active:scale-95 uppercase font-bold"
                  >
                    Iniciar modo Visitante
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
                    <span>Pular & Duplo Salto</span>
                    <span className="font-mono text-[9.5px] bg-slate-950 px-2 py-0.5 rounded border border-slate-700 text-cyan-400 select-all font-bold">ESPAÇO / SETA CIMA</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Abaixar (Esquivar do Laser)</span>
                    <span className="font-mono text-[9.5px] bg-slate-950 px-2 py-0.5 rounded border border-slate-700 text-cyan-400 select-all font-bold">SETA BAIXO / S</span>
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
                      {user.isGuest ? (
                        <span className="bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded text-amber-400">Atleta Visitante</span>
                      ) : (
                        <span className="bg-cyan-500/15 border border-cyan-500/20 px-2 py-0.5 rounded text-cyan-300 font-bold">Inscrito Vought Elite</span>
                      )}
                    </div>
                  </div>
                </div>

                <button 
                  onClick={handleLogout}
                  className="p-1.5 text-slate-500 hover:text-red-400 rounded transition duration-150 active:scale-95"
                  title="Alterar Cadastro"
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
                  onClick={() => setScreen('playing')}
                  className="w-full flex items-center justify-center gap-2.5 px-6 py-4 bg-gradient-to-r from-cyan-500 via-indigo-600 to-fuchsia-600 hover:from-cyan-400 hover:via-indigo-500 hover:to-fuchsia-500 border-2 border-cyan-400 text-white font-mono text-xs tracking-widest font-black rounded-xl shadow-[0_0_20px_rgba(6,182,212,0.4)] transition duration-155 hover:scale-[1.02] active:scale-[0.98] cursor-pointer uppercase"
                >
                  <Play size={15} strokeWidth={3} className="text-white fill-white" />
                  Iniciar Corrida
                </button>

                <button
                  onClick={() => setScreen('leaderboard')}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-slate-900 hover:bg-slate-800 border-2 border-slate-700 text-slate-300 hover:text-white font-mono text-xs tracking-wider rounded-xl transition duration-155 active:scale-95 cursor-pointer"
                >
                  <Trophy size={14} className="text-yellow-400" />
                  Placar de Líderes Geral
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
                speedMultiplier={speedMultiplier}
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
                ) : user.isGuest && !isFirebaseDummy() ? (
                  <span className="text-amber-400 tracking-wider uppercase font-bold">Modo Visitante: Recorde de {personalBest}m salvo localmente.</span>
                ) : (
                  <span className="text-red-400 tracking-wider uppercase">Erro ao conectar com servidor Vought.</span>
                )}
              </div>

              {/* Post game buttons layout */}
              <div className="flex flex-col gap-2.5">
                <button
                  onClick={() => setScreen('playing')}
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

                <button
                  onClick={() => setScreen('leaderboard')}
                  className="w-full py-2.5 bg-slate-950 hover:bg-slate-900 border-2 border-slate-800 text-cyan-400 hover:text-cyan-300 font-mono text-xs tracking-wider rounded-xl transition duration-150 active:scale-95 cursor-pointer uppercase"
                >
                  Ver Placar Geral
                </button>
              </div>
            </motion.div>
          )}

          {/* SCREEN: SCOREBOARD LEADERBOARD */}
          {screen === 'leaderboard' && (
            <motion.div 
              key="leaderboard"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="z-10"
            >
              <Leaderboard 
                currentUserId={user ? user.uid : null}
                onBack={() => setScreen(user ? 'menu' : 'login')}
              />
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}
