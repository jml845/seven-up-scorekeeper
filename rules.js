export const MODIFIERS = [2, 4, 6, 8, 10];
export const NEGATIVE_MODIFIERS = [2, 4, 6, 8, 10];
export const RULESETS = {
  classic: {id:'classic', name:'Flip 7', shortName:'Classic', numberMin:0, numberMax:12},
  vengeance: {id:'vengeance', name:'Flip 7: With a Vengeance', shortName:'Vengeance', numberMin:1, numberMax:13},
};

export function rulesetFor(gameOrId) {
  const id = typeof gameOrId === 'string' ? gameOrId : gameOrId?.ruleset;
  return RULESETS[id] || RULESETS.classic;
}

export function calculateRound({numbers = [], doubled = false, modifiers = [], flip7 = false, busted = false,
  ruleset = 'classic', divided = false, penalties = [], specialZero = false, lucky13 = false} = {}) {
  if (busted) return 0;
  let numberTotal = numbers.reduce((sum, n) => sum + Number(n || 0), 0) + (lucky13 ? 13 : 0);
  if (ruleset === 'vengeance' && specialZero) numberTotal = 0;
  if (ruleset === 'vengeance') {
    if (divided) numberTotal = Math.floor(numberTotal / 2);
    const penaltyTotal = penalties.reduce((sum, n) => sum + Math.abs(Number(n || 0)), 0);
    return Math.max(0, numberTotal - penaltyTotal) + (flip7 ? 15 : 0);
  }
  const modifierTotal = modifiers.reduce((sum, n) => sum + Number(n || 0), 0);
  return numberTotal * (doubled ? 2 : 1) + modifierTotal + (flip7 ? 15 : 0);
}

export function totalsFor(game) {
  return Object.fromEntries(game.playerIds.map(id => [id, game.rounds.reduce((sum, round) => sum + Number(round.scores[id] || 0), 0)]));
}

export function gameOutcome(game) {
  const totals = totalsFor(game);
  const reached = Object.values(totals).some(score => score >= game.target);
  if (!reached) return {finished: false, tied: false, leaders: [], totals};
  const high = Math.max(...Object.values(totals));
  const leaders = Object.keys(totals).filter(id => totals[id] === high);
  return {finished: leaders.length === 1, tied: leaders.length > 1, leaders, totals};
}

export function playerStats(players, games) {
  const complete = games.filter(g => g.status === 'complete' && g.winnerId);
  return players.map(player => {
    const played = complete.filter(g => g.playerIds.includes(player.id));
    const wins = played.filter(g => g.winnerId === player.id).length;
    const totalPoints = played.reduce((sum, g) => sum + (totalsFor(g)[player.id] || 0), 0);
    const placements = played.map(g => {
      const scores = totalsFor(g); const mine = scores[player.id];
      return 1 + Object.values(scores).filter(score => score > mine).length;
    });
    let streak = 0;
    for (const g of [...played].sort((a,b) => b.completedAt.localeCompare(a.completedAt))) { if (g.winnerId === player.id) streak++; else break; }
    return {...player, games: played.length, wins, winPct: played.length ? wins / played.length : 0,
      totalPoints, avgScore: played.length ? totalPoints / played.length : 0,
      avgPlace: placements.length ? placements.reduce((a,b)=>a+b,0)/placements.length : 0, streak};
  });
}
