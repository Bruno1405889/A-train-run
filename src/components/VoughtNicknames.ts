const ADJECTIVES = [
  'Super', 'Veloz', 'Sônico', 'Feroz', 'Blindado', 'Elétrico', 'Turbo', 'Ágil',
  'Elite', 'Supremo', 'Furtivo', 'Relâmpago', 'Magneto', 'Impacto', 'Instantâneo'
];

const NOUNS = [
  'Velocista', 'Corredor', 'Adept', 'Vought', 'Seven', 'Trovão', 'Campeão',
  'CompostoV', 'Raio', 'Fuga', 'Atleta', 'Sombra', 'Vingador', 'Turbina'
];

export function generateRandomNickname(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 900) + 100; // 100-999
  return `${adj}_${noun}_${num}`;
}
