#!/usr/bin/env python3
"""Capture authentic FlipCast screens and render the widescreen promo master."""

from __future__ import annotations

import base64
import json
import math
import shutil
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont
import websocket


ROOT = Path(__file__).resolve().parents[1]
OUT = Path(__file__).resolve().parent / "rendered"
PORT = 19385
APP_URL = "http://127.0.0.1:8787/?campaign=demo"
HARNESS_URL = "http://127.0.0.1:8787/promo/receiver-demo-harness.html"
# Twenty-four fps matches the receiver effect assets and avoids the stuttering
# and long static holds in the first promo draft.
FPS = 24
SIZE = (1920, 1080)
SECONDS = 30


def font(size: int, bold: bool = False):
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


class Chrome:
    def __init__(self):
        self.profile = tempfile.mkdtemp(prefix="flipcast-demo-")
        binary = shutil.which("google-chrome-stable") or shutil.which("chromium")
        self.proc = subprocess.Popen([
            binary, "--headless=new", "--no-sandbox", "--disable-gpu",
            "--disable-background-networking", "--remote-allow-origins=*",
            f"--remote-debugging-port={PORT}", f"--user-data-dir={self.profile}", "about:blank",
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        deadline = time.time() + 10
        while time.time() < deadline:
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/list", timeout=1) as response:
                    page = next(t for t in json.load(response) if t["type"] == "page")
                    self.ws = websocket.create_connection(page["webSocketDebuggerUrl"], timeout=10)
                    break
            except Exception:
                time.sleep(.1)
        else:
            raise RuntimeError("Chrome DevTools did not start")
        self.seq = 0
        self.cmd("Page.enable")
        self.cmd("Runtime.enable")

    def cmd(self, method, params=None):
        self.seq += 1
        self.ws.send(json.dumps({"id": self.seq, "method": method, "params": params or {}}))
        while True:
            reply = json.loads(self.ws.recv())
            if reply.get("id") == self.seq:
                if "error" in reply:
                    raise RuntimeError(reply["error"])
                return reply.get("result", {})

    def viewport(self, width, height, mobile=False):
        self.cmd("Emulation.setDeviceMetricsOverride", {
            "width": width, "height": height, "deviceScaleFactor": 1, "mobile": mobile
        })

    def navigate(self, url):
        self.cmd("Page.navigate", {"url": url})
        for _ in range(100):
            ready = self.eval("document.readyState === 'complete'")
            if ready:
                time.sleep(.35)
                return
            time.sleep(.1)
        raise RuntimeError(f"Page did not load: {url}")

    def eval(self, expression):
        result = self.cmd("Runtime.evaluate", {"expression": expression, "returnByValue": True})
        return result.get("result", {}).get("value")

    def screenshot(self, path):
        shot = self.cmd("Page.captureScreenshot", {"format": "png", "captureBeyondViewport": False})
        Path(path).write_bytes(base64.b64decode(shot["data"]))

    def close(self):
        self.ws.close()
        self.proc.terminate()
        try:
            self.proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.proc.kill()
        shutil.rmtree(self.profile, ignore_errors=True)


def capture():
    OUT.mkdir(parents=True, exist_ok=True)
    chrome = Chrome()
    try:
        chrome.viewport(390, 844, True)
        chrome.navigate(APP_URL)
        chrome.screenshot(OUT / "phone-home.png")
        state = {
            "players": [
                {"id":"p1","name":"Casey","createdAt":"2026-08-20T00:00:00Z"},
                {"id":"p2","name":"Jordan","createdAt":"2026-08-20T00:00:00Z"},
                {"id":"p3","name":"Riley","createdAt":"2026-08-20T00:00:00Z"},
                {"id":"p4","name":"Morgan","createdAt":"2026-08-20T00:00:00Z"},
            ],
            "games": [{
                "id":"promo-game","playerIds":["p1","p2","p3","p4"],"target":200,
                "ruleset":"classic","status":"active","createdAt":"2026-08-20T00:00:00Z",
                "rounds":[
                    {"scores":{"p1":35,"p2":42,"p3":30,"p4":25}},
                    {"scores":{"p1":31,"p2":36,"p3":28,"p4":27}},
                    {"scores":{"p1":34,"p2":39,"p3":33,"p4":22}},
                    {"scores":{"p1":32,"p2":31,"p3":0,"p4":30}},
                ]
            }, {
                "id":"promo-complete-1","playerIds":["p1","p2","p3","p4"],"target":200,
                "ruleset":"classic","status":"complete","winnerId":"p2",
                "createdAt":"2026-08-12T00:00:00Z","completedAt":"2026-08-12T01:00:00Z",
                "rounds":[{"scores":{"p1":62,"p2":71,"p3":44,"p4":53}},{"scores":{"p1":59,"p2":78,"p3":67,"p4":48}},{"scores":{"p1":55,"p2":66,"p3":51,"p4":60}}]
            }, {
                "id":"promo-complete-2","playerIds":["p1","p2","p3","p4"],"target":200,
                "ruleset":"vengeance","status":"complete","winnerId":"p1",
                "createdAt":"2026-08-16T00:00:00Z","completedAt":"2026-08-16T01:00:00Z",
                "rounds":[{"scores":{"p1":81,"p2":55,"p3":63,"p4":47}},{"scores":{"p1":69,"p2":70,"p3":52,"p4":61}},{"scores":{"p1":58,"p2":60,"p3":72,"p4":49}}]
            }],
            "activeGameId":"promo-game"
        }
        payload = json.dumps(state).replace("\\", "\\\\").replace("'", "\\'")
        chrome.eval(f"localStorage.setItem('seven-up-scorekeeper-v1','{payload}');location.reload()")
        time.sleep(1)
        chrome.eval("document.querySelector('[data-nav=game]').click()")
        time.sleep(.4)
        chrome.screenshot(OUT / "phone-game.png")
        chrome.eval("document.querySelector('#scoreRound').click()")
        time.sleep(.4)
        chrome.eval("document.querySelector('[data-player=p1] .expand-calculator').click()")
        time.sleep(.3)
        chrome.screenshot(OUT / "phone-cards-empty.png")
        chrome.eval("[2,4,6,7,8,9,10].forEach(n=>document.querySelector(`[data-player=p1] [data-number=\"${n}\"]`).click())")
        time.sleep(.8)
        chrome.screenshot(OUT / "phone-cards-filled.png")
        chrome.eval("document.querySelector('[data-mode=quick]').click()")
        time.sleep(.4)
        chrome.eval("const vals=['70','40','28','0'];document.querySelectorAll('.quick-score').forEach((el,i)=>{el.value=vals[i];el.dispatchEvent(new Event('input',{bubbles:true}))})")
        time.sleep(.8)
        chrome.screenshot(OUT / "phone-score.png")
        chrome.eval("document.querySelector('[data-nav=game]').click();document.querySelector('[data-nav=home]').click();document.querySelector('[data-nav=stats]').click()")
        time.sleep(.5)
        chrome.screenshot(OUT / "phone-stats.png")
        chrome.eval("document.querySelector('[data-nav=home]').click();document.querySelector('[data-nav=history]').click()")
        time.sleep(.5)
        chrome.screenshot(OUT / "phone-history.png")

        chrome.viewport(1920, 1080, False)
        chrome.navigate(HARNESS_URL)
        time.sleep(.8)
        chrome.screenshot(OUT / "tv-score.png")
        layout=chrome.eval("({width:innerWidth,height:innerHeight,players:[...document.querySelectorAll('.player')].map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,radius:parseFloat(getComputedStyle(el).borderTopLeftRadius)||0}})})")
        (OUT / "tv-layout.json").write_text(json.dumps(layout,indent=2))
        chrome.eval("showScore(true)")
        time.sleep(.8)
        chrome.screenshot(OUT / "tv-update.png")
        chrome.eval("showStats()")
        time.sleep(.5)
        chrome.screenshot(OUT / "tv-stats.png")
        # showEffect indexes the source player array (Casey, Jordan, Riley,
        # Morgan), not the score-sorted DOM rows used by overlay_effect.
        source_effect_players={"flip7":0,"busted":3,"frozen":1}
        for effect,index in source_effect_players.items():
            chrome.eval(f"showEffect('{effect}',{index})")
            time.sleep(.25)
            chrome.eval("document.querySelectorAll('.fx-video').forEach(video=>video.pause())")
            chrome.screenshot(OUT / f"tv-{effect}.png")
    finally:
        chrome.close()


def contain(image, size):
    image = image.copy()
    image.thumbnail(size, Image.Resampling.LANCZOS)
    return image


def rounded_panel(size, radius=34, fill=(8, 18, 47, 255), outline=(91, 230, 194, 180), width=3):
    panel = Image.new("RGBA", size, (0,0,0,0))
    ImageDraw.Draw(panel).rounded_rectangle((1,1,size[0]-2,size[1]-2), radius, fill=fill, outline=outline, width=width)
    return panel


def paste_phone(canvas, phone, xy, height):
    body_w = int(height * .51)
    panel = rounded_panel((body_w + 24, height + 24), 42, (3,8,20,255), (118,240,210,220), 3)
    screen = contain(phone, (body_w, height))
    panel.alpha_composite(screen, ((panel.width-screen.width)//2, (panel.height-screen.height)//2))
    canvas.alpha_composite(panel, xy)
    return (xy[0]+(panel.width-screen.width)//2,xy[1]+(panel.height-screen.height)//2,screen.width,screen.height)


def paste_tv(canvas, screen, xy, size):
    outer = rounded_panel((size[0]+28,size[1]+48), 26, (2,6,16,255), (121,151,181,180), 3)
    fitted = contain(screen, size)
    outer.alpha_composite(fitted, ((outer.width-fitted.width)//2, 14))
    canvas.alpha_composite(outer, xy)
    return (xy[0]+(outer.width-fitted.width)//2,xy[1]+14,fitted.width,fitted.height)


def wrap(draw, text, width, font_obj):
    words=text.split(); lines=[]; line=""
    for word in words:
        trial=(line+" "+word).strip()
        if draw.textbbox((0,0),trial,font=font_obj)[2] <= width: line=trial
        else: lines.append(line); line=word
    if line: lines.append(line)
    return lines


def scene(size, title, subtitle=""):
    w,h=size
    base=Image.new("RGBA",size,(5,14,37,255))
    glow=Image.new("RGBA",size,(0,0,0,0)); gd=ImageDraw.Draw(glow)
    gd.ellipse((-w*.2,-h*.5,w*.75,h*.65),fill=(42,108,136,120))
    gd.ellipse((w*.55,h*.45,w*1.2,h*1.15),fill=(23,113,91,80))
    base=Image.alpha_composite(base,glow.filter(ImageFilter.GaussianBlur(int(min(size)*.07))))
    d=ImageDraw.Draw(base)
    title_font=font(max(42,int(h*.072)),True)
    y=int(h*.07)
    for line in wrap(d,title,int(w*.84),title_font):
        d.text((int(w*.08),y),line,font=title_font,fill=(247,251,255,255)); y+=int(title_font.size*1.08)
    if subtitle:
        sub=font(max(24,int(h*.032)))
        d.text((int(w*.08),y+10),subtitle,font=sub,fill=(145,235,209,255))
    return base


def ease(value):
    return .5-.5*math.cos(math.pi*max(0,min(1,value)))


def tap(canvas,rect,progress,position=(.55,.55)):
    if progress<0 or progress>1:return
    x=int(rect[0]+rect[2]*position[0]);y=int(rect[1]+rect[3]*position[1]);radius=int(12+34*progress)
    layer=Image.new('RGBA',canvas.size,(0,0,0,0));d=ImageDraw.Draw(layer)
    d.ellipse((x-radius,y-radius,x+radius,y+radius),outline=(91,230,194,int(255*(1-progress))),width=6)
    d.ellipse((x-8,y-8,x+8,y+8),fill=(255,255,255,int(220*(1-progress))))
    canvas.alpha_composite(layer)


def label(canvas,text,xy,accent=False,size=30):
    d=ImageDraw.Draw(canvas);f=font(size,True);box=d.textbbox((0,0),text,font=f)
    pad=14;fill=(31,210,168,245) if accent else (8,20,45,230);ink=(3,14,30,255) if accent else (244,249,255,255)
    d.rounded_rectangle((xy[0],xy[1],xy[0]+box[2]+pad*2,xy[1]+f.size+pad*2),16,fill=fill)
    d.text((xy[0]+pad,xy[1]+pad-2),text,font=f,fill=ink)


class EffectClip:
    def __init__(self,path,max_seconds=5.0):
        capture=cv2.VideoCapture(str(path));fps=capture.get(cv2.CAP_PROP_FPS) or 24;limit=int(fps*max_seconds);self.frames=[]
        while len(self.frames)<limit:
            ok,frame=capture.read()
            if not ok:break
            # Receiver CSS stretches source videos to a shallow player row.
            # Normalize while decoding so longer promo holds stay memory-bounded.
            frame=cv2.resize(frame,(1200,100),interpolation=cv2.INTER_AREA)
            self.frames.append(cv2.cvtColor(frame,cv2.COLOR_BGR2RGB))
        capture.release()
        if not self.frames:raise RuntimeError(f'No frames decoded from {path}')

    def frame(self,seconds):
        return self.frames[min(len(self.frames)-1,max(0,int(seconds*24)))]


def overlay_effect(canvas,clip,seconds,tv_rect,player_index,layout):
    frame=Image.fromarray(clip.frame(seconds)).convert('RGB')
    source=layout['players'][player_index];sx=tv_rect[2]/layout['width'];sy=tv_rect[3]/layout['height']
    x=int(tv_rect[0]+source['x']*sx);y=int(tv_rect[1]+source['y']*sy)
    width=max(1,int(source['width']*sx));height=max(1,int(source['height']*sy));radius=max(1,int(source['radius']*min(sx,sy)))
    frame=frame.resize((width,height),Image.Resampling.LANCZOS)
    box=(x,y,x+width,y+height);base=canvas.crop(box).convert('RGB');mixed=ImageChops.screen(base,frame).convert('RGBA')
    mask=Image.new('L',(width,height),0);ImageDraw.Draw(mask).rounded_rectangle((0,0,width-1,height-1),radius=radius,fill=255)
    mixed.putalpha(mask)
    canvas.alpha_composite(mixed,(x,y))


def render_one(filename):
    size=SIZE;w,h=size
    phone_home=Image.open(OUT/"phone-home.png").convert("RGBA")
    phone_cards_empty=Image.open(OUT/"phone-cards-empty.png").convert("RGBA")
    phone_cards_filled=Image.open(OUT/"phone-cards-filled.png").convert("RGBA")
    phone_score=Image.open(OUT/"phone-score.png").convert("RGBA")
    tv_score=Image.open(OUT/"tv-score.png").convert("RGBA")
    tv_update=Image.open(OUT/"tv-update.png").convert("RGBA")
    layout=json.loads((OUT/'tv-layout.json').read_text())
    effect_stills={name:Image.open(OUT/f"tv-{name}.png").convert('RGBA') for name in ('flip7','busted','frozen')}
    clips={
      'flip7':EffectClip(ROOT/'cast-receiver/assets/flip7-v83.mp4'),
      'busted':EffectClip(ROOT/'cast-receiver/assets/bust-v92.mp4'),
      'frozen':EffectClip(ROOT/'cast-receiver/assets/freeze-v49.mp4'),
    }
    logo=Image.open(ROOT/"brand/flipcast-logo-approved.png").convert("RGBA")
    writer=cv2.VideoWriter(str(filename),cv2.VideoWriter_fourcc(*"mp4v"),FPS,size)
    if not writer.isOpened(): raise RuntimeError("OpenCV could not open MP4 writer")
    total=SECONDS*FPS
    for frame_no in range(total):
        t=frame_no/FPS
        if t<3:
            canvas=scene(size,"","")
            # A squash-and-reveal mimics the logo flip at Cast startup.
            cycle=ease((t%1.35)/1.35)
            scale=max(.055,abs(math.cos(cycle*math.pi)))
            mark=contain(logo,(510,510))
            mark=mark.resize((max(1,int(mark.width*scale)),mark.height),Image.Resampling.LANCZOS)
            canvas.alpha_composite(mark,((w-mark.width)//2,(h-mark.height)//2-20))
            d=ImageDraw.Draw(canvas);f=font(34,True)
            text="Game night, upgraded."
            box=d.textbbox((0,0),text,font=f)
            d.text(((w-(box[2]-box[0]))//2,870),text,font=f,fill=(145,235,209,255))
        elif t<15:
            canvas=scene(size,"Score on your phone.","Everyone follows on the TV.")
            reveal=ease((t-3)/1.5)
            # Keep the approved logo anchored like the Cast interface brand mark.
            mark=contain(logo,(int(420-190*reveal),int(420-190*reveal)))
            mx=int((w-mark.width)//2*(1-reveal)+(w-mark.width-80)*reveal)
            my=int((h-mark.height)//2*(1-reveal)+58*reveal)
            canvas.alpha_composite(mark,(mx,my))
            if reveal>.25:
                phone=phone_cards_empty if t<10.4 else phone_cards_filled if t<12.2 else phone_score
                phone_rect=paste_phone(canvas,phone,(170,285),700)
                # Use the same Casey/Flip 7 receiver state that supplies the
                # status tag and highlight; do not mix it with a generic score
                # screenshot whose sorted row order differs.
                preview=tv_score if t<12.2 else effect_stills['flip7']
                tv_rect=paste_tv(canvas,preview,(715,395),(1030,555))
                if t>=12.2:
                    # Casey is the second player row in the production receiver.
                    overlay_effect(canvas,clips['flip7'],t-12.2,tv_rect,1,layout)
                # Follow the real Casey calculator controls instead of pulsing a
                # generic point: 2, 4, 6, 7, 8, 9, 10, Flip 7, then Save round.
                tap_path=[
                    (.49,.357),(.84,.357),(.32,.413),(.50,.413),
                    (.67,.413),(.84,.413),(.14,.469),(.39,.584),(.74,.955),
                ]
                tap_start=5.2;tap_spacing=.78
                for tap_index,tap_position in enumerate(tap_path):
                    tap_time=tap_start+tap_index*tap_spacing
                    tap(canvas,phone_rect,(t-tap_time)/.55,tap_position)
                label(canvas,"AUTOMATIC TOTALS",(1030,895),True,25)
        elif t<26:
            # Begin on the exact preview composition, then let the receiver take over.
            transition=ease((t-15)/1.25)
            canvas=scene(size,"Big moments. Big screen.","")
            start=(715,395,1030,555)
            x=int(start[0]*(1-transition));y=int(start[1]*(1-transition))
            sw=int(start[2]+(w-start[2])*transition);sh=int(start[3]+(h-start[3])*transition)
            # Receiver row order: Jordan, Casey, Riley, Morgan.
            phase=('flip7',1,15.0) if t<19 else ('busted',3,19.0) if t<22.5 else ('frozen',0,22.5)
            effect,index,start_time=phase
            screen=effect_stills[effect].resize((sw,sh),Image.Resampling.LANCZOS)
            canvas.alpha_composite(screen,(x,y))
            tv_rect=(x,y,sw,sh)
            overlay_effect(canvas,clips[effect],t-start_time,tv_rect,index,layout)
        else:
            canvas=scene(size,"Join the FlipCast beta","No paperwork. More game night.")
            mark=contain(logo,(260,260));canvas.alpha_composite(mark,((w-mark.width)//2,350))
            d=ImageDraw.Draw(canvas)
            url="jml845.github.io/seven-up-scorekeeper"
            f=font(38,True)
            box=d.textbbox((0,0),url,font=f); x=(w-(box[2]-box[0]))//2
            d.rounded_rectangle((x-28,690,x+(box[2]-box[0])+28,690+f.size+34),18,fill=(31,210,168,255))
            d.text((x,705),url,font=f,fill=(3,14,30,255))
            feature=font(25,True)
            feature_text="Automatic scoring  ·  Live TV standings  ·  Game history  ·  Player stats"
            feature_box=d.textbbox((0,0),feature_text,font=feature)
            d.text(((w-(feature_box[2]-feature_box[0]))//2,830),feature_text,font=feature,fill=(221,235,242,255))
            foot=font(20)
            note="Independent utility · Not affiliated with or endorsed by The Op · Chromecast-compatible device required"
            box=d.textbbox((0,0),note,font=foot)
            d.text(((w-(box[2]-box[0]))//2,980),note,font=foot,fill=(174,190,207,255))
        rgb=np.array(canvas.convert("RGB"))
        writer.write(cv2.cvtColor(rgb,cv2.COLOR_RGB2BGR))
    writer.release()


def main():
    capture()
    raw=OUT/"flipcast-widescreen-v2-raw.mp4";final=OUT/"flipcast-widescreen-v2.mp4"
    render_one(raw)
    try:
        import imageio_ffmpeg
        ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
        subprocess.run([ffmpeg,'-y','-i',str(raw),'-an','-c:v','libx264','-preset','medium','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',str(final)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
        raw.unlink()
    except (ImportError,subprocess.CalledProcessError):
        raw.replace(final)
    print(final)


if __name__ == "__main__":
    main()
