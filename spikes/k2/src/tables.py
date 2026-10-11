import json,sys,glob,collections,math,os
def q(xs,p):
    if not xs: return '—'
    s=sorted(xs); return s[min(len(s)-1, math.ceil(p*len(s))-1)]
recs=[]
for f in sys.argv[1:]:
    d=json.load(open(f)); lab=d['meta'].get('label') or ''
    env = '本机 Mac' if '本机' in lab else ('macos-26' if 'macos' in lab else 'ubuntu' if 'ubuntu' in lab else 'windows-2025')
    for r in d['records']:
        r['env']=env; recs.append(r)
runners=['static','static-inproc','vite','next','nuxt4','nuxt3','node-ts','python','go','hono']
cols=[('本机 Mac','group'),('本机 Mac','inproc'),('macos-26','group'),('macos-26','inproc'),('ubuntu','group'),('ubuntu','inproc'),('windows-2025','taskkill'),('windows-2025','inproc'),('windows-2025','taskkill-obs'),('windows-2025','job'),('windows-2025','job-ctrlc'),('windows-2025','pty-ctrlc')]
def sel(env,method,runner,scen): return [r for r in recs if r['env']==env and r['method']==method and r['runner']==runner and (r['scenario']==scen if isinstance(scen,str) else scen(r['scenario']))]
def cell(rs):
    if not rs: return None
    port=[r['portMs'] for r in rs if isinstance(r.get('portMs'),(int,float)) and r['portMs']>=0]
    surv=sum(1 for r in rs if r.get('leftover',{}).get('survivors') or r.get('leftover',{}).get('untracked') or r.get('leftover',{}).get('byPort'))
    err=sum(1 for r in rs if r.get('error')); esc=sum(1 for r in rs if r.get('stop',{}).get('escalated'))
    over=sum(1 for r in rs if r.get('portMs') is None or r['portMs']>3000)
    return dict(n=len(rs),surv=surv,err=err,esc=esc,over=over,med=q(port,.5),p95=q(port,.95),mx=q(port,1))
print("### A. 起停（cycle）\n")
print("| 运行器 | 环境 | 办法 | 次数 | 启动失败 | 有残留的次数 | 升级为强杀 | 端口可重绑 ms 中位 / p95 / 最大 | 超过 3 秒 |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |")
for ru in runners:
    for env,m in cols:
        c=cell(sel(env,m,ru,'cycle'))
        if c: print(f"| {ru} | {env} | {m} | {c['n']} | {c['err']} | {c['surv']} | {c['esc']} | {c['med']} / {c['p95']} / {c['mx']} | {c['over']} |")
print("\n### B. 其他场景（每格：次数；有残留；端口最大 ms；超 3 秒）\n")
scs=['inflight','startup-stop','kill','interrupt','install-stop']
print("| 运行器 | 环境 | 办法 | "+" | ".join(scs)+" |\n| --- | --- | --- |"+" --- |"*len(scs))
for ru in runners:
    for env,m in cols:
        cs=[cell(sel(env,m,ru,s)) for s in scs]
        if any(cs): print(f"| {ru} | {env} | {m} | "+" | ".join((f"{c['n']}；{c['surv']}；{c['mx']}；{c['over']}" if c else '—') for c in cs)+" |")
print("\n### C. 停止之后的下一次启动\n")
print("| 运行器 | 环境 | 办法 | 启动中途停止后再启动 | 强制结束后再启动 | 安装中途停止后：原样重装成功 / 之后启动成功 |\n| --- | --- | --- | --- | --- | --- |")
for ru in runners:
    for env,m in cols:
        a=sel(env,m,ru,'startup-stop'); k=sel(env,m,ru,'kill'); i=sel(env,m,ru,'install-stop')
        if not (a or k or i): continue
        f=lambda rs,key: f"{sum(1 for r in rs if r.get(key) is True)}/{len(rs)}" if rs else '—'
        inst = f"{sum(1 for r in i if r.get('reinstall',{}).get('code')==0)}/{len(i)} ； {sum(1 for r in i if r.get('runAfterReinstall') is True)}/{len(i)}" if i else '—'
        # Windows: every cycle is a force kill; next-cycle ready counts
        cyc=sel(env,m,ru,'cycle')
        kk = f(k,'runAfter') if k else (f"{sum(1 for r in cyc[1:] if r.get('ready'))}/{len(cyc)-1}（每次起停都是强制结束）" if env.startswith('win') and m in('taskkill','job') and cyc else '—')
        print(f"| {ru} | {env} | {m} | {f(a,'runAfter')} | {kk} | {inst} |")
print("\n### D. 退出码\n")
g=collections.OrderedDict()
for r in recs:
    if r['scenario'] not in ('cycle','interrupt','kill'): continue
    e=r.get('stop',{}).get('exit',{}); k='超时' if e.get('timeout') else (e.get('signal') or str(e.get('code')))
    g.setdefault((r['runner'],r['env'],r['method'],r['scenario']),collections.Counter())[k]+=1
print("| 运行器 | 环境 | 办法 | 场景 | 退出码或信号 × 次数 |\n| --- | --- | --- | --- | --- |")
for (ru,env,m,sc),c in g.items():
    if ru in runners and ru!='static-inproc' and env in('本机 Mac','windows-2025'): print(f"| {ru} | {env} | {m} | {sc} | "+" ".join(f"{k}×{v}" for k,v in c.items())+" |")
print("\n### E. 就绪耗时 ms（中位 / 最大，cycle）\n")
print("| 运行器 | 环境 | 办法 | 就绪 ms 中位 / 最大 | 就绪时最多进程数 |\n| --- | --- | --- | --- | --- |")
for ru in runners:
    for env,m in cols:
        rs=[r for r in sel(env,m,ru,'cycle') if r.get('ready')]
        if rs and m in('group','taskkill','job'): st=[r['startMs'] for r in rs]; print(f"| {ru} | {env} | {m} | {q(st,.5)} / {q(st,1)} | {max(r['leftover'].get('maxProcs',0) for r in rs)} |")
