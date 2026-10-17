// Widen a Hokage network without changing what it computes.
//   node tools/az-widen.js in=js/az-weights.js out=ai/cur.json [H=256] [HV=128] [HP=128] [seed=1]
// Every old weight is kept. New hidden units get random incoming weights and zero outgoing weights, so the wider
// network gives exactly the old values and move priors until training puts the new units to use.
const fs = require('fs'), path = require('path');
const { NS } = require('./az-common');
const AZ = NS.AZ;
const args = Object.fromEntries(process.argv.slice(2).map(a => a.split('=')));
const root = path.join(__dirname, '..');
const read = f => { const t = fs.readFileSync(path.resolve(root, f), 'utf8'); return AZ.Net.fromJSON(JSON.parse(f.endsWith('.js') ? t.slice(t.indexOf('{', t.indexOf('AZ_WEIGHTS')), t.lastIndexOf('}') + 1) : t)); };

function widen(src, size, seed) {
  const z0 = src.size, z = { H: Math.max(size.H, z0.H), HV: Math.max(size.HV, z0.HV), HP: Math.max(size.HP, z0.HP) };
  const dst = new AZ.Net(seed, z), L0 = AZ.Net.shape(z0), L = AZ.Net.shape(z);
  L.forEach(([k, I, O], n) => {
    const [, I0, O0] = L0[n], a = src.p[k], b = dst.p[k];
    for (let i = 0; i < I; i++) for (let j = 0; j < O; j++) {
      if (i < I0 && j < O0) b[i * O + j] = a[i * O0 + j];
      else if (i >= I0) b[i * O + j] = 0; // out of a new unit: silent until trained
      // else: into a new unit, keeps its random start
    }
  });
  for (const k in src.p) if (k[0] === 'b') { dst.p[k].fill(0); dst.p[k].set(src.p[k]); }
  return dst;
}

if (require.main === module) {
  const src = read(args.in || 'js/az-weights.js');
  const net = widen(src, { H: +(args.H || 256), HV: +(args.HV || 128), HP: +(args.HP || 128) }, +(args.seed || 1));
  const count = n => Object.values(n.p).reduce((t, a) => t + a.length, 0);
  fs.writeFileSync(path.resolve(root, args.out || 'ai/cur.json'), JSON.stringify(net.toJSON()));
  console.log(`widened ${JSON.stringify(src.size)} (${count(src)} weights) -> ${JSON.stringify(net.size)} (${count(net)} weights) -> ${args.out || 'ai/cur.json'}`);
}
module.exports = { widen };
