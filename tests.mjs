import assert from 'node:assert/strict';
import {calculateRound, totalsFor, gameOutcome, playerStats} from './rules.js';

assert.equal(calculateRound({numbers:[3,7,11],doubled:true,modifiers:[4,10],flip7:true}),71);
assert.equal(calculateRound({numbers:[12],doubled:true,modifiers:[10],flip7:true,busted:true}),0);
const game={target:200,playerIds:['a','b'],rounds:[{scores:{a:100,b:90}},{scores:{a:100,b:110}}]};
assert.deepEqual(totalsFor(game),{a:200,b:200});
assert.deepEqual(gameOutcome(game).tied,true);
game.rounds.push({scores:{a:10,b:5}});
assert.equal(gameOutcome(game).leaders[0],'a');
assert.equal(gameOutcome(game).finished,true);
const complete={...game,id:'g',status:'complete',winnerId:'a',completedAt:'2026-07-19T00:00:00Z'};
const stats=playerStats([{id:'a',name:'A'},{id:'b',name:'B'}],[complete]);
assert.equal(stats[0].wins,1);assert.equal(stats[1].wins,0);assert.equal(stats[0].games,1);
console.log('All rules and statistics tests passed.');
