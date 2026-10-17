# Manual browser check (Playwright for Python): an old SW is replaced and updates wait while the mic is live.
# Prebuild /tmp/distA (main), /tmp/distB..D (this branch with RENDER_GIT_COMMIT=bbbb2222, cccc3333, dddd4444).
import subprocess, os, time, urllib.request, shutil
from playwright.sync_api import sync_playwright
REPO=os.path.dirname(os.path.dirname(os.path.abspath(__file__))); DIST=REPO+"/dist"
PORT="8796"; B=f"http://127.0.0.1:{PORT}"
def deploy(name):
    for f in os.listdir(DIST):
        q=os.path.join(DIST,f); shutil.rmtree(q) if os.path.isdir(q) else os.remove(q)
    shutil.copytree(f"/tmp/{name}",DIST,dirs_exist_ok=True)
deploy("distA")
env=dict(os.environ, PORT=PORT, TRANSLATE_PROVIDER="mock"); [env.pop(k,None) for k in ("APP_PIN","APP_PASSWORD","APP_SECRET")]
p=subprocess.Popen(["node","--experimental-strip-types","--no-warnings","server/index.ts"],cwd=REPO,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,stdin=subprocess.DEVNULL,start_new_session=True)
FAKE=open(os.path.join(REPO,"scripts","fake-speech-recognition.js")).read()
results=[]
def ok(name,cond,extra=""):
    results.append(cond); print(("PASS " if cond else "FAIL ")+name, extra)
KEYS="async()=>(await caches.keys()).join(',')"
def wait_keys(pg, sub, t=20):
    end=time.time()+t
    while time.time()<end:
        try:
            k=pg.evaluate(KEYS)
            if sub in k and "v8" not in k and k.count("meeting-translator")==1: return k
        except Exception: pass
        time.sleep(0.5)
    return pg.evaluate(KEYS)
try:
    for _ in range(50):
        try: urllib.request.urlopen(B+"/health"); break
        except Exception: time.sleep(0.2)
    with sync_playwright() as pw:
        br=pw.chromium.launch(); ctx=br.new_context(viewport={"width":375,"height":667},permissions=["microphone"]); ctx.add_init_script(FAKE)
        pg=ctx.new_page(); navs=[]; pg.on("framenavigated", lambda f: navs.append(f.url) if f==pg.main_frame else None)
        pg.goto(B+"/"); pg.wait_for_function("navigator.serviceWorker.controller!==null", timeout=15000)
        ok("old main build (v8 SW) controls the page", "meeting-translator-v8" in pg.evaluate(KEYS), pg.evaluate(KEYS))
        h=urllib.request.urlopen(B+"/sw.js").headers.get("cache-control"); hh=urllib.request.urlopen(B+"/").headers.get("cache-control")
        ok("sw.js and HTML served no-cache", h=="no-cache" and hh=="no-cache", f"sw={h} html={hh}")
        # Deploy the auto-update build; user relaunches the app.
        deploy("distB"); pg.reload()
        k=wait_keys(pg,"-bbbb2222")
        ok("old v8 SW replaced by new build on relaunch (waiting -> SKIP_WAITING -> reload)", "-bbbb2222" in k and "v8" not in k, k)
        v=urllib.request.urlopen(B+"/version.json"); ok("/version.json no-store", "no-store" in v.headers.get("cache-control",""), v.read().decode().strip())
        # Idle page, new deploy, app comes back to the foreground: no manual reload.
        time.sleep(1); pg.evaluate("window.__marker=1"); deploy("distC"); time.sleep(10.5); n0=len(navs)
        pg.evaluate("window.dispatchEvent(new Event('focus'))")
        k=wait_keys(pg,"-cccc3333")
        ok("idle page auto-updates on focus", "cccc3333" in k and len(navs)>n0 and pg.evaluate("window.__marker===undefined"), k)
        # Busy: mic live on the Two-person page, Spanish UI.
        pg.evaluate("localStorage.setItem('mt-ui-lang','es')"); pg.goto(B+"/?view=talk"); pg.wait_for_selector("[data-talk-start]")
        pg.click("[data-talk-a] [data-talk-lang=en]"); pg.click("[data-talk-b] [data-talk-lang=es]"); pg.click("[data-talk-start]"); time.sleep(0.5)
        pg.evaluate("window.__say('hello there', false)")
        pg.evaluate("window.__marker=2"); deploy("distD"); time.sleep(10.5); n0=len(navs)
        pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
        pg.wait_for_selector("[data-update-pill]", timeout=15000); time.sleep(1)
        txt=pg.inner_text("[data-update-pill]")
        waiting=pg.evaluate("navigator.serviceWorker.getRegistration().then(r=>!!r.waiting)")
        ok("mic live: no reload, pill shown, new SW waiting", pg.evaluate("window.__marker===2") and len(navs)==n0 and waiting, f"pill='{txt}' waiting={waiting}")
        pg.screenshot(path="/tmp/update-pill-busy.png")
        time.sleep(6); ok("still no reload after 6s while mic live", pg.evaluate("window.__marker===2"))
        pg.click("[data-talk-start]")  # Stop
        t0=time.time()
        while time.time()-t0<30 and len(navs)==n0: time.sleep(0.25)
        print("  reload after", round(time.time()-t0,1), "s")
        k=wait_keys(pg,"-dddd4444",15)
        ok("reloads on its own once idle (mic stopped)", "dddd4444" in k and pg.evaluate("window.__marker===undefined"), f"{k} after {time.time()-t0:.1f}s")
        br.close()
finally:
    os.killpg(p.pid,15)
print("ALL PASS" if all(results) else "SOME FAILED")
