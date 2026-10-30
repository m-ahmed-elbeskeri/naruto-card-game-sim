"""Trains the candidate networks on the same recorded positions and scores them on held-out games.

  python train.py <data dir>... [--models mlp,units,tf] [--steps 8000] [--gen18 path/to/best.json]

mlp    the current network (271 -> 128 -> 128, value 64, policy 96), from scratch
units  the same network with every leader / Character's details added to its input, and each move's actor and
       target details added to the move's input
tf     a small transformer over leader, Character, hand, Support and chain tokens; each move reads the encoded
       tokens of its actor and target
gen18  (with --gen18) the current champion's weights as they are, as a reference on the same held-out games
"""
import argparse, json, math, os, sys, time, base64
import numpy as np, torch, torch.nn as nn, torch.nn.functional as Fn

ap = argparse.ArgumentParser()
ap.add_argument('dirs', nargs='+')
ap.add_argument('--models', default='mlp,units,tf')
ap.add_argument('--steps', type=int, default=8000)
ap.add_argument('--batch', type=int, default=512)
ap.add_argument('--lr', type=float, default=1e-3)
ap.add_argument('--gen18', default='')
ap.add_argument('--save', default='')
args = ap.parse_args()
dev = 'cuda' if torch.cuda.is_available() else 'cpu'
torch.manual_seed(1); np.random.seed(1)

# ---------------- data ----------------
# loaded one part at a time straight into preallocated GPU tensors (half precision), so host memory stays small
infos = [json.load(open(os.path.join(d, 'info.json'))) for d in args.dirs]
i0 = infos[0]; S, A, T, F, SLOTS, NC = i0['S'], i0['A'], i0['T'], i0['F'], i0['SLOTS'], i0['cards']
N = sum(i['N'] for i in infos); M = sum(i['M'] for i in infos)
D = dict(S=torch.empty(N, S, dtype=torch.float16, device=dev), TOK=torch.empty(N, T, F, dtype=torch.float16, device=dev),
         TOKC=torch.empty(N, T, dtype=torch.int8, device=dev), A=torch.empty(M, A, dtype=torch.float16, device=dev),
         PTR=torch.empty(M, 2, dtype=torch.int8, device=dev), PI=torch.empty(M, dtype=torch.float32, device=dev),
         META=torch.empty(N, 4, dtype=torch.int32, device=dev))
AOFF = torch.empty(N, dtype=torch.long, device=dev); NA = torch.empty(N, dtype=torch.long, device=dev)
n0 = m0 = goff = 0
for d, info in zip(args.dirs, infos):
    n, m = info['N'], info['M']
    rd = lambda f, dt: torch.from_numpy(np.fromfile(os.path.join(d, f), dtype=dt))
    D['S'][n0:n0 + n] = rd('S.f32', np.float32).view(n, S).to(dev).half()
    D['TOK'][n0:n0 + n] = rd('TOK.f32', np.float32).view(n, T, F).to(dev).half()
    D['TOKC'][n0:n0 + n] = rd('TOKC.i8', np.int8).view(n, T).to(dev)
    D['A'][m0:m0 + m] = rd('A.f32', np.float32).view(m, A).to(dev).half()
    D['PTR'][m0:m0 + m] = rd('PTR.i8', np.int8).view(m, 2).to(dev)
    D['PI'][m0:m0 + m] = rd('PI.f32', np.float32).to(dev)
    meta = rd('META.i32', np.int32).view(n, 4).clone(); meta[:, 1] += goff
    D['META'][n0:n0 + n] = meta.to(dev)
    off = rd('AOFF.i32', np.int32).long()
    AOFF[n0:n0 + n] = (off[:-1] + m0).to(dev); NA[n0:n0 + n] = (off[1:] - off[:-1]).to(dev)
    n0 += n; m0 += m; goff += info['games']
games = D['META'][:, 1].long()
test = (games * 2654435761 % 1000) < 100            # 10% of the games, whole games only
tr_idx = torch.nonzero(~test).squeeze(1); te_idx = torch.nonzero(test).squeeze(1)
print(f'{N} positions ({len(tr_idx)} train, {len(te_idx)} held out) from {int(games.max()) + 1} games, {M} moves, on {dev}', flush=True)

def batch(idx):
    """Pads each position's moves to the batch's widest decision."""
    na = NA[idx]; K = int(na.max())
    j = torch.arange(K, device=dev)
    mask = j[None, :] < na[:, None]
    ai = (AOFF[idx][:, None] + j[None, :]).clamp(max=M - 1)
    b = dict(S=D['S'][idx].float(), TOK=D['TOK'][idx].float(), TOKC=D['TOKC'][idx].long(), A=D['A'][ai].float(), PTR=D['PTR'][ai].long(),
             PI=torch.where(mask, D['PI'][ai], torch.zeros((), device=dev)), mask=mask, Z=D['META'][idx, 0].float(), kind=D['META'][idx, 3])
    return b

# ---------------- models ----------------
class MLP(nn.Module):
    """The current network. With units=True the state also gets the 12 leader / Character slots and each move its
    actor's and target's slot (zeros for a hand card or none)."""
    def __init__(s, units=False, H=128, HV=64, HP=96):
        super().__init__(); s.units = units
        U = F + NC + 1
        s.W1 = nn.Linear(S + (SLOTS * U if units else 0), H); s.W2 = nn.Linear(H, H)
        s.Wv1 = nn.Linear(H, HV); s.Wv2 = nn.Linear(HV, 1)
        s.Wph = nn.Linear(H, HP); s.Wpa = nn.Linear(A + (2 * U if units else 0), HP); s.Wp2 = nn.Linear(HP, 1)
    def slot(s, b):
        return torch.cat([b['TOK'], Fn.one_hot(b['TOKC'], NC + 1).float()], -1)  # B T U
    def forward(s, b):
        x, a = b['S'], b['A']
        if s.units:
            u = s.slot(b); B = u.shape[0]
            x = torch.cat([x, u[:, :SLOTS].reshape(B, -1)], 1)
            g = lambda p: torch.where((p >= 0)[..., None], torch.gather(u, 1, p.clamp(min=0)[..., None].expand(-1, -1, u.shape[2])), torch.zeros((), device=dev))
            a = torch.cat([a, g(b['PTR'][..., 0]), g(b['PTR'][..., 1])], -1)
        h = Fn.relu(s.W2(Fn.relu(s.W1(x))))
        v = torch.tanh(s.Wv2(Fn.relu(s.Wv1(h)))).squeeze(1)
        z = Fn.relu(s.Wpa(a) + s.Wph(h)[:, None, :])
        return v, s.Wp2(z).squeeze(-1)

class TF(nn.Module):
    """Tokens: a summary token from the current state features, then the leader / Character / hand / Support /
    chain tokens. A move is its own features plus its actor's and target's encoded tokens and the summary."""
    def __init__(s, d=64, layers=2, heads=4, ff=128):
        super().__init__()
        s.card = nn.Embedding(NC + 1, 16)
        s.tok = nn.Linear(F + 16, d); s.glob = nn.Linear(S, d)
        s.enc = nn.TransformerEncoder(nn.TransformerEncoderLayer(d, heads, ff, dropout=0.0, batch_first=True, norm_first=True), layers)
        s.norm = nn.LayerNorm(d)
        s.v = nn.Sequential(nn.Linear(d, 64), nn.ReLU(), nn.Linear(64, 1))
        s.act = nn.Linear(A, d)
        s.p = nn.Sequential(nn.Linear(4 * d, 96), nn.ReLU(), nn.Linear(96, 1))
    def forward(s, b):
        tok = b['TOK']; B, T_, _ = tok.shape
        live = tok[..., :6].sum(-1) > 0                                    # a token of some type
        x = torch.cat([s.glob(b['S'])[:, None], s.tok(torch.cat([tok, s.card(b['TOKC'])], -1))], 1)
        pad = torch.cat([torch.zeros(B, 1, dtype=torch.bool, device=dev), ~live], 1)
        h = s.norm(s.enc(x, src_key_padding_mask=pad))
        g0 = h[:, 0]
        v = torch.tanh(s.v(g0)).squeeze(1)
        ht = h[:, 1:]
        g = lambda p: torch.where((p >= 0)[..., None], torch.gather(ht, 1, p.clamp(min=0)[..., None].expand(-1, -1, ht.shape[2])), torch.zeros((), device=dev))
        K = b['A'].shape[1]
        m = torch.cat([s.act(b['A']), g(b['PTR'][..., 0]), g(b['PTR'][..., 1]), g0[:, None].expand(-1, K, -1)], -1)
        return v, s.p(m).squeeze(-1)

def from_js(path):
    """The champion's weights in the MLP above (JS keeps W as [in][out])."""
    j = json.load(open(path)); P = j['p']; net = MLP()
    dec = lambda k: torch.from_numpy(np.frombuffer(base64.b64decode(P[k]), dtype=np.float32).copy())
    with torch.no_grad():
        for name, (i, o) in dict(W1=(S, 128), W2=(128, 128), Wv1=(128, 64), Wv2=(64, 1), Wph=(128, 96), Wpa=(A, 96), Wp2=(96, 1)).items():
            lin = getattr(net, name); lin.weight.copy_(dec(name).reshape(i, o).T); b = 'b' + name[1:]
            lin.bias.copy_(dec(b) if b != 'bph' else torch.zeros(96))
        net.Wph.bias.copy_(dec('bph'))
    return net

# ---------------- training / scoring ----------------
def losses(net, b):
    v, logit = net(b)
    logit = logit.masked_fill(~b['mask'], -1e9)
    logp = Fn.log_softmax(logit, 1)
    pl = -(b['PI'] * logp).sum(1)
    vl = (v - b['Z']) ** 2
    return vl, pl, v, logit

@torch.no_grad()
def score(net):
    net.eval(); tot = dict(v=0., p=0., top=0., sign=0., n=0, top_main=0., n_main=0, n_multi=0, top_multi=0.)
    for i in range(0, len(te_idx), 2048):
        b = batch(te_idx[i:i + 2048]); vl, pl, v, logit = losses(net, b)
        top = (logit.argmax(1) == b['PI'].argmax(1)).float(); multi = b['mask'].sum(1) > 1
        tot['v'] += vl.sum().item(); tot['p'] += pl.sum().item(); tot['sign'] += ((v > 0) == (b['Z'] > 0)).float().sum().item(); tot['n'] += len(vl)
        tot['top_multi'] += top[multi].sum().item(); tot['n_multi'] += int(multi.sum())
        mm = (b['kind'] == 0) & multi; tot['top_main'] += top[mm].sum().item(); tot['n_main'] += int(mm.sum())
    net.train(); n = tot['n']
    return dict(value_mse=tot['v'] / n, policy_ce=tot['p'] / n, outcome_acc=tot['sign'] / n, move_acc=tot['top_multi'] / tot['n_multi'], main_move_acc=tot['top_main'] / tot['n_main'])

def train(name, net):
    net.to(dev); opt = torch.optim.AdamW(net.parameters(), lr=args.lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=args.lr, total_steps=args.steps, pct_start=0.05)
    params = sum(p.numel() for p in net.parameters()); t0 = time.time()
    print(f'\n{name}: {params} parameters', flush=True)
    for step in range(1, args.steps + 1):
        idx = tr_idx[torch.randint(len(tr_idx), (args.batch,), device=dev)]
        vl, pl, _, _ = losses(net, batch(idx))
        loss = vl.mean() + pl.mean()
        opt.zero_grad(); loss.backward(); opt.step(); sched.step()
        if step % 2000 == 0 or step == args.steps:
            r = score(net); print(f'  step {step}: ' + ' '.join(f'{k} {v:.4f}' for k, v in r.items()) + f'  ({time.time() - t0:.0f}s)', flush=True)
    if args.save:
        os.makedirs(args.save, exist_ok=True)
        torch.save(net.state_dict(), os.path.join(args.save, name + '.pt'))
        export(name, net, os.path.join(args.save, name + '.json'))
    return r, params

def export(name, net, path):
    """Weights for nets.js: every tensor as float32 base64 with its shape (torch layout, Linear weight = [out][in])."""
    cfg = dict(kind='tf', d=net.tok.out_features, layers=len(net.enc.layers), heads=net.enc.layers[0].self_attn.num_heads) if isinstance(net, TF) else dict(kind='units' if net.units else 'mlp')
    p = {k: dict(shape=list(v.shape), b64=base64.b64encode(v.detach().float().cpu().contiguous().numpy().tobytes()).decode()) for k, v in net.state_dict().items()}
    json.dump(dict(name=name, cfg=cfg, dims=dict(S=S, A=A, T=T, F=F, SLOTS=SLOTS, NC=NC), p=p), open(path, 'w'))

results = {}
if args.gen18:
    r = score(from_js(args.gen18).to(dev)); results['gen18 (as is)'] = (r, 0)
    print('\ngen18 as is: ' + ' '.join(f'{k} {v:.4f}' for k, v in r.items()), flush=True)
for m in args.models.split(','):
    net = dict(mlp=lambda: MLP(), units=lambda: MLP(units=True), tf=lambda: TF(), tfs=lambda: TF(d=32, ff=64))[m]()
    results[m] = train(m, net)
print('\nheld-out games    value MSE  policy CE  outcome  move  main move  params')
for k, (r, p) in results.items():
    print(f"{k:16s}  {r['value_mse']:.4f}     {r['policy_ce']:.4f}     {r['outcome_acc']:.3f}    {r['move_acc']:.3f} {r['main_move_acc']:.3f}      {p}")
