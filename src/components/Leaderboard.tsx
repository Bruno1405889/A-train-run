import React, { useState, useEffect } from 'react';
import { Trophy, RefreshCw, User, Award, ShieldAlert, ArrowLeft, History } from 'lucide-react';
import { fetchTopScores, isFirebaseDummy } from '../firebaseService';
import { Score } from '../types';
import { motion } from 'motion/react';

interface LeaderboardProps {
  onBack: () => void;
  currentUserId: string | null;
}

export default function Leaderboard({ onBack, currentUserId }: LeaderboardProps) {
  const [scores, setScores] = useState<Score[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filterMode, setFilterMode] = useState<'global' | 'mine'>('global');

  async function loadLeaderboard() {
    setLoading(true);
    setError(false);
    try {
      const topScores = await fetchTopScores(20);
      setScores(topScores);
    } catch (err) {
      console.error(err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLeaderboard();
  }, []);

  const isGuestUser = currentUserId?.startsWith('guest_');

  const displayedScores = filterMode === 'global' 
    ? scores 
    : scores.filter(s => s.userId === currentUserId);

  return (
    <div className="w-full max-w-2xl bg-slate-950/92 border-4 border-indigo-500 rounded-3xl p-8 shadow-[0_0_50px_rgba(99,102,241,0.22)] relative overflow-hidden backdrop-blur-md z-20">
      {/* Glow lines */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500 shadow-lg" />
      
      {isFirebaseDummy() ? (
        <div className="mb-4 text-[10.5px] font-mono text-cyan-400 bg-cyan-950/40 border border-cyan-500/25 rounded-md p-3 text-center select-none">
          🎮 <strong>Modo Local Ativo:</strong> O banco de dados em nuvem foi desativado. Suas corridas e recordes serão gravados diretamente no armazenamento local do navegador!
        </div>
      ) : (
        isGuestUser && (
          <div className="mb-4 text-[10.5px] font-mono text-amber-400 bg-amber-950/45 border border-amber-500/25 rounded-xl p-3 text-center select-none">
            🚀 Seu recorde mundial é registrado sob o codinome de atleta informado!
          </div>
        )
      )}
      
      <div className="flex items-center justify-between mb-6">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-tech rounded-lg border-2 border-slate-600 transition duration-150 active:scale-95 text-xs"
        >
          <ArrowLeft size={16} className="text-cyan-400" />
          VOLTAR
        </button>
        
        <h2 className="font-mono text-lg text-center text-white flex items-center gap-2 text-glow-blue select-none uppercase">
          <Trophy className="text-yellow-400 animate-bounce" size={22} />
          Placar de Líderes
        </h2>

        <button 
          onClick={loadLeaderboard}
          disabled={loading}
          className="p-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white rounded-lg border-2 border-slate-600 transition"
          title="Atualizar Placar"
        >
          <RefreshCw size={16} className={`text-cyan-400 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4 bg-slate-950 p-1 rounded-lg border border-slate-800">
        <button
          onClick={() => setFilterMode('global')}
          className={`flex-1 py-1.5 rounded text-xs font-mono uppercase transition ${
            filterMode === 'global' 
              ? 'bg-cyan-600 text-white font-bold' 
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Geral (Top 20)
        </button>
        <button
          onClick={() => setFilterMode('mine')}
          className={`flex-1 py-1.5 rounded text-xs font-mono uppercase transition ${
            filterMode === 'mine' 
              ? 'bg-cyan-600 text-white font-bold' 
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Meus Scores
        </button>
      </div>

      <div className="overflow-y-auto max-h-[280px] bg-slate-950 p-3 rounded-xl border-2 border-slate-800">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <RefreshCw size={36} className="animate-spin text-cyan-500" />
            <span className="font-mono text-xs text-cyan-400 tracking-widest animate-pulse">CARREGANDO DADOS...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-red-400 font-tech">
            <ShieldAlert size={36} />
            <span className="text-sm">Erro ao sincronizar com o servidor</span>
            <button 
              onClick={loadLeaderboard}
              className="text-xs text-cyan-400 underline hover:text-cyan-300 mt-2"
            >
              Tentar novamente
            </button>
          </div>
        ) : displayedScores.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500 font-tech text-center gap-2">
            <History size={32} />
            <span className="text-xs uppercase">Nenhum score registrado ainda.</span>
            <span className="text-[10px] text-slate-600">Corra contra o Capitão Pátria para estrear o placar!</span>
          </div>
        ) : (
          <table className="w-full text-left font-tech border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-800 text-[10px] text-slate-400 font-mono tracking-wider uppercase">
                <th className="py-2 px-1 w-12 text-center">Rank</th>
                <th className="py-2 px-2">Jogador</th>
                <th className="py-2 px-2 text-center">Modo</th>
                <th className="py-2 px-2 text-right">Placar</th>
              </tr>
            </thead>
            <tbody>
              {displayedScores.map((score, index) => {
                const isCurrentUser = score.userId === currentUserId;
                const date = score.createdAt instanceof Date ? score.createdAt : new Date(score.createdAt);
                
                // Rank Styling
                let rankDisplay: React.ReactNode = index + 1;
                let rankStyle = "text-slate-400";
                
                if (index === 0) {
                  rankDisplay = <Award size={18} className="text-yellow-400 inline" />;
                  rankStyle = "text-yellow-400 font-black text-shadow-md";
                } else if (index === 1) {
                  rankDisplay = <Award size={18} className="text-slate-300 inline" />;
                  rankStyle = "text-slate-300 font-black";
                } else if (index === 2) {
                  rankDisplay = <Award size={18} className="text-amber-600 inline" />;
                  rankStyle = "text-amber-600 font-black";
                }

                return (
                  <motion.tr 
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    key={`leaderboard-score-${score.id || 'idx'}-${index}`} 
                    className={`border-b border-slate-900 text-xs transition-colors hover:bg-slate-900/50 ${
                      isCurrentUser ? 'bg-cyan-950/40 border-l-4 border-l-cyan-500' : ''
                    }`}
                  >
                    <td className={`py-3 px-1 text-center font-mono text-[11px] ${rankStyle}`}>
                      {rankDisplay}
                    </td>
                    <td className="py-3 px-2 flex items-center gap-2 min-w-0">
                      {score.photoURL ? (
                        <img 
                          referrerPolicy="no-referrer"
                          src={score.photoURL} 
                          alt={score.username} 
                          className="w-6 h-6 rounded-full border border-slate-700 object-cover"
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700">
                          <User size={12} className="text-slate-400" />
                        </div>
                      )}
                      
                      <div className="flex flex-col min-w-0">
                        <span className={`truncate font-mono text-[10px] sm:text-xs text-slate-100 ${isCurrentUser ? 'text-cyan-300 font-bold' : ''}`}>
                          {score.username}
                        </span>
                        <span className="text-[9px] text-slate-500 font-sans">
                          {date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-2 text-center select-none">
                      {score.isGuest ? (
                        <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase">
                          Visitante
                        </span>
                      ) : (
                        <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 uppercase">
                          Google
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-2 text-right font-mono text-cyan-400 text-[11px] font-extrabold tracking-wider">
                      {score.score}m
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      
      <div className="mt-4 text-[10px] text-slate-500 text-center font-mono uppercase tracking-wide">
        Derrote o Capitão Pátria para subir nos rankings!
      </div>
    </div>
  );
}
